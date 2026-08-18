/**
 * Which lines of `rules/overrides.json` only work where they sit in the file.
 *
 * `categorize` takes the first pattern that matches, so two lines competing for
 * a row make the file's order load-bearing and invisible. An empty list is the
 * proof that the file can be sorted freely.
 */
import { compile, haystackOf, type Overrides } from "./categorize.ts";
import type { Categorized } from "./types.ts";

const EXAMPLES = 3;

export type Overlap = {
  winner: string;
  winnerValue: string;
  loser: string;
  loserValue: string;
  rows: number;
  /** Both name the same category, so the order decides nothing. */
  harmless: boolean;
  examples: string[];
};

/** Every pair of override patterns that compete for the same rows. */
export function overlaps(rows: Categorized[], overrides: Overrides): Overlap[] {
  const compiled = Object.keys(overrides).map((p) => ({
    pattern: p,
    matches: compile(p, "rules/overrides.json"),
  }));
  const acc = new Map<string, Overlap>();

  for (const t of rows) {
    if (t.excluded) continue;
    const hit = compiled.filter((c) => c.matches(haystackOf(t)));
    if (hit.length < 2) continue;
    const [winner, ...losers] = hit;
    for (const loser of losers) {
      const key = `${winner!.pattern} | ${loser.pattern}`;
      const o = acc.get(key) ?? {
        winner: winner!.pattern,
        winnerValue: overrides[winner!.pattern]!,
        loser: loser.pattern,
        loserValue: overrides[loser.pattern]!,
        rows: 0,
        harmless:
          overrides[winner!.pattern]!.split("/")[0] ===
          overrides[loser.pattern]!.split("/")[0],
        examples: [],
      };
      o.rows++;
      const name = t.counterparty ?? t.description;
      if (o.examples.length < EXAMPLES && !o.examples.includes(name))
        o.examples.push(name);
      acc.set(key, o);
    }
  }
  return [...acc.values()].sort(
    (a, b) => Number(a.harmless) - Number(b.harmless) || b.rows - a.rows,
  );
}

export type Narrowing = {
  pattern: string;
  value: string;
  beaten: { pattern: string; value: string; rows: number }[];
  /** Empty where a winner cannot be inlined and the fix has to be by hand. */
  suggest: string;
};

/** `/\bsit\b/` -> `\bsit\b`, `sit kafe` -> the same, escaped. */
function body(pattern: string): string | null {
  const asRegex = /^\/(.+)\/([a-z]*)$/.exec(pattern);
  if (!asRegex)
    return pattern.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // An anchor is positional, so dropping it into a lookahead moves what it
  // anchors to.
  return /[$^]/.test(asRegex[1]!) ? null : asRegex[1]!;
}

/**
 * The order-dependent lines, and the form that would work anywhere: refuse the
 * rows the sharper lines claim, then require what this line looks for. Both are
 * lookaheads, so neither consumes anything and position stops mattering.
 *
 *     "/\\bsit\\b/"  ->  "/^(?!.*(?:sit kafe|sit storkiosk))(?=.*\\bsit\\b)/"
 */
export function narrowings(
  rows: Categorized[],
  overrides: Overrides,
): Narrowing[] {
  const byLoser = new Map<string, Narrowing>();
  for (const c of overlaps(rows, overrides)) {
    if (c.harmless) continue;
    const n = byLoser.get(c.loser) ?? {
      pattern: c.loser,
      value: c.loserValue,
      beaten: [],
      suggest: "",
    };
    n.beaten.push({ pattern: c.winner, value: c.winnerValue, rows: c.rows });
    byLoser.set(c.loser, n);
  }
  for (const n of byLoser.values()) {
    n.beaten.sort((a, b) => b.rows - a.rows);
    const mine = body(n.pattern);
    const theirs = n.beaten.map((b) => body(b.pattern));
    n.suggest =
      mine && theirs.every(Boolean)
        ? `/^(?!.*(?:${theirs.join("|")}))(?=.*${mine})/`
        : "";
  }
  return [...byLoser.values()].sort(
    (a, b) =>
      b.beaten.reduce((n, x) => n + x.rows, 0) -
      a.beaten.reduce((n, x) => n + x.rows, 0),
  );
}
