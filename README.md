# Avvio payouts demo

A business's own app, paying the people it owes: contractors, sellers,
workers. A payee picks an amount, chooses one of their saved bank accounts (or
adds one), confirms the price, and is paid. This repo is the partner side of
that, small enough to read in one sitting:

- **`api/`**, the business's backend, NestJS + TypeScript. Holds the API key,
  renders the bank form from the corridor definition, registers each payee as
  a beneficiary once, sends payouts with a persisted idempotency key, receives
  and verifies webhooks, polls while the payee is watching, and reconciles
  from the events feed.
- **`web/`**, the business's app, React + TypeScript (Vite), in a phone frame
  beside a console that shows what the backend is doing. It never sees the
  API key: it talks only to its own backend.

Node 18 or newer.

```
cp .env.example .env     # a SANDBOX key, your organization id, the webhook secret
npm install
npm run build            # web/ into web/dist, api/ into api/dist
npm start                # http://localhost:4300
```

> **A local demo, not a server to deploy.** Its own `/api` routes have no
> login: anyone who can reach them can send a payout from your balance. So it
> listens on `127.0.0.1` only, answers `/api` and the app only to requests
> addressed to `localhost`, accepts JSON only, and refuses to start with a
> live key. Your real backend puts your own authentication in front of the
> same calls.

For development with reloads: `npm run dev:api` (Nest, watch mode) and
`npm run dev:web` (Vite on :5173, proxied to the API) in two terminals.

## Setup, once

1. **Sandbox key.** In the Avvio dashboard, open the organization menu and
   choose **Switch to Sandbox**. On the **Developer** page, create an API key
   (Transact). Copy it once into `AVVIO_API_KEY`. The **Organization ID** in
   the page header goes into `AVVIO_ORG_ID`.
2. **Webhook endpoint (optional but recommended).** Expose the local server
   with a tunnel, for example `npx -y cloudflared tunnel --url http://localhost:4300`.
   Still in the Sandbox org, on the **Developer** page, **Webhooks** tab, add
   an endpoint with the tunnel URL plus `/webhooks/avvio` and tick the six
   `payout.*` events. Copy the `whsec_` secret once into
   `AVVIO_WEBHOOK_SECRET`. Without it the demo still works: the backend learns
   every outcome by polling and from the events feed, just a little later.
   Through the tunnel only `/webhooks/avvio` answers; the app and `/api` refuse
   anything that did not come from this machine.
   If your organization uses payout approvals, the dashboard's event list has
   no `payout_approval.*` boxes: the demo learns approval outcomes by polling
   `GET /payouts/approvals/{id}` and from the feed.
3. **Fund the sandbox.** Press **Fund sandbox $1,000** in the console panel, or
   the **Add $10,000** button on the dashboard's Developer page.

## What it does, in order

| Step | Where | What |
|---|---|---|
| Form | `GET /api/corridor` → `CorridorService` | The bank form's fields come from `GET /recipients/{orgId}/corridors`, cached an hour. `BankFormScreen` renders one input per field and runs the CLABE check digit before submitting. Nothing is hardcoded |
| Accounts | `POST /api/payees/:id/accounts` → `AccountsService.add()` | The first account registers the payee with `POST /recipients/{orgId}` (`externalId` = the payee id; the `Idempotency-Key` is the app's `requestId`, derived from the details and a per-visit salt, so resubmitting the same details is the same request). The account kept is `method` from the response, never a position in `paymentMethods`; an account an earlier lost attempt already registered for this payee is adopted from the `BANK_ACCOUNT_ALREADY_LINKED` error; every later one is `POST /recipients/{orgId}/{recipientId}/methods`. The backend keeps `recipientId`, each `destinationAccountId` and `last4`, **never the account number**. `DELETE .../methods/{methodId}` removes one |
| Preview | `GET /api/quote` → `AvvioClient.rates()` | An indicative price for the review screen. The binding rate and fee are on the payout |
| Send | `POST /api/withdrawals` → `WithdrawalsService.create()` | The app sends a `requestId` per confirm screen, so a double tap returns the same withdrawal. The backend enforces what the payee has left (available minus everything already on its way or paid), then calls `POST /payments/organizations/{orgId}/payouts` with the chosen account, a `reference` (`DEMO-…`, the join key), `expectDestination` (the amount the payee was shown) and an `Idempotency-Key` **persisted before sending**. `200` is sent; `202` is held for a human (`awaiting_approval`); a 4xx is final (`error`, nothing was sent) |
| Unknown outcome | `WithdrawalsService.resolve()` | A timeout, a 5xx, a 429, `PAYOUT_OUTCOME_UNKNOWN`: the payout may exist, so the withdrawal becomes `unknown`, **never** `error`. The poller looks it up with `GET /orders?reference=`, and only if it is not there resends with the **same** key (honouring `Retry-After`). A withdrawal a crash left in `creating` is resolved the same way on restart. When the API answers `PAYOUT_OUTCOME_UNKNOWN` it cannot vouch for that key either, so the demo stops resending and only looks up; after 20 lookups it asks the payee to contact support with the reference |
| Learn | `FastPollJob`, every 5 s | `GET /orders/{payoutId}` while the payee is watching, or `GET /payouts/approvals/{id}` while an approval is pending. One read per open withdrawal per tick: the default key limit is 100 a minute, so past about eight open at once rely on webhooks |
| Confirm | `POST /webhooks/avvio` → `WebhooksController` | Raw bytes in, `WebhookVerifier` checks `svix-signature` (HMAC-SHA256 over `id.timestamp.body`, five-minute tolerance, rotation-safe), dedupe on `svix-id`, answer 200, then `EventsService` applies it by `reference`, `payoutId` or `approvalId` |
| Guarantee | `ReconcileJob`, every 30 s | `GET /events?since=` with a persisted cursor, saved page by page. Webhooks are the fast path; the feed is what the books are reconciled from. An event id is remembered only once it was applied. Older feed rows can have `data: null`; they are matched by their top-level `payoutId` |
| Never backwards | `withdrawal-status.ts` | Pure functions. Statuses only move forward, so a late poll or an out-of-order delivery cannot regress `completed` to `pending`. `completed` is not final: it can become `returned` (a bank return days later, `returned_by_bank`, money back) or `failed` (a clawback after settlement, such as `compliance_rejected`, where the money is not assumed back: read `fundsReturned`). `returned`, `failed`, `canceled` and `error` never change again. The app keeps watching a `completed` withdrawal for that reason |

## Try the outcomes

In the sandbox, the last four digits of the account a payee registers decide
what every payout to it does:

| Account (CLABE) | What happens |
|---|---|
| `012180000000070003` | `completed` at about 10 s, then **returned by the bank** at about 40 s |
| `012180000000000002` | shows `processing`, completes at about 60 s |
| `012180000000030001` | fails with `account_invalid`; funds return |
| `012180000000045669` | completes normally |

Add `…0003` and `…45669` for the same payee and pay into each: one comes
back, one settles. The picker keeps both for next time; **Remove** deletes
that payment method on Avvio's side too.

## Tests

```
npm test
```

Node's built-in runner, no extra dependencies. They pin the rules worth
copying: the webhook signature recipe (including a rotation and a tampered
body), the forward-only status machine (a bank return after `completed`,
out-of-order deliveries), and the send path (a timeout resolved with the same
`Idempotency-Key`, a double tap sending once, a 4xx never resent, feed rows
with `data: null`).

## Layout

```
api/src
  main.ts                       boot: raw body for webhooks, validation pipe, listen
  app.module.ts                 wires the modules; serves web/dist when it exists
  config/                       AppConfig from the environment (.env loader included)
  store/                        StateRepository (one JSON file) and LogService
  avvio/                        AvvioClient (the only thing that talks to Avvio),
                                AvvioError, WebhookVerifier, the API types
  payees/                       PayeesService (fixture), AccountsService, controller
  withdrawals/                  withdrawal-status.ts (pure state machine),
                                WithdrawalsService, EventsService, controller
  webhooks/                     POST /webhooks/avvio
  jobs/                         FastPollJob, ReconcileJob
  dashboard/                    /api/state, corridor, quote, log, balance, sandbox fund
api/test                        node:test suites: verifier, status machine, send path
web/src
  api/                          typed client and view types
  hooks/                        useWithdrawalPolling, useBackendLog
  components/                   Screen (body + pinned footer), StatusPill, Console
  screens/                      Home, Accounts, BankForm, Confirm, Withdrawal, Activity
  App.tsx                       state and navigation
```

State lives in `api/data/state.json` (or `DATA_FILE`). Delete it to start over.
