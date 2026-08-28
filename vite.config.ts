import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { payload, refresh, rulesRoute } from "./src/web/api.ts";

const api = (): Plugin => ({
  name: "banking-api",
  configureServer(server) {
    // Mounted on no prefix, because connect strips a prefix off req.url and
    // the router needs the whole path.
    server.middlewares.use((req, res, next) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      const answer = rulesRoute(
        url.pathname,
        url.searchParams,
        req.headers["x-banking-rules"] as string | undefined,
      );
      if (!answer) return next();
      answer.then((a) => {
        res.writeHead(a.status, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(a.body);
      });
    });

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
      if (req.headers["x-banking-refresh"] !== "1")
        return json(405, { error: "needs X-Banking-Refresh: 1" });

      refresh().then(
        (r) => json(200, r),
        (e: unknown) =>
          json(500, { error: e instanceof Error ? e.message : String(e) }),
      );
    });
  },
});

// A worktree links `data` to the main checkout, so a build there empties and
// replaces the page that the main checkout deploys. `.git` is a file in a
// worktree and a directory in the main checkout.
const isWorktree = (): boolean => {
  const dotGit = resolve(import.meta.dirname, ".git");
  return existsSync(dotGit) && statSync(dotGit).isFile();
};

export default defineConfig(({ command, mode }) => {
  if (command === "build" && isWorktree())
    throw new Error(
      "build from the main checkout: `data` is a link to it, and this build " +
        "would replace the page that it deploys.",
    );
  // The dashboard is offline, but the refresh endpoint is not. `pnpm dev` runs
  // vite, not `node --env-file`, so load .env.local here.
  Object.assign(process.env, loadEnv(mode, import.meta.dirname, ""));
  return {
    root: "src/web/app",
    build: {
      outDir: resolve(import.meta.dirname, "data/dist"),
      emptyOutDir: true,
    },
    plugins: [react(), tailwindcss(), api()],
    server: {
      host: "127.0.0.1",
      port: 4000,
      // Refuse a port that another server holds. Vite moves to the next port
      // without it, and a request to 4000 then answers from the squatter.
      strictPort: true,
      fs: { allow: [import.meta.dirname] },
    },
  };
});
