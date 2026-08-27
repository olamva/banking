import { existsSync, readFileSync } from "node:fs";
import { openDb, queryRange } from "../core/db.ts";
import { RULES_DIR } from "../core/paths.ts";
import { DB_FILE } from "../core/pipeline.ts";

const CATEGORY_NAMES = `${RULES_DIR}/categories.json`;

export function payload(): string {
  const db = openDb(DB_FILE);
  try {
    return JSON.stringify({
      txns: queryRange(db, "0000-00", "9999-99"),
      names: existsSync(CATEGORY_NAMES)
        ? JSON.parse(readFileSync(CATEGORY_NAMES, "utf8"))
        : {},
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
