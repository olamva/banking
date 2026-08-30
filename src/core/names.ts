const COUNTRY_SEGMENTS = 3;

export function countryOf(name: string): string | null {
  const parts = name.split(",");
  const tail = parts
    .at(-1)!
    .replace(/\s*\(.*\)\s*$/, "")
    .trim();
  if (/(?:^|\s)(?:oslo|trondheim)$/i.test(tail)) return "Norway";
  if (parts.length < COUNTRY_SEGMENTS) return null;
  // A tail with a digit or a slash is a terminal reference. It is not a place.
  if (!/^[\p{L} ]{3,}$/u.test(tail)) return null;
  // An online Norwegian merchant sends the ISO-3 code, not the name.
  if (tail.toUpperCase() === "NOR") return "Norway";
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

// This function needs the whole corpus. One name does not show where its
// street starts. A word that ends many unrelated names is a town.
// ponytail: a heuristic. A fixed-width cut at 15/12/rest is exact, but SB1
// joins the truncated fields with spaces and does not pad them. Check this
// before you use a fixed width.
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
