import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  BUMPS,
  NOTE_NAME,
  versioned,
  type Note,
} from "../src/web/app/releaseNotes.ts";

const DIR = "src/web/app/release-notes";

const isDate = (date: string) => {
  const day = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(day.getTime()) && day.toISOString().startsWith(date);
};

function noteProblems(name: string, note: Note): string[] {
  const problems: string[] = [];
  const date = NOTE_NAME.exec(name)?.[1];
  if (!date || !isDate(date))
    problems.push(
      `${name} needs a name like 2026-11-11-1530-short-title.json.`,
    );
  if (!BUMPS.includes(note.bump))
    problems.push(`${name} needs a bump of major, minor or patch.`);
  if (
    !note.highlights?.length ||
    note.highlights.some((h) => !h.title.trim() || !h.detail.trim())
  )
    problems.push(`${name} needs highlights with text.`);
  return problems;
}

export function releaseProblems(
  head: Record<string, Note>,
  base: string[],
  exempt = false,
): string[] {
  const problems = Object.entries(head).flatMap(([name, note]) =>
    noteProblems(name, note),
  );
  for (const name of base)
    if (!(name in head)) problems.push(`Keep the release ${name}.`);
  const newest = base.toSorted().at(-1) ?? "";
  const added = Object.keys(head).filter((name) => !base.includes(name));
  for (const name of added)
    if (name <= newest) problems.push(`${name} must sort after ${newest}.`);
  if (!added.length && !exempt)
    problems.push(
      `Add a release to ${DIR}, or apply the "no release" label to the PR.`,
    );
  return problems;
}

const headNotes = (): Record<string, Note> =>
  Object.fromEntries(
    readdirSync(DIR)
      .filter((name) => name.endsWith(".json"))
      .map((name) => [
        name,
        JSON.parse(readFileSync(`${DIR}/${name}`, "utf8")) as Note,
      ]),
  );

const baseNames = (ref: string): string[] =>
  execFileSync("git", ["ls-tree", "--name-only", ref, `${DIR}/`], {
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean)
    .map((path) => path.slice(DIR.length + 1));

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const head = headNotes();
  const problems = releaseProblems(
    head,
    baseNames(process.env.RELEASE_BASE ?? "origin/main"),
    process.env.RELEASE_EXEMPT === "true",
  );
  for (const problem of problems) console.error(problem);
  if (problems.length) process.exit(1);
  console.log(`The release check passes at ${versioned(head)[0]!.version}.`);
}
