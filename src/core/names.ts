/**
 * The shape a channel put on a name, taken back off again.
 *
 * `rules/payees.json` says what a payee is *called*. This says nothing about
 * identity — it only undoes the formatting SB1 wraps a name in, so a merchant
 * nobody has written a rule for still reaches the page readable. The two are
 * deliberately separate: a rule is knowledge (NSB is Vy, ARK Bruns and ARK OSL
 * are one bookshop) and cannot be derived; a shape is mechanical and must never
 * need a rule.
 *
 * That split is what keeps this file from growing. Every name on the record
 * today is either named by a rule or handled by the two transformations below,
 * and a merchant first seen next year gets the same treatment with nothing
 * added here.
 *
 * Three shapes arrive, and only two of them are worth touching:
 *
 * - **The card**: `NAME, CITY, COUNTRY`. Comma-delimited, so cutting at the
 *   first comma is exact rather than a guess. The country is not thrown away —
 *   `countryOf` reads it off the same tail and it lands on `Txn.country`.
 * - **BankAxept**: `NAME STREET CITY`, all caps, each field truncated and the
 *   three space-joined. There is no delimiter and no padding, so the boundary
 *   can only ever be inferred; see `makeCleaner`.
 * - **The bank's own cleaned form**: mixed case, already tidy. Left alone
 *   entirely — mixed case is the signal that SB1 has done this work already,
 *   and title-casing it would turn `McDonald's` into `Mcdonald's`.
 */

/** `NAME, CITY, COUNTRY` — three fields, so three segments before a country is claimed. */
const COUNTRY_SEGMENTS = 3;

/**
 * The terminal's country, off the card's own tail.
 *
 * Requiring three comma segments is the whole guard, and it is enough: on the
 * record it accepts all 167 card rows and rejects every false positive, which
 * are all two-segment names where the tail is a city (`GINA TRICOT STORMOA,
 * LAN ÅLESUND`), a store code (`SMART STORE, S L P`) or a person (`Vipps, Ola
 * Munthe Vassbotn :`). A country allowlist would do the same job and would need
 * maintaining, which is the thing this file is trying not to have.
 *
 * The parenthetical is dropped because SB1 sends one on exactly one country —
 * `SLOVAKIA (Slovak Republic)` — and a chip is not the place for it.
 *
 * Kept in the bank's own English rather than translated: a Norwegian name per
 * country is a map to maintain, and `Japan` reads the same either way.
 */
export function countryOf(name: string): string | null {
  const parts = name.split(",");
  if (parts.length < COUNTRY_SEGMENTS) return null;
  const tail = parts.at(-1)!.replace(/\s*\(.*\)\s*$/, "").trim();
  // Letters and spaces only: a tail carrying a digit or a slash is a terminal
  // reference, not a place — `JP.HOTELS.COM` sits one segment further in.
  if (!/^[\p{L} ]{3,}$/u.test(tail)) return null;
  return titleCase(tail);
}

/** Title case, except tokens of three letters or fewer, which stay as sent. */
function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\S+/g, (w, i: number) =>
      // The source decides, not the lowercased copy: `AS`, `UPS` and `CFS` are
      // company forms and initialisms, and there is no list that separates them
      // from three-letter words. Shouting `BAR` back is wrong-looking; calling
      // `UPS Norway AS` "Ups Norway As" is wrong.
      /^[\p{L}]{1,3}$/u.test(s.slice(i, i + w.length))
        ? s.slice(i, i + w.length)
        : w.charAt(0).toUpperCase() + w.slice(1),
    );
}

/** Below this a name is one or two words and has no street left to lose. */
const MIN_TOKENS = 3;
/** A trailing word ending this many distinct names is a place, not a shop. */
const PLACE_NAMES = 3;

/** `STORGT.`, `VIKEBYGDVEGE`, `HAMNEGATA` — the street half of a BankAxept line. */
const STREET =
  /\d|(?:gt|gate|gata|gaten|vei|veg|veien|vegen|vn|plass|torg|bakken|haugen|svingen|alle|allé)\.?$/i;

/**
 * A cleaner that has seen the whole corpus, because one name cannot tell where
 * its own street begins.
 *
 * `VOLDA FILMTEATE STORGT. VOLDA` is three fields and `MAT FRA MIDTOESTEN` is
 * one, and nothing inside either string says which. What does say so is the
 * rest of the record: `VOLDA` ends a dozen unrelated names and `MIDTOESTEN`
 * ends one, so the corpus knows which words are towns without a list of towns
 * in the source. That is the same trick `nearMisses` uses in `merchants.ts`,
 * and for the same reason — a stoplist of Norwegian places would be wrong the
 * first time a new one appeared.
 *
 * ponytail: a heuristic, and it stays one. It only ever runs on names no rule
 * matched, every name on the record today is matched, and the worst case is a
 * shop reading one word short. Upgrade path if that stops being true: SB1's
 * field widths are 15/12/rest, so a fixed-width cut would be exact — except SB1
 * space-joins the truncated fields instead of padding them, which is what ruled
 * that out. Do not reach for it again without checking that first.
 *
 * Mixed-case names are returned untouched, comma cut aside. The bank only sends
 * mixed case where it has already cleaned the name itself, so there is no
 * street to strip and nothing to re-case.
 */
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
    // Exact, because the card delimits these fields with a comma. Everything
    // below is inference; this line is not.
    const head = name.split(",")[0]!.trim();
    if (!head) return name;
    // Mixed case means SB1 cleaned it. Leave it exactly as sent.
    if (head !== head.toUpperCase()) return head;

    const tokens = head.split(/\s+/);
    // Strip from the right while the last token is a place or part of a street,
    // never below MIN_TOKENS-1 words: a name is not worth a guess that could
    // eat it whole.
    while (
      tokens.length >= MIN_TOKENS &&
      (isPlace(tokens.at(-1)!) || STREET.test(tokens.at(-1)!))
    )
      tokens.pop();
    return titleCase(tokens.join(" "));
  };
}
