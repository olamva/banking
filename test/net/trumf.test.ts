import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { sync } from "../../src/net/trumf.ts";

const PAGES = "https://www.trumf.no/trumf-profil/kvitteringer";

const html = (...chunks: string[]) =>
  chunks
    .map((c) => `<script>self.__next_f.push([1,${JSON.stringify(c)}])</script>`)
    .join("");

const list = html(
  '0:["$","html",null,{}]\n5:["$","div",null,{"transactionsData":[{"batchId":"b-100","belop":268.41,"beskrivelse":"KIWI Testbutikk","transaksjonsTidspunkt":"$D2026-09-05T17:58:14.000Z","harKv',
  'ittering":true},{"batchId":"b-101","belop":99,"beskrivelse":"MENY Testby","transaksjonsTidspunkt":"$D2026-08-01T10:00:00.000Z","harKvittering":false}]}]\n',
);

const receipt = html(
  '7:["$","x",null,{"purchaseDetails":{"batchId":"b-100","varelinjer":[{"produktBeskrivelse":"TINE \\"HELMELK\\" 1L","antall":2,"belop":49.8}]}}]\n',
);

function serve(t: TestContext, pages: Record<string, string>): string {
  t.mock.method(
    globalThis,
    "fetch",
    async (url: string) => new Response(pages[url] ?? "<html>Logg inn</html>"),
  );
  const cookie = process.env.TRUMF_COOKIE;
  process.env.TRUMF_COOKIE = "session";
  const dir = mkdtempSync(join(tmpdir(), "trumf-"));
  t.after(() => {
    process.env.TRUMF_COOKIE = cookie;
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

test("a purchase split across flight chunks lands on disk with plain dates", async (t) => {
  const dir = serve(t, { [PAGES]: list, [`${PAGES}/b-100`]: receipt });
  assert.equal(await sync(dir), 2);

  const kiwi = JSON.parse(readFileSync(`${dir}/b-100.json`, "utf8"));
  assert.equal(kiwi.purchase.transaksjonsTidspunkt, "2026-09-05T17:58:14.000Z");
  assert.equal(
    kiwi.receipt.varelinjer[0].produktBeskrivelse,
    'TINE "HELMELK" 1L',
  );

  const meny = JSON.parse(readFileSync(`${dir}/b-101.json`, "utf8"));
  assert.equal(meny.purchase.belop, 99);
  assert.equal(meny.receipt, null, "no receipt page is asked for");

  assert.equal(await sync(dir), 0, "a stored purchase is not fetched again");
});

test("a logged-out page says the login expired instead of finding nothing", async (t) => {
  const dir = serve(t, {});
  await assert.rejects(sync(dir), /login expired/);
});
