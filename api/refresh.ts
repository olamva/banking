export const config = { runtime: "edge" };

// The dev server runs the real sync at this path. Vercel cannot. SB1 rotates its
// refresh token on every exchange, so a second client kills the token on the Mac
// and gets killed by the next sync there. See CLAUDE.md, "The hosted deployment
// never calls SpareBank 1".
const WHY =
  "Refresh runs on the Mac. SpareBank 1 rotates its refresh token on every use, " +
  "so this deployment cannot hold one. Run Refresh under `pnpm dev`, then " +
  "`pnpm deploy:web` to put the result here.";

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });

export default function handler(request: Request): Response {
  if (
    request.method !== "POST" ||
    request.headers.get("x-banking-refresh") !== "1"
  )
    return json(405, { error: "POST with X-Banking-Refresh: 1" });

  return json(501, { error: WHY });
}
