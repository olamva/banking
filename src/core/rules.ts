import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { compile, splitCategory } from "./match.ts";
import { readPreference } from "./preferences.ts";
import { RULES_DIR } from "./paths.ts";
import {
  CATEGORY_VALUED,
  RULE_FILES,
  diffRules,
  changeRules,
  isMapFile as isMap,
  type RuleChange,
  type RuleFile,
  type Rules,
} from "./ruleFiles.ts";

const live = (file: RuleFile) => `${RULES_DIR}/${file}.json`;

const HISTORY = `${RULES_DIR}/.history`;

const read = (path: string): unknown =>
  existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;

const write = (path: string, value: Rules): void =>
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

export function load(file: RuleFile): Rules {
  const value = read(live(file));
  if (value === null) return isMap(file) ? {} : [];
  const ok = isMap(file)
    ? typeof value === "object" && !Array.isArray(value)
    : Array.isArray(value);
  if (!ok) throw new Error(`${file}.json is not the shape this rule takes`);
  return value as Rules;
}

export const loadAll = (): Record<RuleFile, Rules> =>
  Object.fromEntries(RULE_FILES.map((f) => [f, load(f)])) as Record<
    RuleFile,
    Rules
  >;

// The newest first. A version is the whole file as it stood after one edit. The
// live file holds the version at the cursor, which is the newest one until the
// reader steps back through the stack.
// ponytail: no pruning. 20 kB per version of the largest file, so the volume
// takes years of edits. Prune the oldest when that stops being true.
export function versions(file: RuleFile): number[] {
  if (!existsSync(HISTORY)) return [];
  const suffix = `-${file}.json`;
  return readdirSync(HISTORY)
    .filter((n) => n.endsWith(suffix))
    .map((n) => Number(n.slice(0, -suffix.length)))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => b - a);
}

const versionPath = (file: RuleFile, at: number) =>
  `${HISTORY}/${at}-${file}.json`;

export const readVersion = (file: RuleFile, at: number): Rules =>
  read(versionPath(file, at)) as Rules;

// The version the live file holds, and the whole cursor. Nothing records it,
// because the content says it. That keeps the cursor right on both hosts after
// a deploy, which no extra file in the share would.
//
// It reads null when the live file matches no version. A hand edit does that,
// and the next commit records that state rather than losing it.
export function current(file: RuleFile): number | null {
  const now = JSON.stringify(load(file));
  for (const at of versions(file))
    if (JSON.stringify(readVersion(file, at)) === now) return at;
  return null;
}

export type Version = { at: number; changes: RuleChange[] };

// Every version, newest first, with the lines that version changed. Read one
// file past the limit, because the oldest version shown needs the one below it
// to say what it did. The first version of all changed nothing, so it reports
// no line.
export function history(file: RuleFile, limit: number): Version[] {
  const shots = versions(file)
    .slice(0, limit + 1)
    .map((at) => ({ at, value: readVersion(file, at) }));
  return shots.slice(0, limit).map(({ at, value }, i) => {
    const before = shots[i + 1]?.value;
    return { at, changes: before ? diffRules(before, value) : [] };
  });
}

// Two writes in one millisecond would share a name, and the loser would
// disappear. Step forward until the name is free.
function stamp(file: RuleFile): number {
  let at = Date.now();
  while (existsSync(versionPath(file, at))) at += 1;
  return at;
}

function snapshot(file: RuleFile, value: Rules): number {
  mkdirSync(HISTORY, { recursive: true });
  // rules/ is a git repo on the Mac and a plain directory on the volume. This
  // history is the one version store that works on both, so keep git out of it
  // rather than versioning the versions.
  if (!existsSync(`${HISTORY}/.gitignore`))
    writeFileSync(`${HISTORY}/.gitignore`, "*\n");
  const at = stamp(file);
  write(versionPath(file, at), value);
  return at;
}

// An edit made below the top of the stack drops every version above it. That is
// the one place a version is deleted, and it is the same rule an editor uses:
// stepping back costs nothing until you type.
//
// A live file that matches no version is recorded first. That covers the empty
// history of a file only ever edited by hand, which would otherwise have no
// state to go back to.
function commit(file: RuleFile, next: Rules): number {
  const cursor = current(file);
  if (cursor === null) snapshot(file, load(file));
  else
    for (const above of versions(file))
      if (above > cursor) rmSync(versionPath(file, above));
  const at = snapshot(file, next);
  write(live(file), next);
  return at;
}

export type Edit = {
  file: RuleFile;
  key: string;
  value?: string;
  remove?: boolean;
  // The pattern this entry had before. A rename is one commit, not a remove
  // and an add, so it costs one version and one rebuild rather than two.
  was?: string;
};

function check({ file, key, value, remove }: Edit): void {
  if (!key.trim()) throw new Error("the pattern is empty");
  // A bad regex throws here rather than at the next rebuild, where it would
  // break every category at once.
  if (file === "preferences") readPreference(key);
  else compile(key, `${file}.json`);
  if (remove) return;
  if (!isMap(file)) return;
  if (!value?.trim()) throw new Error(`${file}.json needs a value`);
  if (!CATEGORY_VALUED.has(file)) return;
  const pair = splitCategory(value);
  if (!pair.category.trim() || pair.subcategory?.trim() === "")
    throw new Error(`"${value}" is not category or category/subcategory`);
}

// One entry in, one entry out, on both shapes. A map keeps its insertion order,
// so a new key lands at the end and every other line stays where the reader
// left it.
export function save(edit: Edit): number {
  const { file, key, value, remove, was } = edit;
  check(edit);
  return commit(file, changeRules(load(file), key, value, was, remove));
}

export function saveBulk(
  file: RuleFile,
  keys: string[],
  value: string,
): number {
  if (file !== "payees" && file !== "preferences")
    throw new Error("Bulk edits support payees and remembered categories");
  if (keys.length === 0) throw new Error("Select at least one transaction");
  for (const key of keys) check({ file, key, value });
  const existing = load(file) as Record<string, string>;
  const changes = Object.fromEntries(keys.map((key) => [key, value]));
  return commit(file, {
    ...changes,
    ...Object.fromEntries(
      Object.entries(existing).filter(([key]) => !Object.hasOwn(changes, key)),
    ),
  });
}

export function saveValues(
  file: RuleFile,
  keys: string[],
  value: string,
): number {
  if (keys.length === 0) throw new Error(`${file}.json needs a pattern`);
  const existing = load(file);
  if (Array.isArray(existing)) throw new Error(`${file}.json has no values`);
  for (const key of keys) check({ file, key, value });
  const next = { ...existing };
  for (const key of keys) if (key in next) next[key] = value;
  return commit(file, next);
}

// Move the cursor to a version. Nothing is deleted, and every version above it
// stays as the redo side of the stack.
export function restore(file: RuleFile, at: number): number {
  const value = readVersion(file, at);
  if (value === null) throw new Error(`${file}.json has no version ${at}`);
  write(live(file), value);
  return at;
}

// One step down the stack, or one step up it. The list runs newest first, so
// undo moves along it and redo moves back. A live file at no version steps to
// the newest, which is the state the app last recorded.
function step(file: RuleFile, by: number, name: string): number {
  const list = versions(file);
  const cursor = current(file);
  const at = cursor === null ? -1 : list.indexOf(cursor);
  const next = list[at + by];
  if (next === undefined) throw new Error(`${file}.json has no ${name} left`);
  return restore(file, next);
}

export const undo = (file: RuleFile): number => step(file, 1, "undo");

export const redo = (file: RuleFile): number => step(file, -1, "redo");

export type Latest = Record<string, number>;

// The newest version of every file, for the deploy guard. A file with no
// history reports 0, which no real edit can equal.
export const latest = (): Latest =>
  Object.fromEntries(RULE_FILES.map((f) => [f, versions(f)[0] ?? 0]));
