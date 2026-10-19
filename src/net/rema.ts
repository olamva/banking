import { spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { env, keychainGet, keychainSet } from "./token.ts";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const REDIRECT = "https://ae-appen.appspot.com/redirect/redirect.html";
const API = "https://api.rema.no";
const LOGIN_MINUTES = 5;

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

async function devtoolsPort(profile: string): Promise<string> {
  for (let i = 0; i < 100; i++) {
    const file = await readFile(
      join(profile, "DevToolsActivePort"),
      "utf8",
    ).catch(() => "");
    if (file) return file.split("\n")[0]!;
    await sleep(100);
  }
  throw new Error("Chrome did not open a DevTools port");
}

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

  const timeout = new AbortController();
  const profile = await mkdtemp(join(tmpdir(), "rema-login-"));
  const chrome = spawn(
    CHROME,
    [
      `--user-data-dir=${profile}`,
      "--remote-debugging-port=0",
      "--no-first-run",
      "--no-default-browser-check",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  try {
    const port = await devtoolsPort(profile);
    const targets = (await (
      await fetch(`http://127.0.0.1:${port}/json/list`)
    ).json()) as { type: string; webSocketDebuggerUrl: string }[];
    const page = targets.find((t) => t.type === "page");
    if (!page) throw new Error("Chrome opened no page");
    console.error(
      `Log in with your phone number in the Chrome window (${LOGIN_MINUTES} min).`,
    );
    const session = await Promise.race([
      capture(new WebSocket(page.webSocketDebuggerUrl), auth.toString()),
      sleep(LOGIN_MINUTES * 60_000, null, { signal: timeout.signal }).then(
        () => {
          throw new Error("Rema login timed out");
        },
      ),
    ]);
    keychainSet("rema", JSON.stringify(session));
    console.error("Rema login stored in the keychain.");
  } finally {
    timeout.abort();
    chrome.kill();
    await rm(profile, { recursive: true, force: true });
  }
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
    keychainSet(
      "rema",
      JSON.stringify({ ...s, refreshToken: t.refresh_token }),
    );
  return t.id_token;
}

export async function sync(dir: string): Promise<number> {
  const stored = keychainGet("rema");
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
