const COUNTRY_SEGMENTS = 3;
const NORWAY = "Norway";

// The bank books a purchase in the currency of the terminal. A NOK booking
// that names no country is therefore domestic. The name still wins, because a
// foreign terminal can charge in NOK.
export function countryOf(name: string, currency = ""): string | null {
  const parts = name.split(",");
  const tail = parts
    .at(-1)!
    .replace(/\s*\(.*\)\s*$/, "")
    .trim();
  // A tail with a digit or a slash is a terminal reference. It is not a place.
  if (parts.length >= COUNTRY_SEGMENTS && /^[\p{L} ]{3,}$/u.test(tail))
    return titleCase(tail);
  return currency === "NOK" ? NORWAY : null;
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\S+/g, (w, i: number) =>
      /^[\p{L}]{1,3}$/u.test(s.slice(i, i + w.length))
        ? s.slice(i, i + w.length)
        : w.charAt(0).toUpperCase() + w.slice(1),
    );
}

const CARD_PAYMENT = new Set([
  "VISA Varekjøp",
  "VISA Electron",
  "Varer",
  "Transaksjon",
  "Kredittkort",
]);

const COMPANY_FORM = /^(as|asa|ab|da|ans|nuf|ltd|inc)$/i;

const wordKey = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

export function branchFinder(
  txns: {
    counterparty: string | null;
    originalCounterparty?: string;
    typeText: string | null;
  }[],
): (t: (typeof txns)[number]) => string | null {
  const clean = makeCleaner(txns.flatMap((t) => t.originalCounterparty || []));
  const named = (raw: string) => {
    if (!raw.includes(",")) return clean(raw);
    const head = raw.split(",")[0]!.trim();
    return head === head.toUpperCase() ? titleCase(head) : head;
  };
  const rawBranch = (t: (typeof txns)[number]) => {
    if (!t.originalCounterparty || !t.counterparty) return null;
    if (!CARD_PAYMENT.has(t.typeText ?? "")) return null;
    const own = new Set(t.counterparty.split(/\s+/).map(wordKey));
    const words = named(t.originalCounterparty)
      .split(/\s+/)
      .filter((w) => !COMPANY_FORM.test(w));
    while (words.length && own.has(wordKey(words[0]!))) words.shift();
    const branch = words.join(" ");
    if (
      !branch ||
      wordKey(branch) === wordKey(t.counterparty) ||
      /^paypal/i.test(branch) ||
      !words.every((w) => /^\p{L}+\.?$/u.test(w))
    )
      return null;
    return branch === branch.toUpperCase() ? titleCase(branch) : branch;
  };
  const known = new Map<string, Set<string>>();
  for (const t of txns) {
    const branch = rawBranch(t);
    if (branch)
      known.set(
        t.counterparty!,
        (known.get(t.counterparty!) ?? new Set()).add(branch),
      );
  }
  return (t) => {
    const branch = rawBranch(t);
    if (!branch) return null;
    const options = [...(known.get(t.counterparty!) ?? [])];
    const short =
      options
        .filter((b) => branch.startsWith(`${b} `))
        .sort((a, b) => a.length - b.length)[0] ?? branch;
    const size = short.split(" ").length;
    return (
      options
        .filter((b) => b.startsWith(short) && b.split(" ").length === size)
        .sort((a, b) => b.length - a.length)[0] ?? short
    );
  };
}

const MIN_TOKENS = 3;
const PLACE_NAMES = 3;

const STREET =
  /\d|(?:gt|gate|gata|gaten|vei|veg|veien|vegen|vn|plass|torg|bakken|haugen|svingen|alle|allé)\.?$/i;

// This function needs the whole corpus. One name does not show where its
// street starts. A word that ends many unrelated names is a town.
export function makeCleaner(names: Iterable<string>): (name: string) => string {
  const endings = new Map<string, Set<string>>();
  for (const name of names) {
    const head = name.split(",")[0]!.trim();
    const last = head.split(/\s+/).at(-1)?.toLowerCase();
    if (last) endings.set(last, (endings.get(last) ?? new Set()).add(head));
  }
  const isPlace = (token: string) =>
    (endings.get(token.toLowerCase())?.size ?? 0) >= PLACE_NAMES;

  return (name: string): string => {
    // The card separates these fields with a comma, so this cut is exact. The
    // code below infers.
    const head = name.split(",")[0]!.trim();
    if (!head) return name;
    // Mixed case shows that SB1 cleaned the name. Return it as sent.
    if (head !== head.toUpperCase()) return head;

    const tokens = head.split(/\s+/);
    while (
      tokens.length >= MIN_TOKENS &&
      (isPlace(tokens.at(-1)!) || STREET.test(tokens.at(-1)!))
    )
      tokens.pop();
    return titleCase(tokens.join(" "));
  };
}
