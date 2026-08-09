import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newPeers } from './peers.ts';

const paste = [
  '2024-07-10\tOla Nordmann\tUkategorisert\tbank\t700 kr',
  '2024-03-11    Kari Nordmann    Ukategorisert    bank    306 kr',
  '2024-05-13    Ola Nordmann    Ukategorisert    bank    90 kr',
  '',
  '2024-04-08    Per Hansen    Ukategorisert    bank    −36 kr',
].join('\n');

test('newPeers: both column separators, deduped, lowercased, input order', () => {
  assert.deepEqual(newPeers(paste, []), ['ola nordmann', 'kari nordmann', 'per hansen']);
});

test('newPeers: a negative amount is not a different row shape', () => {
  // The typographic minus (U+2212) trips a number parse; column 2 never sees it.
  assert.deepEqual(newPeers('2024-04-08    Per Hansen    Ukategorisert    bank    −36 kr', []), ['per hansen']);
});

test('newPeers: an existing entry covers the name, truncated or whole', () => {
  // The bank truncates long names, so rules/vipps.json holds prefixes that
  // match more than they spell — the same reach `categorize` gives them.
  assert.deepEqual(newPeers(paste, ['ola nord', 'kari nordmann', '/^per h/']), []);
});

test('newPeers: prose and blank lines are not rows', () => {
  assert.deepEqual(newPeers('no columns here\n\n  \n', []), []);
});
