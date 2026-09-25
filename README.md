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
3. **Fund the sandbox.** Press **Fund sandbox $1,000** in the console panel, or
   the **Add $10,000** button on the dashboard's Developer page.

## What it does, in order

| Step | Where | What |
|---|---|---|
| Form | `GET /api/corridor` → `CorridorService` | The bank form's fields come from `GET /recipients/{orgId}/corridors`, cached an hour. `BankFormScreen` renders one input per field and runs the CLABE check digit before submitting. Nothing is hardcoded |
| Accounts | `POST /api/payees/:id/accounts` → `AccountsService.add()` | The first account registers the payee with `POST /recipients/{orgId}` (`externalId` = the payee id, persisted `Idempotency-Key`); every later one is `POST /recipients/{orgId}/{recipientId}/methods`. The backend keeps `recipientId`, each `destinationAccountId` and `last4`, **never the account number**. `DELETE .../methods/{methodId}` removes one |
| Preview | `GET /api/quote` → `AvvioClient.rates()` | An indicative price for the review screen. The binding rate and fee are on the payout |
| Send | `POST /api/withdrawals` → `WithdrawalsService.create()` | `POST /payments/organizations/{orgId}/payouts` with the chosen account, a `reference` (`DEMO-…`, the join key) and an `Idempotency-Key` **persisted before sending**. A network failure retries with the same key; a replay returns the same payout. `200` is sent; `202` is held for a human (`awaiting_approval`) |
| Learn | `FastPollJob`, every 5 s | `GET /orders/{payoutId}` while the payee is watching, or `GET /payouts/approvals/{id}` while an approval is pending |
| Confirm | `POST /webhooks/avvio` → `WebhooksController` | Raw bytes in, `WebhookVerifier` checks `svix-signature` (HMAC-SHA256 over `id.timestamp.body`, five-minute tolerance, rotation-safe), dedupe on `svix-id`, answer 200, then `EventsService` applies it by `reference`, `payoutId` or `approvalId` |
| Guarantee | `ReconcileJob`, every 30 s | `GET /events?since=` with a persisted cursor. Webhooks are the fast path; the feed is what the books are reconciled from |
| Never backwards | `withdrawal-status.ts` | Pure functions. Statuses only move forward, so a late poll or an out-of-order delivery cannot regress `completed` to `pending`. `payout.returned` moves `completed` to `returned`: a bank return days later, which is the case most integrations get wrong |

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

## Testing against a local Avvio backend

From `anzolabs-B2B-backend`, with local Postgres running:

```
# 1. a scratch database, migrated from empty (your dev database is untouched)
psql -h localhost -U postgres -c "CREATE DATABASE avvio_demo_local"
DATABASE_URL="postgresql://postgres@localhost:5432/avvio_demo_local?sslmode=disable" npx prisma migrate deploy

# 2. a partner organization and a sandbox key; it prints AVVIO_API_KEY and AVVIO_ORG_ID
DATABASE_URL="postgresql://postgres@localhost:5432/avvio_demo_local?sslmode=disable" \
  NODE_OPTIONS=--conditions=import npx ts-node scripts/seed-e2e-org.ts

# 3. the API on :3000
npx prisma generate && npm run build
DATABASE_URL="postgresql://postgres@localhost:5432/avvio_demo_local?sslmode=disable" NODE_ENV=development PORT=3000 \
  ALLOWED_ORIGINS="http://localhost:4300" node dist/src/main.js
```

Then in this folder set `.env` to the printed key and org id with
`AVVIO_BASE_URL=http://localhost:3000/api/v1`, and register a local webhook
endpoint (plain `http://localhost` is accepted only by a development backend):

```
curl -s -X POST http://localhost:3000/api/v1/payments/organizations/$AVVIO_ORG_ID/sandbox/webhook-endpoints \
  -H "x-api-key: $AVVIO_API_KEY" -H 'content-type: application/json' \
  -d '{"url":"http://localhost:4300/webhooks/avvio","events":["payout.pending","payout.processing","payout.completed","payout.failed","payout.returned","payout.canceled"]}'
```

Put the returned `whsec_` secret into `AVVIO_WEBHOOK_SECRET` and `npm start`.

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
web/src
  api/                          typed client and view types
  hooks/                        useWithdrawalPolling, useBackendLog
  components/                   Screen (body + pinned footer), StatusPill, Console
  screens/                      Home, Accounts, BankForm, Confirm, Withdrawal, Activity
  App.tsx                       state and navigation
```

State lives in `api/data/state.json` (or `DATA_FILE`). Delete it to start over.
