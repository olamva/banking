import type { Receipt, ReceiptLine } from "./receipts.ts";

type Row = string[][];

type Candidate = {
  name: string;
  amount: number;
  qty: number;
  price?: number;
  total: boolean;
  sub: boolean;
  tax: boolean;
  skip: boolean;
  currency?: string;
};

const ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  aring: "å",
  Aring: "Å",
  oslash: "ø",
  Oslash: "Ø",
  aelig: "æ",
  AElig: "Æ",
  euro: "€",
  pound: "£",
  ndash: "–",
  mdash: "—",
  minus: "−",
  times: "×",
  middot: "·",
  bull: "•",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
  eacute: "é",
  uuml: "ü",
  ouml: "ö",
  auml: "ä",
  copy: "©",
  reg: "®",
  trade: "™",
  zwnj: "",
  zwj: "",
  shy: "",
};

const decode = (s: string) =>
  s.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (m, e: string) =>
    e[0] === "#"
      ? String.fromCodePoint(
          /^#x/i.test(e) ? parseInt(e.slice(2), 16) : Number(e.slice(1)),
        )
      : (ENTITIES[e] ?? m),
  );

const squash = (s: string) => s.replace(/[\s\p{Cf}]+/gu, " ").trim();

const textLines = (html: string) =>
  decode(
    html
      .replace(/<(br|\/?p|\/?div|\/?li|\/?h\d|\/?table|\/?tr)\b[^>]*>/gi, "\n")
      .replace(/<[^>]*>/g, ""),
  )
    .split("\n")
    .map(squash)
    .filter(Boolean);

function htmlRows(html: string): Row[] {
  const rows: Row[] = [];
  const marked = html
    .replace(/<(style|script|head|title)\b[\s\S]*?<\/\1>|<!--[\s\S]*?-->/gi, "")
    .replace(
      /<tr\b[^>]*>((?:(?!<tr\b)[\s\S])*?)<\/tr>/gi,
      (_, inner: string) => {
        rows.push(
          inner
            .split(/<t[dh]\b[^>]*>/i)
            .slice(1)
            .map(textLines)
            .filter((c) => c.length),
        );
        return `\n@@row${rows.length - 1}@@\n`;
      },
    );
  return textLines(marked).flatMap((l) => {
    const row = /^@@row(\d+)@@$/.exec(l)?.[1];
    if (row === undefined) return [[[l]]];
    return rows[Number(row)]!.length ? [rows[Number(row)]!] : [];
  });
}

const textRows = (text: string): Row[] =>
  text
    .split("\n")
    .map((l) => decode(l.replace(/<[^>]*>/g, "")).trim())
    .filter(Boolean)
    .map((l) =>
      l
        .split(/\t| {2,}| \| /)
        .map((c) => [squash(c)])
        .filter((c) => c[0]),
    );

const CURRENCY = String.raw`(?:kr\.?|nok|usd|eur|gbp|sek|dkk|\$|€|£)`;
const MONEY = new RegExp(
  String.raw`(?<![\w.,])([-−–] ?)?(${CURRENCY} ?)?([-−–] ?)?((?:\d{1,3}(?:[ .,]\d{3})+|\d+)(?:[.,]\d{2}(?!\d)|,-|,–)?)( ?${CURRENCY}(?![a-z]))?(?![.,]?\d)`,
  "gi",
);
const FOREIGN = /\b(usd|eur|gbp|sek|dkk)\b|[$€£]/i;
const SIGNS: Record<string, string> = { $: "USD", "€": "EUR", "£": "GBP" };

function money(m: string[]): number | null {
  const [, sign1, cur1, sign2, num = "", cur2] = m;
  const cents = /[.,](\d{2})$/.exec(num);
  if (!cents && !cur1 && !cur2 && !/,[-–]$/.test(num)) return null;
  const whole = cents ? num.slice(0, -3) : num.replace(/,[-–]$/, "");
  if (cents && whole.includes(num.at(-3)!)) return null;
  const value =
    Number(whole.replace(/[ .,]/g, "")) + (cents ? Number(cents[1]) / 100 : 0);
  return sign1 || sign2 ? -value : value;
}

const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
const letters = (s: string) => count(s, /\p{L}/gu);
const digits = (s: string) => count(s, /\d/g);
const wordCount = (s: string) => s.split(" ").length;
const amounts = (s: string) =>
  [...s.matchAll(MONEY)].filter((m) => money(m) !== null);
const words = (s: string) =>
  s
    .replace(MONEY, (m, ...groups) =>
      money([m, ...groups]) === null ? m : " ",
    )
    .replace(/\s+/g, " ")
    .trim();
const prose = (s: string) =>
  wordCount(s) > 14 || (/[.!?]$/.test(s) && wordCount(s) > 3);
const QTY =
  /\b(antall|qty|quantity|stk|pcs|ant)\.?\s*:?\s*\d{1,3}|(?<!\S)[x×]\s*\d{1,3}(?!\S)/gi;
const bare = (s: string) =>
  s.replace(new RegExp(CURRENCY, "gi"), "").replace(QTY, "");
const flatOf = (row: Row) => row.map((c) => c.join(" ")).join("\t");
const priced = (row: Row) => {
  const flat = flatOf(row);
  const last = amounts(flat).at(-1);
  return (
    !!last && !/[\p{L}\d]/u.test(bare(flat.slice(last.index! + last[0].length)))
  );
};
const moneyOnly = (row: Row) =>
  amounts(flatOf(row)).length > 0 && !letters(bare(words(flatOf(row))));

const TOTAL =
  /^(sub ?total|total|totalt|totals|sum\b|summ?er\b|delsum|å betale|til betaling|amount (paid|due|charged)|grand total|order total|ordretotal|you paid|du betalte|totalbeløp|totalsum|your total|ordresum|ordreverdi|varer totalt)/i;
const SUB =
  /^(sub ?total|delsum|varer totalt|total varer|sum varer|varesum|items total|item subtotal|total (excl|excluding|ekskl|eks|før|before|uten))/i;
const SKIP =
  /\b(mva|vat|tax|moms|merverdiavgift|visa|mastercard|master card|kort|card|paypal|vipps|klarna|apple pay|google pay|wallet|saldo|balance|herav|hvorav|inkl|incl|inclusive|excl|eks|ekskl|betalt|paid|betaling|payment)\b/i;
const SAVED = /you saved|du sparer|du sparte|besparelse|savings/i;
const HEADING =
  /^(details|description|beskrivelse|items?|vare|varer|varelinjer|produkt|produkter|products?|pris|price|unit price|stykkpris|enhetspris|á pris|produktpris|in-app purchase|unit of price|amount|beløp|antall|ant|qty|quantity|order summary|ordresammendrag|sammendrag|summary|transaksjons\w*|\S*(nummer|number|dato|date)|payment information|betalingsinformasjon|your order|din ordre|din bestilling|kvittering|receipt|invoice|faktura|ordrebekreftelse|order confirmation)$/i;
const NOT_NAME =
  /@|https?:|www\.|:$|report a problem|write a review|rapporter et problem|nettleser|browser|view online|receipt from|kvittering fra|^purchased:|^(hei|hi|hello|hallo|dear|kjære)\b/i;

function nameish(l: string, loose = false): boolean {
  const value = /^[^:]{1,40}:\s*(.+)$/.exec(l)?.[1];
  return (
    letters(l) > 1 &&
    letters(l) > digits(l) &&
    !NOT_NAME.test(l) &&
    !TOTAL.test(l) &&
    !HEADING.test(l.replace(/[\s:*]+$/, "")) &&
    !(
      value &&
      (letters(value) <= digits(value) ||
        (!loose && (wordCount(value) <= 2 || letters(value) < 4)))
    )
  );
}

const isTotal = (row: Row) => row.flat().some((l) => TOTAL.test(l));

const filled = (rows: Row[], lenient: boolean): Row[] =>
  rows.map((r) =>
    r.map((c) =>
      c.map((l) => {
        const one = l.replace(/^(-?\d+[.,]\d)$/, "$10");
        return lenient
          ? one.replace(/^(\d{2,6}|\d{1,3}(?: \d{3})+)$/, "$1,00")
          : one;
      }),
    ),
  );

const columns = (r: Row): Row[] => {
  const [labels, values] = r;
  return r.length === 2 &&
    labels!.length > 1 &&
    labels!.length === values!.length &&
    values!.every((l) => moneyOnly([[l]]))
    ? labels!.map((l, i) => [[l], [values![i]!]])
    : [r];
};

function labelsBefore(out: Row[]): string[][] {
  const labels: string[][] = [];
  for (
    let k = out.length - 1;
    k >= 0 && k >= out.length - 6 && labels.length < 4;
    k--
  ) {
    const prev = out[k]!;
    const text = prev.flat().join(" ");
    if (/^\d{1,3}$/.test(text)) labels.unshift([text]);
    else if (isTotal(prev)) return labels.length ? labels : [prev.flat()];
    else if (priced(prev) || !letters(text)) break;
    else if (!prose(text)) labels.unshift(prev.flat());
  }
  return labels;
}

function merge(rows: Row[], lenient: boolean): Row[] {
  const out: Row[] = [];
  for (const row of filled(rows, lenient).flatMap(columns))
    out.push(moneyOnly(row) ? [...labelsBefore(out), ...row] : row);
  return out;
}

function nameOf(cells: Row, store: string): string {
  const texts = cells
    .flat()
    .map((l) => words(l).replace(/(\s*[×x] ?\d{1,3})?[\s\-–|·*×x@]*$/, ""))
    .filter((l) => l.toLowerCase() !== store.toLowerCase());
  const strict = texts.filter((l) => nameish(l));
  const first = strict.reduce(
    (a, l) => (letters(l) >= 3 * letters(a) ? l : a),
    strict[0] ??
      texts.map((l) => l.replace(/:$/, "")).find((l) => nameish(l, true)) ??
      "",
  );
  return (
    strict.find((l) => first && l.startsWith(first) && l !== first) ?? first
  );
}

function qtyOf(cells: Row): number {
  const flat = flatOf(cells);
  const qty = (/\b(?:antall|qty|quantity|ant\.?)\s*:?\s*(\d{1,3})\b/i.exec(
    flat,
  ) ??
    /(?:^|\s)(\d{1,3}) ?[x×](?=\s|$)/i.exec(flat) ??
    /(?:^|\s)[x×] ?(\d{1,3})(?=\s|$)/i.exec(flat) ??
    cells.map((c) => /^(\d{1,3})$/.exec(c.join(" "))).find(Boolean) ??
    /(?:^|\s)(\d{1,3}) ?(?:stk\.?|pcs|st\.?)(?=\s|$)/i.exec(flat))?.[1];
  return Number(qty) || 1;
}

const isTax = (label: string) =>
  /\b(mva|vat|tax|moms|merverdiavgift)\b/i.test(label) &&
  !/\b(inkl|incl|inclusive|included|herav|hvorav|excl|eks|ekskl)\b/i.test(
    label,
  ) &&
  wordCount(label) <= 6;

const totalRow = (): Candidate => ({
  name: "",
  amount: 0,
  qty: 1,
  total: true,
  sub: false,
  tax: false,
  skip: true,
});

function candidate(row: Row, store: string): Candidate | null {
  const lines = row.flat();
  const total = lines.some((l) => TOTAL.test(l) && wordCount(words(l)) <= 6);
  const sub = lines.some((l) => SUB.test(l));
  const cells =
    lines.length > 1 && !total
      ? row
          .map((c) => c.filter((l) => !(SKIP.test(l) && amounts(l).length)))
          .filter((c) => c.length)
      : row;
  const flat = flatOf(cells);
  const found = amounts(flat);
  const last = found.at(-1);
  if (!last) return total ? { ...totalRow(), sub } : null;
  if (!priced(cells)) return null;
  const name = nameOf(cells, store);
  const label = words(flat);
  const amount = money(last)!;
  const qty = qtyOf(cells);
  const price = found
    .slice(0, -1)
    .map((m) => money(m)!)
    .find((p) => Math.abs(p * qty - amount) < 0.005);
  const tax = isTax(label);
  const sign = FOREIGN.exec(last[0])?.[0];
  const currency = sign && (SIGNS[sign] ?? sign.toUpperCase());
  return {
    name: name || (tax ? label.replace(/[\s:]+$/, "") : ""),
    amount,
    qty,
    ...(price !== undefined && { price }),
    total,
    sub,
    tax,
    skip:
      !name ||
      (SKIP.test(label) && wordCount(label) <= 8) ||
      (amount > 0 && SAVED.test(flat)),
    ...(currency && { currency }),
  };
}

const candidates = (rows: Row[], store: string): Candidate[] =>
  rows.flatMap((r) => candidate(r, store) ?? []);

const cents = (n: number) => Math.round(n * 100);

function runsFrom(segment: Candidate[], target: number): Candidate[][] {
  const runs: Candidate[][] = [];
  let sum = 0;
  segment.forEach((c, j) => {
    sum += cents(c.amount);
    const run = segment.slice(0, j + 1);
    if (sum === target && run.some((r) => !r.tax)) runs.push(run);
  });
  return runs;
}

function pick(
  found: Candidate[],
  target: number,
  withTax: boolean,
): Candidate[] {
  const segments: Candidate[][] = [[]];
  for (const c of found)
    if (c.total && !c.sub) segments.push([]);
    else if (!c.total && (!c.skip || (withTax && c.tax)))
      segments.at(-1)!.push(c);
  return segments
    .flatMap((segment) =>
      segment.flatMap((_, i) => runsFrom(segment.slice(i), cents(target))),
    )
    .reduce<Candidate[]>((a, run) => (run.length > a.length ? run : a), [])
    .filter((c) => c.amount);
}

function unpriced(rows: Row[]): string | null {
  const b = rows.findIndex((r) => isTotal(r) && amounts(flatOf(r)).length);
  if (b < 0) return null;
  const at = rows[b]!.findIndex((c) => c.some((l) => TOTAL.test(l)));
  let names = rows[b]!.slice(0, at).flat();
  const cut = names.findIndex((l) => l.endsWith(":"));
  if (cut >= 0) names = names.slice(0, cut);
  if (!names.length)
    for (let k = b - 1; k >= 0 && names.length < 5; k--) {
      const [cell, ...rest] = rows[k]!;
      const line = cell?.length === 1 && !rest.length ? cell[0]! : "";
      if (line.endsWith(":")) names = [];
      else if (nameish(line) && !prose(line) && !amounts(line).length)
        names.unshift(line);
      else break;
    }
  return names.length && names.every((l) => nameish(l) && !prose(l))
    ? names.join(", ")
    : null;
}

const line = (c: Candidate): ReceiptLine => ({
  name: c.name,
  qty: c.qty,
  price: c.price ?? Math.round((c.amount / c.qty) * 100) / 100,
  amount: c.amount,
});

type Items = Pick<Receipt, "lines" | "total" | "currency">;

const items = (lines: Candidate[], total: Candidate): Items => ({
  lines: lines.map(line),
  total: total.amount,
  ...(total.currency && { currency: total.currency }),
});

function itemsOf(sets: Row[][], store: string, paid: number): Items | null {
  for (const rows of sets) {
    const found = candidates(rows, store);
    const totals = found.filter((c) => c.total && c.amount > 0).reverse();
    for (const t of [...totals, { ...totalRow(), amount: paid }]) {
      const hit = pick(found, t.amount, false);
      const withTax = hit.length ? hit : pick(found, t.amount, true);
      if (withTax.length) return items(withTax, t);
    }
  }
  for (const rows of sets) {
    const t = candidates(rows, store)
      .filter((c) => c.total && c.amount > 0)
      .at(-1);
    const name = t && unpriced(rows);
    if (name) return items([{ ...t, name, qty: 1, price: t.amount }], t);
  }
  return null;
}

export function mailItems(
  mail: { html?: string; text?: string },
  store: string,
  paid: number,
): Items | null {
  const rows = [
    mail.html ? htmlRows(mail.html) : [],
    mail.text ? textRows(mail.text) : [],
  ];
  return itemsOf(
    [false, true].flatMap((lenient) => rows.map((r) => merge(r, lenient))),
    store,
    paid,
  );
}
