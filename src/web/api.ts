import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { appData, appPeriod } from "../core/app.ts";
import { period } from "../core/select.ts";
import { openDb, queryRange } from "../core/db.ts";
import { osloDate } from "../core/normalize.ts";
import { DATA_DIR, RULES_DIR } from "../core/paths.ts";
import { DB_FILE, rebuildAll } from "../core/pipeline.ts";
import { RULE_FILES, isRuleFile, type RuleFile } from "../core/ruleFiles.ts";
import {
  current,
  history,
  loadAll,
  redo,
  restore,
  save,
  saveValues,
  saveBulk,
  undo,
  type Edit,
} from "../core/rules.ts";

const LABELS = `${RULES_DIR}/labels.json`;

const names = () =>
  existsSync(LABELS) ? JSON.parse(readFileSync(LABELS, "utf8")) : {};

const rows = () => {
  const db = openDb(DB_FILE);
  try {
    return queryRange(db, "0000-00", "9999-99");
  } finally {
    db.close();
  }
};

export const payload = (): string =>
  JSON.stringify({ txns: rows(), names: names(), refreshing: !!running });

export const appPayload = (): string =>
  JSON.stringify(appData(rows(), names()));

export function periodPayload(key: string | null): Answer {
  if (period(key ?? "").kind !== "custom")
    return bad(400, new Error("needs p=YYYY-MM-DD..YYYY-MM-DD"));
  try {
    return ok(appPeriod(key!, rows()));
  } catch (e) {
    return bad(500, e);
  }
}

const SESSION = /^_oauth2_proxy(_\d+)?$/;

export const APP_SCHEME = "spending";

export const HANDOFF_PAGE = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Spending</title>
<style>
  :root { color-scheme: light dark; font-family: system-ui, -apple-system, sans-serif; }
  body { margin: 0; min-height: 100vh; display: grid; place-content: center; gap: 16px; padding: 24px; text-align: center; }
  h1 { margin: 0; font-size: 28px; }
  p { margin: 0; color: GrayText; }
  a { display: block; padding: 14px 24px; border-radius: 999px; background: #34c759; color: white; font-weight: 600; text-decoration: none; }
</style>
<h1>You are signed in</h1>
<p>Send this sign-in to the Spending app on this phone.</p>
<a href="/app/signed-in?open=1">Open Spending</a>
</html>
`;

export function signedIn(
  cookie: string | undefined,
  site: string | undefined,
): string | null {
  if (site !== "same-origin") return null;
  const session = (cookie ?? "")
    .split(";")
    .map((c) => c.trim())
    .filter((c) => SESSION.test(c.slice(0, c.indexOf("="))));
  return session.length
    ? `${APP_SCHEME}://signed-in?cookie=${encodeURIComponent(session.join("; "))}`
    : null;
}

export type Refreshed = {
  rows: number;
  fetched: number;
  stopped: string | null;
};

async function run(): Promise<Refreshed> {
  const { syncAll } = await import("../net/sync.ts");
  const { syncReceipts } = await import("../net/receipts.ts");
  const { rebuildAll } = await import("../core/pipeline.ts");
  const [bank, receipts] = await Promise.all([syncAll(), syncReceipts()]);
  return {
    rows: await rebuildAll(),
    fetched: bank.fetched + receipts.added,
    stopped:
      [bank.stopped, ...receipts.failed].filter(Boolean).join(" ") || null,
  };
}

// One refresh at a time. A second press joins the first rather than starting a
// second full-history sync against the same quota.
let running: Promise<Refreshed> | null = null;

export type RefreshStatus = {
  running: boolean;
  last: ((Refreshed | { error: string }) & { at: number }) | null;
};
let last: RefreshStatus["last"] = null;

export function refresh(): Promise<Refreshed> {
  running ??= run()
    .then(
      (r) => {
        last = { ...r, at: Date.now() };
        return r;
      },
      (e: unknown) => {
        last = {
          error: e instanceof Error ? e.message : String(e),
          at: Date.now(),
        };
        throw e;
      },
    )
    .finally(() => {
      running = null;
    });
  return running;
}

export function refreshRoute(
  path: string,
  header: string | undefined,
): Answer | null {
  if (path === "/api/refresh/start") {
    if (header !== "1")
      return bad(405, new Error("needs X-Banking-Refresh: 1"));
    void quietly(refresh());
  } else if (path !== "/api/refresh/status") return null;
  return ok({ running: !!running, last } satisfies RefreshStatus);
}

export const jsonRoute = (
  url: URL,
  refreshHeader: string | undefined,
): Answer | null =>
  url.pathname === "/api/app/period"
    ? periodPayload(url.searchParams.get("p"))
    : refreshRoute(url.pathname, refreshHeader);

const today = () => osloDate(Date.now());
const VISITED = `${DATA_DIR}/visited`;
let auto = false;

const quietly = (r: Promise<unknown>) =>
  r.catch((e: unknown) =>
    console.error(`refresh failed: ${e instanceof Error ? e.message : e}`),
  );

export function autoRefresh(): void {
  auto = true;
  let day = today();
  setInterval(() => {
    if (day === today()) return;
    day = today();
    void quietly(refresh());
  }, 60_000).unref();
}

export function visit(): void {
  if (
    !auto ||
    (existsSync(VISITED) && readFileSync(VISITED, "utf8") === today())
  )
    return;
  writeFileSync(VISITED, today());
  void quietly(refresh());
}

// The newest versions only. The whole record is on disk, and a page of two
// hundred stamps helps nobody.
const SHOWN_VERSIONS = 30;

export const rulesPayload = (): string =>
  JSON.stringify({
    files: loadAll(),
    history: Object.fromEntries(
      RULE_FILES.map((f) => [f, history(f, SHOWN_VERSIONS)]),
    ),
    // Which version each live file holds. The page marks it, and it is the
    // point that undo and redo step from.
    at: Object.fromEntries(RULE_FILES.map((f) => [f, current(f)])),
  });

export type Edited = { rows: number; at: number };

// A rule change moves rows between categories, and the database holds the
// result rather than the rule. Rebuild before the answer, or the page reloads
// the categories it already had.
const applied = async (at: number): Promise<Edited> => ({
  rows: await rebuildAll(),
  at,
});

// Every value below arrives in a query string. The file name is the one that
// could name a path, and `isRuleFile` is the whole guard on it.
export function ruleEdit(params: URLSearchParams): Edit {
  const file = params.get("file");
  if (!isRuleFile(file)) throw new Error(`no such rule file: ${file}`);
  const was = params.get("was");
  return {
    file,
    key: params.get("key") ?? "",
    value: params.get("value") ?? "",
    remove: params.get("remove") === "1",
    ...(was === null ? {} : { was }),
  };
}

export function ruleTarget(params: URLSearchParams): RuleFile {
  const file = params.get("file");
  if (!isRuleFile(file)) throw new Error(`no such rule file: ${file}`);
  return file;
}

export function ruleVersion(params: URLSearchParams): number {
  const at = Number(params.get("at"));
  if (!Number.isInteger(at) || at <= 0) throw new Error("no such version");
  return at;
}

export type Answer = { status: number; body: string };

const ok = (value: unknown): Answer => ({
  status: 200,
  body: JSON.stringify(value),
});

const bad = (status: number, e: unknown): Answer => ({
  status,
  body: JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
});

// One router for both hosts. `pnpm dev` and the hosted server each own their
// transport, and neither owns a copy of these rules.
export function rulesRoute(
  path: string,
  params: URLSearchParams,
  header: string | undefined,
): Promise<Answer> | null {
  if (path === "/api/rules") {
    try {
      return Promise.resolve({ status: 200, body: rulesPayload() });
    } catch (e) {
      return Promise.resolve(bad(500, e));
    }
  }
  if (!path.startsWith("/api/rules/")) return null;

  // The same guard the refresh carries, and for the same reason. A custom
  // header cannot cross an origin without a preflight, and none is answered.
  if (header !== "1")
    return Promise.resolve(bad(405, new Error("needs X-Banking-Rules: 1")));

  let work: Promise<Edited>;
  try {
    if (path === "/api/rules/rebuild") work = applied(0);
    else if (path === "/api/rules/save") work = applied(save(ruleEdit(params)));
    else if (path === "/api/rules/bulk")
      work = applied(
        saveBulk(
          ruleTarget(params),
          params.getAll("key"),
          params.get("value") ?? "",
        ),
      );
    else if (path === "/api/rules/group")
      work = applied(
        saveValues(
          ruleTarget(params),
          params.getAll("key"),
          params.get("value") ?? "",
        ),
      );
    else if (path === "/api/rules/undo")
      work = applied(undo(ruleTarget(params)));
    else if (path === "/api/rules/redo")
      work = applied(redo(ruleTarget(params)));
    else if (path === "/api/rules/restore")
      work = applied(restore(ruleTarget(params), ruleVersion(params)));
    else return Promise.resolve(bad(404, new Error(`no route ${path}`)));
  } catch (e) {
    // A rejected pattern or an unknown file. The caller sent it, so say so.
    return Promise.resolve(bad(400, e));
  }
  return work.then(ok, (e: unknown) => bad(500, e));
}
