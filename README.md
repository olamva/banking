# banking

Personal spending analysis over my SpareBank 1 accounts and credit card. The code pulls raw transactions to disk one time. It then does everything else offline. This is a private repo for one user.

```
data/raw/  ──normalize──►  Txn  ──exclude──►  ──categorize──►  SQLite
                                (transfers)   (categories)        │
                                                  pnpm dev ◄──────┘
```

Six bank accounts and one credit card supply the data. The code flags internal transfers and card bill payments, so that they do not count two times.

## Setup

You need Node 24 or later, for the built-in TypeScript execution and `node:sqlite`. You also need pnpm.

```bash
pnpm install
pnpm dev                            # http://localhost:4000
```

`.env.local` holds the SB1 credentials, and only the online commands read it. It is not in git, and `data/` and `rules/` are not either, so a fresh clone or worktree starts empty:

```bash
pnpm worktree:link                  # symlink .env.local, data and rules back
pnpm dev                            # its own port in 4010-4089, and its own database
```

## Commands

```bash
ln -s "$PWD/src/bank.ts" ~/.local/bin/banking   # one time. Runs from any directory

banking balances
banking transactions --from 2026-08-01 --to 2026-08-31
banking transaction <id>
banking totals --from 2026-01-01 --to 2026-08-31
```

The CLI writes JSON. It reads this checkout, even when another directory is current. It never calls SB1 or Azure. Use `pnpm bank <command>` to skip the link.

```bash
# online. These are the only commands that touch the network
pnpm sb1 login                      # BankID in the browser. Refresh token to the keychain
pnpm sb1 accounts                   # writes data/raw/accounts.json and rules/accounts.json

# offline
pnpm sb1 rebuild                    # rebuild data/banking.db from data/raw/, after a rules edit
pnpm sb1 reconcile                  # does the history explain the balances?
pnpm sb1 match "<pattern>"          # which rows does a rule pattern claim?
pnpm sb1 budget                     # what SB1 last reported as left of its limit

pnpm build                          # vite build -> data/dist. The hosted page only
pnpm deploy                         # push the code, the page and the rules to Azure
pnpm rules:pull                     # bring the rules the hosted site holds back here

pnpm dev                            # the dashboard on :4000
pnpm test                           # node --test, no framework
pnpm typecheck
```

## The dashboard

`pnpm dev` runs Vite. The app is `src/web/app/`. `/api/txns`, `/api/refresh` and `/api/rules` are one plugin in `vite.config.ts`. The browser computes everything, because the page imports `src/core/stats.ts` directly. Local work needs no build step.

Three views. _Dashboard_ shows the tiles and the charts. _Transactions_ shows the rows behind them. One pair of pickers chooses what both show. _Rules_ edits the category files, and it takes no period and no filter. A delta compares against one year back.

Categories, merchants, accounts and countries each filter as two lists. In a picker, a click cycles: include, then exclude, then off. A meta-click jumps to exclude. An exclusion wins. None means all.

The page lists subscriptions per subscription, not per charge. _Per month_ shows the last payment, not the average.

Every rule save writes a snapshot to `rules/.history/`. _Undo the last change_ steps back one edit, and the version list restores any older state. Nothing leaves the history. The site edits its own copy, so `pnpm deploy` stops when the site holds an edit that this machine does not, and it names `pnpm rules:pull`.

Refresh is the only control on the page that touches the network. It fetches the months that can still change, rebuilds `data/banking.db` and reloads the page. One refresh runs at a time. A typical press is one request.

A month closes four days after it ends, which is the window a late card row books in. Only the open months cost a request. The code drops a pending row rather than counting it, so press Refresh again to collect the tail.

To make the bank restate a month, delete `data/raw/<month>/*.json` and press Refresh. There is no force flag. `pnpm sb1 reconcile` is what tells you a month is owed.

Never share the dashboard. It holds every transaction you have, and so does a screenshot. It has two homes and no third one: `127.0.0.1` here, and the private Azure site below.

## The hosted dashboard

The same page runs on Azure Container Apps, behind Google sign-in, so that a phone can read it away from this wifi. Only an address in `ALLOWED_EMAILS` gets in. The site scales to zero, so the first request after an idle period waits a few seconds.

Easy Auth runs the Google login exchange and passes the identity in `X-MS-CLIENT-PRINCIPAL`.
It passes anonymous requests to the server so that traffic logs include them.
The server redirects anonymous requests to Google login before it serves any route.
`src/web/principal.ts` decodes the identity header.
`allowed()` in `src/auth/session.ts` checks the address against `ALLOWED_EMAILS`.
An empty list denies everybody. `test/web/` checks the access controls.

`src/web/server.ts` serves `data/dist` and the same three endpoints, on `node:http` and no framework. An Azure Files share mounts at `/data`. It holds `data/raw`, the database, the rules and the request ledger. The image holds only the code and the built page, so a scale to zero loses nothing.

Terraform owns the resources. `pnpm deploy` owns their contents. The registry builds the image, so this machine needs no container runtime.

### Traffic

Run `pnpm traffic` to group the last 30 days of requests by browser header and forwarded IP addresses.
The command reads Azure logs. It needs an Azure CLI login and an initialized Terraform backend.
Install the Azure CLI `log-analytics` extension if the command requests it.
Open **banking-dashboard-traffic → Logs** in Azure Portal to run [the same query](infra/traffic.kql).

The report separates allowed, denied, and anonymous requests.
The report shows times in `Europe/Oslo`.
An allowed request passes the email check. Its response can still contain an error.
A request count is not a visit count. One page can request several files.
Compare new visits from each device with the report to identify their browser headers and IP addresses.
Arc can report a Chrome browser header. Safari on an iPhone usually includes `iPhone` in its header.
IP addresses can change or be shared. Headers can be forged. Neither proves who sends a request.

The server records time, method, path, browser header, forwarded IP addresses, access result, status, and duration.
It removes query strings and excludes cookies, authentication headers, email addresses, request bodies, and response bodies.
Azure retains console logs for 30 days. Azure log ingestion charges apply.
Requests that Azure handles before the server, including `/.auth/*`, do not appear in this report.
Use the Azure **Requests** metric for total ingress counts.
Native HTTP logs remain disabled because they store authentication query values without a supported ingestion transformation.

Deploy the server before applying the Terraform changes when upgrading an existing site.
Run `pnpm deploy`, then `terraform -chdir=infra apply`, from the main checkout after merging this change.
Logging starts after activation. Earlier requests cannot be recovered.

### Setting it up

The SB1 values arrive last, because the developer portal wants a redirect before it issues a client.

1. Create a Google **OAuth client ID** of type **Web application**.
2. Copy `infra/terraform.tfvars.example` to `infra/terraform.tfvars`. Fill in the subscription, the allowlist and the two Google values. Leave the four SB1 values empty.
3. Run `infra/bootstrap.sh`, then `terraform -chdir=infra init`, then `terraform -chdir=infra apply`. It prints `google_redirect_uri`.
4. Add that URI to the **Authorised redirect URIs** of the Google client. It must match exactly.
5. Run `pnpm deploy`. The page now works, and it reads an empty database.
6. Register a **second SpareBank 1 client** in the developer portal. The BankID login runs on this machine, so the redirect is a localhost URL. Use a port that the first client does not use.
7. Put the four SB1 values in `infra/terraform.tfvars` and apply again.
8. Run `pnpm seed:azure`. The token lands in Key Vault instead of the keychain. Do not use `pnpm sb1 login`, which reads `.env.local` and would put the token of this machine in the vault.
9. Open the site and press Refresh.

SB1 rotates the refresh token on every exchange, so two processes on one chain invalidate each other. The second client gives Azure an independent chain. The compute scales to zero, and only the registry and the file share bill whatever happens. Both are small.

### Staying inside the rate limit

The SB1 quota is 60 requests each hour for each API. Every response publishes `x-ratelimit-remaining`. `data/api-budget.json` keeps the last figure and its timestamp, and `sb1.get` refuses when the bank reports zero.

A refresh prices the whole sweep first, and the pricing costs nothing. It stops rather than fails, and a second press resumes it. `accountKey` is repeatable and a date range may be five years wide, so one request covers up to five years and every account.

## Categories

The bank labels its own transactions, and it is wrong often enough to matter. The rules live in `rules/`, and none of them are in git.

`rules/categories.json` maps a case-insensitive substring to a category. The code checks it against the description, the merchant and the account number of the payee.

```json
{ "Munkegata 34": "faste_utgifter/boligutgifter" }
```

A pattern inside slashes is a **regex**. `"/\\bleie\\b/"` catches `Leie Juni`, and it does not catch `utleie`. Note the doubled backslash, because this is JSON. A bare street name catches every shop on that street.

Every line must work in any position. Narrow the _pattern_ to fix two lines that compete. Never move a line. A refusal lookahead and a requirement lookahead do this, and they consume nothing:

```json
{
  "/^(?!.*(?:sit kafe|sit storkiosk))(?=.*\\bsit\\b)/": "faste_utgifter/boligutgifter"
}
```

`pnpm sb1 match "<pattern>"` counts the rows that a pattern claims. It reads the name **before** any rename in `rules/payees.json`, so a pattern tested against the database can pass and then claim nothing. `pnpm sb1 rebuild` warns about every line that still depends on its position, and it prints the narrowed form.

The other four files:

- `rules/giro.json` — what the _lump_ transfers of one person are. The row type shows how the money moved and never why.
- `rules/family.json` — relatives. **The sign decides what an entry means.** Money in is `innskudd/familie`. Money out is a repayment. An entry may be an account number.
- `rules/payees.json` — the one name that a payee goes by. A landlord who writes the month into every payment is eleven payees to any count by name.
- `rules/subscriptions.json` — the same patterns, setting `isSubscription`. This is a second axis and not a category.

`src/core/names.ts` cleans a name that **no** pattern claims: the `, CITY, COUNTRY` card tail, a BankAxept street and city, and ALL CAPS. It never touches a claimed name, because that would return `Ikea` and `H&m`.

A person-to-person Vipps payment needs **no rule**. A bare `Vipps*` marker is not enough, because Vipps bills merchants too. On the card the bank files a peer row as `diverse/overforing`, from `mcc: 4829`. On the deposit accounts Vipps doubles its own marker.

`/categories` in Claude Code suggests patterns for a merchant with real money behind it that lands in `ukategorisert`. Run `pnpm sb1 rebuild` after you accept a change.

## Layout

```
src/net/       may make requests
src/core/      may not. Both Node and the browser import it
src/web/app/   the React app
src/web/server.ts  the hosted site: the page, /api/txns, /api/refresh, /api/rules
src/auth/      allowed(), the whole access rule. Pure and tested
src/cli.ts     command dispatch
vite.config.ts pnpm dev: the app plus the same three endpoints
infra/         terraform for Azure, the deploy script and the rules pull
test/          node --test, mirroring src/
rules/         the rules as JSON, gitignored
rules/.history/  one file for each version of a rule file. Undo reads it
```

React, Vite and Tailwind. The Azure SDK reads the refresh token out of Key Vault, and it loads only where a vault is named. Everything else uses the Node standard library, including SQLite, HTTP and TypeScript execution. There is no ORM, no chart library, no component library and no state manager. The charts are hand-written SVG. `data/raw/` is the source of truth, and the database is derived. Analysis never calls the API. Any code that sums money leaves a test behind.

`.claude/CLAUDE.md` holds the rest, including the exclusion rules and the reasons for them.
