import { env } from "./token.ts";

export async function requestSource(name: string): Promise<void> {
  const res = await fetch(env("T3_WEBHOOK_URL"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`T3 Code refused the request (${res.status}).`);
}
