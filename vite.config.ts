import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
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
  },
});

export default defineConfig({
  root: "src/web/app",
  // The payload and the build output both hold transactions, so both sit under
  // data/, where the gitignore already refuses them. Neither may reach a
  // tracked path.
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
});
