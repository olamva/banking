import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// transactions() paginates by continuation_key; a key that never clears would
// loop forever, so drive it with a stub fetch rather than the live API.
test('transactions follows continuation_key to the end', async (t) => {
  const pages = [
    { transactions: [{ id: 1 }, { id: 2 }], continuation_key: 'a' },
    { transactions: [{ id: 3 }], continuation_key: undefined },
  ];
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    assert.equal(url.includes('continuation_key=a'), calls === 1);
    return new Response(JSON.stringify(pages[calls++]), { status: 200 });
  });
  // jwt() signs every call, so it needs a key that parses — but not *the* key.
  // secrets/ is gitignored, so pointing at the real one makes this test pass in
  // the main checkout only, and fail on ENOENT in any fresh worktree.
  const keyFile = join(tmpdir(), 'eb-test-key.pem');
  writeFileSync(keyFile, generateKeyPairSync('rsa', { modulusLength: 2048 })
    .privateKey.export({ type: 'pkcs8', format: 'pem' }));
  process.env.EB_APP_ID = 'test';
  process.env.EB_KEY_FILE = keyFile;

  const { transactions } = await import('./eb.ts');
  const rows = await transactions('uid', '2026-07-01', '2026-07-31');
  assert.deepEqual(rows, [{ id: 1 }, { id: 2 }, { id: 3 }]);
  assert.equal(calls, 2);
});
