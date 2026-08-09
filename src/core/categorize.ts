import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { Classified, Categorized } from './types.ts';

/**
 * overrides.json: { "<pattern>": "<category>" }
 *
 * A pattern is a case-insensitive substring, or a regex if written as
 * `/.../ ` — `"/\\bleie\\b/"` matches the word *leie* but not *utleie* or
 * *leiebil*, which a substring cannot express.
 *
 * Matched against `description` and `counterparty` both, because the two
 * sources put the useful string in different places: SB1's description carries
 * the merchant, while a card row's description is a generic `Varekjøp` and the
 * merchant only arrives in `counterparty`, from the statement export.
 *
 * Not committed — hand-edited locally, applied on top of bankCategory. A
 * missing file means no overrides, not an error.
 */
export type Overrides = Record<string, string>;

const UNCATEGORIZED = 'ukategorisert';
const TRAVEL = 'reise';

/**
 * The statement export ends a card merchant with the terminal's ISO country,
 * `NAME, CITY, XXX`. Anything but NOR was bought abroad, which for this account
 * always means a trip — so those rows are travel rather than an opaque bucket.
 *
 * It misreads a foreign *biller* as a trip (Apple bills from IRL, Fortnite from
 * CHE). An override wins over this, which is where those belong anyway.
 */
const FOREIGN_MERCHANT = /,\s*(?!NOR$)[A-Z]{3}$/;

/**
 * The bank's own catch-all carries no more information than having no category
 * at all, so it collapses into one bucket rather than looking like a real one.
 */
const BANK_CATCH_ALL = 'diverse';

/**
 * The bank calls its fixed-cost bucket `faste_boutgifter`, but it is not only
 * housing — tuition and union dues book there too. Renamed on the way out so
 * one slug does not misname half its own rows. Rename here rather than in
 * `overrides.json`, because these rows carry no override at all: the slug
 * arrives on `bankCategory` and would otherwise reach the page unchanged.
 */
const BANK_FIXED_COSTS = 'faste_boutgifter';
const FIXED_COSTS = 'faste_utgifter';

/**
 * subscriptions.json: `["<pattern>", ...]`, the same pattern language.
 *
 * A separate axis from the category, not a category of its own — Telenor is a
 * fixed housing cost *and* a subscription, and forcing a choice between the two
 * loses one of them. SB1 sets `subscription` itself on standing bank payments;
 * a card row can never carry it, because Enable Banking has no such field, so
 * every subscription paid by card needs a pattern here to be seen at all.
 */
export type Subscriptions = string[];

async function loadJson<T>(path: string, fallback: T): Promise<T> {
  if (!existsSync(path)) return fallback;
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

/**
 * vennebetaling.json: `["<name>", ...]`, the same pattern language.
 *
 * Person-to-person payments were half the lines of `overrides.json` and every
 * one of them mapped to the same category, so they live as a bare list of names
 * instead. Folded into the overrides at load time — a name is an override like
 * any other, it just does not need its value repeated fifty times.
 *
 * Appended after `overrides.json`, and an explicit entry there wins, so a person
 * who shares a string with a merchant can still be overridden by hand.
 */
const PEER_PAYMENT = 'vennebetaling';

export async function loadOverrides(path = 'overrides.json', peerPath = 'vennebetaling.json') {
  const overrides = await loadJson<Overrides>(path, {});
  for (const name of await loadJson<string[]>(peerPath, [])) overrides[name] ??= PEER_PAYMENT;
  return overrides;
}

export const loadSubscriptions = (path = 'subscriptions.json') => loadJson<Subscriptions>(path, []);

type Matcher = (haystack: string) => boolean;
type Rule = { matches: Matcher; category: string };

/** Compiled once per run, not once per transaction. */
function compile(pattern: string, source: string): Matcher {
  const asRegex = /^\/(.+)\/([a-z]*)$/.exec(pattern);
  if (!asRegex) {
    const needle = pattern.toLowerCase();
    return (h) => h.includes(needle);
  }
  try {
    // Always case-insensitive: the haystack is lowercased before matching.
    const re = new RegExp(asRegex[1]!, asRegex[2]!.replace('i', '') + 'i');
    return (h) => re.test(h);
  } catch (e) {
    throw new Error(`${source}: ${pattern} is not a valid regex — ${e instanceof Error ? e.message : e}`);
  }
}

export function categorize(
  txns: Classified[],
  overrides: Overrides,
  subscriptions: Subscriptions = [],
): Categorized[] {
  const rules: Rule[] = Object.entries(overrides).map(([pattern, category]) => ({
    matches: compile(pattern, 'overrides.json'),
    category,
  }));
  const subs = subscriptions.map((pattern) => compile(pattern, 'subscriptions.json'));
  return txns.map((t) => {
    const haystack = `${t.description} ${t.counterparty ?? ''}`.toLowerCase();
    return {
      ...t,
      category: categoryFor(t, rules, haystack),
      // The bank's own flag stands; a pattern only ever adds to it.
      isSubscription: t.isSubscription || subs.some((m) => m(haystack)),
    };
  });
}

function categoryFor(t: Classified, rules: Rule[], haystack: string): string {
  const override = rules.find((r) => r.matches(haystack));
  if (override) return override.category;
  if (t.source === 'card' && FOREIGN_MERCHANT.test(t.counterparty ?? '')) return TRAVEL;
  if (t.bankCategory && t.bankCategory !== BANK_CATCH_ALL) {
    return t.bankCategory === BANK_FIXED_COSTS ? FIXED_COSTS : t.bankCategory;
  }
  return UNCATEGORIZED;
}
