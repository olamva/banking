import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

const guard = join(
  import.meta.dirname,
  "../../.claude/hooks/worktree-guard.sh",
);

const root = mkdtempSync(join(tmpdir(), "guard-"));
const main = join(root, "checkout");
const linked = join(root, "linked");

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8" });

mkdirSync(main);
git(main, "init", "-q", "-b", "main");
git(main, "config", "user.email", "t@t");
git(main, "config", "user.name", "t");
writeFileSync(join(main, ".gitignore"), "rules\ndata\n");
writeFileSync(join(main, "tracked.ts"), "");
mkdirSync(join(main, "rules"));
writeFileSync(join(main, "rules/categories.json"), "{}");
git(main, "add", "-A");
git(main, "commit", "-qm", "init");
git(main, "worktree", "add", "-q", "-b", "side", linked);

after(() => rmSync(root, { recursive: true, force: true }));

const ask = (cwd: string, tool_name: string, tool_input: object) =>
  execFileSync("bash", [guard], {
    input: JSON.stringify({ cwd, tool_name, tool_input }),
    encoding: "utf8",
  }).trim().length > 0;

const edit = (cwd: string, file_path: string) =>
  ask(cwd, "Edit", { file_path });
const bash = (cwd: string, command: string) => ask(cwd, "Bash", { command });

test("the guard refuses a tracked path in the main checkout", () => {
  assert.equal(edit(main, join(main, "tracked.ts")), true);
});

test("a gitignored path is the documented exception, so rules and data still open", () => {
  assert.equal(edit(main, join(main, "rules/categories.json")), false);
});

test("a linked worktree is what the guard asks for, so it refuses nothing there", () => {
  assert.equal(edit(linked, join(linked, "tracked.ts")), false);
  assert.equal(bash(linked, "sed -i '' s/a/b/ tracked.ts"), false);
});

test("a branch does not make the main checkout isolated", () => {
  git(main, "checkout", "-q", "-b", "feature");
  try {
    assert.equal(edit(main, join(main, "tracked.ts")), true);
    assert.equal(bash(main, "sed -i '' s/a/b/ tracked.ts"), true);
  } finally {
    git(main, "checkout", "-q", "main");
  }
});

test("Codex apply_patch is refused in the main checkout", () => {
  const patch = "*** Update File: tracked.ts";
  assert.equal(ask(main, "apply_patch", { command: patch }), true);
  assert.equal(ask(linked, "apply_patch", { command: patch }), false);
  assert.equal(
    ask(main, "apply_patch", { command: "*** Add File: notes.txt" }),
    false,
  );
});

test("an in-place rewriter is refused, and a formatter and a patch with it", () => {
  assert.equal(bash(main, "sed -i '' 24s/a/b/ tracked.ts"), true);
  assert.equal(bash(main, "sed -i '' 24s/a/b/ /tmp/tracked.ts"), false);
  assert.equal(bash(main, "sed -i '' 24s/a/b/ tracked.ts /tmp/tracked.ts"), true);
  assert.equal(bash(main, "perl -pi -e s/a/b/ tracked.ts"), true);
  assert.equal(bash(main, "pnpm prettier --write src"), true);
  assert.equal(bash(main, "git apply /tmp/p.diff"), true);
  assert.equal(bash(main, "git restore -- tracked.ts"), true);
});

test("a redirect is refused only when it names a path in the repo", () => {
  assert.equal(bash(main, "node -e 1 > notes.txt"), true);
  assert.equal(bash(main, "node -e 1 > /tmp/out.txt"), false);
});

// 2>&1 and a grep for => both hold a ">" that redirects nothing. The guard runs
// on every Bash call, so either false positive would stop ordinary work.
test("a stderr merge and a fat arrow are not redirects", () => {
  assert.equal(bash(main, "pnpm test 2>&1 | tail -5"), false);
  assert.equal(bash(main, 'grep -rn "=>" src'), false);
});

test("reading, committing and provisioning all stay open on main", () => {
  assert.equal(bash(main, "cat tracked.ts"), false);
  assert.equal(bash(main, "git status --short"), false);
  assert.equal(bash(main, 'git commit -m "style: x"'), false);
  assert.equal(bash(main, "pnpm install"), false);
});
