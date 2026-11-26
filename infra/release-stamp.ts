import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { PENDING_NAME } from "../src/web/app/releaseNotes.ts";

const DIR = "src/web/app/release-notes";

const git = (...args: string[]) =>
  execFileSync("git", args, { encoding: "utf8" }).trim();

const oslo = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Oslo",
  dateStyle: "short",
  timeStyle: "medium",
});

for (const name of readdirSync(DIR).filter((n) => PENDING_NAME.test(n))) {
  const path = `${DIR}/${name}`;
  const merged = git("log", "-1", "--first-parent", "--diff-filter=A", "--format=%cI", "--", path);
  const stamp = oslo.format(new Date(merged)).replace(" ", "T").replaceAll(":", "");
  git("mv", path, `${DIR}/${stamp}-${name}`);
}
