import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import {
  compile,
  haystackOf,
  splitCategory,
  type Matcher,
  type Overrides,
  type Pair,
} from "./match.ts";
import { makeCleaner } from "./names.ts";
import { RULES_DIR } from "./paths.ts";
import type { Categorized, Classified } from "./types.ts";

const UNCATEGORIZED = "ukategorisert";
const TRAVEL = "reise";

const TRANSFER = "overfoering";

const FOREIGN_MERCHANT = /,\s*(?!NOR(WAY)?$)[A-Z][A-Za-z .()]*$/;

const BANK_CATCH_ALL = new Set([UNCATEGORIZED]);

const BANK_FIXED_COSTS = "faste_boutgifter";
const FIXED_COSTS = "faste_utgifter";

export type Subscriptions = string[];

async function loadJson<T>(path: string, fallback: T): Promise<T> {
  if (!existsSync(path)) return fallback;
  return JSON.parse(await readFile(path, "utf8")) as T;
}

const PEER_PAYMENT = "diverse/vennebetaling";

const VIPPS_PEER_CARD = "diverse/overforing";
const VIPPS_MARKER = /vipps\*/i;
const VIPPS_PEER_DOUBLED = /vipps\*\s*vipps\*/i;

const LUMP_TYPE = /^(giro|mobilgiro|overførsel|avtale)\b(?! mellom egne)/i;

export const loadOverrides = (path = `${RULES_DIR}/overrides.json`) =>
  loadJson<Overrides>(path, {});

export const loadGiro = (path = `${RULES_DIR}/giro.json`) =>
  loadJson<Overrides>(path, {});

export const loadFamily = (path = `${RULES_DIR}/family.json`) =>
  loadJson<string[]>(path, []);

const FAMILY = "innskudd/familie";

export const loadSubscriptions = (path = `${RULES_DIR}/subscriptions.json`) =>
  loadJson<Subscriptions>(path, []);

export const loadNotSubscriptions = (
  path = `${RULES_DIR}/not-subscriptions.json`,
) => loadJson<Subscriptions>(path, []);

export const loadPayees = (path = `${RULES_DIR}/payees.json`) =>
  loadJson<Overrides>(path, {});

export const loadCountries = (path = `${RULES_DIR}/countries.json`) =>
  loadJson<Overrides>(path, {});

// The rule wins over the country the shape heuristic reads off the card name.
export function setCountries<
  T extends {
    description: string;
    counterparty: string | null;
    remoteAccountNumber: string | null;
    country: string | null;
  },
>(txns: T[], countries: Overrides): T[] {
  const rules = Object.entries(countries).map(([pattern, country]) => ({
    matches: compile(pattern, "rules/countries.json"),
    country,
  }));
  if (rules.length === 0) return txns;
  return txns.map((t) => {
    const hit = rules.find((r) => r.matches(haystackOf(t)));
    return hit ? { ...t, country: hit.country } : t;
  });
}

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
  const clean = makeCleaner(
    txns.map((t) => t.counterparty).filter((n) => n !== null),
  );
  return txns.map((t) => {
    const hit = rules.find((r) => r.matches(haystackOf(t)));
    // Use the name from the rule exactly as written. The shape heuristic would
    // change `IKEA` to `Ikea`.
    if (hit) return { ...t, counterparty: hit.name };
    return t.counterparty === null
      ? t
      : { ...t, counterparty: clean(t.counterparty) };
  });
}

type Rule = { matches: (haystack: string) => boolean; category: string };

export function categorize(
  txns: Classified[],
  overrides: Overrides,
  subscriptions: Subscriptions = [],
  giro: Overrides = {},
  cards: Set<string> = new Set(),
  family: string[] = [],
  notSubscriptions: Subscriptions = [],
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
  const nots = notSubscriptions.map((pattern) =>
    compile(pattern, "rules/not-subscriptions.json"),
  );
  return txns.map((t) => {
    const haystack = haystackOf(t);
    const denied = nots.some((m) => m(haystack));
    return {
      ...t,
      ...categoryFor(t, rules, giroRules, familyRules, haystack, cards),
      isRecurring: t.isRecurring && !denied,
      isSubscription:
        !denied && (t.isSubscription || subs.some((m) => m(haystack))),
    };
  });
}

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

const OURS: Record<string, string> = {
  [BANK_FIXED_COSTS]: FIXED_COSTS,
};

export function bankPair(t: {
  bankCategory: string | null;
  bankSub: string | null;
}): Pair | null {
  if (!t.bankCategory) return null;
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
  if (familyRules.some((m) => m(haystack)))
    return splitCategory(t.amount > 0 ? FAMILY : PEER_PAYMENT);
  if (isVippsPeer(t)) return splitCategory(PEER_PAYMENT);
  const bank = bankPair(t);
  if (bank) return bank;
  if (cards.has(t.accountKey) && FOREIGN_MERCHANT.test(t.counterparty ?? ""))
    return flat(TRAVEL);
  return flat(UNCATEGORIZED);
}
