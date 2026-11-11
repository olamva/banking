import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const LOGIN_MINUTES = 5;

async function devtoolsPort(profile: string): Promise<string> {
  for (let i = 0; i < 100; i++) {
    const file = await readFile(
      join(profile, "DevToolsActivePort"),
      "utf8",
    ).catch(() => "");
    if (file) return file.split("\n")[0]!;
    await sleep(100);
  }
  throw new Error("Chrome did not open a DevTools port");
}

export async function chromeLogin<T>(
  name: string,
  how: string,
  capture: (ws: WebSocket) => Promise<T>,
): Promise<T> {
  const timeout = new AbortController();
  const profile = await mkdtemp(join(tmpdir(), "receipt-login-"));
  const chrome = spawn(
    CHROME,
    [
      `--user-data-dir=${profile}`,
      "--remote-debugging-port=0",
      "--no-first-run",
      "--no-default-browser-check",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  try {
    const port = await devtoolsPort(profile);
    const targets = (await (
      await fetch(`http://127.0.0.1:${port}/json/list`)
    ).json()) as { type: string; webSocketDebuggerUrl: string }[];
    const page = targets.find((t) => t.type === "page");
    if (!page) throw new Error("Chrome opened no page");
    console.error(
      `Log in to ${name} ${how} in the Chrome window (${LOGIN_MINUTES} min).`,
    );
    return await Promise.race([
      capture(new WebSocket(page.webSocketDebuggerUrl)),
      sleep(LOGIN_MINUTES * 60_000, null, { signal: timeout.signal }).then(
        () => {
          throw new Error(`${name} login timed out`);
        },
      ),
    ]);
  } finally {
    timeout.abort();
    chrome.kill();
    await rm(profile, { recursive: true, force: true });
  }
}
