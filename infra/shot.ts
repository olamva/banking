import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, realpathSync, symlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { webkit, type Browser } from "playwright-core";

const SIZES: Record<string, number[]> = {
  phone: [375, 812],
  desktop: [1440, 900],
};

const { values: o, positionals: paths } = parseArgs({
  allowPositionals: true,
  options: {
    before: { type: "string" },
    theme: { type: "string", default: "both" },
    size: { type: "string", default: "phone" },
    click: { type: "string", multiple: true, default: [] },
    wait: { type: "string" },
    element: { type: "string" },
    full: { type: "boolean", default: false },
    out: { type: "string" },
  },
});

if (!paths.length) {
  console.error(`pnpm shot <path>... [options]

  --before <ref>        Also capture <ref>, such as origin/main
  --theme <t>           dark, light or both (default both)
  --size <s>            phone (375x812), desktop (1440x900) or WIDTHxHEIGHT
  --click <selector>    Click before the capture; repeat for more steps
  --wait <selector>     Wait for this element before the capture
  --element <selector>  Capture only this element
  --full                Capture the full page
  --out <dir>           Output directory (default the T3 attachments directory)`);
  process.exit(1);
}

const git = (...args: string[]) =>
  execFileSync("git", args, { encoding: "utf8" }).trim();
const [width, height] = SIZES[o.size!] ?? o.size!.split("x").map(Number);
if (!width || !height) throw new Error(`Unknown size ${o.size}`);
const themes = o.theme === "both" ? ["dark", "light"] : [o.theme!];
const out = resolve(
  o.out ??
    join(
      homedir(),
      ".t3/userdata/attachments",
      git("rev-parse", "--abbrev-ref", "HEAD").replace(/[^\w.-]+/g, "-"),
    ),
);
mkdirSync(out, { recursive: true });

const serve = async (cwd: string) => {
  const child = spawn(resolve("node_modules/.bin/vite"), ["--port", "0"], {
    cwd,
    env: { ...process.env, NO_COLOR: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  const url = await new Promise<string>((done, fail) => {
    const read = (chunk: Buffer) => {
      log += chunk;
      const match = /Local:\s+(http\S+?)\/?\s/.exec(log);
      if (match) done(match[1]!);
    };
    child.stdout.on("data", read);
    child.stderr.on("data", read);
    child.once("exit", () => fail(new Error(`Vite exited:\n${log}`)));
  });
  return { url, stop: () => (child.kill(), once(child, "exit")) };
};

const shoot = async (
  browser: Browser,
  url: string,
  theme: string,
  file: string,
) => {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    colorScheme: theme as "dark" | "light",
  });
  context.setDefaultTimeout(10_000);
  const page = await context.newPage();
  const visible = (selector: string) =>
    page.locator(selector).filter({ visible: true }).first();
  try {
    await page.goto(url, { waitUntil: "networkidle" });
    for (const target of o.click!) {
      await visible(target).click();
      await page.waitForLoadState("networkidle");
    }
    if (o.wait) await visible(o.wait).waitFor();
    await page.evaluate(() => document.fonts.ready);
    const shot = { path: file, animations: "disabled" as const };
    if (o.element) await visible(o.element).screenshot(shot);
    else await page.screenshot({ ...shot, fullPage: o.full });
  } finally {
    await context.close();
  }
};

const capture = async (browser: Browser, cwd: string, label: string) => {
  const server = await serve(cwd);
  const files: string[] = [];
  try {
    for (const path of paths)
      for (const theme of themes) {
        const name = path.replace(/\W+/g, "-").replace(/^-|-$/g, "") || "home";
        const file = join(
          out,
          [name, o.size, label, theme].filter(Boolean).join("-") + ".png",
        );
        await shoot(browser, server.url + path, theme, file);
        files.push(file);
      }
  } finally {
    await server.stop();
  }
  return files;
};

const browser = await webkit.launch().catch((error: Error) => {
  throw new Error(
    `${error.message.split("\n")[0]}\nRun pnpm exec playwright-core install webkit`,
  );
});
const before =
  o.before &&
  `/tmp/shot-${git("rev-parse", "--short", o.before)}-${process.pid}`;
if (before) {
  git("worktree", "add", "--detach", before, o.before!);
  for (const link of ["node_modules", "data", "rules"])
    symlinkSync(realpathSync(link), join(before, link));
}
try {
  const files = await capture(browser, ".", before ? "after" : "");
  if (before) files.push(...(await capture(browser, before, "before")));
  for (const file of files.sort()) console.log(file);
} finally {
  await browser.close();
  if (before) git("worktree", "remove", before);
}
