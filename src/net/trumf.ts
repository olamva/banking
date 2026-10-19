import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { env } from "./token.ts";

const PAGES = "https://www.trumf.no/trumf-profil/kvitteringer";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

type Purchase = { batchId: string; harKvittering?: boolean };

function find(node: unknown, key: string): unknown {
  if (!node || typeof node !== "object") return undefined;
  if (key in node) return (node as Record<string, unknown>)[key];
  for (const child of Object.values(node)) {
    const hit = find(child, key);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

const revive = (_: string, v: unknown) =>
  v === "$undefined"
    ? undefined
    : typeof v === "string" && v.startsWith("$D")
      ? v.slice(2)
      : v;

function inline(v: unknown, root: unknown, key: string): unknown {
  const path =
    typeof v === "string" && v.startsWith("$")
      ? v.split(`:${key}:`)[1]
      : undefined;
  if (path)
    return inline(
      path
        .split(":")
        .reduce(
          (n, k) => (n as Record<string, unknown> | undefined)?.[k],
          root,
        ),
      root,
      key,
    );
  if (Array.isArray(v)) return v.map((x) => inline(x, root, key));
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => [k, inline(x, root, key)]),
    );
  return v;
}

function flightValue(html: string, key: string): unknown {
  const flight = [
    ...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g),
  ]
    .map((m) => JSON.parse(m[1]!) as string)
    .join("");
  for (const line of flight.split("\n")) {
    const json = line.slice(line.indexOf(":") + 1);
    if (!json.includes(`"${key}"`) || !/^[[{]/.test(json)) continue;
    try {
      const hit = find(JSON.parse(json, revive), key);
      if (hit !== undefined) return inline(hit, hit, key);
    } catch {}
  }
  return undefined;
}

async function page(path: string, key: string): Promise<unknown> {
  const res = await fetch(PAGES + path, {
    headers: {
      Cookie: env("TRUMF_COOKIE"),
      "User-Agent": UA,
      Accept: "text/html",
    },
  });
  if (!res.ok) throw new Error(`GET ${PAGES + path} -> ${res.status}`);
  const value = flightValue(await res.text(), key);
  if (value === undefined)
    throw new Error(
      "Trumf login expired. Copy the Cookie header of a logged-in www.trumf.no page into TRUMF_COOKIE in .env.local",
    );
  return value;
}

export async function sync(dir: string): Promise<number> {
  const purchases = (await page("", "transactionsData")) as Purchase[];
  await mkdir(dir, { recursive: true });
  let added = 0;
  for (const purchase of purchases) {
    const file = `${dir}/${purchase.batchId.replaceAll(":", "-")}.json`;
    if (existsSync(file)) continue;
    const receipt =
      purchase.harKvittering === false
        ? null
        : await page(
            `/${encodeURIComponent(purchase.batchId)}`,
            "purchaseDetails",
          );
    await writeFile(file, JSON.stringify({ purchase, receipt }, null, 2));
    added++;
  }
  return added;
}
