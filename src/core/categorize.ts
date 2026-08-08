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

const CARD_CATEGORY = 'card spending';
const UNCATEGORIZED = 'ukategorisert';

export async function loadOverrides(path = 'overrides.json'): Promise<Overrides> {
  if (!existsSync(path)) return {};
  return JSON.parse(await readFile(path, 'utf8'));
}

type Rule = { matches: (haystack: string) => boolean; category: string };

/** Compiled once per run, not once per transaction. */
function compile(pattern: string, category: string): Rule {
  const asRegex = /^\/(.+)\/([a-z]*)$/.exec(pattern);
  if (!asRegex) {
    const needle = pattern.toLowerCase();
    return { matches: (h) => h.includes(needle), category };
  }
  try {
    // Always case-insensitive: the haystack is lowercased before matching.
    const re = new RegExp(asRegex[1]!, asRegex[2]!.replace('i', '') + 'i');
    return { matches: (h) => re.test(h), category };
  } catch (e) {
    throw new Error(`overrides.json: ${pattern} is not a valid regex — ${e instanceof Error ? e.message : e}`);
  }
}

export function categorize(txns: Classified[], overrides: Overrides): Categorized[] {
  const rules = Object.entries(overrides).map(([pattern, category]) => compile(pattern, category));
  return txns.map((t) => ({ ...t, category: categoryFor(t, rules) }));
}

function categoryFor(t: Classified, rules: Rule[]): string {
  const haystack = `${t.description} ${t.counterparty ?? ''}`.toLowerCase();
  const override = rules.find((r) => r.matches(haystack));
  if (override) return override.category;
  if (t.source === 'card') return CARD_CATEGORY;
  return t.bankCategory ?? UNCATEGORIZED;
}
