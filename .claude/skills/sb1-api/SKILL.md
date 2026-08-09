---
name: sb1-api
description: Verified contract for the SpareBank 1 personal banking API — base paths, the vendor Accept header, OAuth grants, response envelopes and the quirks that cause 401/403/406. Use when adding or changing any call to api.sparebank1.no, when a request returns an unexpected status, or when interpreting fields in data/raw/.
---

# SpareBank 1 personal banking API

Everything here was confirmed against the live API or read out of the developer
portal's own bundle. The portal serves no OpenAPI spec, and the resource docs in
its catalog are null unless you are logged in — so **this file is the spec**.
The gateway 401s before routing, so you cannot probe paths without a token.

Cross-check against `magnusrodseth/sparebank1-cli` (`src/client.rs`, MIT) — the
only other implementation that has run these endpoints for real.

## Auth

| | |
|---|---|
| Authorize | `https://api.sparebank1.no/oauth/authorize` |
| Token | `https://api.sparebank1.no/oauth/token` |
| Grants accepted | `authorization_code`, `refresh_token` (also `client_credentials` and `jwt-bearer`, but **not for personal clients** — 400 `Could not issue token`) |

`client_id` + `client_secret` go on **every** token request, including refreshes.
Authorize takes `client_id`, `response_type=code`, `redirect_uri`, `state` and
optional `finInst` (skips the bank picker). The redirect URI must match the
registered one exactly. Auth codes expire after **2 minutes**; access tokens
after ~10; the refresh token is the long-lived one and **rotates on every use**.

`api-auth.sparebank1.no` is an alias of `api.sparebank1.no` and behaves
identically; the portal's own config uses the latter.

Two processes refreshing concurrently will invalidate each other's refresh token
and cost a fresh BankID login. Run commands one at a time.

A dead refresh chain must surface as `ReauthRequired`, never as an empty result.

## Requests

Base: `https://api.sparebank1.no/personal/banking`

Every JSON endpoint wants `Accept: application/vnd.sparebank1.v1+json; charset=utf-8`.
Use **v1** even where the catalog lists the resource at version 5 — the version
in the catalog is not the media type version, and v5 is not accepted.

`/transactions/export` is the exception: it returns CSV and needs
`Accept: application/csv;charset=UTF-8`. The JSON Accept gets **406**.

## Endpoints

| Endpoint | Notes |
|---|---|
| `GET /accounts` | `includeCreditCardAccounts`, `includeBsuAccounts`, `includeAskAccounts`, `includePensionAccounts`, `includeCurrencyAccounts` — all default false |
| `GET /accounts/{key}` | |
| `GET /accounts/{key}/details` | loose schema |
| `GET /accounts/{key}/roles` | |
| `POST /accounts/balance` | body `{accountNumber}` |
| `GET /transactions` | `accountKey` (**repeatable**), `fromDate`, `toDate`, `rowLimit` |
| `GET /transactions/classified` | same params, different envelope — see below |
| `GET /transactions/{id}/details` | also `/details/classified` |
| `GET /transactions/export` | CSV, needs the CSV Accept header |
| `GET /common/helloworld` | **404s** under `/personal/banking` — path unconfirmed, do not reach for it |

`accountKey` being repeatable means all accounts can be fetched in one request.
`rowLimit` exists, so there is an unverified pagination ceiling — if a month ever
returns a suspiciously round number of rows, that is why.

**`fromDate`..`toDate` may not exceed five years.** Longer is a
`400 BadRequest`, `Date interval cannot exceed 5 years`. It is a range check,
not a row limit, and it is the reason a full-history sweep is done a month at a
time rather than in one call.

**The credit card answers on the ordinary transactions endpoints.** Its key
comes back only when `includeCreditCardAccounts=true`, it is short and numeric
where a deposit key is a 20-character opaque string, and its `productType` is
`UNKNOWN` and `type` `CREDITCARD`. None of that stops `/transactions/classified`
taking it like any other key. There is no separate credit API to find — the
`/credit/*` paths 403 — and none is needed.

**A customer client gets four APIs, and that is all:** Hello World, Accounts,
Transactions, Transfer. Anything else 403s with an empty body —
`/personal/banking/credit/accounts` and `/credit/cards` among them. This is by
design, not configuration: the client editor has no API access selector, and the
logged-in catalog lists only those four for the customer market.

Do not take the catalog dump as a menu. `/api/applicationcatalog/apis/all` is
reachable without logging in and lists every API in the estate, including
partner and internal ones a customer client can never call. The filtered
`/api/applicationcatalog/apis` is the real entitlement list.

## Envelopes

`GET /accounts` → `{accounts: [{key, name, accountNumber, iban, balance,
availableBalance, currencyCode, type, productType, productId, description,
owner, accountProperties}]}`. `type` is `USER` | `SAVING` | `STOCKSAVING` |
`CREDITCARD`; `productType` is `LOCDEPOSIT` on everything but the card, which
is `UNKNOWN`.

`GET /transactions` → `{transactions: [...], errors: []}`.

`GET /transactions/classified` → the classification wraps the transaction, it is
not merged into it:

```json
{"transactions": [{
  "transaction": { "id": "...", "date": 1785448800000, "amount": -31.9,
                   "description": "...", "cleanedDescription": "...",
                   "typeCode": "R_710", "typeText": "Varer",
                   "bookingStatus": "BOOKED", "source": "HISTORIC",
                   "accountKey": "...", "accountNumber": "...",
                   "currencyCode": "NOK", "canShowDetails": true,
                   "isConfidential": false, "nonUniqueId": "...",
                   "classificationInput": {...}, "detailsUrl": "..." },
  "categories": [{"main": "dagligvarer", "sub": "dagligvarer",
                  "mainI18n": "...", "subI18n": "...", "confidence": 100}],
  "recurring": false,
  "subscription": false
}]}
```

`amount` is signed, negative for money out. `id` is opaque and long;
`nonUniqueId` is not an identifier. A structured merchant exists only on
`/details`, but `cleanedDescription` is the bank's own cleaned merchant string
and is what the row is worth reading for.

Card rows carry more, not less: `mcc`, `mccGroup`, `currencyAmount` +
`currencyCode` for the original currency, and a `creditCardIdentifiers` object.
`-1` (`remoteAccountNumber`) and `-2` (`mcc`, `mccGroup`) are **placeholders for
absent**, not values.

`bookingStatus` is `BOOKED` or `PENDING`, on every account and not only the
card. A pending row has a date like any other, but its `id` is reissued when it
books.

**Only `/details` carries a booking date.** The list endpoints have the single
`date` field, which on a card row is the *purchase* date; `/details` adds
`bookedDate`, `postingDate` and `valueDate` alongside it, one request per
transaction. `canShowDetails: false` on a card row does not stop `/details`
answering for it.

## The date field

`date` is epoch **milliseconds at Norwegian local midnight**. Every timestamp in
a summer month reads `22:00Z` (CEST is UTC+2). Formatting it as UTC shifts every
transaction back a day and pushes the 1st into the previous month.

```ts
new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Europe/Oslo' })  // YYYY-MM-DD
```

## Terms

Personal use only. Rate limits are enforced — one request per call, no retry
loops, surface 429 rather than working around it.

**The limit is published, not documented.** Every response carries
`x-ratelimit-remaining`, and at zero the next call is a `429` — verified, with
the counter on the refusal too. There is no `x-ratelimit-limit` and no
`x-ratelimit-reset`, and SB1 sends **no `Retry-After`**, so the ceiling and the
window can only be observed, never read off. Do not assert a number for either;
`60/hour` was this repo's guess and the API states nothing of the kind.

A 429 costs a request like any other: the local ledger spends before the call
goes out, so a run that pushes past the bank's limit burns budget on refusals.
Credentials are confidential.
