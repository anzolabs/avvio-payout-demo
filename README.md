# Avvio Payouts Demo

Send money to a bank account in Mexico through the
[Avvio Payouts API](https://docs.avvio.xyz), and watch every API call your
backend makes along the way.

<p>
  <a href="https://payoutdemo.avvio.xyz"><img alt="Try the live demo" src="docs/try-the-live-demo.svg" width="380" height="68"></a>
</p>

No sign-up, no key: **[payoutdemo.avvio.xyz](https://payoutdemo.avvio.xyz)** runs on the Avvio
sandbox, with real API calls and test money.

## Build it with an AI agent

Connect your coding agent to Avvio over MCP with your sandbox key and
organization ID. To get them, sign in at https://business.avvio.xyz, switch the
org menu to **Sandbox**, open **Developer**, and create a key with **Transact**
permission (shown once); the **Organization ID** is in that page's header.

Claude Code:

```bash
claude mcp add avvio-payments -e AVVIO_API_KEY=avvio_test_… -e AVVIO_ORG_ID=… -- npx -y @avvio/payments mcp
claude mcp add --transport http avvio-docs https://avvio-docs.pages.dev/mcp
```

Cursor, Claude Desktop and other MCP clients:

```json
{
  "mcpServers": {
    "avvio-payments": {
      "command": "npx",
      "args": ["-y", "@avvio/payments", "mcp"],
      "env": { "AVVIO_API_KEY": "avvio_test_…", "AVVIO_ORG_ID": "…" }
    },
    "avvio-docs": { "type": "http", "url": "https://avvio-docs.pages.dev/mcp" }
  }
}
```

`avvio-payments` acts in your sandbox and tells the agent how to pay someone
correctly; money-moving tools need an explicit `confirm: true`. Run its
**`sandbox_walkthrough`** prompt to watch one payout get paid and then returned,
or **`integrate_payouts`** to have it plan and build the integration in your
codebase from this repo. `avvio-docs` searches the documentation.

## What you'll see

The page is split in two:

- **Your app, on a phone.** "Payday" stands in for your product: someone with
  funds available sends money to family in Mexico, India, the Philippines,
  Europe or the UK. Each country's bank form comes from the API.
- **Your backend, beside it.** Every request it makes to Avvio, as it happens:
  method, path, status and latency. Click one to see the request and response
  bodies, the `Idempotency-Key` and the `x-request-id`.

Try one payout, about a minute end to end:

1. Tap **Send money**, then add a recipient. The name and a test account that
   completes normally are filled in, so you can just continue. To see a bank
   return, tap the account ending `0003` under **Sandbox** first.
2. Choose an amount. You send USD, they receive MXN, priced live.
3. Review, send, and watch it go **Sent to Avvio → Processing → Paid**. With
   `0003` it then comes back as **Returned by the bank**: a payment that is paid
   and later returned is the case your own ledger most needs to handle.

The sandbox account you pick decides what happens to every payout sent to it:

| Account (CLABE) | What happens |
|---|---|
| `012180000000070003` | Completes, then the **bank returns it** about 30 seconds later. |
| `012180000000000002` | Stays `processing`, then completes at about 60 s. |
| `012180000000030001` | Fails with `account_invalid`; the money comes back. |
| `012180000000045669` | Completes normally. |

The code behind the demo is this repo: **`api/`** is the backend (NestJS +
TypeScript, the only code that holds the key or calls Avvio) and **`web/`** is
the app (React + Vite). For the reasoning behind each step, read
**[INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md)**.

## Build it into your own backend

This is the part to copy. Your backend makes the same calls the demo makes,
plus your own login and database. Every request carries your key in
`x-api-key`, and the key never leaves your server:

```bash
export AVVIO_BASE_URL=https://api.avvio.xyz/business/api/v1
export AVVIO_API_KEY=avvio_test_…      # a sandbox key; see "Build it with an AI agent" above
export AVVIO_ORG_ID=…
```

You can also use the Node SDK, `npm install @avvio/payments`, which wraps these
calls and verifies webhooks for you, or plain HTTP as the demo does in
`api/src/avvio/avvio.client.ts`.

### 1. Show the right bank form

Each country needs different bank fields. Ask for them rather than hardcoding
them:

```bash
curl -s "$AVVIO_BASE_URL/recipients/$AVVIO_ORG_ID/corridors?currency=MXN" \
  -H "x-api-key: $AVVIO_API_KEY"
```

Render one input per field and send the values back keyed by each field's
`id`. In the demo: `CorridorService` and `web/src/screens/BankFormScreen.tsx`.

### 2. Register the recipient

Each person you pay is one recipient, registered with their name and bank
account:

```bash
curl -s -X POST "$AVVIO_BASE_URL/recipients/$AVVIO_ORG_ID" \
  -H "x-api-key: $AVVIO_API_KEY" \
  -H "content-type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "type": "individual",
    "name": "Rosa López",
    "email": "rosa@example.com",
    "externalId": "user_123-rosa-lopez",
    "method": {
      "kind": "fiat",
      "currency": "MXN",
      "recipientDetails": { "clabeNumber": "012180000000070003" }
    }
  }'
```

- `externalId` is **your** ID for this person. Sending it again returns the
  same recipient instead of creating a duplicate.
- From the response, save **`id`** (the recipient) and
  **`method.destinationAccountId`** (the account you pay), plus the last 4
  digits for display.
- **Don't store the full account number.** Avvio holds it; you only need the
  IDs.
- Another account for the same person: `POST
  /recipients/{orgId}/{recipientId}/methods` with the same `method` object.

In the demo: `AccountsService.add()`.

### 3. Send the payout

```bash
curl -s -X POST "$AVVIO_BASE_URL/payments/organizations/$AVVIO_ORG_ID/payouts" \
  -H "x-api-key: $AVVIO_API_KEY" \
  -H "content-type: application/json" \
  -H "Idempotency-Key: 6f1c2d3e-…" \
  -d '{
    "amount": "75.00",
    "destinationAccountId": "<method.destinationAccountId from step 2>",
    "reference": "WD-000123"
  }'
```

- `amount` is what you send, in USD, from your Avvio balance. The recipient
  receives it converted, less the fee.
- `reference` is your own ID for this payout. Use it to find the payout later.
- **Save the `Idempotency-Key` in your database before you send.** If the
  request times out, resend with the **same** key: it can never pay twice.
- Optional: `expectDestination` is the amount you showed the user. If the rate
  has moved more than 2% since then, the payout is refused instead of sending
  less.
- `purposeOfPayment` says why the money is sent (`FAMILY_SUPPORT`, `GIFT`,
  …). Some corridors require it (INR and BRL among them; your policy lists
  them under `purposeOfPayment.requiredForCurrencies`), and every corridor
  accepts it, so the demo always sends one.
- Paying on behalf of your own customer (an employer, a merchant)? Add
  `"endUser": { "id": "<your customer's id>" }`. It's never the recipient.
- `200` means it was sent: save `payoutId`. `202` means it's waiting for
  approval in your dashboard. A `4xx` means nothing was sent.

In the demo: `WithdrawalsService.create()`.

### 4. Handle an unknown outcome

A timeout, a `5xx` or a `429` means the payout **may** exist. Never mark it
failed. Look it up by your `reference` first:

```bash
curl -s "$AVVIO_BASE_URL/payments/organizations/$AVVIO_ORG_ID/orders?reference=WD-000123" \
  -H "x-api-key: $AVVIO_API_KEY"
```

If it's there, you're done. If not, resend with the same `Idempotency-Key`. In
the demo: `WithdrawalsService.resolve()`.

### 5. Track it to the end

A payout moves `pending → processing → completed`, or ends `failed` or
`canceled`. **`completed` is not final:** a bank can return the payment days
later, which arrives as `payout.returned` and gives you the money back.

| How | Call | When |
|---|---|---|
| **Webhooks** | `POST` to your endpoint, signed | The moment anything changes. Verify the signature before trusting it. In the demo: `WebhookVerifier`. |
| **Events feed** | `GET /payments/organizations/{orgId}/events?since=<cursor>` | Every 30 s or so. Save `nextSince` and pass it next time. Reconcile your books against this. In the demo: `ReconcileJob`. |
| **Read one payout** | `GET /payments/organizations/{orgId}/orders/{payoutId}` | While a user is watching the screen. In the demo: `FastPollJob`. |

Use the first two. Note the pattern: you **send** to `/payouts` and **read**
from `/orders`. Webhooks can arrive twice or out of order: ignore an event ID
you've already handled, and never let a status move backwards. In the demo:
`withdrawal-status.ts`.

### What to store

| Field | Why |
|---|---|
| Your ID for each recipient, sent as `externalId` | Links your user to Avvio's recipient. |
| `recipientId` | To add or remove accounts later. |
| `destinationAccountId` and `last4` per account | To pay the account and show it. **Not** the account number. |
| Your `reference` and the `Idempotency-Key` per payout | To retry safely and find the payout after a timeout. |
| `payoutId` and the latest `status` | To show progress and reconcile. |
| The events-feed cursor (`nextSince`) | To continue the feed where you left off. |

## Going live

1. Complete business verification with Avvio.
2. Create a **live** key (`avvio_live_…`) on the Developer page in your live
   org. The base URL and organization ID stay the same.
3. Register a production webhook endpoint and store its secret.
4. Fund your live balance using the deposit details in the dashboard.
5. Send one small real payout end to end before you open it to users.

Keep your key on your server, in a secret manager: never in a mobile app,
browser code or a repository. If one is exposed, **Rotate** it on the
Developer page; the old key keeps working for 24 hours while you switch.

## Run it yourself

Only needed if you want to run this code with your own sandbox key, change it,
or step through it. Everything above works in the
[live demo](https://payoutdemo.avvio.xyz).

You need a sandbox key and your organization ID; see
[Build it with an AI agent](#build-it-with-an-ai-agent) for where to get them.

**Run it** (Node 18 or newer):

```bash
git clone https://github.com/anzolabs/avvio-payout-demo.git
cd avvio-payout-demo
npm install
cp .env.example .env      # set AVVIO_API_KEY and AVVIO_ORG_ID
npm run build
npm start                 # http://localhost:4300
```

On start, the backend checks your key and organization and adds test money if
your sandbox balance is below $1,500. If something is wrong, the app says what
to fix.

<details>
<summary><b>Every <code>.env</code> setting</b></summary>

`.env` sits in the repo root and is git-ignored. Real environment variables
override it. Put each comment on its own line: the loader does not strip
trailing comments.

| Variable | Required | Default | What it is |
|---|---|---|---|
| `AVVIO_API_KEY` | **Yes** | none | Your sandbox key, `avvio_test_…`. The demo refuses live keys. |
| `AVVIO_ORG_ID` | **Yes** | none | Your organization ID from the Developer page. |
| `AVVIO_BASE_URL` | No | `https://api.avvio.xyz/business/api/v1` | One URL for sandbox and live. |
| `AVVIO_WEBHOOK_SECRET` | No | empty | Your webhook endpoint's `whsec_…` secret. Empty means polling and the events feed only. |
| `DESTINATION_CURRENCIES` | No | `MXN,INR,PHP,EUR,GBP` | The currencies the app offers, in order; each needs a corridor on your organization. |
| `PORT` | No | `4300` | The port it listens on. |
| `HOST` | No | `127.0.0.1` | Keep it on loopback: the demo's own routes have no login. |
| `DATA_FILE` | No | `api/data/state.json` | Where it keeps its state. Delete it to start over. |

</details>

<details>
<summary><b>Receive webhooks locally</b></summary>

1. Expose the demo: `npx -y cloudflared tunnel --url http://localhost:4300`,
   and copy the URL it prints.
2. In the dashboard (**Sandbox** → **Developer** → **Webhooks**), add an
   endpoint: that URL plus `/webhooks/avvio`, with the six `payout.*` events.
3. Copy the `whsec_…` secret into `AVVIO_WEBHOOK_SECRET` and restart.

Only `/webhooks/avvio` answers through the tunnel. A quick tunnel's URL changes
each time you start it.

</details>

<details>
<summary><b>Troubleshooting</b></summary>

| You see | Cause and fix |
|---|---|
| `This demo refuses live keys` | Use a sandbox key (`avvio_test_…`). |
| `backend is not configured` | `AVVIO_API_KEY` or `AVVIO_ORG_ID` is missing, or `.env` isn't in the repo root. |
| `cannot reach Avvio: …` in the app | The message names the cause: usually the key (`401`), a missing Transact permission (`403`) or the org ID (`404`). |
| Insufficient balance | Restart to top up, or use **Add $1,000 test money** in the console. |
| `This demo only serves /webhooks/* to other hosts` | Open it at `http://localhost:4300`, not through the tunnel or your LAN IP. |
| Webhooks never arrive | The tunnel URL changed. Update the endpoint; the events feed catches up meanwhile. |
| Port 4300 in use | Set `PORT=4301` in `.env`. |

When something looks wrong on Avvio's side, send your Avvio contact the
`x-request-id` from the console.

</details>

<details>
<summary><b>Tests, development and layout</b></summary>

```bash
npm test          # webhook signatures, the status machine, the send path, visitor isolation
npm run dev:api   # backend in watch mode
npm run dev:web   # app on http://localhost:5173, proxied to the backend
```

```
api/src
  avvio/           AvvioClient (the only code that calls Avvio), WebhookVerifier, types
  payees/          people and their bank accounts (recipients)
  withdrawals/     status machine, sending, applying events
  webhooks/        POST /webhooks/avvio
  jobs/            FastPollJob, ReconcileJob
  dashboard/       state, corridor, quote, balance, sandbox top-up
  store/           state file and the console's call log
  visitor.ts       public mode for the hosted demo
web/src
  screens/         Home, Recipients, BankForm, Amount, Confirm, Withdrawal, Activity
  components/      Console (the call timeline), Screen, StatusPill
hosting/cloudflare the hosted demo: Dockerfile, Worker, deploy notes
```

</details>

The hosted demo is this same code in public mode, on a Cloudflare Container;
see [hosting/cloudflare](hosting/cloudflare/README.md).

## License

MIT
