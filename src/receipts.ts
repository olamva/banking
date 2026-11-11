import { receiptDir, SOURCES, type Source } from "./net/receipts.ts";

const isSource = (s?: string): s is Source => !!s && s in SOURCES;

const [cmd, arg] = process.argv.slice(2);

try {
  if (cmd === "login" && (arg === "rema" || arg === "gmail" || arg === "coop"))
    await (await SOURCES[arg]()).login();
  else if (isSource(cmd)) {
    const dir = receiptDir(cmd);
    const added = await (await SOURCES[cmd]()).sync(dir);
    console.error(`${cmd}: ${added} new in ${dir}`);
    if (added) await (await import("./core/pipeline.ts")).rebuildAll();
  } else {
    console.error("usage: pnpm receipts <rema | trumf | gmail | coop>");
    console.error("                     login <rema | gmail | coop>");
    process.exit(1);
  }
} catch (e) {
  console.error(e instanceof Error && !process.env.DEBUG ? e.message : e);
  process.exit(1);
}
