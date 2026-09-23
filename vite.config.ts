import { execFileSync } from "node:child_process";
import {
  constants,
  copyFileSync,
  existsSync,
  mkdirSync,
  statSync,
} from "node:fs";
import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

const api = (): Plugin => ({
  name: "banking-api",
  // `api.ts` loads here rather than at the top of the file. `paths.ts` reads
  // DB_FILE from the environment once, when it first loads, and isolate() sets
  // that variable while this config is still being built. A static import binds
  // the shared database before the worktree can redirect it. `api.ts` and
  // `server.ts` defer their own imports for the same reason.
  async configureServer(server) {
    const { payload, refresh, rulesRoute } = await import("./src/web/api.ts");
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
          "Content-Security-Policy":
            "default-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
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
          "Content-Security-Policy":
            "default-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
        });
        res.end(body);
      } catch (e) {
        res.writeHead(500, {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Security-Policy":
            "default-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
        });
        res.end(`${e instanceof Error ? e.message : e}\n`);
      }
    });

    server.middlewares.use("/api/refresh", (req, res) => {
      const json = (status: number, body: unknown) => {
        res.writeHead(status, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "Content-Security-Policy":
            "default-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
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

// A worktree links `data` to the main checkout, so a build there must write to
// `data.local` or it replaces the page that the main checkout deploys. `.git`
// is a file in a worktree and a directory in the main checkout.
const isWorktree = (): boolean => {
  const dotGit = resolve(import.meta.dirname, ".git");
  return existsSync(dotGit) && statSync(dotGit).isFile();
};

// Give a worktree its own port and its own database, and return the port.
//
// Two worktrees otherwise collide twice. `strictPort` means the second
// `pnpm dev` refuses to start at all, so no agent can look at its own work
// while another server runs. And `data` is a link to the main checkout, so a
// rebuild in a worktree replaces the database the main checkout is serving.
//
// The port comes from the branch name, so one branch always answers on one
// port and a link stays good across restarts. 4010-4089 sits clear of 4000.
const isolate = (): number => {
  const branch = execFileSync("git", ["branch", "--show-current"], {
    cwd: import.meta.dirname,
    encoding: "utf8",
  }).trim();
  let hash = 0;
  for (const ch of branch) hash = (hash * 31 + ch.charCodeAt(0)) % 80;

  const dir = resolve(import.meta.dirname, "data.local");
  const db = resolve(dir, "banking.db");
  const shared = resolve(import.meta.dirname, "data/banking.db");
  mkdirSync(dir, { recursive: true });
  // COPYFILE_FICLONE clones on APFS, so this is instant and costs no disk until
  // one of the two copies changes. A missing shared file is not an error: the
  // worktree starts empty and a rebuild fills it.
  if (!existsSync(db) && existsSync(shared))
    copyFileSync(shared, db, constants.COPYFILE_FICLONE);
  process.env.DB_FILE = db;

  return 4010 + hash;
};

export default defineConfig(({ mode }) => {
  // The dashboard is offline, but the refresh endpoint is not. `pnpm dev` runs
  // vite, not `node --env-file`, so load .env.local here.
  Object.assign(process.env, loadEnv(mode, import.meta.dirname, ""));
  // Before the return: this sets DB_FILE, and the api plugin reads it when the
  // server starts.
  const port = isWorktree() ? isolate() : 4000;
  return {
    root: "src/web/app",
    build: {
      outDir: resolve(
        import.meta.dirname,
        isWorktree() ? "data.local/dist" : "data/dist",
      ),
      emptyOutDir: true,
    },
    plugins: [react(), tailwindcss(), api()],
    server: {
      host: "127.0.0.1",
      port,
      // Refuse a port that another server holds. Vite moves to the next port
      // without it, and a request to 4000 then answers from the squatter.
      strictPort: true,
      fs: { allow: [import.meta.dirname] },
    },
  };
});
