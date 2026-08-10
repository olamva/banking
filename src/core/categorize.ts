import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { Classified, Categorized } from './types.ts';

/**
 * rules/overrides.json: { "<pattern>": "<category>" }
 *
 * A pattern is a case-insensitive substring, or a regex if written as
 * `/.../ ` — `"/\\bleie\\b/"` matches the word *leie* but not *utleie* or
 * *leiebil*, which a substring cannot express.
 *
 * Matched against `description` and `counterparty` both. They usually say the
 * same thing — `counterparty` is the bank's cleaned form of the description —
 * but not always: the card's raw description carries a terminal number the
 * cleaned one drops, and a payment with a message keeps the message.
 *
 * Not committed — hand-edited locally, applied on top of bankCategory. A
 * missing file means no overrides, not an error.
 */
export type Overrides = Record<string, string>;

const UNCATEGORIZED = 'ukategorisert';
const TRAVEL = 'reise';

/**
 * What **every** excluded row is, ahead of any other rule. Both legs of a
 * transfer and both legs of a card bill are exactly that — a transfer — so the
 * one view that lists them says so rather than filing the lot under whatever
 * else the row happens to look like.
 *
 * It used to be the last fallback, below the bank's own category, and the bank
 * has one on most of these: a card bill read as `Avgifter` on the giro paying it
 * and `Annet lån og gjeld` on the credit it settles. Both are true of the
 * payment and neither is true of the money, which never left. `reason` is what
 * says why a row is out, so the category has nothing left to add.
 *
 * No money path can see this: `stats.ts` skips excluded rows before it sums, and
 * the toggle in `select.ts` is the only thing that lists them at all.
 */
const TRANSFER = 'overfoering';

/**
 * A card merchant ends with the terminal's country, `NAME, CITY, COUNTRY` —
 * spelled out (`JAPAN`, `UNITED KINGDOM`, `SLOVAKIA (Slovak Republic)`) and
 * occasionally as a three-letter code (`GRC`). Anything but Norway was bought
 * abroad, which for this account always means a trip.
 *
 * The comma is the whole guard: a Norwegian payee with no country on it at all
 * (`ELETRA ENERGY AS`, `DUTY-FREE GARDERMOEN`) has no comma before its last
 * word and cannot match, and neither can the card's own `Innbetaling` or
 * `Omkostninger minibankuttak` rows. Checked against every card row of the
 * record: it flags the foreign ones, the Greek town names on a Greek trip, and
 * one `Mobil`.
 *
 * It is a **fallback below the bank's own category**, not above it. Every card
 * row now arrives classified, and a supermarket in Vienna is groceries that
 * happened abroad; only a row the bank shrugged at falls through to here. That
 * also contains the old misread of a foreign *biller* as a trip — Apple bills
 * from IRELAND — since those rows carry a category of their own.
 *
 * Card rows only, and that guard is load-bearing: 23 deposit rows in the record
 * match this shape without being anywhere near a trip, `MOBILGIRO M/KID, FORF.
 * I DAG TRANS(ER) TYPE` chief among them.
 */
const FOREIGN_MERCHANT = /,\s*(?!NOR(WAY)?$)[A-Z][A-Za-z .()]*$/;

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
 * `rules/overrides.json`, because these rows carry no override at all: the slug
 * arrives on `bankCategory` and would otherwise reach the page unchanged.
 */
const BANK_FIXED_COSTS = 'faste_boutgifter';
const FIXED_COSTS = 'faste_utgifter';

/**
 * rules/subscriptions.json: `["<pattern>", ...]`, the same pattern language.
 *
 * A separate axis from the category, not a category of its own — Telenor is a
 * fixed housing cost *and* a subscription, and forcing a choice between the two
 * loses one of them. SB1 sets `subscription` itself, on the card as well as on
 * the deposit accounts, but it guesses it from the merchant and is wrong about
 * as often as right — so a pattern here is what makes a subscription certain.
 */
export type Subscriptions = string[];

async function loadJson<T>(path: string, fallback: T): Promise<T> {
  if (!existsSync(path)) return fallback;
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

/**
 * rules/vipps.json: `["<name>", ...]`, the same pattern language.
 *
 * Person-to-person payments were half the lines of `rules/overrides.json` and every
 * one of them mapped to the same category, so they live as a bare list of names
 * instead. Checked *after* `rules/overrides.json`, so an explicit entry there still
 * wins for a person who shares a string with a merchant.
 *
 * A name is not enough on its own, though — see `rules/giro.json` below.
 */
const PEER_PAYMENT = 'vipps';

/**
 * rules/giro.json: `{ "<name>": "<category>" }`, the same pattern language, applied
 * only to a person's *lump* transfers.
 *
 * A flatmate shows up twice over: dozens of small instant payments for a coffee
 * or a taxi, and a standing monthly transfer for rent. The description is the
 * same string in both cases — just the name — so no pattern in
 * `rules/overrides.json` can tell them apart without swallowing both, and that
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

export const loadOverrides = (path = 'rules/overrides.json') => loadJson<Overrides>(path, {});

export const loadPeers = (path = 'rules/vipps.json') => loadJson<string[]>(path, []);

export const loadGiro = (path = 'rules/giro.json') => loadJson<Overrides>(path, {});

export const loadSubscriptions = (path = 'rules/subscriptions.json') => loadJson<Subscriptions>(path, []);

/**
 * rules/payees.json: `{ "<pattern>": "<name>" }`, the same pattern language — the one
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
export const loadPayees = (path = 'rules/payees.json') => loadJson<Overrides>(path, {});

export function renamePayees<
  T extends { description: string; counterparty: string | null; remoteAccountNumber: string | null },
>(txns: T[], payees: Overrides): T[] {
  const rules = Object.entries(payees).map(([pattern, name]) => ({
    matches: compile(pattern, 'rules/payees.json'),
    name,
  }));
  if (rules.length === 0) return txns;
  return txns.map((t) => {
    // Same haystack as `categorize`, account number included: SB1 sends a few
    // rows as a bare `Overføring` with no name on them at all, and the account
    // is then the only thing that says who the other party was.
    const hit = rules.find((r) =>
      r.matches(`${t.description} ${t.counterparty ?? ''} ${t.remoteAccountNumber ?? ''}`.toLowerCase()),
    );
    return hit ? { ...t, counterparty: hit.name } : t;
  });
}

type Matcher = (haystack: string) => boolean;
type Rule = { matches: Matcher; category: string };

/** Compiled once per run, not once per transaction. */
export function compile(pattern: string, source: string): Matcher {
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
  /** Account keys of the credit cards — the only rows the travel guess may see. */
  cards: Set<string> = new Set(),
): Categorized[] {
  const rules: Rule[] = Object.entries(overrides).map(([pattern, category]) => ({
    matches: compile(pattern, 'rules/overrides.json'),
    category,
  }));
  const peerRules = peers.map((pattern) => compile(pattern, 'rules/vipps.json'));
  const giroRules: Rule[] = Object.entries(giro).map(([pattern, category]) => ({
    matches: compile(pattern, 'rules/giro.json'),
    category,
  }));
  const subs = subscriptions.map((pattern) => compile(pattern, 'rules/subscriptions.json'));
  return txns.map((t) => {
    // The account number is in here so a payee that bills two different things
    // under one name can still be told apart — it is the only field that differs
    // between SiT's rent and SiT's gym. See `Txn.remoteAccountNumber`.
    const haystack = `${t.description} ${t.counterparty ?? ''} ${t.remoteAccountNumber ?? ''}`.toLowerCase();
    return {
      ...t,
      category: categoryFor(t, rules, peerRules, giroRules, haystack, cards),
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
  cards: Set<string>,
): string {
  if (t.excluded) return TRANSFER;
  const override = rules.find((r) => r.matches(haystack));
  if (override) return override.category;
  // A lump transfer, and a name that says what this person's lump transfers
  // are — rent from a flatmate, a share of a trip from a friend.
  if (LUMP_TYPE.test(t.typeText ?? '')) {
    const named = giroRules.find((r) => r.matches(haystack));
    if (named) return named.category;
  }
  if (peerRules.some((m) => m(haystack))) return PEER_PAYMENT;
  if (t.bankCategory && !BANK_CATCH_ALL.has(t.bankCategory)) {
    return t.bankCategory === BANK_FIXED_COSTS ? FIXED_COSTS : t.bankCategory;
  }
  if (cards.has(t.accountKey) && FOREIGN_MERCHANT.test(t.counterparty ?? '')) return TRAVEL;
  return UNCATEGORIZED;
}
