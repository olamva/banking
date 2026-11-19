import { personMerchants, type Filters } from "../../core/select.ts";
import type { MonthStats } from "../../core/stats.ts";
import type { Categorized } from "../../core/types.ts";

export const PERSON_LABEL = {
  totalOut: "Paid",
  totalIn: "Received",
  net: "Net",
};

export const onePerson = (f: Filters, rows: Categorized[]) =>
  f.merchants.length === 1 &&
  !f.or.length &&
  personMerchants(rows).has(f.merchants[0]!);

const asPerson = (s: MonthStats): MonthStats => ({
  ...s,
  totalOut: s.totalOut + s.refunded,
  totalIn: s.totalIn + s.refunded,
  refunded: 0,
});

export const personView = <T extends { stats: MonthStats; prev: MonthStats }>(
  p: T,
) => ({ ...p, stats: asPerson(p.stats), prev: asPerson(p.prev), yearly: null });

export const grossRows = (person: boolean, rows: Categorized[]) =>
  person
    ? rows.map((t) =>
        t.amount > 0 ? { ...t, category: "innskudd", subcategory: null } : t,
      )
    : rows;
