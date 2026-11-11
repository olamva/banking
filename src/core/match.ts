// The pure half of a rule: what a pattern is, and what it reads. The page
// imports this to count the rows a pattern claims before the rule is saved, so
// it may hold no `node:` import. categorize.ts re-exports all of it.

export type Matcher = (haystack: string) => boolean;

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
  originalCounterparty?: string;
  remoteAccountNumber: string | null;
}): string =>
  `${t.description} ${t.originalCounterparty ?? t.counterparty ?? ""} ${t.remoteAccountNumber ?? ""}`.toLowerCase();

export const isRegex = (pattern: string): boolean =>
  /^\/(.+)\/([a-z]*)$/.test(pattern);

export function compile(pattern: string, source: string): Matcher {
  const asRegex = /^\/(.+)\/([a-z]*)$/.exec(pattern);
  if (!asRegex) {
    const needle = pattern.toLowerCase();
    return (h) => h.includes(needle);
  }
  try {
    // Match without case. The code makes the haystack lowercase first.
    const re = new RegExp(asRegex[1]!, asRegex[2]!.replace("i", "") + "i");
    return (h) => {
      re.lastIndex = 0;
      return re.test(h);
    };
  } catch (e) {
    throw new Error(
      `${source}: ${pattern} is not a valid regex — ${e instanceof Error ? e.message : e}`,
    );
  }
}

export type Conditions = {
  pattern: string;
  type?: string;
  direction?: "in" | "out";
  account?: string;
};

type Facts = Parameters<typeof haystackOf>[0] & {
  typeText: string | null;
  amount: number;
};

export type Rule = {
  weight: number;
  matches: (t: Facts, haystack?: string) => boolean;
};

const FIELDS = ["pattern", "type", "direction", "account"];

export const ruleKey = ({ pattern, type, direction, account }: Conditions) =>
  type || direction || account
    ? JSON.stringify({ pattern, type, direction, account })
    : pattern;

export function readRule(key: string, source: string): Conditions {
  if (!key.startsWith("{")) return { pattern: key };
  let value: unknown;
  try {
    value = JSON.parse(key);
  } catch {}
  const ok =
    typeof value === "object" &&
    value !== null &&
    "pattern" in value &&
    Object.entries(value).every(
      ([k, v]) => FIELDS.includes(k) && typeof v === "string" && v.trim(),
    ) &&
    [undefined, "in", "out"].includes((value as Conditions).direction) &&
    ruleKey(value as Conditions) === key;
  if (!ok) throw new Error(`${source}: ${key} is not a valid rule`);
  return value as Conditions;
}

export function compileRule(key: string, source: string): Rule {
  const { pattern, type, direction, account } = readRule(key, source);
  const text = compile(pattern, source);
  const kind = type === undefined ? null : compile(type, source);
  const sign = direction === undefined ? 0 : direction === "in" ? 1 : -1;
  return {
    weight: [type, direction, account].filter(Boolean).length,
    matches: (t, haystack = haystackOf(t)) =>
      text(haystack) &&
      (!kind || kind((t.typeText ?? "").toLowerCase())) &&
      (!sign || Math.sign(t.amount) === sign) &&
      (!account || t.remoteAccountNumber === account),
  };
}
