import type { Categorized, Txn } from "./types.ts";

type Identity = Pick<
  Txn,
  | "counterparty"
  | "originalCounterparty"
  | "typeText"
  | "amount"
  | "remoteAccountNumber"
>;
type Preference = [string, string, number, string];

export function preferenceKey(t: Identity): string | null {
  const payee = (t.originalCounterparty ?? t.counterparty ?? "")
    .trim()
    .toLowerCase();
  if (!payee || !t.typeText?.trim() || t.amount === 0) return null;
  return JSON.stringify([
    payee,
    t.typeText.trim().toLowerCase(),
    Math.sign(t.amount),
    t.remoteAccountNumber ?? "",
  ]);
}

export function readPreference(key: string): Preference {
  const value: unknown = JSON.parse(key);
  if (
    !Array.isArray(value) ||
    value.length !== 4 ||
    typeof value[0] !== "string" ||
    !value[0].trim() ||
    typeof value[1] !== "string" ||
    !value[1].trim() ||
    ![-1, 1].includes(value[2]) ||
    typeof value[3] !== "string" ||
    value[0] !== value[0].trim().toLowerCase() ||
    value[1] !== value[1].trim().toLowerCase() ||
    JSON.stringify(value) !== key
  )
    throw new Error("Invalid remembered category conditions");
  return value as Preference;
}

export function preferenceLabel(key: string): string {
  const [payee, type, sign, account] = readPreference(key);
  return `${payee} · ${type} · ${sign < 0 ? "Money out" : "Money in"}${account ? ` · Recipient ${account}` : ""}`;
}

export function reviewGroups(
  txns: Categorized[],
  remembered: Record<string, string>,
): Categorized[][] {
  const groups = new Map<string, Categorized[]>();
  for (const t of txns) {
    if (
      t.excluded ||
      !["Bank category", "Travel estimate", "Needs review"].includes(
        t.categorySource ?? "",
      )
    )
      continue;
    const key = preferenceKey(t);
    if (key === null || Object.hasOwn(remembered, key)) continue;
    const group = groups.get(key) ?? [];
    group.push(t);
    groups.set(key, group);
  }
  for (const group of groups.values())
    group.sort((a, b) => b.date.localeCompare(a.date));
  return [...groups.values()].sort((a, b) =>
    b[0]!.date.localeCompare(a[0]!.date),
  );
}
