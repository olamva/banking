import type { Categorized } from "./types.ts";

export type Names = Record<string, string>;

export type Labels = {
  category: (slug: string) => string;
  subcategory: (category: string, sub: string | null) => string;
};

export function tidy(slug: string): string {
  const words = slug.replace(/_/g, " ").trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : slug;
}

export const NO_SUB = "Annet";

export function buildLabels(txns: Categorized[], names: Names = {}): Labels {
  const mains = new Map<string, string>();
  const subs = new Map<string, string>();
  const bareSubs = new Map<string, string>();
  for (const t of txns) {
    if (t.bankCategory && t.bankCategoryName && !mains.has(t.bankCategory)) {
      mains.set(t.bankCategory, t.bankCategoryName);
    }
    if (t.bankCategory && t.bankSub && t.bankSubName) {
      const key = `${t.bankCategory}/${t.bankSub}`;
      if (!subs.has(key)) subs.set(key, t.bankSubName);
      if (!bareSubs.has(t.bankSub)) bareSubs.set(t.bankSub, t.bankSubName);
    }
  }

  return {
    category: (slug) => names[slug] ?? mains.get(slug) ?? tidy(slug),
    subcategory: (category, sub) => {
      if (sub === null) return NO_SUB;
      return (
        names[`${category}/${sub}`] ??
        subs.get(`${category}/${sub}`) ??
        bareSubs.get(sub) ??
        tidy(sub)
      );
    },
  };
}
