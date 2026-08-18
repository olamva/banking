import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { makeCleaner } from "./names.ts";
import type { Categorized, Classified } from "./types.ts";

export type Overrides = Record<string, string>;

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

export const loadOverrides = (path = "rules/overrides.json") =>
  loadJson<Overrides>(path, {});

export const loadGiro = (path = "rules/giro.json") =>
  loadJson<Overrides>(path, {});

export const loadFamily = (path = "rules/family.json") =>
  loadJson<string[]>(path, []);

const FAMILY = "innskudd/familie";

export const loadSubscriptions = (path = "rules/subscriptions.json") =>
  loadJson<Subscriptions>(path, []);

export const loadNotSubscriptions = (path = "rules/not-subscriptions.json") =>
  loadJson<Subscriptions>(path, []);

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

export function splitCategory(value: string): Pair {
  const cut = value.indexOf("/");
  return cut === -1
    ? { category: value, subcategory: null }
    : { category: value.slice(0, cut), subcategory: value.slice(cut + 1) };
}

export const haystackOf = (t: {
  description: string;
  counterparty: string | null;
  remoteAccountNumber: string | null;
}): string =>
  `${t.description} ${t.counterparty ?? ""} ${t.remoteAccountNumber ?? ""}`.toLowerCase();

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
