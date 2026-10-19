import PostalMime from "postal-mime";
import type { Txn } from "./types.ts";

export type Entry = { label: string; amount: number };

export type ReceiptLine = {
  name: string;
  size?: string;
  qty: number;
  unit?: "kg";
  price: number;
  amount: number;
  discounts?: Entry[];
  deposit?: number;
};

export type Receipt = {
  source: "rema" | "trumf" | "gmail";
  id: string;
  at: number;
  store: string;
  title?: string;
  lines: ReceiptLine[];
  total?: number;
  payments?: Entry[];
};

export type Found = { receipt: Receipt; amounts: number[]; names: string[] };

type RemaRow = {
  prodtxt1?: string;
  productDescription?: string;
  pieces: number;
  amount: number;
  amountWithoutDeposit: number;
  unitPrice: number;
  discount: number;
  unit: string;
  volume: number;
  usedOffers?: { offerDesc?: string; discount: number }[];
};

type RemaFile = {
  head: {
    id: number;
    purchaseDate: number;
    storeName: string;
    amount: number;
    transactionPayments: { amount: number; meansOfPaymentDesc: string }[];
  };
  receipt: { rows: RemaRow[] };
};

type TrumfFile = {
  purchase: {
    batchId: string;
    belop: number;
    beskrivelse: string;
    transaksjonsTidspunkt: string;
  };
  receipt: {
    varelinjer: {
      produktBeskrivelse: string;
      antall: number;
      belop: number;
      enhetsType: string;
      besparelser?: { beskrivelse?: string; belop: number }[];
    }[];
  } | null;
};

const SIZE =
  /(?<![\p{L}\d.,])(?:(ca)\.? ?)?((?:\d+ ?[x×] ?)?\d+(?:[.,]\d+)?) ?(kg|gr|g|mg|ltr|l|dl|cl|ml|cm|stk|pk|pakk|pak|tab|ark)\.?(?: ?[x×] ?(\d+) ?(?:stk|pk|fl|bx)?|(\d+)pk)?(?![\p{L}\d])|(?<![\p{L}\d.,])(0[.,]\d{1,3}) ?(?:bx|fl)?$/giu;

const UNITS: Record<string, string> = {
  gr: "g",
  ltr: "l",
  pak: "pk",
  pakk: "pk",
};

const number = (s: string) => s.replace(".", ",").replace(/ ?[x×] ?/i, " × ");

function splitSize(text: string): { name: string; size?: string } {
  const sizes = new Set<string>();
  const name = text
    .replace(SIZE, (_, ca, amount, unit = "", times, pack, litres) => {
      const count = times ?? pack;
      sizes.add(
        litres
          ? `${number(litres)} l`
          : `${ca ? "ca. " : ""}${number(amount)} ${UNITS[unit.toLowerCase()] ?? unit.toLowerCase()}${count ? ` × ${count}` : ""}`,
      );
      return " ";
    })
    .replace(/\s+/g, " ")
    .trim();
  return sizes.size && name
    ? { name, size: [...sizes].join(" · ") }
    : { name: text };
}

const ore = (n: number) => Math.round(n * 100) / 100;

const sum = (items: { amount: number }[]) =>
  ore(items.reduce((total, i) => total + i.amount, 0));

function remaLine(r: RemaRow): ReceiptLine {
  const kg = r.unit.toLowerCase() === "kg";
  const deposit = ore(r.amount - r.amountWithoutDeposit);
  const discounts = r.usedOffers?.length
    ? r.usedOffers.map((o) => ({
        label: o.offerDesc ?? "",
        amount: o.discount,
      }))
    : r.discount
      ? [{ label: "", amount: -r.discount }]
      : [];
  return {
    ...splitSize(r.prodtxt1 ?? r.productDescription ?? "Unnamed item"),
    qty: kg ? r.volume : r.pieces,
    ...(kg ? { unit: "kg" as const } : {}),
    price: kg
      ? r.unitPrice
      : ore((r.amountWithoutDeposit - r.discount) / r.pieces),
    amount: r.amount,
    ...(discounts.length ? { discounts } : {}),
    ...(deposit ? { deposit } : {}),
  };
}

function remaPayments(head: RemaFile["head"]): Entry[] {
  const paid = (desc: string) =>
    sum(head.transactionPayments.filter((p) => p.meansOfPaymentDesc === desc));
  const rounding = paid("Rounding");
  const card = paid("CreditDebit");
  const coupon = paid("Coupon");
  return [
    { label: "Øreavrunding", amount: rounding },
    { label: "Bankkort", amount: card },
    { label: "Kupong", amount: coupon },
    { label: "Kontant", amount: ore(head.amount + rounding - card - coupon) },
  ].filter((p) => Math.abs(p.amount) >= 0.005);
}

const letters = (s: string) => s.toLowerCase().replace(/[^a-zæøå]/g, "");

const firstWord = (s: string) => letters(s.trim().split(/\s/)[0] ?? "");

export const remaReceipt = ({ head, receipt }: RemaFile): Found => ({
  receipt: {
    source: "rema",
    id: String(head.id),
    at: head.purchaseDate,
    store: head.storeName,
    lines: receipt.rows.map(remaLine),
    total: head.amount,
    payments: remaPayments(head),
  },
  amounts: [
    head.transactionPayments
      .filter((p) => p.meansOfPaymentDesc === "CreditDebit")
      .reduce((sum, p) => sum + p.amount, 0),
  ].filter((a) => a > 0),
  names: ["rema"],
});

export const trumfReceipt = ({ purchase, receipt }: TrumfFile): Found | null =>
  receipt && {
    receipt: {
      source: "trumf",
      id: purchase.batchId,
      at: Date.parse(purchase.transaksjonsTidspunkt),
      store: purchase.beskrivelse,
      lines: receipt.varelinjer.map((l) => {
        const discounts = (l.besparelser ?? []).map((b) => ({
          label: b.beskrivelse ?? "",
          amount: b.belop,
        }));
        return {
          ...splitSize(l.produktBeskrivelse),
          qty: l.antall,
          ...(l.enhetsType === "KG" ? { unit: "kg" as const } : {}),
          price: ore((l.belop + sum(discounts)) / (l.antall || 1)),
          amount: l.belop,
          ...(discounts.length ? { discounts } : {}),
        };
      }),
      total: purchase.belop,
    },
    amounts: [purchase.belop],
    names: [firstWord(purchase.beskrivelse)],
  };

const MONEY =
  /(\d{1,3}(?:[ .,]\d{3})+|\d+)(?:[.,](\d{2})(?!\d)|,-)|(?:kr\.?|nok) ?(\d{1,3}(?: \d{3})+|\d+)(?![\d.,]| \d)|(\d{1,3}(?: \d{3})+|\d+) ?(?:kr|nok)\b/gi;

export async function mailReceipt(id: string, raw: Uint8Array): Promise<Found> {
  const mail = await PostalMime.parse(raw);
  const text =
    `${mail.text ?? ""} ${(mail.html ?? "").replace(/<(style|script)[\s\S]*?<\/\1>|<[^>]*>/gi, " ")}`
      .replace(/&nbsp;|&#160;|&#xa0;/gi, " ")
      .replace(/\s+/g, " ");
  const address = mail.from?.address ?? "";
  const domain = address.split("@")[1]?.split(".").at(-2) ?? "";
  return {
    receipt: {
      source: "gmail",
      id,
      at: Date.parse(mail.date ?? ""),
      store: mail.from?.name || domain || address,
      title: mail.subject ?? "",
      lines: [],
    },
    amounts: [...text.matchAll(MONEY)].map(
      (m) =>
        Number((m[1] ?? m[3] ?? m[4])!.replace(/[ .,]/g, "")) +
        Number(m[2] ?? 0) / 100,
    ),
    names: [letters(domain), firstWord(mail.from?.name ?? "")],
  };
}

const osloDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo" });

const dayOf = (date: string) => Date.parse(`${date}T00:00:00Z`) / 864e5;

function sameStore(names: string[], t: Txn): boolean {
  const text =
    `${t.description.split(",")[0]} ${t.counterparty ?? ""}`.toLowerCase();
  const words = text.split(/[^a-zæøå]+/).filter((w) => w.length >= 4);
  return names.some(
    (n) =>
      n.length >= 3 &&
      (letters(text).includes(n) || words.some((w) => n.includes(w))),
  );
}

export function matchReceipts<T extends Txn>(
  txns: T[],
  found: Found[],
): Map<T, Receipt> {
  const byCents = Map.groupBy(
    txns.filter((t) => t.amount < 0),
    (t) => Math.round(-t.amount * 100),
  );
  const pairs = found.flatMap((f) => {
    const day = dayOf(osloDay.format(f.receipt.at));
    return [...new Set(f.amounts.map((a) => Math.round(a * 100)))].flatMap(
      (cents) =>
        (byCents.get(cents) ?? [])
          .map((t) => ({ f, t, lag: dayOf(t.date) - day }))
          .filter(
            ({ t, lag }) => lag >= -2 && lag <= 7 && sameStore(f.names, t),
          ),
    );
  });
  pairs.sort((a, b) => Math.abs(a.lag) - Math.abs(b.lag) || b.lag - a.lag);
  const used = new Set<Found>();
  const matched = new Map<T, Receipt>();
  for (const { f, t } of pairs)
    if (!used.has(f) && !matched.has(t)) {
      used.add(f);
      matched.set(t, f.receipt);
    }
  return matched;
}
