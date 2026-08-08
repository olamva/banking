import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { Classified, Categorized } from './types.ts';

/**
 * overrides.json: { "<substring pattern, case-insensitive>": "<category>" }
 * Matched against `description`. Not committed — hand-edited locally, applied
 * on top of bankCategory. Missing file means no overrides, not an error.
 */
export type Overrides = Record<string, string>;

const CARD_CATEGORY = 'card spending';
const UNCATEGORIZED = 'ukategorisert';

export async function loadOverrides(path = 'overrides.json'): Promise<Overrides> {
  if (!existsSync(path)) return {};
  return JSON.parse(await readFile(path, 'utf8'));
}

export function categorize(txns: Classified[], overrides: Overrides): Categorized[] {
  const patterns = Object.entries(overrides);
  return txns.map((t) => ({ ...t, category: categoryFor(t, patterns) }));
}

function categoryFor(t: Classified, patterns: [string, string][]): string {
  const description = t.description.toLowerCase();
  const override = patterns.find(([pattern]) => description.includes(pattern.toLowerCase()));
  if (override) return override[1];
  if (t.source === 'card') return CARD_CATEGORY;
  return t.bankCategory ?? UNCATEGORIZED;
}
