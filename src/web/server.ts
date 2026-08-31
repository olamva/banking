import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { allowed } from "../auth/session.ts";
import { payload, refresh, rulesRoute } from "./api.ts";
import { claimTypes, principalEmail } from "./principal.ts";

const DIST = resolve(import.meta.dirname, "../../data/dist");

const TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
};

const SECURITY = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
};

const send = (
  res: ServerResponse,
  status: number,
  type: string,
  body: string,
): void => {
  res.writeHead(status, {
    ...SECURITY,
    "Content-Type": type,
    "Cache-Control": "no-store",
  });
  res.end(body);
};

const json = (res: ServerResponse, status: number, body: unknown): void =>
  send(res, status, "application/json; charset=utf-8", JSON.stringify(body));

function file(res: ServerResponse, path: string): void {
  // A request may not climb out of the build output.
  const full = resolve(DIST, `.${path}`);
  if (full !== DIST && !full.startsWith(DIST + sep)) {
    send(res, 403, "text/plain; charset=utf-8", "no\n");
    return;
  }
  const hit = existsSync(full) && statSync(full).isFile();
  // An asset that is missing is missing. Only a route falls back to the page.
  if (!hit && extname(full)) {
    send(res, 404, "text/plain; charset=utf-8", "not found\n");
    return;
  }
  const serve = hit ? full : join(DIST, "index.html");
  if (!existsSync(serve)) {
    send(res, 404, "text/plain; charset=utf-8", "no build output\n");
    return;
  }
  const ext = extname(serve);
  res.writeHead(200, {
    ...SECURITY,
    "Content-Type": TYPES[ext] ?? "application/octet-stream",
    // The page and the payload both hold transactions. Only the hashed assets
    // may sit in a cache.
    "Cache-Control": serve.includes(`${sep}assets${sep}`)
      ? "private, max-age=31536000, immutable"
      : "private, no-store",
  });
  createReadStream(serve).pipe(res);
}

export const server = createServer((req, res) => {
  const principal = req.headers["x-ms-client-principal"] as string | undefined;
  const email = principalEmail(principal);
  if (!email || !allowed(email, process.env.ALLOWED_EMAILS)) {
    if (process.env.DEBUG === "1")
      console.error(
        `refused: principal ${principal ? "present" : "absent"}, ` +
          `claims [${claimTypes(principal).join(", ")}]`,
      );
    send(res, 403, "text/plain; charset=utf-8", "Not your dashboard.\n");
    return;
  }

  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;

  const rules = rulesRoute(
    path,
    url.searchParams,
    req.headers["x-banking-rules"] as string | undefined,
  );
  if (rules) {
    rules.then((a) =>
      send(res, a.status, "application/json; charset=utf-8", a.body),
    );
    return;
  }

  if (path === "/api/txns") {
    try {
      send(res, 200, "application/json; charset=utf-8", payload());
    } catch (e) {
      send(
        res,
        500,
        "text/plain; charset=utf-8",
        `${e instanceof Error ? e.message : e}\n`,
      );
    }
    return;
  }

  if (path === "/api/refresh") {
    // A custom header cannot be set on a cross-origin request without a
    // preflight, and no preflight is answered here. A page on another site
    // therefore cannot make this machine spend its bank quota. The header is
    // the whole guard, and the method carries none of it: Easy Auth refuses a
    // cookie on any method but GET, so the button cannot use POST.
    if (req.headers["x-banking-refresh"] !== "1") {
      json(res, 405, { error: "needs X-Banking-Refresh: 1" });
      return;
    }
    refresh().then(
      (r) => json(res, 200, r),
      (e: unknown) =>
        json(res, 500, { error: e instanceof Error ? e.message : String(e) }),
    );
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    send(res, 405, "text/plain; charset=utf-8", "GET only\n");
    return;
  }
  file(res, path);
});

// A test imports this file. Only a direct run binds the port.
if (process.argv[1] === import.meta.filename) {
  const port = Number(process.env.PORT ?? 8080);
  // The database sits on the local disk, so a cold start begins without one.
  // Build it again from the raw files on the volume before serving a request.
  const { DB_FILE } = await import("../core/paths.ts");
  if (!existsSync(DB_FILE)) {
    const { rebuildAll } = await import("../core/pipeline.ts");
    await rebuildAll().catch((e: unknown) =>
      console.error(
        `rebuild on start failed: ${e instanceof Error ? e.message : e}`,
      ),
    );
  }
  // A wildcard bind does not collide with a server that already holds
  // 127.0.0.1, so a local run reports success while curl answers from the
  // squatter. The image sets PORT. A local run does not.
  server.listen(port, process.env.PORT ? undefined : "127.0.0.1", () =>
    console.error(`listening on ${port}`),
  );
}
