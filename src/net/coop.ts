import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { chromeLogin } from "./chrome.ts";
import { secretGet, secretSet } from "./token.ts";

const CLIENT = "7WrQEdeXwUudArpQVjmZEvrTgVs1WkRr";
const REDIRECT = "https://login.coop.no/android/no.coop.members/callback";
const API = "https://coopay.coop.no/user/pay/history";

type Cdp = { method?: string; params?: { request?: { url: string } } };

function capture(ws: WebSocket, url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const send = (id: number, method: string, params = {}) =>
      ws.send(JSON.stringify({ id, method, params }));
    ws.onopen = () => {
      send(1, "Network.enable");
      send(2, "Page.navigate", { url });
    };
    ws.onclose = () =>
      reject(new Error("Chrome closed before the login ended"));
    ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data)) as Cdp;
      const req = m.params?.request;
      if (m.method === "Network.requestWillBeSent" && req?.url.startsWith(REDIRECT)) {
        const code = new URL(req.url).searchParams.get("code");
        if (code) resolve(code);
      }
    };
  });
}

async function token(params: Record<string, string>): Promise<string> {
  const res = await fetch("https://login.coop.no/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT, ...params }),
  });
  if (!res.ok)
    throw new Error(
      `Coop login expired (${res.status}). Run: pnpm receipts login coop`,
    );
  const t = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
  };
  if (t.refresh_token) secretSet("coop", t.refresh_token);
  return t.access_token;
}

export async function login(): Promise<void> {
  const verifier = randomBytes(32).toString("base64url");
  const auth = new URL("https://login.coop.no/authorize");
  auth.search = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT,
    redirect_uri: REDIRECT,
    audience: "https://api.coop.no",
    scope: "openid profile offline_access",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    state: randomBytes(16).toString("base64url"),
  }).toString();
  const code = await chromeLogin(
    "Coop",
    "with your password and SMS code",
    (ws) => capture(ws, auth.toString()),
  );
  await token({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT,
    code_verifier: verifier,
  });
  console.error("Coop login stored in the keychain.");
}

export async function sync(dir: string): Promise<number> {
  const refresh = secretGet("coop");
  if (!refresh) throw new Error("No Coop login. Run: pnpm receipts login coop");
  const headers = {
    "x-token": await token({
      grant_type: "refresh_token",
      refresh_token: refresh,
    }),
  };
  const get = async (path: string): Promise<unknown> => {
    const res = await fetch(`${API}/${path}`, { headers });
    if (!res.ok)
      throw new Error(
        `GET ${path} -> ${res.status}: ${(await res.text()).slice(0, 300)}`,
      );
    return res.json();
  };
  const ordinal = (p: { year: number; month: number }) =>
    p.year * 12 + p.month - 1;

  const { oldestPeriod, currentPeriod } = (await get("dashboard")) as Record<
    "oldestPeriod" | "currentPeriod",
    { year: number; month: number }
  >;
  await mkdir(dir, { recursive: true });
  let added = 0;
  for (let n = ordinal(currentPeriod); n >= ordinal(oldestPeriod); n--) {
    const { purchases } = (await get(
      `month?year=${Math.floor(n / 12)}&month=${(n % 12) + 1}`,
    )) as { purchases: { summaryId: string }[] };
    for (const head of purchases) {
      const file = `${dir}/${head.summaryId}.json`;
      if (existsSync(file)) continue;
      const details = await get(
        `details?${new URLSearchParams({ summaryId: head.summaryId })}`,
      );
      await writeFile(file, JSON.stringify({ head, details }, null, 2));
      added++;
    }
  }
  return added;
}
