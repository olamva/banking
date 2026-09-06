import { execFileSync, spawnSync } from "node:child_process";
import { lstatSync, readlinkSync, realpathSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

interface PullRequest {
  state: string;
  baseRefName: string;
  headRefName: string;
  headRefOid: string;
  mergeCommit: { oid: string } | null;
  url: string;
}

function git(cwd: string, ...args: string[]) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export function inspectWorktree(cwd: string, path: string, pr: PullRequest) {
  const target = realpathSync(path);
  const common = git(
    cwd,
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir",
  );
  const main = dirname(common);
  if (target === realpathSync(main))
    throw new Error("Preserve the main checkout.");
  const current = realpathSync(cwd);
  if (current === target || current.startsWith(target + sep))
    throw new Error("Run cleanup from another checkout.");
  const entries = git(cwd, "worktree", "list", "--porcelain", "-z").split(
    "\0\0",
  );
  const entry = entries.find(
    (value) => value.split("\0")[0] === `worktree ${target}`,
  );
  if (
    !entry ||
    entry.split("\0").some((line) => /^(locked|prunable)( |$)/.test(line))
  )
    throw new Error("The worktree is absent, locked, or prunable.");
  const branch = git(target, "symbolic-ref", "--short", "HEAD");
  const head = git(target, "rev-parse", "HEAD");
  if (
    branch === "main" ||
    pr.state !== "MERGED" ||
    pr.baseRefName !== "main" ||
    pr.headRefName !== branch ||
    pr.headRefOid !== head ||
    !pr.mergeCommit
  )
    throw new Error("The worktree does not match the merged PR.");
  git(cwd, "merge-base", "--is-ancestor", head, "refs/remotes/origin/main");
  git(
    cwd,
    "merge-base",
    "--is-ancestor",
    pr.mergeCommit.oid,
    "refs/remotes/origin/main",
  );
  if (git(target, "status", "--porcelain", "--untracked-files=all"))
    throw new Error("Preserve uncommitted or untracked files.");
  const ignored = git(
    target,
    "ls-files",
    "--others",
    "--ignored",
    "--exclude-standard",
    "--directory",
    "-z",
  );
  for (const name of ignored.split("\0").filter(Boolean)) {
    if (name === "node_modules/") continue;
    const relative = name.replace(/\/$/, "");
    const file = join(target, relative);
    if (
      [".env.local", "data", "rules"].includes(relative) &&
      lstatSync(file).isSymbolicLink() &&
      resolve(target, readlinkSync(file)) === join(main, relative)
    )
      continue;
    throw new Error(`Preserve the ignored path: ${relative}`);
  }
  return { target, branch, head, url: pr.url };
}

export function removeWorktree(cwd: string, path: string, pr: PullRequest) {
  const result = inspectWorktree(cwd, path, pr);
  git(cwd, "worktree", "remove", result.target);
  git(cwd, "update-ref", "-d", `refs/heads/${result.branch}`, result.head);
  return result;
}

function requireIdle(target: string) {
  if (process.platform !== "darwin")
    throw new Error("Automatic activity checks require macOS.");
  const processes = execFileSync("ps", ["-axo", "args="], { encoding: "utf8" });
  if (/\/T3 Code[^/]*\.app\/|(?:^|[\s/])t3(?:code)?(?:\s|\/)/m.test(processes))
    throw new Error("Stop T3 before removing its worktree.");
  const files = spawnSync(
    "lsof",
    ["-n", "-a", "-u", String(process.getuid!()), "-d", "cwd", "-Fn"],
    { encoding: "utf8" },
  );
  if (files.error || files.status !== 0 || files.stderr.trim())
    throw new Error("Cannot verify process working directories.");
  if (
    files.stdout
      .split("\n")
      .some(
        (line) => line === `n${target}` || line.startsWith(`n${target}${sep}`),
      )
  )
    throw new Error("A process still uses the worktree.");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const [path, number, apply, ...extra] = process.argv.slice(2);
    if (
      !path ||
      !/^\d+$/.test(number ?? "") ||
      (apply && apply !== "--apply") ||
      extra.length
    )
      throw new Error(
        "Use pnpm worktree:cleanup <path> <pr-number> [--apply].",
      );
    const cwd = process.cwd();
    git(cwd, "fetch", "origin", "main");
    const pr: PullRequest = JSON.parse(
      execFileSync(
        "gh",
        [
          "pr",
          "view",
          number,
          "--json",
          "state,baseRefName,headRefName,headRefOid,mergeCommit,url",
        ],
        { cwd, encoding: "utf8" },
      ),
    );
    const result = inspectWorktree(cwd, path, pr);
    if (apply) {
      requireIdle(result.target);
      removeWorktree(cwd, path, pr);
    }
    console.log(JSON.stringify({ ...result, removed: Boolean(apply) }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Cleanup fails.");
    process.exitCode = 1;
  }
}
