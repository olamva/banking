export type Txn = {
  // SB1 gives a new id when a reservation books. Do not rely on it across syncs.
  id: string;
  accountKey: string;
  account: string;
  card?: boolean;
  date: string;
  // The amount is signed. A negative amount is money out.
  amount: number;
  description: string;
  counterparty: string | null;
  // An empty string preserves an absent imported payee after a rule supplies a display name.
  originalCounterparty?: string;
  country: string | null;
  bankCategory: string | null;
  bankSub: string | null;
  bankCategoryName: string | null;
  bankSubName: string | null;
  bankConfidence: number | null;
  remoteAccountNumber: string | null;
  typeText: string | null;
  isPending: boolean;
  isRecurring: boolean;
  isSubscription: boolean;
};

// The code flags an exclusion. It does not remove the row. Always set `reason`.
export type Classified = Txn & {
  excluded: boolean;
  reason: string | null;
};

export type Categorized = Classified & {
  category: string;
  subcategory: string | null;
  categorySource?: string;
};
