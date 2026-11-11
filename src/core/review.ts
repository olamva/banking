import { payeePattern } from "./bulkRules.ts";
import type { Categorized } from "./types.ts";

const GUESSED = new Set(["Travel estimate", "Needs review"]);
const UNCONFIRMED = new Set([...GUESSED, "Bank category"]);

export type ReviewGroup = { txns: Categorized[]; guessed: boolean };

export function reviewGroups(txns: Categorized[]): ReviewGroup[] {
  const groups = new Map<string, Categorized[]>();
  for (const t of txns) {
    const key = payeePattern(t);
    if (key === null || !UNCONFIRMED.has(t.categorySource ?? "")) continue;
    const group = groups.get(key) ?? [];
    group.push(t);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({
      txns: group.sort((a, b) => b.date.localeCompare(a.date)),
      guessed: group.some((t) => GUESSED.has(t.categorySource ?? "")),
    }))
    .sort(
      (a, b) =>
        Number(b.guessed) - Number(a.guessed) ||
        b.txns[0]!.date.localeCompare(a.txns[0]!.date),
    );
}
