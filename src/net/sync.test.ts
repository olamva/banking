import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { accountKeys, monthsBetween, rangeCost, rangeToDate } from "./sync.ts";

// Enable Banking answers 400 ASPSP_ERROR when date_to is in the future, which
// is every refresh of the month you are currently in.
test("the current month stops at today, not its last calendar day", () => {
  assert.deepEqual(rangeToDate("2026-08", new Date(2026, 7, 8)), {
    from: "2026-08-01",
    to: "2026-08-08",
  });
});

test("a finished month keeps its full range", () => {
  assert.deepEqual(rangeToDate("2026-07", new Date(2026, 7, 8)), {
    from: "2026-07-01",
    to: "2026-07-31",
  });
});

test("the last day of a month is not clamped away", () => {
  assert.deepEqual(rangeToDate("2026-08", new Date(2026, 7, 31)), {
    from: "2026-08-01",
    to: "2026-08-31",
  });
});

test("a bare year opens in January and closes in December", () => {
  const months = monthsBetween("2024", "2025", new Date(2026, 7, 9));
  assert.equal(months.length, 24);
  assert.deepEqual([months[0], months.at(-1)], ["2024-01", "2025-12"]);
});

test("the span never reaches past the month we are standing in", () => {
  // A month that has not happened costs one request per account to be told it
  // is empty, and the file it writes would then be wrong for good.
  assert.deepEqual(monthsBetween("2026-07", "2026", new Date(2026, 7, 9)), [
    "2026-07",
    "2026-08",
  ]);
});

test("the two ends may be months, and a single month is a span of one", () => {
  assert.deepEqual(monthsBetween("2025-11", "2026-02", new Date(2026, 7, 9)), [
    "2025-11",
    "2025-12",
    "2026-01",
    "2026-02",
  ]);
  assert.deepEqual(monthsBetween("2026-03", "2026-03", new Date(2026, 7, 9)), [
    "2026-03",
  ]);
});

test("a backwards span is empty rather than a year of wasted requests", () => {
  assert.deepEqual(monthsBetween("2026", "2024", new Date(2026, 7, 9)), []);
});

test("anything that is not a year or a month is refused before a request is spent", () => {
  assert.throws(
    () => monthsBetween("2026-1", "2026", new Date(2026, 7, 9)),
    /YYYY or YYYY-MM/,
  );
});

test("a span costs the files it is missing, not the months it covers", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "sync-cost-"));
  const cwd = process.cwd();
  process.chdir(dir);
  t.after(() => {
    process.chdir(cwd);
    rmSync(dir, { recursive: true, force: true });
  });
  mkdirSync("rules", { recursive: true });
  writeFileSync(
    "rules/accounts.json",
    JSON.stringify({
      a: { mine: true },
      b: { mine: true },
      gone: { mine: true, sync: false },
    }),
  );
  const months = ["2026-06", "2026-07"];

  // `sync: false` has no key to fetch, so it is not part of the bill.
  assert.equal(await rangeCost(months, false), 4);

  mkdirSync("data/raw/2026-06", { recursive: true });
  writeFileSync("data/raw/2026-06/a.json", "{}");
  // One file on disk is one request not owed — which is what makes re-running
  // a range a resume rather than a repeat.
  assert.equal(await rangeCost(months, false), 3);
  // …unless it is being refetched on purpose.
  assert.equal(await rangeCost(months, true), 4);

  // `--stale N` is the resume of a forced sweep: what was just written is left
  // alone, so a run that died on a 429 does not re-spend the requests it made.
  assert.equal(await rangeCost(months, 60), 3);
  utimesSync(
    "data/raw/2026-06/a.json",
    new Date(),
    new Date(Date.now() - 2 * 3600_000),
  );
  assert.equal(await rangeCost(months, 60), 4);
});

test("an account is not fetched for months before it opened", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "sync-from-"));
  const cwd = process.cwd();
  process.chdir(dir);
  t.after(() => {
    process.chdir(cwd);
    rmSync(dir, { recursive: true, force: true });
  });
  mkdirSync("rules", { recursive: true });
  writeFileSync(
    "rules/accounts.json",
    JSON.stringify({
      old: { mine: true },
      card: { mine: true, from: "2026-02" },
    }),
  );

  // The month it opened counts; the month before it does not exist yet.
  assert.deepEqual(await accountKeys("2026-02"), ["old", "card"]);
  assert.deepEqual(await accountKeys("2026-01"), ["old"]);
  // No month asked about is no floor applied — the CLI's own listing.
  assert.deepEqual(await accountKeys(), ["old", "card"]);

  // And the estimate says so before anything is spent: three months, one
  // account for two of them and two for the third.
  assert.equal(
    await rangeCost(["2025-12", "2026-01", "2026-02"], false),
    1 + 1 + 2,
  );
});

test("a numeric --force refetches, but leaves what this run already wrote", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "sync-force-"));
  const cwd = process.cwd();
  process.chdir(dir);
  t.after(() => {
    process.chdir(cwd);
    rmSync(dir, { recursive: true, force: true });
  });
  mkdirSync("rules", { recursive: true });
  writeFileSync(
    "rules/accounts.json",
    JSON.stringify({ a: { mine: true }, b: { mine: true } }),
  );
  mkdirSync("data/raw/2026-06", { recursive: true });
  writeFileSync("data/raw/2026-06/a.json", "{}");

  const months = ["2026-06"];
  // Written seconds ago, so a 60-minute window leaves it alone and only the
  // account the run never reached is owed — which is what makes a forced sweep
  // resumable after the cap stops it.
  assert.equal(await rangeCost(months, 60), 1);

  // Older than the window, and it is owed again like anything else.
  const twoHoursAgo = new Date(Date.now() - 2 * 3600_000);
  utimesSync("data/raw/2026-06/a.json", twoHoursAgo, twoHoursAgo);
  assert.equal(await rangeCost(months, 60), 2);

  // The booleans are the ends of the same scale: everything, or only what is missing.
  assert.equal(await rangeCost(months, true), 2);
  assert.equal(await rangeCost(months, false), 1);
});
