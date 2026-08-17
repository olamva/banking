import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { makeCleaner } from "./names.ts";
import type { Categorized, Classified } from "./types.ts";

/**
 * rules/overrides.json: `{ "<pattern>": "<category>/<sub>" }`.
 *
 * A pattern is a case-insensitive substring, or a regex if written as `/.../` —
 * `"/\\bleie\\b/"` matches the word *leie* but not *utleie*, which a substring
 * cannot express. Matched against `description` and `counterparty` both, since
 * the card's raw description carries a terminal number the cleaned one drops.
 *
 * Name both levels: a bare value means the category with *no* subcategory,
 * which reaches the page as `Annet`.
 */
export type Overrides = Record<string, string>;

const UNCATEGORIZED = "ukategorisert";
const TRAVEL = "reise";

/**
 * What every excluded row is, ahead of every other rule. `reason` already says
 * why a row is out, so the category has nothing to add — and the bank's word
 * for the *payment* is wrong about money that never moved. No sum can see it:
 * `stats.ts` skips excluded rows before it adds anything up.
 */
const TRANSFER = "overfoering";

/**
 * A card merchant ends with the terminal's country — `NAME, CITY, COUNTRY`,
 * spelled out or as a three-letter code — and anything but Norway means a trip.
 *
 * The comma is the whole guard: a Norwegian payee with no country on it
 * (`DUTY-FREE GARDERMOEN`) has no comma before its last word and cannot match.
 * Card rows only, which is load-bearing — 23 deposit rows match this shape
 * without being near a trip.
 */
const FOREIGN_MERCHANT = /,\s*(?!NOR(WAY)?$)[A-Z][A-Za-z .()]*$/;

/**
 * The one bucket carrying no more than no category at all. `diverse` is
 * deliberately not in here: it is the bank's largest main and reads like a
 * shrug, but at the pair level every one of its rows says something —
 * `vennebetaling`, `overforing`, `minibank`, `skatt`.
 */
const BANK_CATCH_ALL = new Set([UNCATEGORIZED]);

const BANK_FIXED_COSTS = "faste_boutgifter";
const FIXED_COSTS = "faste_utgifter";

/**
 * rules/subscriptions.json: `["<pattern>", ...]`.
 *
 * A separate axis from the category, not a category of its own — Telenor is a
 * fixed cost *and* a subscription. SB1 sets the flag itself but guesses it from
 * the merchant, so a pattern here is what makes a subscription certain.
 */
export type Subscriptions = string[];

async function loadJson<T>(path: string, fallback: T): Promise<T> {
  if (!existsSync(path)) return fallback;
  return JSON.parse(await readFile(path, "utf8")) as T;
}

const PEER_PAYMENT = "diverse/vennebetaling";

/**
 * The two row shapes that say by themselves that a Vipps payment went to a
 * person. A bare `Vipps*` marker is not one: Vipps bills merchants too, and
 * matching it alone moves canteen lunches and tram fares into `vennebetaling`.
 *
 * On the card the bank files a peer row as `diverse/overforing`, its reading of
 * `mcc: 4829`, *MONEY TRANSF*. On the deposit accounts Vipps doubles its own
 * marker on the instant-settlement rows the bank has no category for.
 */
const VIPPS_PEER_CARD = "diverse/overforing";
const VIPPS_MARKER = /vipps\*/i;
const VIPPS_PEER_DOUBLED = /vipps\*\s*vipps\*/i;

/**
 * rules/giro.json: `{ "<name>": "<category>" }`, applied only to a person's
 * *lump* transfers.
 *
 * A flatmate is two relationships at once — dozens of small instant payments,
 * and a standing monthly transfer for rent — and the description is the bare
 * name in both. `typeText` is what splits them. The category is per name
 * because the row type says how the money moved and never why: a lump is rent
 * from one person and a share of a trip from another.
 */
const LUMP_TYPE = /^(giro|mobilgiro|overførsel|avtale)\b(?! mellom egne)/i;

export const loadOverrides = (path = "rules/overrides.json") =>
  loadJson<Overrides>(path, {});

export const loadGiro = (path = "rules/giro.json") =>
  loadJson<Overrides>(path, {});

/**
 * rules/family.json: `["<name>", ...]`, or an account number where the bank
 * names no payee.
 *
 * **The sign is what the entry decides, not whether it applies**: money in is
 * family support, money out to the same person is paying a relative back. It
 * needs its own rule because neither neighbour can express it — giro.json is
 * gated on the row being a lump, and an override cannot see the sign.
 */
export const loadFamily = (path = "rules/family.json") =>
  loadJson<string[]>(path, []);

/** Money in from someone on that list. Under `innskudd` because it is income. */
const FAMILY = "innskudd/familie";

export const loadSubscriptions = (path = "rules/subscriptions.json") =>
  loadJson<Subscriptions>(path, []);

/**
 * rules/payees.json: `{ "<pattern>": "<name>" }` — the one name a payee goes by.
 *
 * A landlord who writes the month into every payment is eleven payees to
 * anything counting by name. Renaming beats grouping at the point of use,
 * because `merchantOf` is what the table, the bars, the chips and the
 * subscriptions card all agree on.
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
  // The cleaner infers places from the un-renamed names: the raw strings are
  // where a city ends a dozen entries, which is the shape it looks for.
  const clean = makeCleaner(
    txns.map((t) => t.counterparty).filter((n) => n !== null),
  );
  return txns.map((t) => {
    const hit = rules.find((r) => r.matches(haystackOf(t)));
    // A rule's name is used exactly as written — running the shape heuristic
    // over a person's decision would hand back `Ikea` and `H&m`.
    if (hit) return { ...t, counterparty: hit.name };
    return t.counterparty === null
      ? t
      : { ...t, counterparty: clean(t.counterparty) };
  });
}

type Matcher = (haystack: string) => boolean;
type Rule = { matches: Matcher; category: string };

export type Pair = { category: string; subcategory: string | null };

/**
 * `"a/b"` is both levels, `"a"` the first alone. A value with more than one
 * slash keeps the rest in the sub: no bank slug contains one, so `"a/b/c"` is a
 * mistake better seen on the page than silently trimmed.
 */
export function splitCategory(value: string): Pair {
  const cut = value.indexOf("/");
  return cut === -1
    ? { category: value, subcategory: null }
    : { category: value.slice(0, cut), subcategory: value.slice(cut + 1) };
}

/**
 * The string every pattern in every rules file is matched against. The account
 * number is in it so a payee billing two things under one name can still be
 * told apart — see `Txn.remoteAccountNumber`.
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

function isVippsPeer(t: {
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
 * The bank's name for something -> ours. Only one entry, and that is the point:
 * the taxonomy is kept as it comes wherever it is usable, and
 * `faste_boutgifter` is renamed only because it is not only housing.
 */
const OURS: Record<string, string> = {
  [BANK_FIXED_COSTS]: FIXED_COSTS,
};

/** The pair the bank's own answer becomes, or null where it said nothing usable. */
export function bankPair(t: {
  bankCategory: string | null;
  bankSub: string | null;
}): Pair | null {
  if (!t.bankCategory) return null;
  // Above the catch-all test: `diverse` is a catch-all as a main, never as a pair.
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
  if (t.excluded) return flat(TRANSFER);
  const override = rules.find((r) => r.matches(haystack));
  if (override) return splitCategory(override.category);
  if (LUMP_TYPE.test(t.typeText ?? "")) {
    const named = giroRules.find((r) => r.matches(haystack));
    if (named) return splitCategory(named.category);
  }
  // Below the lump rule, so pocket money keeps the better label giro.json gave
  // it, and above the Vipps rules, which would call every gift a peer payment.
  if (familyRules.some((m) => m(haystack)))
    return splitCategory(t.amount > 0 ? FAMILY : PEER_PAYMENT);
  // Above the bank's own category, which is the whole point: the card files
  // these as `diverse/overforing`, and letting that stand reads a peer payment
  // as a transfer.
  if (isVippsPeer(t)) return splitCategory(PEER_PAYMENT);
  const bank = bankPair(t);
  if (bank) return bank;
  // A guess from the shape of a name, so nothing at the second level:
  // `reise/annen_reise` would be an invented claim rather than a read one.
  if (cards.has(t.accountKey) && FOREIGN_MERCHANT.test(t.counterparty ?? ""))
    return flat(TRAVEL);
  return flat(UNCATEGORIZED);
}
