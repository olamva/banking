import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { openDb, queryRange } from "./src/core/db.ts";
import { DB_FILE, WEB } from "./src/core/pipeline.ts";

const CATEGORY_NAMES = "rules/categories.json";

function payload(): string {
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

type Refreshed = { rows: number; fetched: number; stopped: string | null };

async function refresh(): Promise<Refreshed> {
  const { syncAll } = await import("./src/net/sync.ts");
  const { rebuildAll } = await import("./src/core/pipeline.ts");
  const { fetched, stopped } = await syncAll();
  return { rows: await rebuildAll(), fetched, stopped };
}

// One refresh at a time. A second press joins the first rather than starting a
// second full-history sync against the same quota.
let running: Promise<Refreshed> | null = null;

const api = (): Plugin => ({
  name: "banking-api",
  configureServer(server) {
    server.middlewares.use("/api/txns", (_req, res) => {
      try {
        const body = payload();
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(body);
      } catch (e) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(`${e instanceof Error ? e.message : e}\n`);
      }
    });

    server.middlewares.use("/api/refresh", (req, res) => {
      const json = (status: number, body: unknown) => {
        res.writeHead(status, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(JSON.stringify(body));
      };
      // A custom header cannot be set on a cross-origin request without a
      // preflight, and no preflight is answered here. A page on another site
      // therefore cannot make this machine spend its bank quota.
      if (req.method !== "POST" || req.headers["x-banking-refresh"] !== "1")
        return json(405, { error: "POST with X-Banking-Refresh: 1" });

      running ??= refresh().finally(() => {
        running = null;
      });
      running.then(
        (r) => json(200, r),
        (e: unknown) =>
          json(500, { error: e instanceof Error ? e.message : String(e) }),
      );
    });
  },
});

export default defineConfig(({ mode }) => {
  // The dashboard is offline, but the refresh endpoint is not. `pnpm dev` runs
  // vite, not `node --env-file`, so load .env.local here.
  Object.assign(process.env, loadEnv(mode, import.meta.dirname, ""));
  return {
    root: "src/web/app",
    // The payload and the build output both hold transactions, so both sit
    // under data/, where the gitignore already refuses them. Neither may reach
    // a tracked path.
    publicDir: resolve(import.meta.dirname, WEB),
    build: {
      outDir: resolve(import.meta.dirname, "data/dist"),
      emptyOutDir: true,
    },
    plugins: [react(), tailwindcss(), api()],
    server: {
      host: "127.0.0.1",
      port: 4000,
      fs: { allow: [import.meta.dirname] },
    },
  };
});
