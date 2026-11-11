import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { chromeLogin } from "./chrome.ts";
import { env, secretGet, secretSet } from "./token.ts";

const REDIRECT = "https://ae-appen.appspot.com/redirect/redirect.html";
const API = "https://api.rema.no";

type Session = { key: string; refreshToken: string; deviceId: string };

type Cdp = {
  id?: number;
  method?: string;
  params?: {
    requestId?: string;
    request?: { url: string; method: string };
  };
  result?: { body?: string };
};

function capture(ws: WebSocket, url: string): Promise<Session> {
  return new Promise((resolve, reject) => {
    let key = "";
    let signIn = "";
    let refreshToken = "";
    let redirected = false;
    const send = (id: number, method: string, params = {}) =>
      ws.send(JSON.stringify({ id, method, params }));
    const settle = () =>
      refreshToken &&
      redirected &&
      resolve({ key, refreshToken, deviceId: randomUUID().toUpperCase() });
    ws.onopen = () => {
      send(1, "Network.enable");
      send(2, "Page.navigate", { url });
    };
    ws.onclose = () =>
      reject(new Error("Chrome closed before the login ended"));
    ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data)) as Cdp;
      const req = m.params?.request;
      if (m.method === "Network.requestWillBeSent" && req) {
        const u = new URL(req.url);
        if (
          u.pathname.endsWith("signInWithPhoneNumber") &&
          req.method === "POST"
        ) {
          key = u.searchParams.get("key") ?? "";
          signIn = m.params!.requestId!;
        }
        if (req.url.startsWith(REDIRECT) && u.searchParams.has("code"))
          redirected = true;
      }
      if (
        m.method === "Network.loadingFinished" &&
        m.params?.requestId === signIn
      )
        send(3, "Network.getResponseBody", { requestId: signIn });
      if (m.id === 3 && m.result?.body)
        refreshToken = JSON.parse(m.result.body).refreshToken ?? "";
      settle();
    };
  });
}

export async function login(): Promise<void> {
  const auth = new URL("https://id.rema.no/authorization");
  auth.search = new URLSearchParams({
    response_type: "code",
    client_id: "c886192e-2ac2-11e9-b210-d663bd873d93",
    code_challenge_method: "S256",
    code_challenge: createHash("sha256")
      .update(randomBytes(32))
      .digest("base64url"),
    state: randomBytes(16).toString("base64url"),
    scope: "all",
    redirect_uri: REDIRECT,
  }).toString();

  const session = await chromeLogin("Rema", "with your phone number", (ws) =>
    capture(ws, auth.toString()),
  );
  secretSet("rema", JSON.stringify(session));
  console.error("Rema login stored in the keychain.");
}

async function idToken(s: Session): Promise<string> {
  const res = await fetch(
    `https://securetoken.googleapis.com/v1/token?key=${s.key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: s.refreshToken,
      }),
    },
  );
  if (!res.ok)
    throw new Error(
      `Rema login expired (${res.status}). Run: pnpm receipts login rema`,
    );
  const t = (await res.json()) as { id_token: string; refresh_token: string };
  if (t.refresh_token !== s.refreshToken)
    secretSet("rema", JSON.stringify({ ...s, refreshToken: t.refresh_token }));
  return t.id_token;
}

export async function sync(dir: string): Promise<number> {
  const stored = secretGet("rema");
  if (!stored) throw new Error("No Rema login. Run: pnpm receipts login rema");
  const session = JSON.parse(stored) as Session;
  const headers = {
    Authorization: `Bearer ${await idToken(session)}`,
    "Ocp-Apim-Subscription-Key": env("REMA_SUBSCRIPTION_KEY"),
    "X-App": "Bella",
    "X-Platform": "CLI",
    "X-App-Version": "3.13.0.1181",
    "X-Device-ID": session.deviceId,
    "Accept-Language": "no",
  };
  const get = async (path: string): Promise<unknown> => {
    const res = await fetch(`${API}${path}`, { headers });
    if (!res.ok)
      throw new Error(
        `GET ${path} -> ${res.status}: ${(await res.text()).slice(0, 300)}`,
      );
    return res.json();
  };

  const { transactions } = (await get("/v1/bella/transaction/v2/heads")) as {
    transactions: { id: number }[];
  };
  await mkdir(dir, { recursive: true });
  let added = 0;
  for (const head of transactions) {
    const file = `${dir}/${head.id}.json`;
    if (existsSync(file)) continue;
    const receipt = await get(`/v1/bella/transaction/v2/rows/${head.id}`);
    await writeFile(file, JSON.stringify({ head, receipt }, null, 2));
    added++;
  }
  return added;
}
