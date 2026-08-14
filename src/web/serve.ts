/**
 * `pnpm dev` — the dashboard, the only way it is served.
 *
 * Two things on one port: `/api/txns` reads the database and returns every row
 * as JSON, and everything else is handed to Vite, running in *middleware mode*
 * inside this process. That is why there is no `vite build`, no `dist/` and no
 * second port — the page is only ever run locally, so the dev server is the
 * only server it needs, and Ctrl-C stops one thing rather than two.
 *
 * The database is re-read per request, so a `rebuild` in another terminal shows
 * up on reload.
 *
 * **The server never touches the network.** There is no path from a page view to
 * an SB1 request: syncing is `pnpm sb1 sync`, run by hand, and this process only
 * ever reads `data/banking.db`. A `--pull` flag used to re-sync a stale current
 * month on request, and every line of it was a defence against the page spending
 * the bank's 60/hour — staleness on disk so a restart did not re-trigger, one
 * refresh at a time so three tabs did not become three syncs, a failed attempt
 * counted so a dead token did not retry forever. Not having the path at all is
 * the same guarantee for none of the code.
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { openDb, queryRange } from '../core/db.ts';
import { DB_FILE } from '../core/pipeline.ts';

const CATEGORY_NAMES = 'rules/categories.json';

/**
 * Every row, plus the names for the category slugs that are ours to name.
 *
 * The bank's own names ride on the rows themselves, so this map only carries
 * what `rules/categories.json` overrides — usually a handful of entries, since
 * `labels.ts` tidies a slug into a serviceable Norwegian name on its own. It has
 * to come over the wire because `rules/` is a local secret the browser has no
 * way to read, and the same reason `Txn.account` carries a name and not a key.
 *
 * Re-read per request, like the rows: an edited rules file shows up on reload.
 */
function payload(): string {
  const db = openDb(DB_FILE);
  try {
    return JSON.stringify({
      txns: queryRange(db, '0000-00', '9999-99'),
      names: existsSync(CATEGORY_NAMES) ? JSON.parse(readFileSync(CATEGORY_NAMES, 'utf8')) : {},
    });
  } finally {
    db.close();
  }
}

export async function serve(port: number): Promise<void> {
  // Imported here rather than at the top: `pnpm sb1 rebuild` loads this module's
  // siblings and has no business paying for Vite's startup.
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    configFile: 'vite.config.ts',
    // The HMR socket is a second listener and it does not follow `--port`: two
    // dev servers both want Vite's default 24678, and the loser boots with hot
    // reload silently dead. Derive it from the port, so `--port` moves both.
    server: { middlewareMode: true, ws: { port: port + 20000 } },
    appType: 'spa',
  });

  const server = createServer((req, res) => {
    if (req.url !== '/api/txns') {
      vite.middlewares(req, res);
      return;
    }
    try {
      // Built before the headers go out, not inside `res.end`: a database that
      // is missing or mid-rebuild throws here, and a 200 already on the wire
      // makes the catch below unable to answer with anything at all.
      const body = payload();
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        // Always fresh; a cached copy of the data is the opposite of the point.
        'Cache-Control': 'no-store',
      });
      res.end(body);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`${e instanceof Error ? e.message : e}\n`);
    }
  });

  // Without this the port clash is an unhandled 'error' event: a stack trace in
  // whatever log the process was started under, while a curl to the same port is
  // happily answered by the server that already had it. Say which port and how.
  server.on('error', (e: NodeJS.ErrnoException) => {
    if (e.code !== 'EADDRINUSE') throw e;
    console.error(`port ${port} is already in use — another \`pnpm dev\` has it`);
    console.error(`run \`pnpm dev --port ${port + 1}\` to serve alongside it`);
    process.exit(1);
  });

  server.listen(port, '127.0.0.1', () => {
    console.error(`http://localhost:${port}`);
    console.error('offline — run `pnpm sb1 sync` then `pnpm sb1 rebuild` to bring the data forward');
    console.error('local only, and it holds every transaction — do not expose this port');
  });
}
