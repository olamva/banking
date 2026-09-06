import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readlinkSync, symlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function linkWorktree(cwd = process.cwd()) {
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  const root = git("rev-parse", "--show-toplevel");
  const common = git("rev-parse", "--path-format=absolute", "--git-common-dir");
  if (git("rev-parse", "--absolute-git-dir") === common)
    throw new Error("Run setup from a linked worktree.");
  const main = dirname(common);
  const links = [".env.local", "data", "rules"].map((name) => ({
    source: join(main, name),
    target: join(root, name),
  }));
  for (const { source, target } of links) {
    if (!existsSync(source))
      throw new Error(`The setup source is missing: ${source}`);
    git("check-ignore", "-q", target);
    const stat = lstatSync(target, { throwIfNoEntry: false });
    if (
      stat &&
      (!stat.isSymbolicLink() || resolve(root, readlinkSync(target)) !== source)
    )
      throw new Error(`Preserve the existing setup path: ${target}`);
  }
  for (const { source, target } of links)
    if (!lstatSync(target, { throwIfNoEntry: false }))
      symlinkSync(source, target);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  linkWorktree();
  console.log("Worktree links are ready.");
}
