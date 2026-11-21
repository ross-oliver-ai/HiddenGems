# Hidden Gems

Mobile-first web app for tracking charity shop buys and Vinted sales: items, profit, stock and reports.

Stack: Next.js (App Router) on Vercel · Postgres on Railway · Drizzle ORM · Tailwind · Vercel Blob (photos).

## Status
- [x] Stage 1: database schema, login, admin-created accounts, forced password change, app shell, colour themes + dark mode
- [x] Stage 2: items (bought → listed → sold → posted → completed, returns), photos, postal services / shops / categories settings
- [x] Stage 3: reports and charts, goals, stale-stock alerts, CSV export
- [ ] Stage 4: installable app (PWA), polish

## Setup

1. **Railway**: create a Postgres database and copy its *public* connection URL.
2. **Local env**: copy `.env.example` to `.env.local` and fill it in.
3. Install and create the tables:
   ```bash
   npm install
   npm run db:migrate
   ```
4. Create the admin account (this is you; the admin only manages users):
   ```bash
   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-long-password' npm run db:seed
   ```
   Re-running it resets that account's password.
5. Run locally: `npm run dev`

## First-time setup from a phone (no command line)
Set `SETUP_TOKEN` (any secret, 12+ characters) in Vercel, deploy, then open `/setup`. Enter the code, your admin email and a password: it creates the tables and the admin account. It refuses to run again once an admin exists, so you can delete `SETUP_TOKEN` afterwards.

## Deploy to Vercel
1. Import the GitHub repo into Vercel.
2. Add the environment variables `DATABASE_URL`, `AUTH_SECRET` and `BLOB_READ_WRITE_TOKEN` (create a Blob store under Vercel → Storage).
3. Also add `SETUP_TOKEN`. Deploy, then visit `/setup` (or run `npm run db:migrate` and `npm run db:seed` from a computer instead).

## Installing it on a phone
It works like an app with no app store. iPhone: open the site in Safari, tap Share, then Add to Home Screen. Android: open it in Chrome, tap the ⋮ menu, then Install app. It opens full-screen with the gem icon. It needs a connection to work (no offline mode).

## Sign-up, email and password reset
These are **off until you switch them on** in Vercel, so the app behaves exactly as before. They need a [Resend](https://resend.com) account (free tier) with a verified sending domain.

| Variable | What it does |
|---|---|
| `RESEND_API_KEY` | Turns email on. With `EMAIL_FROM` set, "Forgot your password?" appears on the sign-in page. |
| `EMAIL_FROM` | The sender, e.g. `Hidden Gems <hello@yourdomain.com>` (must be on your verified Resend domain). |
| `APP_URL` | Your site's address, e.g. `https://yourdomain.com`, used for links in emails. (Optional on Vercel.) |
| `SIGNUPS_OPEN` | Set to `true` to let anyone create an account. Needs email set up. Remove it or set it to `false` to close sign-ups again. |
| `SIGNUPS_PER_DAY` | Optional cap on new accounts per day (default 100). |

Anyone who signs up must confirm their email before they can sign in. Accounts created by the admin are already confirmed.

## Billing (free trial, then £3/month)
**Off until you switch it on**, so the app behaves exactly as before. When it's on, new accounts get a free trial (no card). After the trial an account is read-only (they can still view and download their data) until they subscribe through Stripe. Accounts that existed when billing shipped, and admins, are "free forever".

| Variable | What it does |
|---|---|
| `BILLING_ENABLED` | Set to `true` to start enforcing trials. Needs both Stripe keys below, otherwise it stays off (so nobody is locked out with no way to pay). |
| `STRIPE_SECRET_KEY` | From Stripe → Developers → API keys (use a test key first). |
| `STRIPE_WEBHOOK_SECRET` | From the webhook you add in Stripe (see below). |
| `STRIPE_PRICE_ID` | Optional. A Stripe Price to charge; if empty, £3/month is created automatically. |
| `CRON_SECRET` | Any long random string; protects the daily trial-reminder email job (`vercel.json`). |
| `TRIAL_DAYS` / `PRICE_PENCE` | Optional: trial length (default 30) and price in pence (default 300). Changing the price here also changes the text in the app and emails. |

Stripe set-up: add a webhook endpoint `https://YOUR-SITE/api/stripe/webhook` listening to `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid` and `invoice.payment_failed`; and turn on the Customer portal (Settings → Billing → Customer portal) so people can cancel and update cards. Admins can make someone free forever or extend a trial from Settings → Manage users.

## Database updates
On Vercel **production** deploys, the build applies any pending database updates before building the app. If an update fails, the build fails and the live site stays on the previous version. Updates only ever add things, so rolling back the code never breaks the data. Settings → Update database is still there as a manual fallback.

## Accounts
Nobody can sign up. As admin, go to Settings → Manage users, add a person with a temporary password, and give it to them. They must choose their own password at first sign-in. Each user's data is private to them.

## Scripts
- `npm run db:generate` after changing `src/db/schema.ts`, then `npm run db:migrate`
- `npm run typecheck`
