import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { Accounts } from "./core/exclude.ts";
import { RULES_DIR } from "./core/paths.ts";
import { monthsOnDisk, RAW } from "./core/pipeline.ts";
import type { Categorized, Txn } from "./core/types.ts";

const args = process.argv.slice(2);
const cmd = args[0];
const raise = (msg: string): never => {
  throw new Error(msg);
};

const ACCOUNTS_RAW = `${RAW}/accounts.json`;

const SHOWN_HITS = 40;

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
  if (!existsSync(`${RULES_DIR}/accounts.json`)) {
    const card = (a: Account) => a.type === "CREDITCARD";
    await dump(
      `${RULES_DIR}/accounts.json`,
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

// A rule reads the name before any rename, and the database holds the name
// after it. A pattern tested against the database therefore lies. This runs the
// pattern over the rows that `categorize` really sees.
async function matchCmd(pattern: string): Promise<void> {
  const { compile, haystackOf } = await import("./core/match.ts");
  const { pipeline } = await import("./core/pipeline.ts");
  const claims = compile(pattern, "match");

  const hits: Categorized[] = [];
  for (const month of monthsOnDisk())
    hits.push(
      ...(await pipeline(month, { rename: false })).filter((t) =>
        claims(haystackOf(t)),
      ),
    );

  for (const t of hits.slice(0, SHOWN_HITS))
    console.log(
      `${t.date}  ${t.amount.toFixed(2).padStart(11)}  ` +
        `${t.category}/${t.subcategory ?? "-"}  ${t.description}`,
    );
  if (hits.length > SHOWN_HITS)
    console.log(`... and ${hits.length - SHOWN_HITS} more`);
  console.error(`\n${hits.length} row(s) claimed by ${pattern}`);
}

async function reconcileCmd(): Promise<void> {
  const { normalizeMonth } = await import("./core/normalize.ts");
  const { reconcile, unexplained } = await import("./core/reconcile.ts");
  const accounts: Accounts = JSON.parse(
    await readFile(`${RULES_DIR}/accounts.json`, "utf8"),
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
  else if (cmd === "sync")
    raise("sync is retired — press Refresh on the dashboard (`pnpm dev`)");
  else if (cmd === "rebuild")
    await (await import("./core/pipeline.ts")).rebuildAll();
  else if (cmd === "reconcile") await reconcileCmd();
  else if (cmd === "match")
    await matchCmd(
      args[1] ?? raise('match wants a pattern: pnpm sb1 match "vy"'),
    );
  else if (cmd === "budget") {
    const left = (await import("./net/budget.ts")).remaining();
    console.error(
      left === null
        ? "SB1 has not said what is left recently — the next request will ask."
        : `SB1 last reported ${left} requests left; it refills continuously.`,
    );
  } else {
    console.error("usage: pnpm sb1 <login | accounts | rebuild | budget");
    console.error(
      "                | match <pattern>  (which rows does a rule claim?)",
    );
    console.error(
      "                | reconcile  (does the history explain the balances?)>",
    );
    console.error(
      "\nthe dashboard is `pnpm dev`. Refresh there syncs and rebuilds.",
    );
    process.exit(1);
  }
} catch (e) {
  console.error(e instanceof Error && !process.env.DEBUG ? e.message : e);
  process.exit(1);
}
