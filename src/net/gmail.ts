import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { env, keychainGet, keychainSet } from "./token.ts";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";
const QUERY =
  '{category:purchases category:reservations subject:kvittering subject:receipt subject:ordrebekreftelse subject:"order confirmation"}';

async function postToken(params: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("GMAIL_CLIENT_ID"),
      client_secret: env("GMAIL_CLIENT_SECRET"),
      ...params,
    }),
  });
  const body = await res.text();
  if (!res.ok)
    throw new Error(
      `Google token endpoint ${res.status}: ${body.slice(0, 300)}. Run: pnpm receipts login gmail`,
    );
  return JSON.parse(body) as { access_token: string; refresh_token?: string };
}

export async function login(): Promise<void> {
  const clientId = env("GMAIL_CLIENT_ID");
  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(16).toString("hex");
  const server = createServer();
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const redirectUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;

  const code = await new Promise<string>((resolve, reject) => {
    server.on("request", (req, res) => {
      const url = new URL(req.url ?? "/", redirectUri);
      if (url.pathname !== "/") return void res.writeHead(404).end();
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Back to the terminal.");
      server.close();
      const c = url.searchParams.get("code");
      if (c && url.searchParams.get("state") === state) resolve(c);
      else
        reject(
          new Error(
            `Google login failed: ${url.searchParams.get("error") ?? "state mismatch"}`,
          ),
        );
    });
    const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    auth.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/gmail.readonly",
      access_type: "offline",
      prompt: "consent",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      state,
    }).toString();
    console.error(`Opening the Google login:\n${auth}`);
    execFile("open", [auth.toString()]);
  });

  const t = await postToken({
    grant_type: "authorization_code",
    code,
    code_verifier: verifier,
    redirect_uri: redirectUri,
  });
  if (!t.refresh_token) throw new Error("Google returned no refresh token");
  keychainSet("gmail", t.refresh_token);
  console.error("Gmail login stored in the keychain.");
}

export async function sync(dir: string): Promise<number> {
  const refresh = keychainGet("gmail");
  if (!refresh)
    throw new Error("No Gmail login. Run: pnpm receipts login gmail");
  const { access_token } = await postToken({
    grant_type: "refresh_token",
    refresh_token: refresh,
  });
  const get = async (path: string): Promise<unknown> => {
    for (let retry = 0; ; retry++) {
      const res = await fetch(`${API}/${path}`, {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      if (res.ok) return res.json();
      const body = await res.text();
      if (
        retry < 3 &&
        (res.status === 429 || /rateLimitExceeded|Quota exceeded/.test(body))
      ) {
        const wait = Number(res.headers.get("retry-after")) || 60;
        console.error(`Gmail quota reached. Waiting ${wait} s.`);
        await sleep(wait * 1000);
        continue;
      }
      throw new Error(`GET ${path} -> ${res.status}: ${body.slice(0, 300)}`);
    }
  };

  const ids: string[] = [];
  let pageToken = "";
  do {
    const page = (await get(
      `messages?${new URLSearchParams({ q: QUERY, maxResults: "500", ...(pageToken && { pageToken }) })}`,
    )) as { messages?: { id: string }[]; nextPageToken?: string };
    ids.push(...(page.messages ?? []).map((m) => m.id));
    pageToken = page.nextPageToken ?? "";
  } while (pageToken);

  await mkdir(dir, { recursive: true });
  let added = 0;
  for (const id of ids) {
    const file = `${dir}/${id}.eml`;
    if (existsSync(file)) continue;
    const { raw } = (await get(`messages/${id}?format=raw`)) as { raw: string };
    await writeFile(file, Buffer.from(raw, "base64url"));
    added++;
  }
  return added;
}
