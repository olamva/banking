import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { appData, appPeriod, appTxn } from "../core/app.ts";
import { payeePattern } from "../core/bulkRules.ts";
import { withItems } from "../core/items.ts";
import { compileRule } from "../core/match.ts";
import { overlaps } from "../core/narrowings.ts";
import { reviewGroups } from "../core/review.ts";
import { filtersFromParams } from "../core/select.ts";
import { openDb, queryRange } from "../core/db.ts";
import { osloDate } from "../core/normalize.ts";
import { DATA_DIR, RULES_DIR } from "../core/paths.ts";
import { DB_FILE, rebuildAll } from "../core/pipeline.ts";
import {
  FILE_LABEL,
  RULE_FILES,
  RULE_GROUPS,
  RULE_NOTE,
  isRuleFile,
  type RuleFile,
  type RuleMap,
} from "../core/ruleFiles.ts";
import { NOTE_NAME, versioned, type Note } from "./app/releaseNotes.ts";
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

const itemNames = (): RuleMap => loadAll().items as RuleMap;

export const payload = (): string =>
  JSON.stringify({ txns: rows(), names: names(), refreshing: !!running });

export const appPayload = (): string =>
  JSON.stringify(appData(rows(), names(), undefined, undefined, itemNames()));

const PERIOD_KEY =
  /^(\d{4}(-\d{2})?|all|(\d{4}-\d{2}-\d{2})?\.\.(\d{4}-\d{2}-\d{2})?)$/;

const answer = (work: () => unknown): Answer => {
  try {
    return ok(work());
  } catch (e) {
    return bad(500, e);
  }
};

export function periodPayload(params: URLSearchParams): Answer {
  const key = params.get("p") ?? "";
  if (!PERIOD_KEY.test(key))
    return bad(
      400,
      new Error("needs p=YYYY-MM, YYYY, all or YYYY-MM-DD..YYYY-MM-DD"),
    );
  return answer(() =>
    appPeriod(
      key,
      withItems(rows(), itemNames()),
      undefined,
      filtersFromParams(params),
    ),
  );
}

const MATCHES_SHOWN = 200;

export function matchPayload(params: URLSearchParams): Answer {
  const all = rows();
  if (all.some((t) => t.originalCounterparty === undefined))
    return ok({ rebuild: true, count: 0, txns: [] });
  let rule: ReturnType<typeof compileRule>;
  try {
    rule = compileRule(params.get("key") ?? "", "pattern");
  } catch (e) {
    return bad(400, e);
  }
  const items = itemNames();
  const found = all
    .filter((t) => rule.matches(t))
    .sort((a, b) => b.date.localeCompare(a.date));
  return ok({
    rebuild: false,
    count: found.length,
    txns: found.slice(0, MATCHES_SHOWN).map((t) => appTxn(t, items)),
  });
}

const CHECKED = ["categories", "payees"] as const;

export const appRulesPayload = (): Answer =>
  answer(() => {
    const all = rows();
    const files = loadAll();
    const items = itemNames();
    return {
      files,
      history: Object.fromEntries(
        RULE_FILES.map((f) => [f, history(f, SHOWN_VERSIONS)]),
      ),
      at: Object.fromEntries(RULE_FILES.map((f) => [f, current(f)])),
      labels: FILE_LABEL,
      notes: RULE_NOTE,
      groups: RULE_GROUPS,
      rebuild: all.some((t) => t.originalCounterparty === undefined),
      review: reviewGroups(all).map(({ txns, guessed }) => ({
        key: payeePattern(txns[0]!),
        guessed,
        count: txns.length,
        txn: appTxn(txns[0]!, items),
      })),
      conflicts: CHECKED.flatMap((file) =>
        overlaps(all, files[file] as RuleMap, file === "payees")
          .filter((c) => !c.harmless)
          .map((c) => ({ ...c, file })),
      ),
    };
  });

const NOTES = new URL("./app/release-notes/", import.meta.url);

export const releasesPayload = (): Answer =>
  answer(() =>
    versioned(
      Object.fromEntries(
        readdirSync(NOTES)
          .filter((name) => NOTE_NAME.test(name))
          .map((name) => [
            name,
            JSON.parse(readFileSync(new URL(name, NOTES), "utf8")) as Note,
          ]),
      ),
    ),
  );

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

const APP_ROUTES: Record<string, (params: URLSearchParams) => Answer> = {
  "/api/app/period": periodPayload,
  "/api/app/match": matchPayload,
  "/api/app/rules": appRulesPayload,
  "/api/app/releases": releasesPayload,
};

export const jsonRoute = (
  url: URL,
  refreshHeader: string | undefined,
): Answer | null =>
  APP_ROUTES[url.pathname]?.(url.searchParams) ??
  refreshRoute(url.pathname, refreshHeader);

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
