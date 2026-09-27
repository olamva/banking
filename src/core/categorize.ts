import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import {
  compile,
  haystackOf,
  splitCategory,
  type Matcher,
  type Pair,
} from "./match.ts";
import { makeCleaner } from "./names.ts";
import { RULES_DIR } from "./paths.ts";
import { preferenceKey, readPreference } from "./preferences.ts";
import type { RuleMap } from "./ruleFiles.ts";
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

export const loadCategories = (path = `${RULES_DIR}/categories.json`) =>
  loadJson<RuleMap>(path, {});

export const loadPreferences = (path = `${RULES_DIR}/preferences.json`) =>
  loadJson<RuleMap>(path, {});

export const loadGiro = (path = `${RULES_DIR}/giro.json`) =>
  loadJson<RuleMap>(path, {});

export const loadFamily = (path = `${RULES_DIR}/family.json`) =>
  loadJson<string[]>(path, []);

const FAMILY = "innskudd/familie";

export const loadSubscriptions = (path = `${RULES_DIR}/subscriptions.json`) =>
  loadJson<Subscriptions>(path, []);

export const loadNotSubscriptions = (
  path = `${RULES_DIR}/not-subscriptions.json`,
) => loadJson<Subscriptions>(path, []);

export const loadPayees = (path = `${RULES_DIR}/payees.json`) =>
  loadJson<RuleMap>(path, {});

export const loadCountries = (path = `${RULES_DIR}/countries.json`) =>
  loadJson<RuleMap>(path, {});

type Find = (haystack: string) => string | undefined;

const finders = new WeakMap<RuleMap, Find>();

const finder = (map: RuleMap, file: string): Find => {
  const cached = finders.get(map);
  if (cached) return cached;
  const rules = Object.entries(map).map(([pattern, value]) => ({
    matches: compile(pattern, `rules/${file}.json`),
    value,
  }));
  const seen = new Map<string, string | undefined>();
  const find: Find = (haystack) => {
    if (!seen.has(haystack))
      seen.set(haystack, rules.find((r) => r.matches(haystack))?.value);
    return seen.get(haystack);
  };
  finders.set(map, find);
  return find;
};

// The rule wins over the country the shape heuristic reads off the card name.
export function setCountries<
  T extends {
    description: string;
    counterparty: string | null;
    remoteAccountNumber: string | null;
    country: string | null;
  },
>(txns: T[], countries: RuleMap): T[] {
  const find = finder(countries, "countries");
  return txns.map((t) => {
    const hit = find(haystackOf(t));
    return hit === undefined ? t : { ...t, country: hit };
  });
}

export function renamePayees<
  T extends {
    description: string;
    counterparty: string | null;
    originalCounterparty?: string;
    remoteAccountNumber: string | null;
  },
>(txns: T[], payees: RuleMap): T[] {
  const find = finder(payees, "payees");
  const clean = makeCleaner(
    txns
      .map((t) => t.originalCounterparty ?? t.counterparty)
      .filter((n) => n !== null),
  );
  return txns.map((t) => {
    const hit = find(haystackOf(t));
    // Use the name from the rule exactly as written. The shape heuristic would
    // change `IKEA` to `Ikea`.
    const original = t.originalCounterparty ?? t.counterparty ?? "";
    return {
      ...t,
      originalCounterparty: original,
      counterparty: hit ?? (original ? clean(original) : null),
    };
  });
}

export function categorize(
  txns: Classified[],
  categories: RuleMap,
  subscriptions: Subscriptions = [],
  giro: RuleMap = {},
  cards: Set<string> = new Set(),
  family: string[] = [],
  notSubscriptions: Subscriptions = [],
  preferences: RuleMap = {},
): Categorized[] {
  for (const key of Object.keys(preferences)) readPreference(key);
  const rules = finder(categories, "categories");
  const giroRules = finder(giro, "giro");
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
      ...categoryFor(
        t,
        rules,
        giroRules,
        familyRules,
        haystack,
        cards,
        preferences,
      ),
      isRecurring: t.isRecurring && !denied,
      isSubscription:
        !denied && (t.isSubscription || subs.some((m) => m(haystack))),
    };
  });
}

const flat = (category: string): Pair => ({ category, subcategory: null });
const assigned = (pair: Pair, categorySource: string) => ({
  ...pair,
  categorySource,
});

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
  rules: Find,
  giroRules: Find,
  familyRules: Matcher[],
  haystack: string,
  cards: Set<string>,
  preferences: RuleMap,
): Pair & { categorySource: string } {
  if (t.excluded) return assigned(flat(TRANSFER), "Excluded");
  const key = preferenceKey(t);
  const remembered = key === null ? undefined : preferences[key];
  if (remembered)
    return assigned(splitCategory(remembered), "Remembered category");
  const hit = rules(haystack);
  if (hit !== undefined) return assigned(splitCategory(hit), "Category rule");
  if (LUMP_TYPE.test(t.typeText ?? "")) {
    const named = giroRules(haystack);
    if (named !== undefined) return assigned(splitCategory(named), "Giro rule");
  }
  if (familyRules.some((m) => m(haystack)))
    return assigned(
      splitCategory(t.amount > 0 ? FAMILY : PEER_PAYMENT),
      "Family rule",
    );
  if (isVippsPeer(t))
    return assigned(splitCategory(PEER_PAYMENT), "Peer payment");
  const bank = bankPair(t);
  if (bank) return assigned(bank, "Bank category");
  if (
    cards.has(t.accountKey) &&
    FOREIGN_MERCHANT.test(t.originalCounterparty ?? t.counterparty ?? "")
  )
    return assigned(flat(TRAVEL), "Travel estimate");
  return assigned(flat(UNCATEGORIZED), "Needs review");
}
