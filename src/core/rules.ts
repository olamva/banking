import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { compile, splitCategory } from "./categorize.ts";
import { RULES_DIR } from "./paths.ts";
import {
  CATEGORY_VALUED,
  RULE_FILES,
  diffRules,
  isMapFile as isMap,
  type RuleChange,
  type RuleFile,
  type Rules,
} from "./ruleFiles.ts";

export { RULE_FILES, isRuleFile } from "./ruleFiles.ts";
export type { RuleFile, RuleMap, Rules } from "./ruleFiles.ts";

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

// The newest first. A version is the whole file as it stood after one edit, so
// the newest entry holds what the live file holds.
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

// The history starts empty for a file that was only ever edited by hand. Record
// what is there before the first write, or that state has no version to
// go back to.
function commit(file: RuleFile, next: Rules): number {
  const first = versions(file).length === 0;
  if (first) snapshot(file, load(file));
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
  compile(key, `${file}.json`);
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
  const current = load(file);
  if (Array.isArray(current)) {
    const without = current.filter((k) => k !== key && k !== was);
    return commit(file, remove ? without : [...without, key]);
  }
  const next = { ...current };
  if (was !== undefined) delete next[was];
  if (remove) delete next[key];
  else next[key] = value!;
  return commit(file, next);
}

export function saveValues(
  file: RuleFile,
  keys: string[],
  value: string,
): number {
  if (keys.length === 0) throw new Error(`${file}.json needs a pattern`);
  const current = load(file);
  if (Array.isArray(current)) throw new Error(`${file}.json has no values`);
  for (const key of keys) check({ file, key, value });
  const next = { ...current };
  for (const key of keys) if (key in next) next[key] = value;
  return commit(file, next);
}

// A restore is permanent. Every version above the one it names goes, and the
// one it names moves to the top, so the history reads forward to the state the
// file is in. The page asks before it calls this.
//
// The stamp moves forward because it must. `infra/rules-lib.sh` compares the
// newest stamp on each side to say which side is ahead, so a stamp that goes
// backwards reads as the site holding edits this machine lacks. The deploy then
// refuses, and the pull it names puts the deleted versions back.
export function restore(file: RuleFile, at: number): number {
  const value = readVersion(file, at);
  if (value === null) throw new Error(`${file}.json has no version ${at}`);
  for (const above of versions(file))
    if (above > at) rmSync(versionPath(file, above));
  const now = stamp(file);
  renameSync(versionPath(file, at), versionPath(file, now));
  write(live(file), value);
  return now;
}

// Take the version before the newest one, and record it as a new version. The
// newest holds what the live file holds, so this steps one edit back. A second
// undo therefore returns to where it started, which is what `git revert` of a
// revert does too. Restore is the permanent one, and this is not it.
export function undo(file: RuleFile): number {
  const previous = versions(file)[1];
  if (previous === undefined) throw new Error(`${file}.json has no undo left`);
  return commit(file, readVersion(file, previous));
}

export type Latest = Record<string, number>;

// The newest version of every file, for the deploy guard. A file with no
// history reports 0, which no real edit can equal.
export const latest = (): Latest =>
  Object.fromEntries(RULE_FILES.map((f) => [f, versions(f)[0] ?? 0]));
