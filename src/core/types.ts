export type Txn = {
  /** SB1's id, reissued when a reservation books — never stable across syncs. */
  id: string;
  accountKey: string;
  account: string;
  date: string;
  /** Signed. Negative is money out. */
  amount: number;
  description: string;
  counterparty: string | null;
  country: string | null;
  bankCategory: string | null;
  bankSub: string | null;
  bankCategoryName: string | null;
  bankSubName: string | null;
  bankConfidence: number | null;
  remoteAccountNumber: string | null;
  typeText: string | null;
  isRecurring: boolean;
  isSubscription: boolean;
};

/** Exclusions are flagged, never dropped, so always set `reason`. */
export type Classified = Txn & {
  excluded: boolean;
  reason: string | null;
};

export type Categorized = Classified & {
  category: string;
  subcategory: string | null;
};
