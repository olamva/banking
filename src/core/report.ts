/**
 * What `rules/overrides.json` still earns, now that the bank's own subcategory
 * is on the row.
 *
 * The bank sends `main` *and* `sub` on every transaction, and half of
 * `rules/overrides.json` was written to re-derive the sub by hand before anyone
 * noticed it was there. This says which lines that is — and, for the lines that
 * disagree with the bank, which of the two is worth keeping.
 *
 * It is a report and only a report, the same division as `peers.ts` and
 * `merchants.ts`: it prints, a person edits, nothing under `rules/` is a tool's
 * to rewrite.
 *
 * **The verdict is a counterfactual, not a resemblance.** A line is redundant
 * when deleting it changes no row's category — computed by re-running
 * `categorize` over that line's own rows with the line removed, which is the
 * same function the pipeline runs and so cannot drift from it. Nothing here
 * guesses at a mapping between our slugs and the bank's.
 */
import {
  bankPair,
  categorize,
  compile,
  haystackOf,
  splitCategory,
  type Overrides,
  type Subscriptions,
} from './categorize.ts';
import type { Categorized } from './types.ts';

/**
 * - `unused` — matches nothing on record. Delete it, or find out why it misses.
 * - `redundant` — every row keeps its category without it. Delete it; the rows
 *   gain the bank's subcategory in exchange.
 * - `rewrite` — the value is *our name* for the pair the bank already sends, on
 *   every row. `"eletra": "stroem"` against `faste_boutgifter/stroem` is the
 *   shape. Rewrite the value to `suggest` and the line becomes redundant.
 * - `diverges` — the bank has an opinion on every row and it is a *different
 *   claim*, not a different spelling. Read it and decide; do not paste it.
 *   `"uber *eats": "kafe_og_restaurant"` against `bil_og_transport/taxi` is the
 *   shape, and so is every airport shop the bank files as `reise/annen_reise`
 *   because the terminal stands airside. The line is load-bearing until you
 *   say otherwise — `suggest` is what the bank would do, not a recommendation.
 * - `load-bearing` — no row keeps its category, and the bank is not the reason.
 *   Keep it. `"sit kafe"` is one: without it a canteen reads as rent.
 * - `mixed` — some rows keep it and some do not. Read the outcomes.
 */
export type Verdict = 'unused' | 'redundant' | 'rewrite' | 'diverges' | 'load-bearing' | 'mixed';

/** What the rest of the chain says about one group of a pattern's rows. */
export type Outcome = {
  /** The category the row would land in with this line deleted. */
  fallback: string;
  /** The bank's own pair on those rows, and its Norwegian name. Blank where the bank sent none. */
  bankPair: string;
  bankName: string;
  /** Rounded down across the group — the bank is per-row and this is a summary. */
  confidence: number;
  rows: number;
  /** True where deleting the line leaves the category unchanged. */
  same: boolean;
  /**
   * True where the fallback is the bank's own pair rather than a second
   * override, a peer name or the shrug. Only these make a line a `rewrite`.
   */
  fromBank: boolean;
  /** Up to three names from the group, so a verdict can be sanity-checked by eye. */
  examples: string[];
};

export type PatternReport = {
  pattern: string;
  /** The right-hand side of the line, as written — bare slug or `main/sub`. */
  value: string;
  verdict: Verdict;
  rows: number;
  /** NOK, magnitude. A refund inside the group nets off. */
  total: number;
  /** Rows whose category survives deleting the line. */
  kept: number;
  /**
   * The one bank pair every row falls to, as a value to paste in place of
   * `value` — `"faste_boutgifter/stroem"`. Null where the rows fall to more
   * than one pair, or to something that is not the bank.
   *
   * Set on `mixed` lines too, where it is the pair the bank agrees on for the
   * part of the group it has an opinion about.
   */
  suggest: string | null;
  /** Grouped by what the fallback said, most rows first. */
  outcomes: Outcome[];
};

const EXAMPLES = 3;

/**
 * What each of our own category slugs *means*, learned from the corpus rather
 * than from a map somebody has to maintain.
 *
 * Two shapes, and they need different tests:
 *
 * - A slug that **is** a bank main (`kafe_og_restaurant`, `reise`) already
 *   agrees with the bank by construction. A rewrite there only ever *adds* a
 *   second level, so the bank's main matching ours is the whole test.
 * - A slug that is **ours alone** (`uteliv`, `stroem`, `husleie`) is an alias
 *   for some bank pair, and which pair is a fact about the data: `uteliv` is
 *   `kafe_og_restaurant/utesteder` on 155 rows. There the whole pair has to
 *   match, because the main agreeing says nothing — `barrock` arrives as
 *   `kafe_og_restaurant/restaurant`, same main, and it is a bar.
 *
 * Catch-all rows are skipped: `diverse` and `ukategorisert` are not opinions.
 */
type Meaning = { mains: Set<string>; aliasOf: Map<string, string> };

function meaning(rows: Categorized[]): Meaning {
  const mains = new Set<string>();
  const pairs = new Map<string, Map<string, number>>();
  for (const t of rows) {
    const b = bankPair(t);
    if (!b) continue;
    mains.add(b.category);
    const seen = pairs.get(t.category) ?? new Map<string, number>();
    const key = pairText(b);
    seen.set(key, (seen.get(key) ?? 0) + 1);
    pairs.set(t.category, seen);
  }
  const aliasOf = new Map<string, string>();
  for (const [slug, seen] of pairs)
    aliasOf.set(slug, [...seen].reduce((a, b) => (b[1] > a[1] ? b : a))[0]);
  return { mains, aliasOf };
}

/**
 * Is the pair the bank puts on this line the same claim our value already
 * makes, or a different one?
 *
 * This is the whole difference between a line to paste and a line to argue
 * with, and getting it wrong is worse than not having it: eight of the first
 * run's "rewrites" were the bank reclassifying an airport bakery as travel and
 * a Tokyo transit card as a flight.
 */
function sameClaim(ours: string, suggest: string, m: Meaning): boolean {
  if (m.mains.has(ours)) return suggest.split('/')[0] === ours;
  return suggest === m.aliasOf.get(ours);
}


/** Every row this pattern is the *first* override match for — what `categorize` gives it. */
function claimed(rows: Categorized[], patterns: string[]): Map<string, Categorized[]> {
  const compiled = patterns.map((p) => ({ pattern: p, matches: compile(p, 'rules/overrides.json') }));
  const out = new Map<string, Categorized[]>(patterns.map((p) => [p, []]));
  for (const t of rows) {
    // An excluded row never reaches an override — `categorize` returns the
    // transfer slug above every rule — so counting one here would credit a line
    // with a row it does not decide.
    if (t.excluded) continue;
    const hit = compiled.find((c) => c.matches(haystackOf(t)));
    if (hit) out.get(hit.pattern)!.push(t);
  }
  return out;
}

/** `main/sub`, or the main alone where there is no second level. */
export const pairText = (p: { category: string; subcategory: string | null }): string =>
  p.subcategory ? `${p.category}/${p.subcategory}` : p.category;

/**
 * Would deleting the line leave this row where the line put it?
 *
 * A stated subcategory must survive; an unstated one may be *filled in*. That
 * asymmetry is the whole point of the migration: a bare `"dagligvarer"` losing
 * its line and picking up `dagligvarer/dagligvarer` from the bank is a gain and
 * the line is redundant, but `"kafe_og_restaurant/utesteder"` losing its line
 * and picking up `kafe_og_restaurant/restaurant` is a bar being called a
 * restaurant, and the line is holding that off.
 *
 * Comparing the category alone was right only while nothing but the bank ever
 * set a sub. The moment a rule value could carry one, it silently deleted
 * `"barrock"` and moved two rows.
 */
function survives(after: Categorized, ours: string, sub: string | null): boolean {
  if (after.category !== ours) return false;
  return sub === null || after.subcategory === sub;
}

function group(rows: Categorized[], fallbacks: Categorized[], ours: string, sub: string | null): Outcome[] {
  const acc = new Map<string, Outcome>();
  rows.forEach((t, i) => {
    const after = fallbacks[i]!;
    const pair = t.bankCategory ? `${t.bankCategory}/${t.bankSub ?? ''}` : '';
    const fallback = pairText(after);
    const bank = bankPair(t);
    const key = `${fallback} | ${pair}`;
    const o = acc.get(key) ?? {
      fallback,
      bankPair: pair,
      bankName: [t.bankCategoryName, t.bankSubName].filter(Boolean).join(' > '),
      confidence: t.bankConfidence ?? 0,
      rows: 0,
      same: survives(after, ours, sub),
      // The bank decided this row iff its own pair is exactly what came back. A
      // second override landing on the same string is not the bank agreeing.
      fromBank: !!bank && pairText(bank) === fallback,
      examples: [],
    };
    o.rows++;
    o.confidence = Math.min(o.confidence, t.bankConfidence ?? 0);
    const name = t.counterparty ?? t.description;
    if (o.examples.length < EXAMPLES && !o.examples.includes(name)) o.examples.push(name);
    acc.set(key, o);
  });
  return [...acc.values()].sort((a, b) => b.rows - a.rows);
}

/**
 * `rows` must be everything on record, not a period: a line that decides four
 * rows in one month and forty in another is only judged against the forty.
 *
 * The remaining arguments are the other rules files, passed through untouched so
 * the counterfactual runs the whole chain and not just the overrides — deleting
 * a line can hand its rows to `rules/vipps.json` or to the bank, and both are
 * answers the person editing the file needs to see.
 */
export function overrideReport(
  rows: Categorized[],
  overrides: Overrides,
  subscriptions: Subscriptions = [],
  peers: string[] = [],
  giro: Overrides = {},
  cards: Set<string> = new Set(),
): PatternReport[] {
  const patterns = Object.keys(overrides);
  const byPattern = claimed(rows, patterns);
  const m = meaning(rows);

  return patterns
    .map((pattern) => {
      const mine = byPattern.get(pattern)!;
      const value = overrides[pattern]!;
      const ours = splitCategory(value).category;
      // The same file with this one line gone, and the real `categorize` run
      // over it. Only this pattern's own rows are re-run: no other row can
      // change, since nothing else was matching this line in the first place.
      const without = { ...overrides };
      delete without[pattern];
      const fallbacks = categorize(mine, without, subscriptions, peers, giro, cards);
      const outcomes = group(mine, fallbacks, ours, splitCategory(value).subcategory);
      const kept = outcomes.reduce((n, o) => n + (o.same ? o.rows : 0), 0);
      // Where every row the bank has an opinion on falls to one and the same
      // pair, that pair is what this line should have said in the first place.
      // More than one, and there is nothing to suggest — the group is really
      // two groups and the person editing has to see that rather than be told a
      // number that fits neither half.
      const banked = [...new Set(outcomes.filter((o) => o.fromBank).map((o) => o.fallback))];
      const suggest = banked.length === 1 ? banked[0]! : null;
      const allBank = suggest !== null && outcomes.every((o) => o.fromBank);
      const verdict: Verdict =
        mine.length === 0
          ? 'unused'
          : kept === mine.length
            ? 'redundant'
            : kept === 0 && allBank
              ? sameClaim(ours, suggest, m)
                ? 'rewrite'
                : 'diverges'
              : kept === 0
                ? 'load-bearing'
                : 'mixed';
      return {
        pattern,
        value,
        verdict,
        rows: mine.length,
        total: mine.reduce((n, t) => n + Math.abs(t.amount), 0),
        kept,
        suggest,
        outcomes,
      };
    })
    .sort((a, b) => b.rows - a.rows);
}

/** One bank pair, and what our own rules currently call its rows. */
export type PairUse = {
  pair: string;
  /** The bank's Norwegian name for it — the label the page will show. */
  name: string;
  rows: number;
  /** What we file those rows as today, most rows first. */
  ours: { category: string; rows: number }[];
};

/**
 * Every bank pair on record against what we make of it — the other half of the
 * question, and the one that says what a two-level page would look like.
 *
 * Excluded rows are in: they are all one slug by design, and seeing 785 rows of
 * `sparing/sparing` land there is how you check that the design still holds.
 */
export function pairUse(rows: Categorized[]): PairUse[] {
  const acc = new Map<string, { name: string; rows: number; ours: Map<string, number> }>();
  for (const t of rows) {
    const pair = t.bankCategory ? `${t.bankCategory}/${t.bankSub ?? ''}` : '(none)';
    const a = acc.get(pair) ?? {
      name: [t.bankCategoryName, t.bankSubName].filter(Boolean).join(' > '),
      rows: 0,
      ours: new Map<string, number>(),
    };
    a.rows++;
    a.ours.set(t.category, (a.ours.get(t.category) ?? 0) + 1);
    acc.set(pair, a);
  }
  return [...acc]
    .map(([pair, a]) => ({
      pair,
      name: a.name,
      rows: a.rows,
      ours: [...a.ours]
        .map(([category, rows]) => ({ category, rows }))
        .sort((x, y) => y.rows - x.rows),
    }))
    .sort((a, b) => b.rows - a.rows);
}

/**
 * Every slug we assign that the bank never spells — the list that has to be
 * given a Norwegian name before a two-level page can label it.
 *
 * Asked per *slug* and per level, not per pair: `dagligvarer` with no
 * subcategory on it is still a main the bank names `Dagligvarer`, and listing
 * it as unnamed would bury the dozen that really are ours. A slug counts as
 * named the moment any row anywhere carries it as the bank's own main (for a
 * category) or sub (for a subcategory).
 *
 * Two ways off this list, and the report deliberately does not choose between
 * them: give the slug a name, or rewrite the rules so it becomes a pair the
 * bank already sends. `uteliv` should take the second — the bank has
 * `kafe_og_restaurant/utesteder` and agrees on 155 of its rows. `overfoering`
 * and `linjeforening_kiosk` have no bank pair at all and must take the first.
 */
export function unnamed(rows: Categorized[]): { slug: string; level: 'category' | 'subcategory'; rows: number }[] {
  const mains = new Set(rows.map((t) => t.bankCategory).filter(Boolean));
  const subs = new Set(rows.map((t) => t.bankSub).filter(Boolean));
  const acc = new Map<string, { slug: string; level: 'category' | 'subcategory'; rows: number }>();
  const note = (slug: string, level: 'category' | 'subcategory') => {
    const key = `${level} ${slug}`;
    const a = acc.get(key) ?? { slug, level, rows: 0 };
    a.rows++;
    acc.set(key, a);
  };
  for (const t of rows) {
    if (!mains.has(t.category)) note(t.category, 'category');
    if (t.subcategory && !subs.has(t.subcategory)) note(t.subcategory, 'subcategory');
  }
  return [...acc.values()].sort((a, b) => b.rows - a.rows);
}

/** Two patterns that both match the same rows, and which one wins today. */
export type Overlap = {
  /** Earlier in the file, so `categorize` gives it the rows. */
  winner: string;
  winnerValue: string;
  /** Later in the file, so it never sees them. */
  loser: string;
  loserValue: string;
  rows: number;
  /**
   * True where both name the same category, so the order genuinely does not
   * matter and the pair needs no work — the rows land in the same place either
   * way. Only the false ones are load-bearing ordering.
   */
  harmless: boolean;
  examples: string[];
};

/**
 * Every pair of override patterns that compete for the same rows.
 *
 * `categorize` resolves a collision by file order — first match wins — and that
 * is an invisible requirement: the file reads as a set of independent rules and
 * behaves as a sequence. Nothing warns you when a line you add at the top
 * quietly swallows rows from one further down, and nothing warns you when
 * sorting the file changes what a month costs.
 *
 * The fix is in the patterns, not in the matcher: narrow them until nothing
 * here is left, and the order stops mattering because no two lines can ever
 * claim the same row. An empty list is that proof.
 *
 * `rules/payees.json` can create one of these out of nothing, which is how the
 * ordering bites hardest: it rewrites `ONLINE LINJ TR` to
 * `Online Linjeforeningen`, and the new string matches a *different* override
 * than the one that decided the row. `categorize` runs first so the pipeline is
 * right, but the two files disagree about what a row is called.
 */
export function overlaps(rows: Categorized[], overrides: Overrides): Overlap[] {
  const patterns = Object.keys(overrides);
  const compiled = patterns.map((p) => ({ pattern: p, matches: compile(p, 'rules/overrides.json') }));
  const acc = new Map<string, Overlap>();

  for (const t of rows) {
    if (t.excluded) continue;
    const hay = haystackOf(t);
    const hit = compiled.filter((c) => c.matches(hay));
    if (hit.length < 2) continue;
    // The first is the winner by the same rule `categorize` uses; every other
    // match is a line that would have decided this row had it been first.
    const [winner, ...losers] = hit;
    for (const loser of losers) {
      const key = `${winner!.pattern} | ${loser.pattern}`;
      const o = acc.get(key) ?? {
        winner: winner!.pattern,
        winnerValue: overrides[winner!.pattern]!,
        loser: loser.pattern,
        loserValue: overrides[loser.pattern]!,
        rows: 0,
        harmless: overrides[winner!.pattern]!.split('/')[0] === overrides[loser.pattern]!.split('/')[0],
        examples: [],
      };
      o.rows++;
      const name = t.counterparty ?? t.description;
      if (o.examples.length < EXAMPLES && !o.examples.includes(name)) o.examples.push(name);
      acc.set(key, o);
    }
  }
  // The ones that change a category first, and the biggest of those first.
  return [...acc.values()].sort((a, b) => Number(a.harmless) - Number(b.harmless) || b.rows - a.rows);
}

/** One pattern, everything that outranks it, and the form that would not need the ranking. */
export type Narrowing = {
  pattern: string;
  value: string;
  /** Patterns that take rows from it today, most rows first. */
  beaten: { pattern: string; value: string; rows: number }[];
  /**
   * The same rule written so no other line can reach its rows — paste this and
   * the file order stops deciding. Empty where one of the winners cannot be
   * inlined safely, and the narrowing has to be written by hand.
   */
  suggest: string;
};

/** A pattern as a regex body: `/\bsit\b/` -> `\bsit\b`, `sit kafe` -> `sit kafe` escaped. */
function body(pattern: string): string | null {
  const asRegex = /^\/(.+)\/([a-z]*)$/.exec(pattern);
  if (!asRegex) return pattern.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // An anchor means the body is positional, and dropping it into a lookahead
  // moves what it anchors to. Rare enough to hand back rather than guess at.
  return /[$^]/.test(asRegex[1]!) ? null : asRegex[1]!;
}

/**
 * Every pattern that only works because of where it sits in the file, and the
 * form that would work anywhere.
 *
 * The suggestion is a pair of lookaheads: refuse the rows the sharper lines
 * claim, then require what this line was always looking for. `compile` runs a
 * regex with `.test` over the whole haystack, so both are unanchored assertions
 * at position zero and neither consumes anything — which is what lets them be
 * combined without knowing anything about either side.
 *
 *     "/\\bsit\\b/"  ->  "/^(?!.*(?:sit kafe|sit storkiosk))(?=.*\\bsit\\b)/"
 *
 * Collisions where both lines name the same category are left out: the order
 * decides nothing there, and rewriting a rule that is already correct is how a
 * working file gets broken.
 */
export function narrowings(rows: Categorized[], overrides: Overrides): Narrowing[] {
  const byLoser = new Map<string, Narrowing>();
  for (const c of overlaps(rows, overrides)) {
    if (c.harmless) continue;
    const n = byLoser.get(c.loser) ?? { pattern: c.loser, value: c.loserValue, beaten: [], suggest: '' };
    n.beaten.push({ pattern: c.winner, value: c.winnerValue, rows: c.rows });
    byLoser.set(c.loser, n);
  }
  for (const n of byLoser.values()) {
    n.beaten.sort((a, b) => b.rows - a.rows);
    const mine = body(n.pattern);
    const theirs = n.beaten.map((b) => body(b.pattern));
    n.suggest =
      mine && theirs.every(Boolean) ? `/^(?!.*(?:${theirs.join('|')}))(?=.*${mine})/` : '';
  }
  return [...byLoser.values()].sort(
    (a, b) => b.beaten.reduce((n, x) => n + x.rows, 0) - a.beaten.reduce((n, x) => n + x.rows, 0),
  );
}
