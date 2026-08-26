import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { Accounts } from "./core/exclude.ts";
import { monthsOnDisk, RAW } from "./core/pipeline.ts";
import type { Txn } from "./core/types.ts";

const args = process.argv.slice(2);
const cmd = args[0];
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
const has = (name: string) => args.includes(`--${name}`);
const raise = (msg: string): never => {
  throw new Error(msg);
};

const ACCOUNTS_RAW = `${RAW}/accounts.json`;
const CATEGORY_NAMES = "rules/categories.json";

async function dump(file: string, data: unknown): Promise<void> {
  await mkdir(file.slice(0, file.lastIndexOf("/")), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2));
  console.error(`wrote ${file}`);
}

async function accounts(): Promise<void> {
  const { get } = await import("./net/sb1.ts");
  // Request all five flags. Each flag defaults to false. An account that you
  // omit here is not visible in any later step.
  const include = new URLSearchParams({
    includeCreditCardAccounts: "true",
    includeBsuAccounts: "true",
    includeAskAccounts: "true",
    includePensionAccounts: "true",
    includeCurrencyAccounts: "true",
  });
  const raw = await get(`/personal/banking/accounts?${include}`);
  await dump(ACCOUNTS_RAW, raw);

  type Account = {
    key?: string;
    accountNumber?: string;
    name?: string;
    description?: string;
    type?: string;
  };
  const list = (raw as { accounts?: Account[] }).accounts;
  const found =
    list?.filter((a): a is Account & { key: string } => !!a.key) ?? [];
  if (!found.length) {
    console.error(
      `No accounts[].key found — inspect ${ACCOUNTS_RAW} and adjust before syncing.`,
    );
    return;
  }
  if (!existsSync("rules/accounts.json")) {
    const card = (a: Account) => a.type === "CREDITCARD";
    await dump(
      "rules/accounts.json",
      Object.fromEntries(
        found.map((a) => [
          a.key,
          {
            mine: !card(a),
            ...(card(a) ? { card: true } : {}),
            name: (card(a) ? a.description : a.name) ?? a.name ?? a.key,
            number: a.accountNumber,
          },
        ]),
      ),
    );
  }
  console.error(`${found.length} account keys.`);
}

// The page reads one payload and aggregates in the browser, so the hosted build
// needs a file and not an endpoint. `pnpm dev` still reads the database live.
async function exportWeb(): Promise<void> {
  const { openDb, queryRange } = await import("./core/db.ts");
  const { DB_FILE, WEB } = await import("./core/pipeline.ts");
  const db = openDb(DB_FILE);
  try {
    await mkdir(WEB, { recursive: true });
    const file = `${WEB}/txns.json`;
    await writeFile(
      file,
      JSON.stringify({
        txns: queryRange(db, "0000-00", "9999-99"),
        names: existsSync(CATEGORY_NAMES)
          ? JSON.parse(await readFile(CATEGORY_NAMES, "utf8"))
          : {},
      }),
    );
    console.error(`wrote ${file}`);
  } finally {
    db.close();
  }
}

async function reconcileCmd(): Promise<void> {
  const { normalizeMonth } = await import("./core/normalize.ts");
  const { reconcile, unexplained } = await import("./core/reconcile.ts");
  const accounts: Accounts = JSON.parse(
    await readFile("rules/accounts.json", "utf8"),
  );
  const snap = JSON.parse(await readFile(ACCOUNTS_RAW, "utf8")) as {
    accounts?: Array<{ key: string; balance: number }>;
  };
  if (!snap.accounts?.length) {
    raise(`No balances in ${ACCOUNTS_RAW} — run \`pnpm sb1 accounts\` first.`);
  }
  const balances = new Map(snap.accounts!.map((a) => [a.key, a.balance]));

  const txns: Txn[] = [];
  for (const month of monthsOnDisk())
    txns.push(...normalizeMonth(`${RAW}/${month}`));

  const kr = (n: number) =>
    n.toLocaleString("nb-NO", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const lines = reconcile(txns, accounts, balances);
  const col = (s: string) => s.padStart(15);
  console.log(
    `${"account".padEnd(18)}${col("opening")}${col("+ rows")}${col("= expected")}${col("bank says")}${col("gap")}`,
  );
  for (const l of lines)
    console.log(
      `${l.name.padEnd(18)}${col(kr(l.opening))}${col(kr(l.rows))}${col(kr(l.expected))}${col(kr(l.actual))}${col(kr(l.gap))}`,
    );

  const bad = unexplained(lines);
  console.error(
    bad.length
      ? `\n${bad.length} account(s) do not add up. Either the balances are stale — ` +
          `\`pnpm sb1 accounts\` — or rows are missing, or an "opening" is owed in rules/accounts.json:\n` +
          bad.map((l) => `  ${l.name}: ${kr(l.gap)}`).join("\n")
      : `\nEvery account adds up. The history explains the money.`,
  );
}

try {
  if (cmd === "login") await (await import("./net/sb1.ts")).login();
  else if (cmd === "accounts") await accounts();
  else if (cmd === "sync") {
    const { syncMonth, syncRange, thisMonth } = await import("./net/sync.ts");
    const from = flag("from");
    const to = flag("to");
    const stale = flag("stale");
    if (stale !== undefined && !(Number(stale) > 0))
      raise("--stale wants minutes, e.g. --stale 60");
    const force = stale === undefined ? has("force") : Number(stale);
    if (from || to) {
      if (!from) raise("sync needs --from, as YYYY or YYYY-MM");
      await syncRange(from!, to ?? thisMonth(), force);
    } else {
      await syncMonth(
        flag("month") ?? raise("sync needs --month YYYY-MM"),
        force,
      );
    }
  } else if (cmd === "rebuild")
    await (await import("./core/pipeline.ts")).rebuildAll();
  else if (cmd === "export") await exportWeb();
  else if (cmd === "reconcile") await reconcileCmd();
  else if (cmd === "budget") {
    const left = (await import("./net/budget.ts")).remaining();
    console.error(
      left === null
        ? "SB1 has not said what is left recently — the next request will ask."
        : `SB1 last reported ${left} requests left; it refills continuously.`,
    );
  } else {
    console.error(
      "usage: pnpm sb1 <login | accounts | rebuild | budget | export",
    );
    console.error(
      "                | sync --month YYYY-MM [--force | --stale MINUTES]",
    );
    console.error(
      "                | sync --from YYYY[-MM] [--to YYYY[-MM]] [--force | --stale MINUTES]",
    );
    console.error(
      "                    (--to defaults to this month; one request per five years)",
    );
    console.error(
      "                | reconcile  (does the history explain the balances?)>",
    );
    console.error("\nthe dashboard is `pnpm dev`");
    process.exit(1);
  }
} catch (e) {
  console.error(e instanceof Error && !process.env.DEBUG ? e.message : e);
  process.exit(1);
}
