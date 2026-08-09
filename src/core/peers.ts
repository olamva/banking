import { compile } from './categorize.ts';

/**
 * A pasted report block -> the names `rules/vipps.json` does not cover yet.
 *
 * The paste is one transaction per line, tab- or space-aligned columns:
 * `date  counterparty  category  source  amount`. Only column 2 is read, so the
 * amount's typographic minus and the thousands separator never matter.
 *
 * Existing entries are patterns, not literals — `compile` is the same matcher
 * `categorize` runs, so a truncated name already in the file suppresses the
 * full one here, exactly as it will when the rule is applied.
 */
export function newPeers(text: string, peers: string[]): string[] {
  const covered = peers.map((pattern) => compile(pattern, 'rules/vipps.json'));
  const seen = new Set<string>();
  for (const line of text.split('\n')) {
    const fields = line.split(/\t|\s{2,}/);
    if (fields.length < 3) continue; // a blank line, or prose that is not a row
    const name = fields[1]!.trim().toLowerCase();
    if (name && !covered.some((matches) => matches(name))) seen.add(name);
  }
  return [...seen];
}
