import { DATA_DIR } from "../core/paths.ts";

export const SOURCES = {
  rema: () => import("./rema.ts"),
  trumf: () => import("./trumf.ts"),
  gmail: () => import("./gmail.ts"),
  coop: () => import("./coop.ts"),
};
export type Source = keyof typeof SOURCES;

export const receiptDir = (source: Source): string =>
  `${DATA_DIR}/raw/receipts/${source}`;

const seed = (message: string): string =>
  process.platform !== "darwin" && /login|\.env/.test(message)
    ? `${message} Then run pnpm receipts:seed.`
    : message;

export async function syncReceipts(): Promise<{
  added: number;
  failed: string[];
}> {
  const sources = Object.keys(SOURCES) as Source[];
  const results = await Promise.allSettled(
    sources.map(async (s) => (await SOURCES[s]()).sync(receiptDir(s))),
  );
  return {
    added: results.reduce(
      (n, r) => n + (r.status === "fulfilled" ? r.value : 0),
      0,
    ),
    failed: results.flatMap((r, i) =>
      r.status === "rejected"
        ? [
            `${sources[i]}: ${seed(r.reason instanceof Error ? r.reason.message : String(r.reason))}`,
          ]
        : [],
    ),
  };
}
