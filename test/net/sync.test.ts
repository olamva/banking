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
import {
  accountKeys,
  monthsBetween,
  rangeCost,
  rangeToDate,
  spans,
  splitSpan,
  thisMonth,
} from "../../src/net/sync.ts";

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

test("a missing --to means the month we are standing in", () => {
  const today = new Date(2026, 7, 14);
  assert.equal(thisMonth(today), "2026-08");
  assert.deepEqual(monthsBetween("2026-06", thisMonth(today), today), [
    "2026-06",
    "2026-07",
    "2026-08",
  ]);
  // Zero-padded, so it sorts and compares like every other month string here —
  // an unpadded "2026-1" would both fail `bound` and sort after "2026-12".
  assert.equal(thisMonth(new Date(2026, 0, 3)), "2026-01");
});

test("a sweep is cut into five-year spans, which is the bank's own ceiling", () => {
  // `fromDate`..`toDate` longer than five years is a 400, so 60 months is the
  // widest a single request may be — and the remainder is its own span rather
  // than being dropped or padded.
  const months = monthsBetween("2018-09", "2026-08", new Date(2026, 7, 14));
  assert.equal(months.length, 96);
  const parts = spans(months);
  assert.deepEqual(
    parts.map((p) => [p[0], p.at(-1), p.length]),
    [
      ["2018-09", "2023-08", 60],
      ["2023-09", "2026-08", 36],
    ],
  );
  // Every month lands in exactly one span, in order.
  assert.deepEqual(parts.flat(), months);
});

test("a range longer than five years is split, never refused", () => {
  // The bank's ceiling is a reason to cut a sweep up, not a reason to make the
  // caller do the cutting: 13 years is three requests, not a 400.
  const today = new Date(2026, 7, 14);
  const parts = spans(monthsBetween("2014", thisMonth(today), today));
  assert.equal(parts.length, 3);
  assert.deepEqual(
    parts.map((p) => [p[0], p.at(-1)]),
    [
      ["2014-01", "2018-12"],
      ["2019-01", "2023-12"],
      ["2024-01", "2026-08"],
    ],
  );
  // None of them can trip `Date interval cannot exceed 5 years`.
  for (const p of parts) assert.ok(p.length <= 60);
});

test("a row is filed by its Oslo month, not its UTC one", () => {
  // Norwegian midnight on 1 July is 22:00Z on 30 June. Splitting on UTC would
  // write this row into data/raw/2023-06/, where normalizeMonth — which reads
  // Europe/Oslo — would then never look for it.
  const midnightOslo1July = Date.UTC(2023, 5, 30, 22, 0, 0);
  assert.equal(
    new Date(midnightOslo1July).toISOString().slice(0, 7),
    "2023-06",
    "the trap: this timestamp is June in UTC",
  );
  const split = splitSpan([
    { transaction: { date: midnightOslo1July, accountKey: "a" } },
  ]);
  assert.deepEqual([...split.keys()], ["2023-07/a"]);
});

test("a span response splits into one bucket per month per account", () => {
  const oslo = (y: number, m: number, d: number) =>
    Date.UTC(y, m - 1, d, 12, 0, 0);
  const split = splitSpan([
    { transaction: { date: oslo(2024, 1, 5), accountKey: "a" } },
    { transaction: { date: oslo(2024, 1, 31), accountKey: "a" } },
    { transaction: { date: oslo(2024, 1, 5), accountKey: "b" } },
    { transaction: { date: oslo(2024, 2, 1), accountKey: "a" } },
  ]);
  assert.deepEqual(
    [...split].map(([k, v]) => [k, v.length]),
    [
      ["2024-01/a", 2],
      ["2024-01/b", 1],
      ["2024-02/a", 1],
    ],
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
