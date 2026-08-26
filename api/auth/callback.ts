import {
  allowed,
  clearCookie,
  cookie,
  idTokenEmail,
  OAUTH_COOKIE,
  origin,
  redirect,
  safeNext,
  sameNonce,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  setCookie,
  signSession,
} from "../../src/auth/session.ts";

export const config = { runtime: "edge" };

const deny = (message: string, status: number): Response =>
  new Response(`${message}\n`, {
    status,
    headers: [
      ["Content-Type", "text/plain; charset=utf-8"],
      ["Cache-Control", "no-store"],
      ["Set-Cookie", clearCookie(OAUTH_COOKIE)],
    ],
  });

export default async function handler(request: Request): Promise<Response> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const sessionSecret = process.env.SESSION_SECRET;
  if (!clientId || !clientSecret || !sessionSecret)
    return deny("The sign-in variables are not set", 500);

  const url = new URL(request.url);
  const failed = url.searchParams.get("error");
  if (failed) return deny(`Google refused the sign-in: ${failed}`, 403);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const jar = cookie(request, OAUTH_COOKIE) ?? "";
  const bar = jar.indexOf("|");
  const nonce = bar === -1 ? "" : jar.slice(0, bar);
  const next = safeNext(bar === -1 ? "/" : jar.slice(bar + 1));

  if (!code || !state || !nonce || !sameNonce(state, nonce))
    return deny("The sign-in did not match its start. Try again.", 400);

  const token = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: `${origin(request)}/api/auth/callback`,
    }),
  });
  if (!token.ok) return deny("Google would not exchange the code.", 502);

  const { id_token } = (await token.json()) as { id_token?: string };
  const email = id_token && idTokenEmail(id_token, clientId);
  if (!email) return deny("Google returned no usable identity.", 403);

  if (!allowed(email, process.env.ALLOWED_EMAILS))
    return deny("That account is not on the list.", 403);

  const session = await signSession(sessionSecret, {
    email,
    exp: Date.now() + SESSION_MAX_AGE * 1000,
  });
  return redirect(`${origin(request)}${next}`, [
    setCookie(SESSION_COOKIE, session, SESSION_MAX_AGE),
    clearCookie(OAUTH_COOKIE),
  ]);
}
