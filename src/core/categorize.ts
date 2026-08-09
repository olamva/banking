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
 * What an excluded row falls back to instead of `ukategorisert`. Both legs of a
 * transfer and both legs of a card bill are exactly that — a transfer — so the
 * one view that lists them says so rather than filing the lot under "no idea".
 *
 * No money path can see this: `stats.ts` skips excluded rows before it sums, and
 * the toggle in `select.ts` is the only thing that lists them at all.
 */
const TRANSFER = 'overfoering';

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
 * The bank's own catch-alls carry no more information than having no category
 * at all, so they collapse into one bucket rather than looking like real ones.
 * It sends both — `diverse`, and `ukategorisert` spelled out on the row.
 */
const BANK_CATCH_ALL = new Set(['diverse', UNCATEGORIZED]);

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
 * vipps.json: `["<name>", ...]`, the same pattern language.
 *
 * Person-to-person payments were half the lines of `overrides.json` and every
 * one of them mapped to the same category, so they live as a bare list of names
 * instead. Checked *after* `overrides.json`, so an explicit entry there still
 * wins for a person who shares a string with a merchant.
 *
 * A name is not enough on its own, though — see `giro.json` below.
 */
const PEER_PAYMENT = 'vipps';

/**
 * giro.json: `{ "<name>": "<category>" }`, the same pattern language, applied
 * only to a person's *lump* transfers.
 *
 * A flatmate shows up twice over: dozens of small instant payments for a coffee
 * or a taxi, and a standing monthly transfer for rent. The description is the
 * same string in both cases — just the name — so no pattern in
 * `overrides.json` can tell them apart without swallowing both, and that
 * quietly filed 293 000 kr of rent under `vipps`.
 *
 * `typeText` is what splits them: a Vipps payment settles instantly
 * (`Straksbetaling`) or rides the card, while the other kind is a giro or a
 * plain `Overførsel` — set up once and left running, or pushed across in one
 * lump.
 *
 * The category is per name rather than always rent, because the row type says
 * how the money moved and never why. Two of these turned out to be friends'
 * shares of a trip, transferred in a lump exactly like a month's rent and
 * indistinguishable from it on the row — same type, same shape, nothing to tell
 * them apart but knowing. A name absent here keeps its peer-payment reading.
 *
 * `Overførsel mellom egne kontoer` is deliberately excluded: that is the bank's
 * wording for a family transfer, not a standing arrangement.
 */
const LUMP_TYPE = /^(giro|mobilgiro|overførsel)\b(?! mellom egne)/i;

export const loadOverrides = (path = 'overrides.json') => loadJson<Overrides>(path, {});

export const loadPeers = (path = 'vipps.json') => loadJson<string[]>(path, []);

export const loadGiro = (path = 'giro.json') => loadJson<Overrides>(path, {});

export const loadSubscriptions = (path = 'subscriptions.json') => loadJson<Subscriptions>(path, []);

/**
 * payees.json: `{ "<pattern>": "<name>" }`, the same pattern language — the one
 * name a payee should go by.
 *
 * A landlord who writes the month into every payment is eleven payees as far as
 * anything counting by name is concerned: `SIMEN LEIE Februar Husleie` and
 * `SIMEN LEIE Mars Husleie` share nothing a grouping can see, so the
 * subscriptions card listed the same standing rent eleven times over.
 *
 * Renaming beats grouping at the point of use, because `merchantOf` is what the
 * table, the bars, the filter chips and the subscriptions card all agree on — a
 * name synthesised in one of them would filter to nothing in the others.
 *
 * It rewrites `counterparty` only, and runs *after* `categorize`, so no rule is
 * matched against a name it did not see. The month is still in `description`,
 * which is what the search box reads, so nothing is actually lost.
 */
export const loadPayees = (path = 'payees.json') => loadJson<Overrides>(path, {});

export function renamePayees<T extends { description: string; counterparty: string | null }>(
  txns: T[],
  payees: Overrides,
): T[] {
  const rules = Object.entries(payees).map(([pattern, name]) => ({
    matches: compile(pattern, 'payees.json'),
    name,
  }));
  if (rules.length === 0) return txns;
  return txns.map((t) => {
    const hit = rules.find((r) => r.matches(`${t.description} ${t.counterparty ?? ''}`.toLowerCase()));
    return hit ? { ...t, counterparty: hit.name } : t;
  });
}

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
  peers: string[] = [],
  giro: Overrides = {},
): Categorized[] {
  const rules: Rule[] = Object.entries(overrides).map(([pattern, category]) => ({
    matches: compile(pattern, 'overrides.json'),
    category,
  }));
  const peerRules = peers.map((pattern) => compile(pattern, 'vipps.json'));
  const giroRules: Rule[] = Object.entries(giro).map(([pattern, category]) => ({
    matches: compile(pattern, 'giro.json'),
    category,
  }));
  const subs = subscriptions.map((pattern) => compile(pattern, 'subscriptions.json'));
  return txns.map((t) => {
    // The account number is in here so a payee that bills two different things
    // under one name can still be told apart — it is the only field that differs
    // between SiT's rent and SiT's gym. See `Txn.remoteAccountNumber`.
    const haystack = `${t.description} ${t.counterparty ?? ''} ${t.remoteAccountNumber ?? ''}`.toLowerCase();
    return {
      ...t,
      category: categoryFor(t, rules, peerRules, giroRules, haystack),
      // The bank's own flag stands; a pattern only ever adds to it.
      isSubscription: t.isSubscription || subs.some((m) => m(haystack)),
    };
  });
}

function categoryFor(
  t: Classified,
  rules: Rule[],
  peerRules: Matcher[],
  giroRules: Rule[],
  haystack: string,
): string {
  const override = rules.find((r) => r.matches(haystack));
  if (override) return override.category;
  // A lump transfer, and a name that says what this person's lump transfers
  // are — rent from a flatmate, a share of a trip from a friend.
  if (LUMP_TYPE.test(t.typeText ?? '')) {
    const named = giroRules.find((r) => r.matches(haystack));
    if (named) return named.category;
  }
  if (peerRules.some((m) => m(haystack))) return PEER_PAYMENT;
  if (t.source === 'card' && FOREIGN_MERCHANT.test(t.counterparty ?? '')) return TRAVEL;
  if (t.bankCategory && !BANK_CATCH_ALL.has(t.bankCategory)) {
    return t.bankCategory === BANK_FIXED_COSTS ? FIXED_COSTS : t.bankCategory;
  }
  return t.excluded ? TRANSFER : UNCATEGORIZED;
}
