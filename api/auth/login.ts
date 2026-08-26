import {
  OAUTH_COOKIE,
  OAUTH_MAX_AGE,
  origin,
  redirect,
  safeNext,
  setCookie,
} from "../../src/auth/session.js";

export const config = { runtime: "edge" };

export default function handler(request: Request): Response {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId)
    return new Response("GOOGLE_CLIENT_ID is not set\n", { status: 500 });

  const nonce = crypto.randomUUID();
  const next = safeNext(new URL(request.url).searchParams.get("next"));

  const google = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  google.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${origin(request)}/api/auth/callback`,
    response_type: "code",
    scope: "openid email",
    state: nonce,
    prompt: "select_account",
  }).toString();

  return redirect(google.toString(), [
    setCookie(OAUTH_COOKIE, `${nonce}|${next}`, OAUTH_MAX_AGE),
  ]);
}
