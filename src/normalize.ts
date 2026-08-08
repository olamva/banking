// Flattens data/raw/<month>/*.json into Txn[]. Pure, no network.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Txn } from './types.ts';

type Sb1File = {
  transactions: Array<{
    transaction: {
      id: string;
      accountKey: string;
      amount: number;
      /** Epoch millis at Oslo midnight — never format as UTC. */
      date: number;
      description: string;
      cleanedDescription: string;
    };
    categories: Array<{ main: string }>;
    recurring: boolean;
    subscription: boolean;
  }>;
};

type EbFile = {
  account: { uid: string };
  transactions: Array<{
    transaction_id: string;
    transaction_amount: { amount: string };
    credit_debit_indicator: 'DBIT' | 'CRDT';
    /** Null while still pending — the same open pending rows reappear in every
     *  month's file regardless of the query range, so these can't be
     *  attributed to a month. Skip rather than fall back to transaction_date:
     *  the booking date is the only date Txn commits to. */
    booking_date: string | null;
    remittance_information: string[];
    status: string;
  }>;
};

function osloDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString('en-CA', { timeZone: 'Europe/Oslo' });
}

function normalizeSb1(file: Sb1File): Txn[] {
  return file.transactions.map(({ transaction: t, categories, recurring, subscription }) => ({
    id: t.id,
    source: 'sb1',
    accountKey: t.accountKey,
    date: osloDate(t.date),
    amount: t.amount,
    description: t.description,
    counterparty: t.cleanedDescription,
    bankCategory: categories[0]?.main ?? null,
    isRecurring: recurring,
    isSubscription: subscription,
    isPending: false,
  }));
}

function normalizeCard(file: EbFile): Txn[] {
  return file.transactions
    .filter((t): t is typeof t & { booking_date: string } => t.booking_date != null)
    .map((t) => ({
      id: t.transaction_id,
      source: 'card',
      accountKey: file.account.uid,
      date: t.booking_date,
      amount: (t.credit_debit_indicator === 'DBIT' ? -1 : 1) * Number(t.transaction_amount.amount),
      description: t.remittance_information.join(' '),
      counterparty: null,
      bankCategory: null,
      isRecurring: false,
      isSubscription: false,
      isPending: t.status === 'PDNG',
    }));
}

/** Flattens every JSON file in a data/raw/<month> directory into Txn[]. */
export function normalizeMonth(dir: string): Txn[] {
  const out: Txn[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    const data = JSON.parse(readFileSync(join(dir, name), 'utf8'));
    out.push(...(name.startsWith('eb-') ? normalizeCard(data) : normalizeSb1(data)));
  }
  return out;
}
