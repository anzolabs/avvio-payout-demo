# Hosted demo: payoutdemo.avvio.xyz

The same app, run in **public mode** (`DEMO_PUBLIC=1`) inside a Cloudflare
Container, so anyone can try it without a key or any setup.

Public mode, all in `api/src/visitor.ts` and switched off when you run locally:

- Each browser gets a visitor cookie. Its payees, accounts, payouts and console
  lines are its own.
- Only the four sandbox test accounts are accepted, so no one can enter real
  bank details.
- The shared sandbox balance tops itself up every minute when it runs low.
- Changes are capped at 40 per 10 minutes per IP address.
- State is kept on the container's disk and resets when it sleeps (after 2 h idle).

Deploys run from `.github/workflows/deploy-demo.yml` on every push to `main`.
They need these repository secrets:

| Secret | What |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Workers Scripts, Containers and Workers Routes: Edit, on the account and the `avvio.xyz` zone |
| `CLOUDFLARE_ACCOUNT_ID` | The Cloudflare account |
| `DEMO_AVVIO_API_KEY` | A sandbox key (`avvio_test_…`) with Transact permission. Live keys are refused. |
| `DEMO_AVVIO_ORG_ID` | The organization that key belongs to |
