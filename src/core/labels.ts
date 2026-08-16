/**
 * What to call a category slug on the page.
 *
 * Three sources, in order, and the order is the whole design:
 *
 * 1. **`rules/categories.json`**, for names that are ours to choose. Gitignored
 *    like every other rules file.
 * 2. **The bank's own name, learned from the rows.** SB1 sends `mainI18n` and
 *    `subI18n` on all 8 547 rows, so 68 pairs name themselves and no file has to
 *    list them. This is why `Txn` carries the names rather than a lookup table:
 *    the browser has the rows and nothing else.
 * 3. **The slug, tidied.** `medlemskap_og_veldedighet` -> `Medlemskap og
 *    veldedighet`, which is already right for most of what we invent. That is
 *    what keeps `rules/categories.json` down to the handful of slugs where
 *    tidying gets it wrong — `overfoering`, spelled without the ø it needs.
 *
 * Mains and subs are looked up **separately, never in one map**, because one
 * slug can be both and mean different things: `dagligvarer` is a main the bank
 * calls `Dagligvarer` and a sub under itself that it calls `Matvarer`.
 */
import type { Categorized } from "./types.ts";

/**
 * rules/categories.json: `{ "<category>": "<name>", "<category>/<sub>": "<name>" }`
 *
 * A sub is keyed by its full pair, so a sub sharing a slug with a main — or with
 * a sub under a different main — cannot collide with it.
 */
export type Names = Record<string, string>;

export type Labels = {
  /** The display name for a category slug. */
  category: (slug: string) => string;
  /** The display name for a subcategory, given the category it sits under. */
  subcategory: (category: string, sub: string | null) => string;
};

/**
 * `faste_utgifter` -> `Faste utgifter`. First letter only: these are Norwegian
 * names and Norwegian does not capitalise every word in a phrase, so title case
 * would be wrong for `Medlemskap og veldedighet` in a way nobody would type.
 */
export function tidy(slug: string): string {
  const words = slug.replace(/_/g, " ").trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : slug;
}

/** A row with no second level at all — the bank had none and no rule named one. */
export const NO_SUB = "Annet";

export function buildLabels(txns: Categorized[], names: Names = {}): Labels {
  // The bank names itself, so this is learned rather than listed. Two maps, not
  // one: see the note above about `dagligvarer`.
  const mains = new Map<string, string>();
  const subs = new Map<string, string>();
  // The same names again, keyed on the bare sub, for the renamed-main fallback
  // below. Built here rather than searched for per call: it is the difference
  // between one pass over 70 pairs and one per row, and the page asks for a
  // label once per row per render — see the note on the fallback.
  const bareSubs = new Map<string, string>();
  for (const t of txns) {
    if (t.bankCategory && t.bankCategoryName && !mains.has(t.bankCategory)) {
      mains.set(t.bankCategory, t.bankCategoryName);
    }
    if (t.bankCategory && t.bankSub && t.bankSubName) {
      const key = `${t.bankCategory}/${t.bankSub}`;
      if (!subs.has(key)) subs.set(key, t.bankSubName);
      // First one wins, matching the search this replaces: it scanned `subs` in
      // insertion order and took the first key ending in the sub.
      if (!bareSubs.has(t.bankSub)) bareSubs.set(t.bankSub, t.bankSubName);
    }
  }

  return {
    category: (slug) => names[slug] ?? mains.get(slug) ?? tidy(slug),
    subcategory: (category, sub) => {
      if (sub === null) return NO_SUB;
      // The pair first, then the sub as the bank spells it anywhere — our own
      // main renames (`faste_boutgifter` -> `faste_utgifter`) leave the pair key
      // unfindable while the sub underneath is still the bank's own.
      //
      // All three are map reads, and that is the point: this runs once per row
      // per render — 10 440 times on the transactions table, and twice that per
      // comparison when it sorts by the category column. The fallback used to
      // spread `subs` into an array and scan it, and it did so *before* the
      // chain rather than inside it, so every row paid for a search it did not
      // need. That cost 200 ms a sort. Keep all four branches O(1).
      return (
        names[`${category}/${sub}`] ??
        subs.get(`${category}/${sub}`) ??
        bareSubs.get(sub) ??
        tidy(sub)
      );
    },
  };
}
