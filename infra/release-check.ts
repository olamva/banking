import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Release } from "../src/web/app/releases.ts";

const FILE = "src/web/app/releases.ts";

const parts = (version: string) =>
  /^(\d+)\.(\d+)\.(\d+)$/.exec(version)?.slice(1).map(Number);

const newer = (a: number[], b: number[]) =>
  a[0]! - b[0]! || a[1]! - b[1]! || a[2]! - b[2]!;

const isDate = (date: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(date) &&
  new Date(`${date}T00:00:00Z`).toISOString().startsWith(date);

export function releaseProblems(
  head: Release[],
  base: Release[],
  exempt = false,
): string[] {
  const problems: string[] = [];
  head.forEach((release, i) => {
    const version = parts(release.version);
    if (!version)
      problems.push(`${release.version} is not a semantic version.`);
    if (!isDate(release.date))
      problems.push(`${release.version} has an invalid date.`);
    if (
      !release.highlights.length ||
      release.highlights.some((h) => !h.title.trim() || !h.detail.trim())
    )
      problems.push(`${release.version} needs highlights with text.`);
    const next = head[i + 1];
    const older = next && parts(next.version);
    if (version && older && newer(version, older) <= 0)
      problems.push(`${release.version} must be newer than ${next.version}.`);
    if (next && release.date < next.date)
      problems.push(`${release.version} must not predate ${next.version}.`);
  });
  const kept = head.slice(head.length - base.length).map((r) => r.version);
  if (head.length < base.length || base.some((r, i) => r.version !== kept[i]))
    problems.push("Keep every earlier release and add new ones at the start.");
  else if (head.length === base.length && !exempt)
    problems.push(
      `Add a release to ${FILE}, or apply the "no release" label to the PR.`,
    );
  return problems;
}

async function baseReleases(ref: string): Promise<Release[]> {
  const path = join(mkdtempSync(join(tmpdir(), "releases-")), "releases.ts");
  writeFileSync(
    path,
    execFileSync("git", ["show", `${ref}:${FILE}`], { encoding: "utf8" }),
  );
  return (await import(pathToFileURL(path).href)).RELEASES;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const { RELEASES } = await import("../src/web/app/releases.ts");
  const problems = releaseProblems(
    RELEASES,
    await baseReleases(process.env.RELEASE_BASE ?? "origin/main"),
    process.env.RELEASE_EXEMPT === "true",
  );
  for (const problem of problems) console.error(problem);
  if (problems.length) process.exit(1);
  console.log(`The release check passes at ${RELEASES[0]!.version}.`);
}
