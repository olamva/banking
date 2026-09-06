import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  inspectWorktree,
  removeWorktree,
} from "../../infra/worktree-cleanup.ts";
import { linkWorktree } from "../../infra/worktree-link.ts";

function fixture(t: { after: (fn: () => void) => void }) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "banking-worktree-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const main = join(dir, "main");
  const target = join(dir, "task");
  mkdirSync(main);
  const git = (cwd: string, ...args: string[]) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  git(main, "init", "-q", "-b", "main");
  git(main, "config", "user.name", "Test");
  git(main, "config", "user.email", "test@example.com");
  writeFileSync(
    join(main, ".gitignore"),
    ".env.local\ndata\nrules\nnode_modules\ndata.local\n*.key\n",
  );
  writeFileSync(join(main, "tracked"), "initial");
  mkdirSync(join(main, "data"));
  mkdirSync(join(main, "rules"));
  writeFileSync(join(main, ".env.local"), "");
  git(main, "add", ".");
  git(main, "commit", "-qm", "initial");
  git(main, "worktree", "add", "-qb", "task", target);
  writeFileSync(join(target, "tracked"), "change");
  git(target, "commit", "-qam", "change");
  const head = git(target, "rev-parse", "HEAD");
  git(main, "merge", "--no-ff", "task", "-m", "merge");
  const merge = git(main, "rev-parse", "HEAD");
  git(main, "update-ref", "refs/remotes/origin/main", merge);
  const pr = {
    state: "MERGED",
    baseRefName: "main",
    headRefName: "task",
    headRefOid: head,
    mergeCommit: { oid: merge },
    url: "https://example.com/pr/1",
  };
  return { main, target, pr, git };
}

test("setup links ignored files and remains safe on repeated runs", (t) => {
  const { main, target } = fixture(t);
  linkWorktree(target);
  linkWorktree(target);
  for (const name of [".env.local", "data", "rules"])
    assert.equal(readlinkSync(join(target, name)), join(main, name));
  assert.throws(() => linkWorktree(main), /linked worktree/);
});

test("setup preserves local data and creates no partial links", (t) => {
  const { target } = fixture(t);
  mkdirSync(join(target, "data"));
  assert.throws(() => linkWorktree(target), /Preserve/);
  assert.equal(lstatSync(join(target, "data")).isDirectory(), true);
  assert.equal(existsSync(join(target, ".env.local")), false);
});

test("setup preserves an incorrect symlink", (t) => {
  const { target } = fixture(t);
  symlinkSync("/missing", join(target, "rules"));
  assert.throws(() => linkWorktree(target), /Preserve/);
  assert.equal(readlinkSync(join(target, "rules")), "/missing");
});

test("cleanup removes only the merged worktree and local branch", (t) => {
  const { main, target, pr, git } = fixture(t);
  linkWorktree(target);
  mkdirSync(join(target, "node_modules"));
  writeFileSync(join(target, "node_modules", "dependency"), "replaceable");
  const inspection = inspectWorktree(main, target, pr);
  assert.equal(inspection.head, pr.headRefOid);
  assert.equal(existsSync(target), true);
  removeWorktree(main, target, pr);
  assert.equal(existsSync(target), false);
  assert.equal(existsSync(join(main, "data")), true);
  assert.equal(existsSync(join(main, "rules")), true);
  assert.equal(git(main, "branch", "--list", "task"), "");
  assert.equal(git(main, "rev-parse", "HEAD"), pr.mergeCommit.oid);
});

for (const name of [
  "tracked",
  "untracked",
  "private.key",
  "data.local/database",
]) {
  test(`cleanup preserves ${name}`, (t) => {
    const { main, target, pr } = fixture(t);
    if (name.includes("/")) mkdirSync(join(target, "data.local"));
    writeFileSync(join(target, name), "keep");
    assert.throws(() => removeWorktree(main, target, pr), /Preserve/);
    assert.equal(existsSync(join(target, name)), true);
  });
}

test("cleanup refuses active, locked, and main worktrees", (t) => {
  const { main, target, pr, git } = fixture(t);
  assert.throws(() => inspectWorktree(target, target, pr), /another checkout/);
  assert.throws(() => inspectWorktree(target, main, pr), /main checkout/);
  git(main, "worktree", "lock", target);
  assert.throws(() => removeWorktree(main, target, pr), /locked/);
});

test("cleanup refuses a closed PR or mismatched branch", (t) => {
  const { main, target, pr } = fixture(t);
  for (const change of [
    { state: "CLOSED" },
    { headRefName: "another" },
    { baseRefName: "other" },
    { mergeCommit: null },
  ])
    assert.throws(
      () => removeWorktree(main, target, { ...pr, ...change }),
      /merged PR/,
    );
});

test("cleanup preserves commits after the PR merge", (t) => {
  const { main, target, pr, git } = fixture(t);
  writeFileSync(join(target, "tracked"), "later");
  git(target, "commit", "-qam", "later");
  assert.throws(() => removeWorktree(main, target, pr), /merged PR/);
  assert.equal(existsSync(target), true);
});

test("cleanup requires the branch and merge commit in origin main", (t) => {
  const { main, target, pr, git } = fixture(t);
  git(main, "update-ref", "refs/remotes/origin/main", "HEAD^1");
  assert.throws(() => removeWorktree(main, target, pr));
  git(main, "update-ref", "refs/remotes/origin/main", pr.headRefOid);
  assert.throws(() => removeWorktree(main, target, pr));
  assert.equal(existsSync(target), true);
});
