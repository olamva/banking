const COUNTRY_SEGMENTS = 3;

export function countryOf(name: string): string | null {
  const parts = name.split(",");
  if (parts.length < COUNTRY_SEGMENTS) return null;
  const tail = parts
    .at(-1)!
    .replace(/\s*\(.*\)\s*$/, "")
    .trim();
  // A tail carrying a digit or a slash is a terminal reference, not a place.
  if (!/^[\p{L} ]{3,}$/u.test(tail)) return null;
  return titleCase(tail);
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

const MIN_TOKENS = 3;
const PLACE_NAMES = 3;

const STREET =
  /\d|(?:gt|gate|gata|gaten|vei|veg|veien|vegen|vn|plass|torg|bakken|haugen|svingen|alle|allé)\.?$/i;

// Needs the whole corpus: one name cannot tell where its own street begins, but
// a word ending a dozen unrelated names is a town.
// ponytail: a heuristic. Fixed-width (15/12/rest) would be exact except SB1
// space-joins the truncated fields rather than padding — check that first.
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
    // Exact, because the card comma-delimits these. Everything below is inference.
    const head = name.split(",")[0]!.trim();
    if (!head) return name;
    // Mixed case means SB1 cleaned it. Leave it exactly as sent.
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
