import { DATA_DIR } from "../core/paths.ts";

export const SOURCES = {
  rema: () => import("./rema.ts"),
  trumf: () => import("./trumf.ts"),
  gmail: () => import("./gmail.ts"),
};
export type Source = keyof typeof SOURCES;

export const receiptDir = (source: Source): string =>
  `${DATA_DIR}/raw/receipts/${source}`;

const SEED =
  process.platform === "darwin" ? "" : " Then run pnpm receipts:seed.";

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
            `${sources[i]}: ${r.reason instanceof Error ? r.reason.message : r.reason}${SEED}`,
          ]
        : [],
    ),
  };
}
