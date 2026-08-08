// Enable Banking (licensed AISP) — the only route to the credit card, which
// SpareBank 1's own customer API does not expose.
import { createServer } from 'node:https';
import { createSign, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';

const API = 'https://api.enablebanking.com';
const SESSION_FILE = 'data/eb-session.json';

function env(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing ${key} — is .env.local present?`);
  return v;
}

/** Every call is authorised by a short-lived JWT signed with the app's RSA key. */
function jwt(): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const iat = Math.floor(Date.now() / 1000);
  const signed = `${b64({ typ: 'JWT', alg: 'RS256', kid: env('EB_APP_ID') })}.${b64({
    iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat, exp: iat + 3600,
  })}`;
  const key = readFileSync(env('EB_KEY_FILE'), 'utf8');
  return `${signed}.${createSign('RSA-SHA256').update(signed).sign(key, 'base64url')}`;
}

export async function api(path: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${jwt()}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${res.status}: ${body.slice(0, 400)}`);
  return JSON.parse(body);
}

/** Authorisation flow: BankID in the browser, back to a loopback TLS listener. */
export async function login(): Promise<Session> {
  const redirectUri = 'https://localhost:12345/callback';
  const { port, pathname } = new URL(redirectUri);
  const state = randomUUID();
  const validUntil = new Date(Date.now() + 90 * 864e5).toISOString();

  const auth = await api('/auth', {
    method: 'POST',
    body: JSON.stringify({
      access: { valid_until: validUntil },
      aspsp: { name: env('EB_ASPSP'), country: 'NO' },
      state,
      redirect_url: redirectUri,
      psu_type: 'personal',
    }),
  }) as { url: string };

  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer({
      cert: readFileSync('secrets/localhost-cert.pem'),
      key: readFileSync('secrets/localhost-key.pem'),
    }, (req, res) => {
      const url = new URL(req.url ?? '/', redirectUri);
      if (url.pathname !== pathname) {
        res.writeHead(404).end();
        return;
      }
      const done = (msg: string) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' }).end(msg);
        server.close();
      };
      if (url.searchParams.get('state') !== state) {
        return done('Failed. Back to the terminal.'), reject(new Error('state mismatch — aborting'));
      }
      const c = url.searchParams.get('code');
      if (!c) return done('Failed. Back to the terminal.'), reject(new Error(`no code: ${url.search}`));
      done('Authorised. Back to the terminal.');
      resolve(c);
    });
    server.on('error', reject);
    server.listen(Number(port), '127.0.0.1', () => {
      console.error(`Opening BankID authorisation:\n${auth.url}\n`);
      console.error('The listener uses a self-signed certificate — accept the browser warning once.');
      execFile('open', [auth.url]);
    });
  });

  return await api('/sessions', { method: 'POST', body: JSON.stringify({ code }) }) as Session;
}

export type Account = {
  uid: string;
  cash_account_type?: string;
  product?: string;
  currency?: string;
  identification_hash?: string;
};
export type Session = { session_id: string; accounts: Account[] };

export function readSession(): Session {
  try {
    return JSON.parse(readFileSync(SESSION_FILE, 'utf8')) as Session;
  } catch {
    throw new Error(`No Enable Banking session. Run: pnpm sb1 eb-login`);
  }
}

export const sessionFile = SESSION_FILE;

/** Transactions for one account, following continuation_key until exhausted. */
export async function transactions(uid: string, from: string, to: string): Promise<unknown[]> {
  const all: unknown[] = [];
  let key: string | undefined;
  do {
    const q = new URLSearchParams({ date_from: from, date_to: to });
    if (key) q.set('continuation_key', key);
    const page = await api(`/accounts/${uid}/transactions?${q}`) as
      { transactions?: unknown[]; continuation_key?: string };
    all.push(...(page.transactions ?? []));
    key = page.continuation_key;
  } while (key);
  return all;
}
