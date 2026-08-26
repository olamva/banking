import {
  clearCookie,
  origin,
  redirect,
  SESSION_COOKIE,
} from "../../src/auth/session.ts";

export const config = { runtime: "edge" };

export default function handler(request: Request): Response {
  return redirect(`${origin(request)}/`, [clearCookie(SESSION_COOKIE)]);
}
