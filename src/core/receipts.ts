import PostalMime from "postal-mime";
import { mailItems } from "./mail.ts";
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
  fee?: boolean;
  group?: { code: string; name: string };
};

export type Receipt = {
  source: "rema" | "trumf" | "gmail" | "coop";
  id: string;
  at: number;
  store: string;
  title?: string;
  lines: ReceiptLine[];
  total?: number;
  currency?: string;
  payments?: Entry[];
};

export type Found = {
  receipt: Receipt;
  amounts: number[];
  names: string[];
  fit?: (paid: number) => Receipt;
};

type RemaRow = {
  prodtxt1?: string;
  prodtxt2?: string;
  prodtxt3?: string;
  productDescription?: string;
  productGroupCode?: string;
  productGroupDescription?: string;
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
  /(?<![\p{L}\d.,])(?:(ca)\.? ?)?((?:\d+ ?[x×] ?)?\d+(?:[.,]\d+)?) ?(kg|gr|g|mg|ltr|l|dl|cl|ml|cm|stk|pk|pakk|pak|tab|ark)\.?(?: ?[x×] ?(\d+) ?(?:stk|pk|fl|bx)?|(\d+)pk)?(?![\p{L}\d])|(?<![\p{L}\d.,])(0[.,]\d{1,3})(?: ?[x×] ?(\d+))? ?(?:bx|fl|b)?$/giu;

const UNITS: Record<string, string> = {
  gr: "g",
  ltr: "l",
  pak: "pk",
  pakk: "pk",
};

const PACK_SIZES: Record<string, string> = {
  "7044613876013": "0,5 l × 6",
  "7030019539799": "0,5 l",
};

const number = (s: string) => s.replace(".", ",").replace(/ ?[x×] ?/i, " × ");

function parseSizes(text: string): { rest: string; sizes: string[] } {
  const sizes = new Set<string>();
  const rest = text
    .replace(SIZE, (_, ca, amount, unit = "", times, pack, litres, cans) => {
      const count = times ?? pack ?? cans;
      sizes.add(
        `${litres ? number(litres) : `${ca ? "ca. " : ""}${number(amount)}`} ${litres ? "l" : (UNITS[unit.toLowerCase()] ?? unit.toLowerCase())}${count ? ` × ${count}` : ""}`,
      );
      return " ";
    })
    .replace(/\s+/g, " ")
    .trim();
  return { rest, sizes: [...sizes] };
}

function splitSize(text: string): { name: string; size?: string } {
  const { rest, sizes } = parseSizes(text);
  return sizes.length && rest
    ? { name: rest, size: sizes.join(" · ") }
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
  const { name, size: found = parseSizes(r.prodtxt2 ?? "").sizes[0] } =
    splitSize(r.prodtxt1 || r.productDescription || "Unnamed item");
  const size = PACK_SIZES[r.prodtxt3 ?? ""] ?? found;
  return {
    name,
    ...(size ? { size } : {}),
    qty: kg ? r.volume : r.pieces,
    ...(kg ? { unit: "kg" as const } : {}),
    price: kg
      ? r.unitPrice
      : ore((r.amountWithoutDeposit - r.discount) / r.pieces),
    amount: r.amount,
    ...(discounts.length ? { discounts } : {}),
    ...(deposit ? { deposit } : {}),
    ...(r.productGroupCode
      ? {
          group: {
            code: r.productGroupCode,
            name: r.productGroupDescription ?? "",
          },
        }
      : {}),
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

const cardPayments = (head: RemaFile["head"]) =>
  head.transactionPayments.filter(
    (p) => p.meansOfPaymentDesc === "CreditDebit",
  );

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
    sum(cardPayments(head)),
    ...cardPayments(head).map((p) => p.amount),
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

type CoopFile = {
  period: { year: number; month: number };
  details: {
    summary: {
      summaryId: string;
      storeName: string;
      dateTime: string;
      totalSum: string;
      lines: {
        name: string;
        quantity: string;
        price: string;
        discount: string | null;
      }[];
    };
  };
};

const kroner = (s: string | null) =>
  Number((s ?? "0").replace(/[\s.]/g, "").replace(",", "."));

const osloOffset = (utc: number) => {
  const [, sign, h, m] = new Intl.DateTimeFormat("en", {
    timeZone: "Europe/Oslo",
    timeZoneName: "longOffset",
  })
    .format(utc)
    .match(/([+-])(\d\d):(\d\d)/)!;
  return (sign === "-" ? -1 : 1) * (Number(h) * 60 + Number(m)) * 60_000;
};

function coopTime({ year, month }: CoopFile["period"], text: string): number {
  const [, day, hour, minute] = text.match(/^(\d+)\.\D+(\d+):(\d+)/) ?? [];
  const local = Date.UTC(
    year,
    month - 1,
    Number(day),
    Number(hour),
    Number(minute),
  );
  return local - osloOffset(local);
}

export const coopReceipt = ({ period, details }: CoopFile): Found => {
  const s = details.summary;
  return {
    receipt: {
      source: "coop",
      id: s.summaryId,
      at: coopTime(period, s.dateTime),
      store: s.storeName,
      lines: s.lines.map((l) => {
        const [, count, unit] = l.quantity.match(/^([\d,.]+)\s*(\S*)/) ?? [];
        const qty = count ? kroner(count) : 1;
        const amount = kroner(l.price);
        const discount = kroner(l.discount);
        return {
          ...splitSize(l.name),
          qty,
          ...(unit?.toLowerCase() === "kg" ? { unit: "kg" as const } : {}),
          price: ore((amount + discount) / qty),
          amount,
          ...(discount ? { discounts: [{ label: "", amount: discount }] } : {}),
        };
      }),
      total: kroner(s.totalSum),
    },
    amounts: [kroner(s.totalSum)],
    names: [firstWord(s.storeName)],
  };
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
  const receipt: Receipt = {
    source: "gmail",
    id,
    at: Date.parse(mail.date ?? ""),
    store: mail.from?.name || domain || address,
    title: mail.subject ?? "",
    lines: [],
  };
  return {
    receipt,
    fit: (paid) => ({ ...receipt, ...mailItems(mail, receipt.store, paid) }),
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
      matched.set(t, f.fit?.(-t.amount) ?? f.receipt);
    }
  return matched;
}
