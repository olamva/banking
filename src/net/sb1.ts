import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { note, spend } from "./budget.ts";
import { env, getToken, setToken, store } from "./token.ts";

const API = "https://api.sparebank1.no";

// The code throws this when the refresh chain fails. Do not convert it to an
// empty result.
export class ReauthRequired extends Error {
  constructor(cause: string) {
    super(`BankID login required (${cause}). Run: pnpm sb1 login`);
  }
}

export class RateLimited extends Error {
  // Use a plain field, not a parameter property. Node removes types and does not
  // compile them, so `erasableSyntaxOnly` forbids that shorthand.
  retryAfter: string | null;

  constructor(retryAfter: string | null) {
    super(
      `SpareBank 1 refused: 429, its own rate limit. ` +
        (retryAfter
          ? `Retry after ${retryAfter}s.`
          : `It does not say for how long — wait, then re-run.`),
    );
    this.retryAfter = retryAfter;
  }
}

export function noteLimits(
  status: number,
  headers: Headers,
  path?: string,
  now?: number,
): void {
  const left = headers.get("x-ratelimit-remaining");
  if (left !== null && left !== "") note(Number(left), path, now);
  if (status === 401) throw new ReauthRequired("API returned 401");
  if (status === 429) throw new RateLimited(headers.get("retry-after"));
}

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

async function postToken(
  params: Record<string, string>,
): Promise<TokenResponse> {
  spend(); // token exchanges count against the hourly limit like anything else
  const res = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("CLIENT_ID"),
      client_secret: env("CLIENT_SECRET"),
      ...params,
    }),
  });
  const body = await res.text();
  if (!res.ok)
    throw new ReauthRequired(`token endpoint ${res.status}: ${body}`);
  return JSON.parse(body) as TokenResponse;
}

export async function login(): Promise<void> {
  const redirectUri = env("REDIRECT_URI");
  const { port, pathname } = new URL(redirectUri);
  const state = randomBytes(16).toString("hex");

  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", redirectUri);
      if (url.pathname !== pathname) {
        res.writeHead(404).end();
        return;
      }
      const done = (msg: string) => {
        res.writeHead(200, { "Content-Type": "text/plain" }).end(msg);
        server.close();
      };
      const err = url.searchParams.get("error");
      if (err)
        return (
          done("Failed. Back to the terminal."),
          reject(new Error(`authorize: ${err}`))
        );
      if (url.searchParams.get("state") !== state) {
        return (
          done("Failed. Back to the terminal."),
          reject(new Error("state mismatch — aborting"))
        );
      }
      const c = url.searchParams.get("code");
      if (!c)
        return (
          done("Failed. Back to the terminal."),
          reject(new Error("no code in callback"))
        );
      done("Logged in. Back to the terminal.");
      resolve(c);
    });
    server.on("error", reject);
    server.listen(Number(port), "127.0.0.1", () => {
      const authorize = new URL(`${API}/oauth/authorize`);
      authorize.search = new URLSearchParams({
        client_id: env("CLIENT_ID"),
        response_type: "code",
        redirect_uri: redirectUri,
        finInst: env("FINANCIAL_INSTITUTION"),
        state,
      }).toString();
      console.error(
        `Opening BankID login (code expires in 2 min):\n${authorize}`,
      );
      execFile("open", [authorize.toString()]);
    });
  });

  const t = await postToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    state,
  });
  await setToken(t.refresh_token);
  console.error(`Refresh token stored in the ${store()}.`);
}

let accessToken: string | undefined;

async function getAccessToken(): Promise<string> {
  if (accessToken) return accessToken;
  const refresh = await getToken();
  if (!refresh) throw new ReauthRequired(`no refresh token in the ${store()}`);
  const t = await postToken({
    grant_type: "refresh_token",
    refresh_token: refresh,
  });
  await setToken(t.refresh_token); // rotates on every use
  accessToken = t.access_token;
  return accessToken;
}

export async function get(path: string): Promise<unknown> {
  spend();
  const res = await fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${await getAccessToken()}`,
      Accept: "application/vnd.sparebank1.v1+json; charset=utf-8",
    },
  });
  noteLimits(res.status, res.headers);
  const body = await res.text();
  if (!res.ok)
    throw new Error(`GET ${path} -> ${res.status}: ${body.slice(0, 500)}`);
  return JSON.parse(body);
}

export function monthRange(month: string): { from: string; to: string } {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) throw new Error(`--month must be YYYY-MM, got "${month}"`);
  const [, y, mo] = m;
  const last = new Date(Date.UTC(Number(y), Number(mo), 0)).getUTCDate();
  if (!last) throw new Error(`invalid month "${month}"`);
  return {
    from: `${y}-${mo}-01`,
    to: `${y}-${mo}-${String(last).padStart(2, "0")}`,
  };
}
