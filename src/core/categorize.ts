import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { Classified, Categorized } from './types.ts';

/**
 * rules/overrides.json: { "<pattern>": "<category>" or "<category>/<sub>" }
 *
 * A pattern is a case-insensitive substring, or a regex if written as
 * `/.../ ` — `"/\\bleie\\b/"` matches the word *leie* but not *utleie* or
 * *leiebil*, which a substring cannot express.
 *
 * **The value takes two forms and both are current.** A bare `"dagligvarer"`
 * names the category alone; `"kafe_og_restaurant/utesteder"` names the bank's
 * own pair. Both forms are read by `splitCategory` below, which is what lets
 * this file be rewritten a line at a time: the category half is unchanged by
 * adding a sub, so the page does not move while the migration is half done.
 *
 * The pair form is the one to write. `pnpm sb1 categories` says which lines
 * still earn their place — 81 of the 175 patterns on record decide exactly what
 * the bank's own subcategory already says, and delete cleanly.
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
 * The one bucket that really does carry no more information than no category at
 * all. The bank sends it spelled out on the row, on 1 184 of them.
 *
 * **`diverse` is not in here, deliberately.** It reads like a second catch-all
 * and it is the bank's largest main, but at the pair level every one of its
 * 2 482 rows says something: `vennebetaling`, `overforing`, `renter_og_gebyrer`,
 * `medlemskap_veldedighet`, `minibank`, `kurs_utdanning`, `skatt`. Collapsing it
 * threw all of that away one level above where the signal was, and cost
 * `rules/vipps.json` 176 hand-written names for people the bank had already
 * recognised. Its Norwegian name is `Diverse`, which the bank supplies itself.
 */
const BANK_CATCH_ALL = new Set([UNCATEGORIZED]);

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
const PEER_PAYMENT = 'diverse/vennebetaling';

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
const LUMP_TYPE = /^(giro|mobilgiro|overførsel|avtale)\b(?! mellom egne)/i;

export const loadOverrides = (path = 'rules/overrides.json') => loadJson<Overrides>(path, {});

export const loadPeers = (path = 'rules/vipps.json') => loadJson<string[]>(path, []);

export const loadGiro = (path = 'rules/giro.json') => loadJson<Overrides>(path, {});

/**
 * rules/family.json: `["<name>", ...]`, the same pattern language.
 *
 * Money *from* these people is family support rather than a peer payment. It
 * needs its own rule because neither of the two it sits between can express it:
 * `rules/giro.json` is gated on the row being a lump, and most family money
 * arrives as `Straksbetaling` like any other instant payment; and an override
 * cannot see the sign, so it would file the money you send back the same way.
 *
 * **Incoming only, and that is the category's own doing** — it lands under
 * `innskudd`, the bank's income main, where an outgoing row would be a
 * contradiction. Paying a sibling back for a taxi stays a peer payment.
 */
export const loadFamily = (path = 'rules/family.json') => loadJson<string[]>(path, []);

/** Money in from someone on that list. Under `innskudd` because it is income. */
const FAMILY = 'innskudd/familie';

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
    const hit = rules.find((r) => r.matches(haystackOf(t)));
    return hit ? { ...t, counterparty: hit.name } : t;
  });
}

type Matcher = (haystack: string) => boolean;
type Rule = { matches: Matcher; category: string };

/** What a rule decided: a category, and the second level where it named one. */
export type Pair = { category: string; subcategory: string | null };

/**
 * A rule value -> the pair it names. `"a/b"` is both levels, `"a"` is the first
 * alone, and a value with more than one slash keeps the rest in the sub, since
 * no bank slug has ever contained one and a hand-typed `"a/b/c"` is a mistake
 * better seen on the page than silently trimmed.
 */
export function splitCategory(value: string): Pair {
  const cut = value.indexOf('/');
  return cut === -1
    ? { category: value, subcategory: null }
    : { category: value.slice(0, cut), subcategory: value.slice(cut + 1) };
}

/**
 * The string every pattern in every rules file is matched against.
 *
 * The account number is in it so a payee that bills two different things under
 * one name can still be told apart — it is the only field that differs between
 * SiT's rent and SiT's gym. See `Txn.remoteAccountNumber`.
 *
 * Exported because `report.ts` has to match patterns exactly as this file will,
 * or a line it calls redundant is redundant only in the report.
 */
export const haystackOf = (t: {
  description: string;
  counterparty: string | null;
  remoteAccountNumber: string | null;
}): string => `${t.description} ${t.counterparty ?? ''} ${t.remoteAccountNumber ?? ''}`.toLowerCase();

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
  family: string[] = [],
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
  const familyRules = family.map((pattern) => compile(pattern, 'rules/family.json'));
  const subs = subscriptions.map((pattern) => compile(pattern, 'rules/subscriptions.json'));
  return txns.map((t) => {
    const haystack = haystackOf(t);
    return {
      ...t,
      ...categoryFor(t, rules, peerRules, giroRules, familyRules, haystack, cards),
      // The bank's own flag stands; a pattern only ever adds to it.
      isSubscription: t.isSubscription || subs.some((m) => m(haystack)),
    };
  });
}

/** A rule that named one level only, and a guess, both say nothing about the second. */
const flat = (category: string): Pair => ({ category, subcategory: null });

/**
 * A rule that named only a category keeps the bank's subcategory — **when the
 * bank agrees about the category**.
 *
 * Most of `rules/overrides.json` still names one level, and throwing the bank's
 * second level away with it lost real information: `/\bSAS[\d ]/` says `reise`
 * and the bank says `reise/flybilletter`, the same category and one level
 * deeper. 2 132 rows arrived with a subcategory on them and reached the page
 * without one for no better reason than that.
 *
 * The guard is the category matching. `PAYPAL BOOKING HOTEL` is a trip to us and
 * `hobby_og_fritid/digital_markedsplass` to the bank; grafting that sub under
 * `reise` would invent a pair neither of us meant. Where the mains disagree the
 * rule has overruled the bank outright, and its subcategory goes with it.
 */
function keepBankSub(pair: Pair, t: Classified): Pair {
  if (pair.subcategory !== null) return pair;
  const bank = bankPair(t);
  return bank && bank.category === pair.category ? { ...pair, subcategory: bank.subcategory } : pair;
}

/**
 * The pair the bank's own answer becomes, or null where it said nothing usable.
 *
 * The sub rides along untouched even where the main is renamed: the rename is
 * ours and the pair underneath it is still the bank's own answer.
 *
 * Exported so `report.ts` can tell a fallback that came from the bank from one
 * that came from a second override. That distinction is the whole difference
 * between "this line is our name for something the bank already sends, rewrite
 * it" and "this line is the only thing standing between a canteen and the rent".
 */
/**
 * The bank's name for something -> ours. A bare key renames a *main*; a
 * `main/sub` key would rename a whole pair to one category of ours.
 *
 * Only one entry, and that is the point: the bank's taxonomy is kept as it comes
 * wherever it is usable, and `faste_boutgifter` is renamed only because it is
 * not only housing — tuition and union dues book there too.
 */
const OURS: Record<string, string> = {
  [BANK_FIXED_COSTS]: FIXED_COSTS,
};

export function bankPair(t: { bankCategory: string | null; bankSub: string | null }): Pair | null {
  if (!t.bankCategory) return null;
  // The pair first, and deliberately above the catch-all test: `diverse` is a
  // catch-all as a main and never as a pair.
  const asPair = t.bankSub && OURS[`${t.bankCategory}/${t.bankSub}`];
  if (asPair) return flat(asPair);
  if (BANK_CATCH_ALL.has(t.bankCategory)) return null;
  return { category: OURS[t.bankCategory] ?? t.bankCategory, subcategory: t.bankSub };
}

function categoryFor(
  t: Classified,
  rules: Rule[],
  peerRules: Matcher[],
  giroRules: Rule[],
  familyRules: Matcher[],
  haystack: string,
  cards: Set<string>,
): Pair {
  // An excluded row is a transfer and nothing else, at either level: `reason`
  // already says why it is out, so a subcategory has nothing to add.
  if (t.excluded) return flat(TRANSFER);
  const override = rules.find((r) => r.matches(haystack));
  if (override) return keepBankSub(splitCategory(override.category), t);
  // A lump transfer, and a name that says what this person's lump transfers
  // are — rent from a flatmate, a share of a trip from a friend.
  if (LUMP_TYPE.test(t.typeText ?? '')) {
    const named = giroRules.find((r) => r.matches(haystack));
    if (named) return keepBankSub(splitCategory(named.category), t);
  }
  // Below the lump rule, so a standing arrangement keeps the name giro.json gave
  // it — pocket money is family money that already has a better label — and
  // above the peer list, which would otherwise call every gift a Vipps payment.
  if (t.amount > 0 && familyRules.some((m) => m(haystack))) return splitCategory(FAMILY);
  // The pair outright, not `keepBankSub`: the list exists precisely for the rows
  // the bank files as `diverse/overforing` or shrugs at, and taking its sub
  // there would file a peer payment as a transfer.
  if (peerRules.some((m) => m(haystack))) return splitCategory(PEER_PAYMENT);
  const bank = bankPair(t);
  if (bank) return bank;
  // A guess from the shape of a merchant string, with nothing behind it at the
  // second level — `reise/annen_reise` would be an invented claim, not a read one.
  if (cards.has(t.accountKey) && FOREIGN_MERCHANT.test(t.counterparty ?? '')) return flat(TRAVEL);
  return flat(UNCATEGORIZED);
}
