---
name: enable-banking
description: Contract for the Enable Banking AIS API — the only route to the credit card, which SpareBank 1's own API does not expose. JWT auth, the authorisation flow, consent expiry, and the transaction shape. Use when touching src/net/eb.ts, when a call to api.enablebanking.com fails, or when interpreting data/raw/*/eb-*.json.
---

# Enable Banking (AIS)

Enable Banking is a licensed AISP. It holds the PSD2 TPP licence, so we need no
licence and no eIDAS certificate of our own. It exists in this project for one
reason: the SpareBank 1 Mastercard is invisible to SpareBank 1's own customer
API, and reachable through SMN's PSD2 interface as a card account.

Base URL `https://api.enablebanking.com`. Implementation in `src/net/eb.ts`.

## Auth

Every request carries a JWT signed with the application's RSA private key:

- header `{typ: JWT, alg: RS256, kid: <application id>}`
- claims `{iss: "enablebanking.com", aud: "api.enablebanking.com", iat, exp}`

`EB_APP_ID` and `EB_KEY_FILE` come from `.env.local`. The key file is the `.pem`
exported at registration — gitignored, mode 600, and it is the whole credential.

A `403 "Application is not active"` means the app has no linked accounts, not a
bad signature; a bad signature is 401.

## Authorisation flow

`POST /auth` with `{access: {valid_until}, aspsp: {name, country}, state,
redirect_url, psu_type: "personal"}` returns `{url}`. Send the user there for
BankID, catch the redirect, then `POST /sessions {code}` returns
`{session_id, accounts}`.

The redirect URL must be **https** — the portal rejects `http` outright, which is
why the listener runs TLS with a self-signed cert (`localhost-cert.pem` /
`localhost-key.pem`, both gitignored) and the browser warns once per login.

**Consent expires.** `valid_until` is set 90 days out; after that `eb-sync` fails
and `eb-login` must run again. This is normal, not a bug.

`DELETE /sessions/{id}` closes the session and withdraws the bank consent.

## Accounts

The session lists the linked accounts. `cash_account_type` is `CACC` for deposit
accounts and `CARD` for the Mastercard. **Only the card is linked** — the deposit
accounts were unlinked deliberately, because the SB1 API serves them directly and
routing our own data through a third party twice buys nothing. `eb-sync` filters
on `CARD` regardless, so re-linking something by accident does not silently
widen what gets pulled.

## Transactions

`GET /accounts/{uid}/transactions?date_from&date_to`, paginated by
`continuation_key` — follow it until absent or the loop truncates a month.

Fields that matter: `transaction_amount: {amount: string, currency}` — a
**string**, always positive, with direction in `credit_debit_indicator`
(`DBIT`/`CRDT`). `booking_date` and `transaction_date` are plain `YYYY-MM-DD`
strings, unlike SB1's epoch millis. `status` is `BOOK` or `PDNG`; pending rows
are real and appear here, so a month re-synced later can legitimately change.

Fields that are always null on this card: `creditor`, `creditor_account`,
`merchant_category_code`, `bank_transaction_code`, `note`, `reference_number`,
`value_date`, `balance_after_transaction`. `remittance_information` is generic
(`Varekjøp`). The per-transaction endpoint
`GET /accounts/{uid}/transactions/{id}` returns `Forbidden` from the bank, so
there is no merchant detail to be had. Do not build categorisation that assumes
a counterparty on card rows.
