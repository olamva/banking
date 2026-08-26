const enc = new TextEncoder();
const dec = new TextDecoder();

export const SESSION_COOKIE = "bank_session";
export const OAUTH_COOKIE = "bank_oauth";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
export const OAUTH_MAX_AGE = 600;

const b64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const unb64url = (s: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
    c.charCodeAt(0),
  );

const hmacKey = (secret: string): Promise<CryptoKey> =>
  crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );

export type Session = { email: string; exp: number };

export async function signSession(
  secret: string,
  session: Session,
): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(session)));
  const mac = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret),
    enc.encode(body),
  );
  return `${body}.${b64url(new Uint8Array(mac))}`;
}

export async function readSession(
  secret: string,
  token: string | undefined,
  now = Date.now(),
): Promise<Session | null> {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  try {
    const ok = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret),
      unb64url(token.slice(dot + 1)),
      enc.encode(body),
    );
    if (!ok) return null;
    const s = JSON.parse(dec.decode(unb64url(body))) as Session;
    return typeof s.email === "string" &&
      typeof s.exp === "number" &&
      s.exp > now
      ? s
      : null;
  } catch {
    return null;
  }
}

export function cookie(request: Request, name: string): string | undefined {
  for (const part of request.headers.get("cookie")?.split(";") ?? []) {
    const c = part.trim();
    if (c.startsWith(`${name}=`))
      return decodeURIComponent(c.slice(name.length + 1));
  }
  return undefined;
}

export const setCookie = (
  name: string,
  value: string,
  maxAge: number,
): string =>
  `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

export const clearCookie = (name: string): string =>
  `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

/** An empty list denies everybody. A missing variable must never open the door. */
export function allowed(email: string, list: string | undefined): boolean {
  const want = email.trim().toLowerCase();
  if (!want) return false;
  return (list ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(want);
}

/** `//host` and `/\host` are absolute to a browser, so both must fail here. */
export function safeNext(next: string | null | undefined): string {
  return next &&
    next.startsWith("/") &&
    !next.startsWith("//") &&
    !next.startsWith("/\\")
    ? next
    : "/";
}

export function sameNonce(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

type Claims = {
  iss?: string;
  aud?: string;
  exp?: number;
  email?: string;
  email_verified?: boolean;
};

const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

/**
 * No signature check. The token arrives straight from the Google token endpoint
 * over TLS, which OpenID Connect 3.1.3.7 accepts as proof of origin. A token
 * that reaches this code by any other route must not be trusted.
 */
export function idTokenEmail(
  token: string,
  clientId: string,
  now = Date.now(),
): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  let claims: Claims;
  try {
    claims = JSON.parse(dec.decode(unb64url(parts[1]!))) as Claims;
  } catch {
    return null;
  }
  if (!claims.email || claims.email_verified !== true) return null;
  if (claims.aud !== clientId) return null;
  if (!ISSUERS.has(claims.iss ?? "")) return null;
  // exp is seconds, not milliseconds.
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= now) return null;
  return claims.email;
}

/** Vercel serves the deployment behind a proxy, so request.url carries the internal host. */
export function origin(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? url.host;
  const proto =
    request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export const redirect = (to: string, cookies: string[] = []): Response =>
  new Response(null, {
    status: 302,
    headers: [
      ["Location", to],
      ["Cache-Control", "no-store"],
      ...cookies.map((c) => ["Set-Cookie", c] as [string, string]),
    ],
  });
