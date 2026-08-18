/**
 * `pnpm dev` is Vite and nothing else. There is no `vite build` and no `dist/`:
 * the page is only ever served to localhost, so the dev server is the only
 * server it needs.
 *
 * `root` is the app alone. Everything it imports from `src/core/` sits above
 * that root, which `fs.allow` has to permit explicitly.
 */
import { existsSync, readFileSync } from "node:fs";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { openDb, queryRange } from "./src/core/db.ts";
import { DB_FILE } from "./src/core/pipeline.ts";

const CATEGORY_NAMES = "rules/categories.json";

/**
 * Every row, plus the names for the category slugs that are ours to name.
 *
 * The bank's own names ride on the rows themselves, so this map carries only
 * what `rules/categories.json` overrides. It has to come over the wire because
 * `rules/` is a local secret the browser cannot read — the same reason
 * `Txn.account` carries a name and not a key.
 *
 * Read per request, so a `rebuild` in another terminal shows up on reload.
 */
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

/**
 * The one endpoint. Nothing here touches the network: syncing is `pnpm sb1
 * sync`, run by hand, so no number of tabs or reloads can cost an SB1 request.
 */
const api = (): Plugin => ({
  name: "banking-api",
  configureServer(server) {
    server.middlewares.use("/api/txns", (_req, res) => {
      try {
        // Built before the headers go out: a database that is missing or
        // mid-rebuild throws here, and a 200 already on the wire would leave
        // the catch unable to answer with anything.
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
  },
});

export default defineConfig({
  root: "src/web/app",
  plugins: [react(), tailwindcss(), api()],
  server: {
    // It holds every transaction and must never be reachable from another
    // machine.
    host: "127.0.0.1",
    port: 4000,
    // Absolute, and the repo root rather than `root`: `fs.allow` resolves
    // relative to the Vite root, so anything shorter silently denies
    // `src/core/` — and looks like it works until the first import from there
    // that is a value rather than a type, which then 403s.
    fs: { allow: [import.meta.dirname] },
  },
});
