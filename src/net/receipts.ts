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

const advice = (message: string): string =>
  process.platform !== "darwin" && /login|\.env/.test(message)
    ? `${message.replace(/\.?\s*(Run:|Copy|—) .*$/, "")}. Connect it again in Settings.`
    : message;

const failure = (source: Source, reason: unknown): string => {
  const m = advice(reason instanceof Error ? reason.message : String(reason));
  return m.toLowerCase().startsWith(source) ? m : `${source}: ${m}`;
};

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
      r.status === "rejected" ? [failure(sources[i], r.reason)] : [],
    ),
  };
}
