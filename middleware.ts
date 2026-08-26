import { next } from "@vercel/functions";
import {
  cookie,
  origin,
  readSession,
  redirect,
  SESSION_COOKIE,
} from "./src/auth/session.js";

// The import above ends `.js`, and the rest of the repo ends `.ts`. The Vercel
// edge builder emits each file as `.js` and does not rewrite the specifier, so
// a `.ts` import fails the deploy. Every file that Vercel alone runs needs this.

// Everything except the sign-in routes. The dashboard bundle and the transaction
// payload are both static files, so only a gate above the CDN can hold them.
export const config = { matcher: ["/((?!api/auth/).*)"] };

export default async function middleware(request: Request): Promise<Response> {
  const secret = process.env.SESSION_SECRET;
  if (!secret)
    return new Response("SESSION_SECRET is not set\n", { status: 500 });

  if (await readSession(secret, cookie(request, SESSION_COOKIE))) return next();

  const url = new URL(request.url);
  const login = new URL("/api/auth/login", origin(request));
  login.searchParams.set("next", `${url.pathname}${url.search}`);
  return redirect(login.toString());
}
