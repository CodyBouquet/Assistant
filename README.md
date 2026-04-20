# Assistant

Personal assistant web app. Handles schedule, finances, bills, and todos. Claude is the brain via tool-use, Plaid pulls bank data, Twilio runs two-way SMS.

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind v4
- Postgres + Drizzle ORM
- Auth.js (email magic link)
- `@anthropic-ai/sdk` (tool-use loop)
- `plaid` (Development tier — free up to 100 Items)
- `twilio` (two-way SMS)
- Deploys to Railway

## Local setup

1. Install deps
   ```bash
   npm install
   ```

2. Copy env template and fill it in
   ```bash
   cp .env.example .env.local
   ```
   - `DATABASE_URL` — local Postgres or Railway connection string
   - `AUTH_SECRET` — `openssl rand -base64 32`
   - `ANTHROPIC_API_KEY` — from console.anthropic.com
   - `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV=development`
   - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
   - `EMAIL_*` for magic-link sign-in (Resend recommended)
   - `CRON_SECRET` — `openssl rand -hex 32`

3. Push the schema to Postgres
   ```bash
   npm run db:push
   ```

4. Run it
   ```bash
   npm run dev
   ```

5. Visit http://localhost:3000 → sign in with your email → go to **Setup**:
   - Enter zip, phone (E.164), pay cadence
   - Click **Link a bank** and step through Plaid Link

## Twilio webhook

Point your Twilio number's **incoming message** webhook at:

```
https://<your-domain>/api/twilio/incoming
```

Method: `POST`. Signature validation is enforced in production using `TWILIO_AUTH_TOKEN`.

## Cron (Railway)

Add these as scheduled jobs in Railway (Settings → Cron jobs):

| Name         | Schedule                     | Command                                                                                     |
| ------------ | ---------------------------- | ------------------------------------------------------------------------------------------- |
| daily-check  | `0 13 * * *` (8am US Central) | `curl -X POST -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/jobs/daily-check`     |
| plaid-sync   | `0 */6 * * *`                | `curl -X POST -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/jobs/plaid-sync`       |

## How Claude reasons

Two modes, same brain:

- **Reactive** — triggered by chat or incoming SMS. Claude can call read-only tools (`get_balances`, `get_transactions`, `get_budget`, etc.) and replies directly. Cannot call `send_sms`.
- **Proactive** — triggered by the daily cron. Claude pulls context, decides whether anything is noteworthy (bill due soon, over-budget category, statistically unusual transaction), and either calls `send_sms` once or replies `SILENT`.

See `src/lib/claude-tools.ts` for the tool catalog and `src/lib/claude-dispatch.ts` for implementations.

## Budget derivation

On first bank link, `deriveBudgetsForUser()` runs over the last 90 days of transactions, computes per-category monthly averages, adds a 10% cushion, and stores mean/stddev for unusual-spend detection. Re-runnable from **Setup → Re-derive from history**.

## What's stubbed

The following modules are scaffolded but not yet built:

- Bills UI (`/bills`) — schema in place, no CRUD yet
- Schedule / Calendar (`/schedule`) — schema in place, Google OAuth slot reserved
- Todos (`/todos`) — schema in place, no CRUD yet

## Deploying to Railway

1. Create a new Railway project
2. Add a **Postgres** service — copy the generated `DATABASE_URL` into the app service
3. Deploy this repo as a **Node** service (Railway auto-detects Next.js via Nixpacks)
4. Set all env vars from `.env.example`
5. Add the two cron jobs above
6. Point Twilio at `https://<railway-domain>/api/twilio/incoming`

## Security notes

- Plaid access tokens are stored plaintext in Postgres — fine for a single-user personal deploy, but move to KMS/envelope-encryption if you ever multi-tenant this.
- The cron routes check a shared-secret bearer token (`CRON_SECRET`). Rotate it when rotating other secrets.
- Twilio webhook validates the `X-Twilio-Signature` header in production.
