#!/usr/bin/env node

import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { openDb, queryRange } from "./core/db.ts";
import {
  NO_FILTERS,
  inRange,
  matchesFilters,
  type Filters,
} from "./core/select.ts";
import { totals } from "./core/stats.ts";
import type { Categorized } from "./core/types.ts";

type Options = {
  from: string | null;
  to: string | null;
  search: string;
  account: string[];
  category: string[];
  includeExcluded: boolean;
  limit: number | null;
};

const APP_ROOT = resolve(import.meta.dirname, "..");
const DATA_DIR = process.env.DATA_DIR || resolve(APP_ROOT, "data");
const RULES_DIR = process.env.RULES_DIR || resolve(APP_ROOT, "rules");
const DB_FILE = process.env.DB_FILE || resolve(DATA_DIR, "banking.db");
const RAW = resolve(DATA_DIR, "raw");

const usage = `usage: banking <command> [options]

commands:
  balances                     Read the cached account balances
  transactions                 Read transaction history
  transaction <id>             Read one transaction
  totals                       Calculate income, spending and net

options:
  --from YYYY-MM-DD
  --to YYYY-MM-DD
  --account NAME               Repeat to include more accounts
  --category MAIN[/SUB]        Repeat to include more categories
  --search TEXT
  --include-excluded
  --limit N                    Transactions only`;

const fail = (message: string): never => {
  throw new Error(message);
};

function value(args: string[], index: number, option: string): string {
  return args[index + 1] ?? fail(`${option} needs a value.`);
}

export function parseOptions(args: string[]): Options {
  const options: Options = {
    from: null,
    to: null,
    search: "",
    account: [],
    category: [],
    includeExcluded: false,
    limit: null,
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--from") options.from = value(args, i++, arg);
    else if (arg === "--to") options.to = value(args, i++, arg);
    else if (arg === "--search") options.search = value(args, i++, arg);
    else if (arg === "--account") options.account.push(value(args, i++, arg));
    else if (arg === "--category") options.category.push(value(args, i++, arg));
    else if (arg === "--include-excluded") options.includeExcluded = true;
    else if (arg === "--limit") {
      const limit = Number(value(args, i++, arg));
      if (!Number.isInteger(limit) || limit < 1)
        fail("--limit must be a positive integer.");
      options.limit = limit;
    } else fail(`Unknown option: ${arg}`);
  }
  for (const [name, date] of [
    ["--from", options.from],
    ["--to", options.to],
  ])
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date))
      fail(`${name} must use YYYY-MM-DD.`);
  if (options.from && options.to && options.from > options.to)
    fail("--from must not follow --to.");
  return options;
}

function rows(options: Options): Categorized[] {
  if (!existsSync(DB_FILE))
    fail(`No database at ${DB_FILE}. Run \`pnpm sb1 rebuild\`.`);
  const db = openDb(DB_FILE);
  try {
    const fromMonth = options.from?.slice(0, 7) ?? "0000-00";
    const toMonth = options.to?.slice(0, 7) ?? "9999-99";
    const filters: Filters = {
      ...NO_FILTERS,
      accounts: options.account,
      categories: options.category,
      search: options.search,
      showExcluded: options.includeExcluded,
    };
    return queryRange(db, fromMonth, toMonth)
      .filter((row) => inRange(row, options.from, options.to))
      .filter((row) => matchesFilters(row, filters));
  } finally {
    db.close();
  }
}

function balances(): unknown {
  const snapshot = `${RAW}/accounts.json`;
  const rulesFile = `${RULES_DIR}/accounts.json`;
  if (!existsSync(snapshot))
    fail(`No balance snapshot at ${snapshot}. Run \`pnpm sb1 accounts\`.`);
  if (!existsSync(rulesFile)) fail(`No account rules at ${rulesFile}.`);
  const raw = JSON.parse(readFileSync(snapshot, "utf8")) as {
    accounts?: Array<{
      key?: string;
      balance?: number;
      availableBalance?: number;
      currencyCode?: string;
      type?: string;
    }>;
  };
  const rules = JSON.parse(readFileSync(rulesFile, "utf8")) as Record<
    string,
    { name?: string }
  >;
  return {
    capturedAt: statSync(snapshot).mtime.toISOString(),
    accounts: (raw.accounts ?? []).flatMap((account) => {
      const name = account.key ? rules[account.key]?.name : undefined;
      return name
        ? [
            {
              name,
              balance: account.balance ?? null,
              availableBalance: account.availableBalance ?? null,
              currency: account.currencyCode ?? null,
              type: account.type ?? null,
            },
          ]
        : [];
    }),
  };
}

export function execute(argv: string[]): unknown {
  const [command, ...args] = argv;
  if (command === "balances") return balances();
  if (command === "transaction") {
    const id = args.shift() ?? fail("transaction needs an id.");
    const found = rows(parseOptions(args)).filter((row) => row.id === id);
    if (found.length === 0) fail(`No transaction has id ${id}.`);
    return found[0];
  }
  if (command === "transactions") {
    const options = parseOptions(args);
    const found = rows(options);
    return options.limit ? found.slice(-options.limit) : found;
  }
  if (command === "totals") {
    const options = parseOptions(args);
    return { from: options.from, to: options.to, ...totals(rows(options)) };
  }
  fail(usage);
}

if (process.argv[1] === import.meta.filename) {
  try {
    console.log(JSON.stringify(execute(process.argv.slice(2)), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
