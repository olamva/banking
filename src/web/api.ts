import { existsSync, readFileSync } from "node:fs";
import { openDb, queryRange } from "../core/db.ts";
import { RULES_DIR } from "../core/paths.ts";
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
  undo,
  type Edit,
} from "../core/rules.ts";

const LABELS = `${RULES_DIR}/labels.json`;

export function payload(): string {
  const db = openDb(DB_FILE);
  try {
    return JSON.stringify({
      txns: queryRange(db, "0000-00", "9999-99"),
      names: existsSync(LABELS) ? JSON.parse(readFileSync(LABELS, "utf8")) : {},
    });
  } finally {
    db.close();
  }
}

export type Refreshed = {
  rows: number;
  fetched: number;
  stopped: string | null;
};

async function run(): Promise<Refreshed> {
  const { syncAll } = await import("../net/sync.ts");
  const { rebuildAll } = await import("../core/pipeline.ts");
  const { fetched, stopped } = await syncAll();
  return { rows: await rebuildAll(), fetched, stopped };
}

// One refresh at a time. A second press joins the first rather than starting a
// second full-history sync against the same quota.
let running: Promise<Refreshed> | null = null;

export function refresh(): Promise<Refreshed> {
  running ??= run().finally(() => {
    running = null;
  });
  return running;
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
// ponytail: no queue. One replica, one reader, and a rebuild is about a
// second. Serialise this with the refresh when two writers become real.
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
