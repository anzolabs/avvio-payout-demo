# Avvio payouts demo

A working example of paying people through the Avvio API. It registers a
payee's bank account, sends them a payout, and tracks it until the money lands,
or until the bank sends it back.

This repo is the **partner side** of an integration: what you build on your
own systems. It has two parts:

- **`api/`**: your backend (NestJS + TypeScript). It holds the API key and
  makes every call to Avvio.
- **`web/`**: your app (React + Vite), shown in a phone frame next to a console
  that logs every call the backend makes. It never sees the API key.

**Contents**

1. [What you need](#1-what-you-need)
2. [Run it locally](#2-run-it-locally)
3. [Your `.env`, explained](#3-your-env-explained)
4. [Try the outcomes](#4-try-the-outcomes)
5. [Receive webhooks (optional)](#5-receive-webhooks-optional)
6. [Build it into your own backend](#6-build-it-into-your-own-backend)
7. [Going live](#7-going-live)
8. [Troubleshooting](#8-troubleshooting)
9. [Tests, development and layout](#9-tests-development-and-layout)

For the full reasoning behind each step, see
**[INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md)** and the API reference at
**https://docs.avvio.xyz**.

---

## 1. What you need

| | Where to get it |
|---|---|
| **Node 18 or newer** | `node -v` to check. |
| **An Avvio dashboard login** | https://business.avvio.xyz. Ask your Avvio contact for an invite if you don't have one. |
| **A sandbox API key** (`avvio_test_…`) | Dashboard → switch the org menu to **Sandbox** → **Developer** → create a key with **Transact** permission. It is shown **once**, so copy it straight into `.env`. |
| **Your organization ID** | The same **Developer** page, in the header. It is the same ID in sandbox and live. |
| **Sandbox funds** | Press **Fund sandbox $1,000** in the demo's console, or ask your Avvio contact. It's test money. |

The sandbox is a full copy of the real API with test money. Nothing you do in
it reaches a real bank.

## 2. Run it locally

```bash
git clone https://github.com/anzolabs/avvio-payout-demo.git
cd avvio-payout-demo
cp .env.example .env        # then fill in AVVIO_API_KEY and AVVIO_ORG_ID
npm install
npm run build
npm start
```

Open **http://localhost:4300**. The console on the right should show your
balance. Then send your first payout:

1. Enter an amount and tap **Withdraw**.
2. Tap **+ Add a new account** and enter CLABE `012180000000070003`.
3. Tap **Continue**, then confirm. The payout completes after about 10 seconds.
4. Keep watching. About 30 seconds later the bank **returns** it and the money
   comes back. This is the case your own ledger most needs to handle.

## 3. Your `.env`, explained

`.env` sits in the repo root, next to `package.json`. It is git-ignored: never
commit it. Real environment variables override it.

| Variable | Required | Default | What it is |
|---|---|---|---|
| `AVVIO_API_KEY` | **Yes** | none | Your sandbox key, starting `avvio_test_`. The key decides the environment: a test key only ever reaches the sandbox. The demo **refuses to start with a live key** (`avvio_live_…`). |
| `AVVIO_ORG_ID` | **Yes** | none | Your organization ID from the Developer page. It's part of most API paths. |
| `AVVIO_BASE_URL` | No | `https://api.avvio.xyz/business/api/v1` | One URL for sandbox and live. Don't change it unless Avvio asks you to. |
| `AVVIO_WEBHOOK_SECRET` | No | empty | The `whsec_…` secret of your webhook endpoint (see [section 5](#5-receive-webhooks-optional)). Leave it empty and the demo learns outcomes by polling instead, a little later. |
| `DESTINATION_CURRENCY` | No | `MXN` | The currency payees receive. MXN is the sandbox currency with test accounts. |
| `PORT` | No | `4300` | The port the demo listens on. |
| `HOST` | No | `127.0.0.1` | The address it listens on. Keep it on loopback; see the note below. |
| `DATA_FILE` | No | `api/data/state.json` | Where the demo keeps its state (payees, accounts, withdrawals). Delete it to start over. |

A minimal `.env`:

```bash
AVVIO_API_KEY=avvio_test_xxxxxxxxxxxxxxxx
AVVIO_ORG_ID=your_org_id
```

> **Keep your key on the server.** It can send money from your balance. Store
> it in a secret manager in your real systems, never in a mobile app, browser
> code or a repository. If a key is exposed, **Rotate** it on the Developer
> page: you get a new key and the old one keeps working for 24 hours while you
> switch.

> **This is a local demo, not a server to deploy.** The demo's own `/api`
> routes have **no login**, so anyone who can reach them could send a payout
> from your balance. That's why it listens on `127.0.0.1`, only answers
> requests addressed to `localhost`, and refuses live keys. Your real backend
> puts your own authentication in front of the same calls.

## 4. Try the outcomes

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

## 5. Receive webhooks (optional)

Webhooks tell your backend the moment a payout changes. The demo works without
them, but your production backend should use them.

1. Expose the demo to the internet with a tunnel:
   ```bash
   npx -y cloudflared tunnel --url http://localhost:4300
   ```
   Copy the `https://….trycloudflare.com` URL it prints.
2. In the dashboard (**Sandbox** → **Developer** → **Webhooks**), add an
   endpoint: the tunnel URL plus `/webhooks/avvio`. Select the six payout
   events: `payout.pending`, `payout.processing`, `payout.completed`,
   `payout.failed`, `payout.canceled` and `payout.returned`.
3. Copy the `whsec_…` secret (shown once) into `AVVIO_WEBHOOK_SECRET` and
   restart with `npm start`.

Only `/webhooks/avvio` answers through the tunnel. The app itself stays
reachable from your machine only. A quick tunnel's URL changes each time you
start it, so update the endpoint when it does.

## 6. Build it into your own backend

This is the part to copy. Your backend needs the same calls the demo makes,
plus your own login and database. Every request carries your key in
`x-api-key`:

```bash
export AVVIO_BASE_URL=https://api.avvio.xyz/business/api/v1
export AVVIO_API_KEY=avvio_test_…
export AVVIO_ORG_ID=…
```

You can also use the official Node SDK, `npm install @avvio/payments`, which
wraps these calls and verifies webhooks for you. Or use plain HTTP, as the demo
does in `api/src/avvio/avvio.client.ts`.

### Step 1: Show the right bank form

Each country needs different bank fields. Ask for them rather than hardcoding
them:

```bash
curl -s "$AVVIO_BASE_URL/recipients/$AVVIO_ORG_ID/corridors?currency=MXN" \
  -H "x-api-key: $AVVIO_API_KEY"
```

Render one input per field and send the values back keyed by each field's
`id`. In the demo, see `CorridorService` and `web/src/screens/BankFormScreen.tsx`.

### Step 2: Register the payee's bank account

```bash
curl -s -X POST "$AVVIO_BASE_URL/recipients/$AVVIO_ORG_ID" \
  -H "x-api-key: $AVVIO_API_KEY" \
  -H "content-type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "type": "individual",
    "name": "Maria Lopez",
    "email": "maria@example.com",
    "externalId": "payee_123",
    "method": {
      "kind": "fiat",
      "currency": "MXN",
      "recipientDetails": { "clabeNumber": "012180000000045669" }
    }
  }'
```

- `externalId` is **your** ID for this payee. Sending it again returns the
  same payee instead of creating a duplicate.
- From the response, save **`id`** (the recipient) and
  **`method.destinationAccountId`** (the account you pay). Save the last 4
  digits for display too.
- **Don't store the full account number.** Avvio holds it; you only need the
  IDs.
- To add another account for the same payee, `POST
  /recipients/{orgId}/{recipientId}/methods` with the same `method` object.
  The new account's `method.destinationAccountId` is in the response.

In the demo, see `AccountsService.add()`.

### Step 3: Send the payout

```bash
curl -s -X POST "$AVVIO_BASE_URL/payments/organizations/$AVVIO_ORG_ID/payouts" \
  -H "x-api-key: $AVVIO_API_KEY" \
  -H "content-type: application/json" \
  -H "Idempotency-Key: 6f1c2d3e-…" \
  -d '{
    "amount": "25.00",
    "destinationAccountId": "<method.destinationAccountId from step 2>",
    "reference": "WD-000123"
  }'
```

- `amount` is what you send, in USD, from your Avvio balance. The payee
  receives it converted, less the fee.
- `reference` is your own ID for this payout. Use it to find the payout later.
- **Save the `Idempotency-Key` in your database before you send.** If the
  request times out, resend with the **same** key: it can never pay twice.
- Optional: `expectDestination` is the amount you showed the payee. If the
  rate has moved more than 2% since then, the payout is refused instead of
  sending less.
- Paying on behalf of your own customer (an employer, a merchant)? Add
  `"endUser": { "id": "<your customer's id>" }`. It's never the payee.
- `200` means it was sent. Save `payoutId`. `202` means it's waiting for
  approval in your dashboard. A `4xx` means nothing was sent.

In the demo, see `WithdrawalsService.create()`.

### Step 4: Handle an unknown outcome

A timeout, a `5xx` or a `429` means the payout **may** exist. Never mark it
failed. First look it up by your `reference`:

```bash
curl -s "$AVVIO_BASE_URL/payments/organizations/$AVVIO_ORG_ID/orders?reference=WD-000123" \
  -H "x-api-key: $AVVIO_API_KEY"
```

If it's there, you're done. If not, resend with the same `Idempotency-Key`. In
the demo, see `WithdrawalsService.resolve()`.

### Step 5: Track it to the end

A payout moves `pending → processing → completed`, or ends `failed` or
`canceled`. **`completed` is not final:** a bank can return the payment days
later, which arrives as `payout.returned` and gives you the money back.

You have three ways to learn what happened. Use the first two:

| How | Call | When |
|---|---|---|
| **Webhooks** | `POST` to your endpoint, signed | The moment anything changes. Verify the signature before trusting it. In the demo, see `WebhookVerifier`. |
| **Events feed** | `GET /payments/organizations/{orgId}/events?since=<cursor>` | Every 30 s or so. Save `nextSince` and pass it next time. This is what your books should reconcile against. In the demo, see `ReconcileJob`. |
| **Read one payout** | `GET /payments/organizations/{orgId}/orders/{payoutId}` | While a user is watching the screen. In the demo, see `FastPollJob`. |

Note the pattern: you **send** to `/payouts` and **read** from `/orders`.

Webhooks can arrive twice or out of order. Ignore an event ID you've already
handled, and never let a status move backwards (a late `processing` must not
undo `completed`). In the demo, see `withdrawal-status.ts`.

### What to store

| Field | Why |
|---|---|
| Your payee ID, sent as `externalId` | Links your user to Avvio's recipient. |
| `recipientId` | To add or remove accounts later. |
| `destinationAccountId` and `last4` per account | To pay the account and show it. **Not** the account number. |
| Your `reference` and the `Idempotency-Key` per payout | To retry safely and to find the payout after a timeout. |
| `payoutId` and the latest `status` | To show progress and reconcile. |
| The events-feed cursor (`nextSince`) | To continue the feed where you left off. |

## 7. Going live

1. Complete business verification with Avvio.
2. Create a **live** key (`avvio_live_…`) on the Developer page in your live
   org. The base URL and organization ID stay the same.
3. Register a production webhook endpoint and store its new secret.
4. Fund your live balance using the deposit details in the dashboard.
5. Send one small real payout end to end before you open it to users.

Use your own backend for live. This demo refuses live keys on purpose.

## 8. Troubleshooting

| You see | Cause and fix |
|---|---|
| `This demo refuses live keys` on start | You used an `avvio_live_` key. Use a sandbox key (`avvio_test_…`). |
| `backend is not configured: set AVVIO_API_KEY and AVVIO_ORG_ID` | One of the two is missing from `.env`, or `.env` isn't in the repo root. Fix it and restart. |
| `401` from Avvio | The key is wrong, revoked, or copied with a stray space. Create a new one on the Developer page. |
| `403` from Avvio | The key doesn't have **Transact** permission, or the org ID belongs to a different organization. |
| Insufficient balance | Press **Fund sandbox $1,000** in the console. |
| `This demo only serves /webhooks/* to other hosts` | Open the app at `http://localhost:4300`, not through the tunnel URL or your LAN IP. |
| `503 webhook secret not configured` in the log | Webhooks are arriving but `AVVIO_WEBHOOK_SECRET` is empty. Add it and restart. |
| Webhooks never arrive | The tunnel URL changed or stopped. Restart it and update the endpoint in the dashboard. The demo still catches up from the events feed. |
| Port 4300 already in use | Set `PORT=4301` in `.env`. |
| Old payees or payouts you don't want | Stop the demo, delete `api/data/state.json`, start again. |

When something looks wrong on Avvio's side, send your Avvio contact the
`x-request-id` from the response. The console shows it for every call.

## 9. Tests, development and layout

```bash
npm test          # webhook signatures, the status machine, the send path
npm run dev:api   # backend in watch mode
npm run dev:web   # app on http://localhost:5173, proxied to the backend
```

The tests use Node's built-in runner, with no extra dependencies.

<details>
<summary>Project layout</summary>

```
api/src
  main.ts          boot: raw body for webhooks, validation, localhost guard
  config/          settings from .env and the environment
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
