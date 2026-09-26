# Avvio payouts demo

A working example of paying people through the Avvio API: register a payee's
bank account, send them a payout, and track it until the money lands (or comes
back).

It is the **partner side** of an integration, small enough to read in one
sitting:

- **`api/`**: your backend (NestJS + TypeScript). It holds the API key and
  makes every call to Avvio.
- **`web/`**: your app (React + Vite), shown in a phone frame next to a console
  that logs what the backend is doing. It never sees the API key.

Want the full walkthrough, from a new account to a live payout? Read
**[INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md)**. Everything it describes is
implemented here.

## Quick start (about five minutes)

You need Node 18 or newer and an Avvio sandbox key.

**1. Get your sandbox key and organization ID.** Sign in to the Avvio
dashboard, switch the org menu to **Sandbox**, and open **Developer**:

- Create an API key with **Transact** permission. It starts with
  `avvio_test_` and is shown once.
- Copy the **Organization ID** from the page header.

**2. Configure.**

```
cp .env.example .env
```

| Variable | Value |
|---|---|
| `AVVIO_API_KEY` | Your sandbox key (`avvio_test_…`). The demo refuses to start with a live key. |
| `AVVIO_ORG_ID` | Your organization ID. The same ID is used in sandbox and live. |
| `AVVIO_WEBHOOK_SECRET` | Optional. Leave it empty to start; see [Webhooks](#webhooks-optional). |

**3. Run.**

```
npm install
npm run build
npm start
```

Open http://localhost:4300.

**4. Fund and pay.** If your sandbox has no balance yet, press **Fund sandbox
$1,000** in the console. Then, in the phone:

1. Enter an amount and tap **Withdraw**.
2. Tap **+ Add a new account** and use CLABE `012180000000070003`.
3. Continue and confirm. The payout completes after about 10 seconds.
4. Keep watching. About 30 seconds later the bank **returns** it and the money
   is back. This is the case your own ledger most needs to handle.

## Test accounts

In the sandbox, the last digits of the account decide what happens to every
payout sent to it:

| CLABE | Result |
|---|---|
| `012180000000045669` | Completes normally. |
| `012180000000000002` | Stays `processing`, then completes at about 60 s. |
| `012180000000070003` | Completes at about 10 s, then is **returned by the bank** at about 40 s. |
| `012180000000030001` | Fails with `account_invalid`; the funds come back. |

A payee can keep several accounts. **Remove** deletes that account on Avvio's
side too.

## How it works

Each step below is one place in the code. These are the patterns worth
copying into your own backend.

| Step | Code | What it does |
|---|---|---|
| **1. Build the bank form** | `CorridorService` | Reads the required fields from `GET /recipients/{orgId}/corridors`, so no field is hardcoded. |
| **2. Register the account** | `AccountsService.add()` | The first account creates the payee with `POST /recipients/{orgId}`; later ones use `POST /recipients/{orgId}/{recipientId}/methods`. The backend stores only `method.destinationAccountId` and the last 4 digits, **never the account number**. |
| **3. Show a price** | `AvvioClient.rates()` | An indicative quote for the review screen. The binding rate is on the payout itself. |
| **4. Send the payout** | `WithdrawalsService.create()` | `POST /payments/organizations/{orgId}/payouts` with an `Idempotency-Key` **saved before sending**, so a double tap or a retry never pays twice. |
| **5. Handle unknown outcomes** | `WithdrawalsService.resolve()` | After a timeout or 5xx, the payout might exist. The backend looks it up by `reference` and only then retries with the **same** key. It never marks it failed. |
| **6. Get updates** | `WebhooksController`, `FastPollJob` | Verifies each webhook's signature and applies it. It also polls while the payee is watching the screen. |
| **7. Reconcile** | `ReconcileJob` | Reads `GET /events` from a saved cursor every 30 s. Webhooks are fast; the events feed is the record your books should match. |
| **8. Never go backwards** | `withdrawal-status.ts` | A status only moves forward, so a late update can't undo a newer one. `completed` is **not final**: a bank can return the payment days later. |

For the reasoning behind each step, see the
[integration guide](INTEGRATION_GUIDE.md) and the API docs at
https://docs.avvio.xyz.

## Webhooks (optional)

The demo works without webhooks: it learns every outcome by polling and from
the events feed, just a little later. To receive them:

1. Expose the local server, for example with
   `npx -y cloudflared tunnel --url http://localhost:4300`.
2. In the dashboard (Sandbox, **Developer**, **Webhooks** tab), add an endpoint
   with the tunnel URL plus `/webhooks/avvio` and select the `payout.*` events.
3. Copy the `whsec_…` secret into `AVVIO_WEBHOOK_SECRET` and restart.

Through the tunnel only `/webhooks/avvio` answers.

## This is a local demo, not a server to deploy

The demo's own `/api` routes have **no login**: anyone who can reach them could
send a payout from your balance. So it listens on `127.0.0.1` only, answers
only requests addressed to `localhost`, and refuses live keys. Your real backend
puts your own authentication in front of the same calls.

## Development

```
npm test          # webhook signatures, the status machine, the send path
npm run dev:api   # backend in watch mode
npm run dev:web   # app on :5173, proxied to the backend
```

State is kept in `api/data/state.json`. Delete it to start over.

<details>
<summary>Project layout</summary>

```
api/src
  main.ts          boot: raw body for webhooks, validation, listen
  config/          settings from the environment
  store/           state file and console log
  avvio/           AvvioClient (the only code that calls Avvio), errors,
                   WebhookVerifier, API types
  payees/          payees and their bank accounts
  withdrawals/     status machine, sending, applying events
  webhooks/        POST /webhooks/avvio
  jobs/            FastPollJob, ReconcileJob
  dashboard/       state, corridor, quote, log, balance, sandbox funding
api/test           node:test suites
web/src
  screens/         Home, Accounts, BankForm, Confirm, Withdrawal, Activity
  components/      Screen, StatusPill, Console
  hooks/, api/     polling, backend log, typed client
```

</details>

## License

MIT
