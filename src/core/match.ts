// The pure half of a rule: what a pattern is, and what it reads. The page
// imports this to count the rows a pattern claims before the rule is saved, so
// it may hold no `node:` import. categorize.ts re-exports all of it.

export type Overrides = Record<string, string>;

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
    // Match without case. The code makes the haystack lowercase first.
    const re = new RegExp(asRegex[1]!, asRegex[2]!.replace("i", "") + "i");
    return (h) => re.test(h);
  } catch (e) {
    throw new Error(
      `${source}: ${pattern} is not a valid regex — ${e instanceof Error ? e.message : e}`,
    );
  }
}
