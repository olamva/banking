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

export function inspectWorktree(
  cwd: string,
  path: string,
  pr: PullRequest,
  branchOnly = false,
) {
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
  if (!branchOnly && (current === target || current.startsWith(target + sep)))
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
  const branch =
    entry
      .split("\0")
      .find((line) => line.startsWith("branch "))
      ?.slice("branch refs/heads/".length) ?? pr.headRefName;
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
  if (!branchOnly) inspectIgnoredFiles(target, main);
  return { target, branch, head, url: pr.url };
}

function inspectIgnoredFiles(target: string, main: string) {
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
    if (["node_modules/", "data.local/"].includes(name)) continue;
    const relative = name.replace(/\/$/, "");
    const file = join(target, relative);
    if (
      [".env", "data", "rules"].includes(relative) &&
      lstatSync(file).isSymbolicLink() &&
      resolve(target, readlinkSync(file)) === join(main, relative)
    )
      continue;
    throw new Error(`Preserve the ignored path: ${relative}`);
  }
}

export function removeWorktree(cwd: string, path: string, pr: PullRequest) {
  const result = inspectWorktree(cwd, path, pr);
  removeBranch(cwd, path, pr);
  git(cwd, "worktree", "remove", result.target);
  return result;
}

export function removeBranch(cwd: string, path: string, pr: PullRequest) {
  const result = inspectWorktree(cwd, path, pr, true);
  if (git(cwd, "ls-remote", "--heads", "origin", `refs/heads/${result.branch}`))
    throw new Error("Wait for remote branch deletion.");
  const ref = git(cwd, "branch", "--list", result.branch);
  if (
    ref &&
    git(cwd, "rev-parse", `refs/heads/${result.branch}`) !== result.head
  )
    throw new Error("Preserve the changed local branch.");
  git(result.target, "switch", "--detach", result.head);
  if (ref) git(result.target, "branch", "-d", result.branch);
  return result;
}

function requireIdle(target: string) {
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

function clean(
  cwd: string,
  path: string,
  pr: PullRequest,
  apply: boolean,
  branchOnly: boolean,
) {
  const result = inspectWorktree(cwd, path, pr, branchOnly);
  if (apply && branchOnly) removeBranch(cwd, path, pr);
  else if (apply) {
    requireIdle(result.target);
    removeWorktree(cwd, path, pr);
  }
  return { ...result, removed: apply && !branchOnly, branchRemoved: apply };
}

export function sweep(
  cwd: string,
  prs: PullRequest[],
  apply: boolean,
  branchOnly: boolean,
) {
  const results: object[] = [];
  for (const entry of git(cwd, "worktree", "list", "--porcelain", "-z")
    .split("\0\0")
    .filter(Boolean)) {
    const [path, head] = entry
      .split("\0")
      .map((line) => line.slice(line.indexOf(" ") + 1));
    const pr = prs.find((pr) => pr.headRefOid === head);
    if (!pr) continue;
    try {
      results.push(clean(cwd, path!, pr, apply, branchOnly));
    } catch (error) {
      results.push({ target: path, error: (error as Error).message });
    }
  }
  const orphanBranches = git(
    cwd,
    "for-each-ref",
    "--merged=refs/remotes/origin/main",
    "--format=%(worktreepath)%(refname:short)",
    "refs/heads/t3/",
  )
    .split("\n")
    .filter((name) => name.startsWith("t3/"));
  if (apply && orphanBranches.length)
    git(cwd, "branch", "-D", ...orphanBranches);
  return [...results, { orphanBranches }];
}

const fields = "state,baseRefName,headRefName,headRefOid,mergeCommit,url";

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const args = process.argv.slice(2);
    const merged = args[0] === "--merged";
    const [path, number] = args;
    const flags = args.slice(merged ? 1 : 2);
    const apply = flags.includes("--apply");
    const branchOnly = flags.includes("--branch-only");
    if (
      (!merged && (!path || !/^\d+$/.test(number ?? ""))) ||
      flags.some((flag) => !["--apply", "--branch-only"].includes(flag)) ||
      new Set(flags).size !== flags.length
    )
      throw new Error(
        "Use pnpm worktree:cleanup <path> <pr-number> | --merged [--branch-only] [--apply].",
      );
    const cwd = process.cwd();
    const gh = (...args: string[]) =>
      JSON.parse(execFileSync("gh", args, { cwd, encoding: "utf8" }));
    const view = () =>
      gh("pr", "view", number!, "--json", `${fields},autoMergeRequest`);
    let pr = merged ? undefined : view();
    for (
      const end = Date.now() + 120_000;
      pr?.state === "OPEN" && pr.autoMergeRequest && Date.now() < end;
      pr = view()
    )
      await new Promise((done) => setTimeout(done, 5000));
    git(cwd, "fetch", "--prune", "origin");
    const lines = pr
      ? [clean(cwd, path!, pr, apply, branchOnly)]
      : sweep(
          cwd,
          gh(
            "pr",
            "list",
            "--state",
            "merged",
            "--base",
            "main",
            "--limit",
            "1000",
            "--json",
            fields,
          ),
          apply,
          branchOnly,
        );
    for (const line of lines) console.log(JSON.stringify(line));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Cleanup fails.");
    process.exitCode = 1;
  }
}
