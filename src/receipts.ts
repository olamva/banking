import { DATA_DIR } from "./core/paths.ts";

const sources = {
  rema: () => import("./net/rema.ts"),
  trumf: () => import("./net/trumf.ts"),
  gmail: () => import("./net/gmail.ts"),
};
type Source = keyof typeof sources;
const isSource = (s?: string): s is Source => !!s && s in sources;

const [cmd, arg] = process.argv.slice(2);

try {
  if (cmd === "login" && (arg === "rema" || arg === "gmail"))
    await (await sources[arg]()).login();
  else if (isSource(cmd)) {
    const dir = `${DATA_DIR}/raw/receipts/${cmd}`;
    const added = await (await sources[cmd]()).sync(dir);
    console.error(`${cmd}: ${added} new in ${dir}`);
    if (added) await (await import("./core/pipeline.ts")).rebuildAll();
  } else {
    console.error("usage: pnpm receipts <rema | trumf | gmail>");
    console.error("                     login <rema | gmail>");
    process.exit(1);
  }
} catch (e) {
  console.error(e instanceof Error && !process.env.DEBUG ? e.message : e);
  process.exit(1);
}
