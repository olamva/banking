import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { Categorized, Classified } from "./types.ts";

/**
 * rules/overrides.json: { "<pattern>": "<category>" or "<category>/<sub>" }
 *
 * A pattern is a case-insensitive substring, or a regex if written as
 * `/.../ ` — `"/\\bleie\\b/"` matches the word *leie* but not *utleie* or
 * *leiebil*, which a substring cannot express.
 *
 * **The value is a pair, `"kafe_og_restaurant/utesteder"`.** Every line names
 * both levels; a bare `"dagligvarer"` parses, and now means the category with
 * *no* subcategory rather than one to be filled in from the bank.
 *
 * It used to mean the second. A bare value kept the bank's own sub wherever the
 * bank agreed about the main, which read as a migration half done and behaved as
 * a coin toss: of the 52 bare lines on record, 40 inherited nothing at all and
 * the rest split one payee across two labels — `sans fris` was `velvare` on 25
 * rows and `Annet` on the 26th, on nothing but whether the bank had recognised
 * the merchant that day. Naming the pair moved 298 rows off `Annet` and left
 * every row's category, and both money totals, untouched.
 *
 * `pnpm sb1 categories` says which lines still earn their place — a line the
 * bank's own pair already agrees with deletes cleanly.
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

const UNCATEGORIZED = "ukategorisert";
const TRAVEL = "reise";

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
const TRANSFER = "overfoering";

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
const BANK_FIXED_COSTS = "faste_boutgifter";
const FIXED_COSTS = "faste_utgifter";

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
  return JSON.parse(await readFile(path, "utf8")) as T;
}

const PEER_PAYMENT = "diverse/vennebetaling";

/**
 * The two row shapes that say *by themselves* that a Vipps payment went to a
 * person. Both replaced a hand-written list of names — `rules/vipps.json`, 32 of
 * them — which is now gone; the names it still earned live in
 * `rules/overrides.json` like any other pattern.
 *
 * **A bare `Vipps*` marker is not one of these.** Vipps bills merchants too, and
 * matching it alone moved 271 correctly-filed rows — canteen lunches, tram fares
 * — into `vennebetaling`. Each shape below adds the second signal that a plain
 * `Vipps*` lacks.
 *
 * `VIPPS_PEER_CARD` is the card's half. A Vipps row on the credit card arrives
 * as `diverse/overforing`, which is the bank reading `mcc: 4829`, *MONEY
 * TRANSF*, off the row — the card network's own word for "this merchant moves
 * money", which is what Vipps is to it when the payee is a person. The 28 card
 * rows carrying `Vipps*` split exactly on it: the 16 at `diverse/overforing` are
 * all people, and the other 12 arrive as `RESTAURANTS`, `FURNITURE/EQ`,
 * `Bus Lines` and `Motion Pictu` with a real category to match. So the pair is
 * the whole guard, and it is read off `bankCategory`/`bankSub` rather than the
 * MCC because the bank has already done that read — `mcc` is not on `Txn`, and
 * widening it would buy nothing this does not already get. Checked against all
 * 8 547 rows of the record: 16 matches, every one of them a person, and no
 * deposit row matches at all.
 *
 * `VIPPS_PEER_DOUBLED` is the deposit accounts' half. Vipps doubles its own
 * marker — `Vipps*Vipps*Name` — when the payment settles as a
 * `Straksbetaling - ekstern betalingstjeneste` rather than over the card rails,
 * and the bank has no category for those at all. 18 rows on record, all people,
 * no false positives.
 */
const VIPPS_PEER_CARD = "diverse/overforing";
const VIPPS_MARKER = /vipps\*/i;
const VIPPS_PEER_DOUBLED = /vipps\*\s*vipps\*/i;

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

export const loadOverrides = (path = "rules/overrides.json") =>
  loadJson<Overrides>(path, {});

export const loadGiro = (path = "rules/giro.json") =>
  loadJson<Overrides>(path, {});

/**
 * rules/family.json: `["<name>", ...]`, the same pattern language.
 *
 * Money *from* these people is family support rather than a peer payment. It
 * needs its own rule because neither of the two it sits between can express it:
 * `rules/giro.json` is gated on the row being a lump, and most family money
 * arrives as `Straksbetaling` like any other instant payment; and an override
 * cannot see the sign, so it would file the money you send back the same way.
 *
 * **The sign is what the entry decides, not whether it applies.** Money in is
 * family support; money out to the same person is you paying a relative back,
 * which is a peer payment and nothing else — `innskudd` is the bank's income
 * main, so an outgoing row filed there would be a contradiction. Both readings
 * live here because both need the same list, and the list is the only thing that
 * knows these people are relatives: `rules/vipps.json` used to carry a second
 * copy of three of them purely to catch the outgoing half, and 57 rows and
 * 63 672 kr of paying relatives back rode on that duplication.
 *
 * An entry may be an **account number** as well as a name. The bank names no
 * payee at all on a plain `Overføring`, so the number is the only thing on the
 * row that says who the other party was — and a number is safe here in a way it
 * is not in `rules/overrides.json`, which runs above `rules/giro.json` and would
 * swallow the same relative's standing pocket-money transfers.
 */
export const loadFamily = (path = "rules/family.json") =>
  loadJson<string[]>(path, []);

/** Money in from someone on that list. Under `innskudd` because it is income. */
const FAMILY = "innskudd/familie";

export const loadSubscriptions = (path = "rules/subscriptions.json") =>
  loadJson<Subscriptions>(path, []);

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
export const loadPayees = (path = "rules/payees.json") =>
  loadJson<Overrides>(path, {});

export function renamePayees<
  T extends {
    description: string;
    counterparty: string | null;
    remoteAccountNumber: string | null;
  },
>(txns: T[], payees: Overrides): T[] {
  const rules = Object.entries(payees).map(([pattern, name]) => ({
    matches: compile(pattern, "rules/payees.json"),
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
  // A bare value is still parsed rather than refused: it is a hand-edited file,
  // and a line that names one level should reach the page as that level and an
  // `Annet` under it — visible, and fixable by adding the sub.
  const cut = value.indexOf("/");
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
}): string =>
  `${t.description} ${t.counterparty ?? ""} ${t.remoteAccountNumber ?? ""}`.toLowerCase();

/** Compiled once per run, not once per transaction. */
export function compile(pattern: string, source: string): Matcher {
  const asRegex = /^\/(.+)\/([a-z]*)$/.exec(pattern);
  if (!asRegex) {
    const needle = pattern.toLowerCase();
    return (h) => h.includes(needle);
  }
  try {
    // Always case-insensitive: the haystack is lowercased before matching.
    const re = new RegExp(asRegex[1]!, asRegex[2]!.replace("i", "") + "i");
    return (h) => re.test(h);
  } catch (e) {
    throw new Error(
      `${source}: ${pattern} is not a valid regex — ${e instanceof Error ? e.message : e}`,
    );
  }
}

export function categorize(
  txns: Classified[],
  overrides: Overrides,
  subscriptions: Subscriptions = [],
  giro: Overrides = {},
  /** Account keys of the credit cards — the only rows the travel guess may see. */
  cards: Set<string> = new Set(),
  family: string[] = [],
): Categorized[] {
  const rules: Rule[] = Object.entries(overrides).map(
    ([pattern, category]) => ({
      matches: compile(pattern, "rules/overrides.json"),
      category,
    }),
  );
  const giroRules: Rule[] = Object.entries(giro).map(([pattern, category]) => ({
    matches: compile(pattern, "rules/giro.json"),
    category,
  }));
  const familyRules = family.map((pattern) =>
    compile(pattern, "rules/family.json"),
  );
  const subs = subscriptions.map((pattern) =>
    compile(pattern, "rules/subscriptions.json"),
  );
  return txns.map((t) => {
    const haystack = haystackOf(t);
    return {
      ...t,
      ...categoryFor(t, rules, giroRules, familyRules, haystack, cards),
      // The bank's own flag stands; a pattern only ever adds to it.
      isSubscription: t.isSubscription || subs.some((m) => m(haystack)),
    };
  });
}

/** A rule that named one level only, and a guess, both say nothing about the second. */
const flat = (category: string): Pair => ({ category, subcategory: null });

/**
 * A Vipps payment the row itself says went to a person, by either shape
 * described at `VIPPS_PEER_CARD` — never on the marker alone.
 *
 * Exported so `report.ts` judges a line against the rules that will actually
 * run: a name in `rules/overrides.json` this now decides without help is a line
 * that has stopped earning its place.
 */
export function isVippsPeer(t: {
  description: string;
  bankCategory: string | null;
  bankSub: string | null;
}): boolean {
  if (VIPPS_PEER_DOUBLED.test(t.description)) return true;
  return (
    VIPPS_MARKER.test(t.description) &&
    `${t.bankCategory}/${t.bankSub}` === VIPPS_PEER_CARD
  );
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

export function bankPair(t: {
  bankCategory: string | null;
  bankSub: string | null;
}): Pair | null {
  if (!t.bankCategory) return null;
  // The pair first, and deliberately above the catch-all test: `diverse` is a
  // catch-all as a main and never as a pair.
  const asPair = t.bankSub && OURS[`${t.bankCategory}/${t.bankSub}`];
  if (asPair) return flat(asPair);
  if (BANK_CATCH_ALL.has(t.bankCategory)) return null;
  return {
    category: OURS[t.bankCategory] ?? t.bankCategory,
    subcategory: t.bankSub,
  };
}

function categoryFor(
  t: Classified,
  rules: Rule[],
  giroRules: Rule[],
  familyRules: Matcher[],
  haystack: string,
  cards: Set<string>,
): Pair {
  // An excluded row is a transfer and nothing else, at either level: `reason`
  // already says why it is out, so a subcategory has nothing to add.
  if (t.excluded) return flat(TRANSFER);
  const override = rules.find((r) => r.matches(haystack));
  if (override) return splitCategory(override.category);
  // A lump transfer, and a name that says what this person's lump transfers
  // are — rent from a flatmate, a share of a trip from a friend.
  if (LUMP_TYPE.test(t.typeText ?? "")) {
    const named = giroRules.find((r) => r.matches(haystack));
    if (named) return splitCategory(named.category);
  }
  // Below the lump rule, so a standing arrangement keeps the name giro.json gave
  // it — pocket money is family money that already has a better label — and
  // above the peer list, which would otherwise call every gift a Vipps payment.
  // A relative, in either direction: money in is family support, money out is
  // paying them back. Same list, and the sign is the whole difference.
  if (familyRules.some((m) => m(haystack)))
    return splitCategory(t.amount > 0 ? FAMILY : PEER_PAYMENT);
  // A Vipps row that says for itself it went to a person. Both shapes sit here,
  // below the three rules above — a flatmate's rent and a parent's gift are Vipps
  // payments too, and both already have a better name by now — and *above* the
  // bank's own category, which is the whole point: the card rows arrive filed as
  // `diverse/overforing`, and letting that stand is what files a peer payment as
  // a transfer. The pair outright, not `keepBankSub`, for the same reason.
  if (isVippsPeer(t)) return splitCategory(PEER_PAYMENT);
  const bank = bankPair(t);
  if (bank) return bank;
  // A guess from the shape of a merchant string, with nothing behind it at the
  // second level — `reise/annen_reise` would be an invented claim, not a read one.
  if (cards.has(t.accountKey) && FOREIGN_MERCHANT.test(t.counterparty ?? ""))
    return flat(TRAVEL);
  return flat(UNCATEGORIZED);
}
