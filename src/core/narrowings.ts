import { compile, haystackOf } from "./match.ts";
import type { RuleMap } from "./ruleFiles.ts";
import type { Categorized } from "./types.ts";

const EXAMPLES = 3;

export type Overlap = {
  winner: string;
  winnerValue: string;
  loser: string;
  loserValue: string;
  rows: number;
  harmless: boolean;
  examples: string[];
};

export function overlaps(
  rows: Categorized[],
  categories: RuleMap,
  includeExcluded = false,
): Overlap[] {
  const compiled = Object.keys(categories).map((p) => ({
    pattern: p,
    matches: compile(p, "rules/categories.json"),
  }));
  const acc = new Map<string, Overlap>();
  const hits = new Map<string, typeof compiled>();

  for (const t of rows) {
    if (t.excluded && !includeExcluded) continue;
    const haystack = haystackOf(t);
    const hit =
      hits.get(haystack) ?? compiled.filter((c) => c.matches(haystack));
    hits.set(haystack, hit);
    if (hit.length < 2) continue;
    const [winner, ...losers] = hit;
    for (const loser of losers) {
      const key = `${winner!.pattern} | ${loser.pattern}`;
      const o = acc.get(key) ?? {
        winner: winner!.pattern,
        winnerValue: categories[winner!.pattern]!,
        loser: loser.pattern,
        loserValue: categories[loser.pattern]!,
        rows: 0,
        harmless: categories[winner!.pattern] === categories[loser.pattern],
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
  suggest: string;
};

function body(pattern: string): string | null {
  const asRegex = /^\/(.+)\/([a-z]*)$/.exec(pattern);
  if (!asRegex)
    return pattern.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // An anchor is positional. A lookahead moves what the anchor applies to.
  return /[$^]/.test(asRegex[1]!) ? null : asRegex[1]!;
}

export function narrowings(
  rows: Categorized[],
  categories: RuleMap,
): Narrowing[] {
  const byLoser = new Map<string, Narrowing>();
  for (const c of overlaps(rows, categories)) {
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
        ? `/^(?!.*(?:${theirs.join("|")}))(?=.*(?:${mine}))/`
        : "";
  }
  return [...byLoser.values()].sort(
    (a, b) =>
      b.beaten.reduce((n, x) => n + x.rows, 0) -
      a.beaten.reduce((n, x) => n + x.rows, 0),
  );
}
