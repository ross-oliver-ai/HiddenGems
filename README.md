# Hidden Gems

A mobile-first web app for resellers: record what you buy, list, sell and post, and see what you **really** make (profit, margin, ROI, stock value, goals). It started as a charity-shop-to-Vinted tracker for one person and is being turned into a product other resellers can sign up to (free 30-day trial, then £3/month).

- **Live site:** https://www.hiddengemsapp.co.uk (the original `hidden-gems-seven.vercel.app` address still works)
- **Repo:** `ross-oliver-ai/HiddenGems` (default branch `main`)
- **Last updated:** 22 November 2026 (kept current with every change; see `CLAUDE.md`)

> **If you only read one section, read [Current state](#1-current-state) and [Working notes](#14-working-notes-and-gotchas).**

---

## Contents
1. [Current state](#1-current-state)
2. [What the app does](#2-what-the-app-does)
3. [Tech stack](#3-tech-stack)
4. [Architecture](#4-architecture)
5. [Data model](#5-data-model)
6. [Accounts, sign-up and security](#6-accounts-sign-up-and-security)
7. [Billing: free trial, read-only lock, Stripe](#7-billing-free-trial-read-only-lock-stripe)
8. [Email](#8-email)
9. [Scheduled jobs](#9-scheduled-jobs)
10. [Integrations and where things live](#10-integrations-and-where-things-live)
11. [Configuration (environment variables)](#11-configuration-environment-variables)
12. [Deploying and operating](#12-deploying-and-operating)
13. [Local development and scripts](#13-local-development-and-scripts)
14. [Working notes and gotchas](#14-working-notes-and-gotchas)
15. [Project history](#15-project-history)
16. [Open items and backlog](#16-open-items-and-backlog)

---

## 1. Current state

| Area | State |
|---|---|
| Core app (items, lifecycle, photos, reports, goals, CSV export, themes, PWA) | Built and in daily use |
| Public landing page and waitlist | Live |
| Self sign-up, email confirmation, password reset | Built; switched on with `SIGNUPS_OPEN=true` |
| Email change (user and admin) | Built, tested live |
| Free trial and read-only lock | Built, tested end to end, **on** |
| Stripe subscriptions (£3/month) | Built, tested end to end in **Stripe sandbox (test mode)**. **Not yet on live Stripe keys** |
| Custom domain | Live: `www.hiddengemsapp.co.uk` (DNS at Fasthosts, certificate by Vercel) |
| Preview deployments | Off (Ignored Build Step = Only build production) |
| Trial-reminder emails (daily cron) | Built; first scheduled run not yet confirmed in Vercel's logs |

**People and data.** The first testers (the owner's wife and a friend; the wife now uses the app from the new domain) are marked **"free forever"** (`billing_exempt`) and are never locked. The migration that shipped billing set `billing_exempt = true` for every account that existed at that moment. Admins are never billed either.

**Before real customers pay** (see [Open items](#16-open-items-and-backlog)): live Stripe keys and webhook, business status and VAT, a professional review of the terms (including the 14-day refund promise), and a few housekeeping items.

---

## 2. What the app does

### For sellers
- **Items.** Each item records name, brand, size, condition, notes, photo, category, where it was bought, buy price and date. Search as you type (name, brand, shop) and filter chips: All, In stock, To list, Listed, Sold, Returned/unsold.
- **Lifecycle** (see the diagram in [Data model](#5-data-model)). Bought → Listed → Sold → Posted → Completed, plus Returned (with refund amount), Unsold and Donated. Price reductions on a listing are recorded as history. Each step asks only for what it needs (price, date, postal service) and validates (for example, you can't list before you bought).
- **Profit.** Sold, posted and completed items: sold price − buy price. Returned: sold price − refund − buy price. Unsold or donated: −buy price (written off). Items still in stock have no profit yet.
- **Stale stock.** A listed item is "stale" once it has been listed for the user's chosen number of days (default 30).
- **Photos.** Taken or chosen on the phone, resized in the browser to JPEG, uploaded to Vercel Blob. Tap to enlarge and zoom.
- **Home.** Greeting, counts (to list, listed, to post), stock value at cost, and this month's profit goal with confetti when it's reached.
- **Reports.** Period picker (week, month, quarter, UK tax year, year, all time, custom) with jump-to-previous-period. KPIs: money spent, revenue, profit, margin, ROI, average profit, average days to sell, sell-through. Charts over time; rankings by category, shop and postal service; best and worst items; stock ageing buckets; the monthly goal pro-rated to the chosen period. Tap a chart to drill in.
- **CSV export** of all items (`/reports/export`), available on every plan, even when read-only.
- **Settings.** Colour theme (Blossom, Sage, Lavender, Apricot, Ocean, Berry) × light/dark/auto; manage shops, categories and postal services (add, rename, archive); monthly profit goal and stale-after days; change email; change password; Billing.
- **Defaults for new accounts.** Categories: Women's Clothing, Men's Clothing, Kids' Clothing, Shoes, Bags & Accessories, Books, Home & Kitchen, Toys & Games, Electronics, Other. Postal services: Royal Mail, InPost, Evri. New accounts start in **Blossom + Dark** mode.
- **Installable (PWA).** Add to Home Screen on iPhone (Safari) or Install on Android (Chrome). Full-screen, gem icon. Needs a connection (no offline mode).

### For the admin
- **Manage users** (Settings → Manage users): create accounts with a temporary password (the person must choose their own at first sign-in; admin-created accounts are pre-confirmed), reset passwords, change someone's sign-in email, disable or re-enable, make "free forever", extend a trial by 14 days, end a trial now. Each action that changes a trial or someone's access asks for confirmation. A plan badge shows each person's state (Trial: Nd left, Paid to date, Read-only, Free forever, …).
- **Waitlist** (Settings → Waitlist): emails collected by the landing page, with an "invited" toggle and a copy-all button.
- **Update database**: a manual button that applies pending migrations (a fallback; production deploys do this automatically).
- The admin account does not hold stock itself; it manages users.

### Public pages
Landing page (`/welcome`, shown at `/` to signed-out visitors, with a "Celebrate the wins" confetti section and waitlist or sign-up button), sign-in, sign-up, confirm email, forgot/reset password, terms, privacy.

---

## 3. Tech stack

| Layer | Choice |
|---|---|
| Language | **TypeScript** (strict) throughout, plus a little SQL (migrations) and CSS |
| Framework | **Next.js 16.4** (App Router, Turbopack), **React 19**, Server Components and **Server Actions** for all mutations |
| Styling | **Tailwind CSS 4** with CSS variables for themes; hand-built components (no UI kit) |
| Charts | **Recharts** |
| Database | **PostgreSQL** (Railway) via **Drizzle ORM** and `pg`; migrations generated by **drizzle-kit** |
| Validation | **Zod 4** |
| Auth | Own implementation: **bcryptjs** password hashes, **jose** signed JWT in an HTTP-only cookie |
| File storage | **Vercel Blob** (item photos) |
| Email | **Resend** HTTP API (plain `fetch`, no SDK) |
| Payments | **Stripe** via plain `fetch` (no SDK), Checkout and Customer portal, webhooks |
| Hosting | **Vercel** (serverless functions, cron) |
| Tooling | ESLint 9, `tsx` for scripts |

There is **no** separate API server, state library, ORM-generated client or UI framework. Everything runs inside the one Next.js app.

---

## 4. Architecture

```mermaid
flowchart LR
  Phone["Phone / browser<br/>(PWA)"] -->|HTTPS| Vercel
  subgraph Vercel["Vercel: Next.js app"]
    Proxy["proxy.ts<br/>(session gate)"] --> Pages["Server Components<br/>+ Server Actions"]
    Pages --> Lib["src/lib<br/>(auth, billing, reports, email, stripe)"]
    Hooks["API routes<br/>/api/stripe/webhook<br/>/api/cron/trial-reminders<br/>/api/upload"]
  end
  Lib --> DB[("Postgres<br/>Railway")]
  Hooks --> DB
  Pages -->|photos| Blob[("Vercel Blob")]
  Lib -->|emails| Resend
  Lib -->|checkout, portal| Stripe
  Stripe -->|webhook events| Hooks
  Cron["Vercel Cron<br/>08:00 UTC daily"] --> Hooks
  GitHub["GitHub: main"] -->|push triggers build| Vercel
```

### How a request flows
1. **`src/proxy.ts`** (Next 16's replacement for `middleware.ts`) is a cheap first gate: no valid session cookie → redirect to `/login`, except for a list of public paths (landing, terms, privacy, sign-up, verify, reset, `/confirm-email-change`, `/setup`), and the Stripe webhook and cron routes, which check their own secrets. Signed-out visitors to `/` see the landing page via a rewrite.
2. **Real authorisation happens in server code**, not the proxy: `requireUser()` (signed in, account exists and isn't disabled, has set their own password), `requireAdmin()`, and `requireWritableUser()` (also not read-only). Every database query is scoped by `user.id`.
3. **Pages are Server Components** that query Postgres through Drizzle. **Forms post to Server Actions** (`"use server"`) which validate with Zod, check permissions, write, and `revalidatePath`. Client components (`"use client"`) are used only for interactivity (forms with `useActionState`, charts, photo picker, confetti).
4. **Route groups.** `src/app/(app)/` is the signed-in app (shared layout: header, billing banner, bottom nav). Public and auth pages sit beside it.

### Folder map
```
src/
  proxy.ts                     session gate + public path list
  app/
    layout.tsx                 <html data-theme data-mode>, viewport, fonts
    (app)/                     signed-in app
      page.tsx                 home dashboard
      items/                   list, new, [id] detail, actions.ts, lifecycle.ts
      reports/                 page + export/route.ts (CSV)
      settings/                page, actions, lists/ (shops, categories, postal, goals)
      billing/                 page + actions (Checkout, Customer portal)
      admin/                   users/, waitlist/, update-database action
    api/
      stripe/webhook/route.ts  Stripe events in
      cron/trial-reminders/    daily job
      upload/route.ts          photo upload to Blob
    login/ signup/ verify/ forgot-password/ reset-password/
    change-password/ change-email/ confirm-email-change/ setup/
    welcome/ (landing)  terms/  privacy/  manifest.ts  icons
  components/                  shared UI (forms, charts, banner, pickers, …)
  db/  schema.ts index.ts      Drizzle schema and pooled connection
  lib/
    auth.ts session.ts password.ts   sessions, guards, hashing
    billing.ts stripe.ts             entitlement logic, Stripe client + webhook handling
    email.ts authEmails.ts trialEmails.ts emailChange.ts tokens.ts
    items.ts reports.ts periods.ts queries.ts format.ts defaults.ts themes.ts migrations.ts
scripts/  build-migrate.ts migrate.ts seed-admin.ts
drizzle/  0000…0006_*.sql + meta/ (journal and snapshots)
vercel.json                    cron schedule
```

### Patterns worth knowing
- **Money** is stored as `numeric(10,2)` and handled as strings or numbers via `parseMoney()` / `money()`; currency is GBP only.
- **Dates** are plain `YYYY-MM-DD` strings in UK terms (`todayLondon()`); no time-zone arithmetic. Timestamps (`created_at`, trial dates) are real timestamps.
- **No-existence leaks.** Sign-up, resend-verification, forgot-password and change-email give the same answer whether or not an address already has an account.
- **Idempotent webhooks.** Stripe events are recorded in `stripe_events`; repeats are ignored.
- **Billing is a pure function.** `entitlement(user, now, enforced)` in `src/lib/billing.ts` decides what a user may do; pages, the banner, server actions, the upload route and the admin badge all call it.

---

## 5. Data model

Tables (Drizzle schema in `src/db/schema.ts`):

| Table | Purpose |
|---|---|
| `users` | Account, role (`admin`/`seller`), password hash, `must_change_password`, `disabled`, theme and colour mode, monthly goal, stale-after days, `email_verified_at`, and all billing fields (see below) |
| `shops`, `categories`, `postal_services` | Per-user lookup lists (`archived` instead of delete) |
| `items` | One row per item with every lifecycle field (bought/listed/sold/posted/returned dates and prices), `status`, photo URL, Vinted URL |
| `price_changes` | History of asking-price reductions per item |
| `auth_tokens` | One-time email links (`verify_email`, `reset_password`, `change_email`); only a SHA-256 hash is stored, with expiry, used-at and an optional `payload` (the new email for `change_email`) |
| `stripe_events` | IDs of Stripe webhook events already handled |
| `waitlist` | Landing-page signups, with `invited_at` |

**Billing columns on `users`:** `billing_exempt`, `trial_ends_at`, `stripe_customer_id`, `stripe_subscription_id`, `subscription_status`, `subscription_period_end`, `cancel_at_period_end`, `payment_failed_at`, `trial_reminder_7_sent_at`, `trial_reminder_1_sent_at`.

### Item lifecycle

```mermaid
stateDiagram-v2
  [*] --> bought: add item
  bought --> listed: list (price, date)
  listed --> listed: reduce price
  listed --> bought: unlist
  bought --> sold: sell
  listed --> sold: sell (price, postal service)
  sold --> posted: post
  sold --> completed: complete
  posted --> completed: complete
  sold --> returned: return (refund)
  posted --> returned: return
  completed --> returned: return
  returned --> listed: relist (clears sale)
  bought --> unsold: give up
  listed --> unsold: give up
  bought --> donated: donate
  listed --> donated: donate
  unsold --> donated: donate
  unsold --> bought: reopen
  donated --> bought: reopen
```
Transitions are enforced in `src/app/(app)/items/lifecycle.ts` (a table of which statuses each step may start from).

### Migrations
Drizzle migrations live in `drizzle/` and are **additive only**, so rolling the code back never breaks the data.

| File | What it did |
|---|---|
| `0000` | Initial schema: users, items, shops, categories, postal services, price changes |
| `0001` | `waitlist` table (landing page) |
| `0002` | `auth_tokens` table and `users.email_verified_at` (sign-up, confirmation, reset) |
| `0003_billing` | Billing columns, `stripe_events`; marked all existing users `billing_exempt` |
| `0004_title_case_categories` | Title-cased existing category names |
| `0005_default_dark_mode` | New accounts default to `dark` colour mode (existing rows untouched) |
| `0006_change_email` | `change_email` token kind and `auth_tokens.payload` |

Generate a new one with `npm run db:generate` after editing `schema.ts`; pass `--name` for a readable file name.

---

## 6. Accounts, sign-up and security

- **Sessions.** A signed JWT (HS256, `AUTH_SECRET`, 30 days) in the `hg_session` cookie (HTTP-only, SameSite=Lax, Secure in production). It holds only the user ID, so email and role changes take effect immediately. Cookies are per host, so signing in on a new domain needs a fresh sign-in.
- **Passwords.** bcrypt (cost 12). 10–72 characters. Login runs a dummy hash when the email is unknown so timing doesn't reveal which emails exist.
- **First run.** Set `SETUP_TOKEN` in Vercel and open `/setup`: it applies migrations and creates the admin. It refuses to run again once an admin exists. Delete `SETUP_TOKEN` afterwards. (`npm run db:seed` does the same from a computer.)
- **Self sign-up** (`SIGNUPS_OPEN=true`, needs email configured): name, email, password, tick-box for terms, a hidden honeypot field, a daily cap (`SIGNUPS_PER_DAY`, default 100). The account gets a trial end date and default lists; a confirmation email is sent; the person can't sign in until they confirm. If the email can't be sent, the account is removed so they can retry.
- **Email confirmation / password reset.** One-time links (24h and 1h). The confirmation page requires a button tap, so email scanners that pre-open links can't use the token up.
- **Change email.** User: Settings → Change email → new address + current password → link sent to the **new** address → nothing changes until confirmed → notice sent to the old address. Max 3 requests/hour. Admin: set directly from Manage users (admin vouches for it). Either way the new address counts as confirmed, unused links to the old address are revoked, the Stripe customer email is updated (best effort), and addresses are lower-cased and unique.
- **Other protections.** Every query scoped to the signed-in user; the Stripe webhook verifies its signature; the cron route needs a bearer secret; uploads need a session; photos use unguessable random-suffix URLs (public if the URL is known).

**Known gaps:** no rate limiting on sign-in attempts; resetting a password doesn't sign out other sessions; no account deletion or self-serve data export beyond CSV; photos are public-by-URL; terms and privacy still need a professional review and contact details.

---

## 7. Billing: free trial, read-only lock, Stripe

**Model.** New accounts get a 30-day free trial with no card. After it, the account is **read-only** until they subscribe (£3/month via Stripe Checkout). Read-only people can still view everything, see reports, download the CSV, and change appearance or password; they cannot add, edit or delete items, change lists, or upload photos (the upload API returns 402).

**Switch.** Billing is enforced only when `BILLING_ENABLED=true` **and** both `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are set (otherwise the whole thing is "off", so nobody can be locked out with no way to pay).

**Access states** (`entitlement()` in `src/lib/billing.ts`):

| State | Meaning | Can write |
|---|---|---|
| `off` | Billing not switched on | yes |
| `exempt` | Admin or "free forever" | yes |
| `subscribed` | Stripe status active or trialing (shows an end date if cancelled but paid up) | yes |
| `past_due` | A payment failed; 7-day grace period from `payment_failed_at` | yes |
| `trial` | Inside the free trial (a banner appears at 7 days or fewer) | yes |
| `locked` | Reason: `trial_ended`, `subscription_ended` or `payment_failed` | **no** |

Trial end = `trial_ends_at`, or `created_at + TRIAL_DAYS` if that's null.

**Flows.**
- **Subscribe:** Billing page → server action creates a Stripe Checkout session (`mode=subscription`, inline £3 GBP monthly price unless `STRIPE_PRICE_ID`) → Stripe-hosted page → returns to `/billing?session_id=…`, where the app retrieves the session from Stripe and unlocks immediately (it doesn't wait for the webhook). Subscribing charges at once; remaining trial days don't carry over.
- **Manage / cancel:** "Manage subscription" opens the Stripe **Customer portal**. Cancelling keeps access until the period ends; the webhook updates the account.
- **Webhook** (`POST /api/stripe/webhook`): verifies the HMAC-SHA256 signature (300 s tolerance), dedupes via `stripe_events`, then applies `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_failed`. A late "canceled" event for an old subscription ID is ignored. Failures return 500 so Stripe retries.
- **Admin overrides:** make free forever, extend trial by 14 days (for trial or locked accounts), end trial now (for accounts on a trial).

**Stripe setup actually used:** a Stripe **sandbox**, endpoint `https://www.hiddengemsapp.co.uk/api/stripe/webhook` with "Snapshot" payloads and the six events above; Customer portal enabled. The Stripe client is hand-written `fetch` code in `src/lib/stripe.ts` (form-encoded, nested params). `STRIPE_API_BASE` exists only so tests can point at a fake Stripe.

**Test cards (sandbox only):** `4242 4242 4242 4242` succeeds; `4000 0000 0000 0002` is declined; `4000 0025 0000 3155` asks for 3D Secure; any future expiry, any CVC.

**UK law note.** The DMCC Act's subscription rules (cooling-off, pre-contract information, reminders) are not expected before spring 2027. The terms promise a 14-day refund. None of this is legal advice; get the terms reviewed.

---

## 8. Email

Sent through the **Resend** HTTP API from `src/lib/email.ts` (`sendEmail`, `emailLayout` for the simple branded layout with one button). Email is "configured" when `RESEND_API_KEY` and `EMAIL_FROM` are both set; until then nothing is sent and features that need email stay hidden or disabled. Emails are sent from the project's own domain, verified in Resend (the verification records are DNS records, managed where the domain's DNS is, at Fasthosts).

| Email | Sent when | To |
|---|---|---|
| Confirm your email | Sign-up, resend | New address |
| Reset your password | Forgot password | Account address |
| "You already have an account" | Someone signs up with an existing address | Existing address |
| Confirm your new email | Change email requested | **New** address |
| "Your email was changed" | Change completed (user or admin) | **Old** address |
| Trial reminders (about 7 days left, and the last two days) | Daily cron, only when billing is enforced | Verified, non-exempt, unsubscribed sellers |

Links are built from `APP_URL` (`https://www.hiddengemsapp.co.uk`), falling back to the Vercel production URL if unset. In non-production, `EMAIL_DEBUG_LOG=1` logs emails to the console instead of sending (used by tests).

---

## 9. Scheduled jobs

Only one, defined in `vercel.json`:

| Job | Schedule | What it does |
|---|---|---|
| `GET /api/cron/trial-reminders` | `0 8 * * *` (08:00 UTC daily) | Sends the two trial-reminder emails to eligible people (not admins, not free-forever, not subscribed, not disabled, verified email), recording `trial_reminder_7_sent_at` / `trial_reminder_1_sent_at` so nobody is emailed twice. Does nothing unless billing is enforced. |

Vercel calls it with `Authorization: Bearer $CRON_SECRET`; without the right secret it returns 401. Check runs in Vercel → project → Cron Jobs / logs.

---

## 10. Integrations and where things live

| Service | Used for | Where to manage it |
|---|---|---|
| **GitHub** (`ross-oliver-ai/HiddenGems`) | Source of truth; pushes to `main` trigger production deploys | github.com |
| **Vercel** | Hosting, builds, env vars, cron, domains, Blob storage | vercel.com project settings |
| **Railway** | Postgres database (use the **public** connection URL in `DATABASE_URL`) | railway.com |
| **Vercel Blob** | Item photos (`items/<userId>/photo.jpg` with a random suffix) | Vercel → Storage |
| **Stripe** | Subscriptions, Checkout, Customer portal, webhooks | dashboard.stripe.com (currently the **Sandbox**) |
| **Resend** | Transactional email | resend.com |
| **Fasthosts** | Domain registration and DNS for `hiddengemsapp.co.uk` (A record + `www` CNAME to Vercel; Resend records) | Fasthosts → Domain Names → Configure Advanced DNS |

---

## 11. Configuration (environment variables)

Set in **Vercel → Settings → Environment Variables** (Production). Locally, copy `.env.example` to `.env.local`.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Railway Postgres public URL |
| `AUTH_SECRET` | yes | 32+ character random string for signing sessions (`openssl rand -base64 48`) |
| `BLOB_READ_WRITE_TOKEN` or `BLOB_STORE_ID` | for photos | Added automatically when a Blob store is connected |
| `SETUP_TOKEN` | first run only | Protects `/setup`; **delete after setup** (already deleted in production) |
| `APP_URL` | yes in practice | `https://www.hiddengemsapp.co.uk`; used for links in emails |
| `RESEND_API_KEY`, `EMAIL_FROM` | for email | Together they switch email on, e.g. `Hidden Gems <hello@hiddengemsapp.co.uk>` |
| `SIGNUPS_OPEN` | optional | `true` opens self sign-up (needs email) |
| `SIGNUPS_PER_DAY` | optional | Daily sign-up cap (default 100) |
| `BILLING_ENABLED` | optional | `true` starts enforcing trials (needs both Stripe keys) |
| `STRIPE_SECRET_KEY` | for billing | Test key now; live key at go-live |
| `STRIPE_WEBHOOK_SECRET` | for billing | Signing secret of the webhook endpoint (different for test and live) |
| `STRIPE_PRICE_ID` | optional | A fixed Stripe Price; otherwise £3/month is created inline |
| `CRON_SECRET` | for the cron job | Any long random string |
| `TRIAL_DAYS`, `PRICE_PENCE` | optional | Trial length (1–365, default 30) and price in pence (default 300). Also changes the wording in the app and emails |
| `MIGRATE_ON_BUILD`, `EMAIL_DEBUG_LOG`, `STRIPE_API_BASE` | testing only | Force migrations on non-production builds; log emails; point Stripe calls at a fake server |

---

## 12. Deploying and operating

**Deploy.** Merging to `main` triggers a Vercel **production** build. `npm run build` is `tsx scripts/build-migrate.ts && next build`: on production builds it first applies pending migrations; **if a migration fails the build fails and the live site stays on the previous version.** Migrations are additive, so rollback is safe.

**Only production builds run.** In Vercel → project → Settings → **Build and Deployment** → **Ignored Build Step**, the behaviour is set to **Only build production**, so branches and pull requests don't get preview builds. (They used to fail anyway: preview deployments have no `DATABASE_URL`, deliberately, so previews can't touch real data, and the build trips over it.) If previews are ever wanted again, give Preview its own empty test database; do **not** add the production database URL to Preview.

**Domain.** Added in Vercel (apex and `www`); DNS at Fasthosts; HTTPS certificates are automatic and free. Sign-in cookies are per host, so people sign in once on a new domain, and anyone who installed the app from the old address should re-add it from the new one.

**Going live with Stripe (checklist).**
1. Switch the Stripe dashboard to live mode; create live API keys → `STRIPE_SECRET_KEY`.
2. Create a **new live webhook destination** (same URL, same six events, Snapshot payloads); copy its **own** signing secret → `STRIPE_WEBHOOK_SECRET`.
3. Configure the **Customer portal in live mode** too (sandbox settings don't carry over).
4. Redeploy, then make one real £3 payment on your own card and refund it; check Billing, the webhook delivery (200), and cancel flow.

**Rotating secrets.** Railway password: use **Regenerate** (Postgres service → Database → Config → Connection), never edit the password variable by hand (that changes only the variable, not the real password). Then copy the new `DATABASE_PUBLIC_URL` (the full `postgresql://user:password@host:port/db` string) into `DATABASE_URL` in Vercel and redeploy; the site can't reach its database in between, so do it quickly at a quiet time. Keep the URL out of chats and screenshots. Stripe or Resend keys → update in Vercel → redeploy.

**Backups.** Rely on Railway's database backups (confirm they're switched on). The CSV export is a per-user safety net.

---

## 13. Local development and scripts

Most development on this project has been done without a local machine (changes go through GitHub and Vercel), but the app runs locally:

```bash
npm install
cp .env.example .env.local        # fill in DATABASE_URL and AUTH_SECRET at least
npm run db:migrate                # create tables
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-long-password' npm run db:seed   # create the admin
npm run dev
```

| Script | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev server / production build (runs migrations on production deploys) / serve the build |
| `npm run lint` / `typecheck` | ESLint / `tsc --noEmit` |
| `npm run db:generate` | Generate a migration after changing `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` |
| `npm run db:seed` | Create or reset the admin (re-running resets that password) |

**Testing.** There is no automated test suite in the repo yet. Changes have been verified with type-check, lint, a production build and ad-hoc browser tests (Playwright) against a local Postgres and a small fake Stripe server, plus manual testing in the Stripe sandbox. Turning those scripts into checked-in tests is a worthwhile future task.

---

## 14. Working notes and gotchas

- **This is a newer Next.js than most docs describe.** `AGENTS.md` tells coding agents to read `node_modules/next/dist/docs/` before writing code. Notable differences already hit: `proxy.ts` replaces `middleware.ts`; `params` and `searchParams` are Promises; route handlers that read headers are dynamic.
- **Server Actions body limit** is 6 MB (`next.config.ts`); photos are resized in the browser first (about 4 MB cap in the upload route).
- **Migrations ship with certain functions** (`outputFileTracingIncludes` for `/setup` and `/settings`) so the manual buttons can run them.
- **Inputs must stay at 16px** (set globally in `globals.css`) and the viewport sets `maximum-scale=1`, otherwise iPhones zoom in when a field is focused. Pinch-zoom is blocked on Android as a result.
- **Theme and mode** are `data-theme` / `data-mode` attributes on `<html>`, driven by the user's saved choice; signed-out pages follow the device setting.
- **Don't import the database at build time** in new top-level code: `src/db/index.ts` throws if `DATABASE_URL` is missing (that's why preview builds fail).
- **Rate-limit counts** for emails use tokens created in the last hour, whether or not they were used.
- **Keep this README current.** Every change that affects what's described here updates the README in the same pull request; `CLAUDE.md` has the checklist, and each PR description says which sections changed (or "No README impact").
- **Ways of working.** The owner is a product manager building this from a phone: changes are made by Claude (Claude Code) in a sandbox, opened as a pull request, and **merged only when the owner says "merge"**. Keep changes small, one PR per idea, with a plain-English description and what was tested. Don't add unrequested features; propose them and wait.

---

## 15. Project history

| Stage | What shipped |
|---|---|
| 1 | Schema, login, admin-created accounts, forced password change, app shell, themes and dark mode |
| Setup page | One-time `/setup` to create tables and the admin from a phone |
| 2 | Items, full buy-to-sold lifecycle, photos, shops/categories/postal settings |
| Polish | Sign out on forced change-password, search-as-you-type, whole-photo viewer with zoom |
| 3 | Reports, charts, goals, stale-stock alerts, CSV export; chart label and mobile date fixes; jump-to-period picker; PWA |
| Goal | Confetti when the monthly goal is reached |
| Landing | Public landing page, waitlist, admin "Update database" button; copy and layout tweaks |
| Sign-up | Self sign-up, email confirmation, password reset (off until enabled) |
| Billing (#14) | 30-day trial, read-only lock, Stripe subscriptions, trial reminder emails, admin controls (off until enabled) |
| #15–#16 | Title Case categories (new defaults and existing); new accounts start in Blossom dark |
| #17–#19 | Admin trial buttons: confirmations, End trial now, shown only where they apply |
| #20 | Change email (user and admin) |
| #21 | Stop iPhones zooming into fields |
| Launch prep | Domain `hiddengemsapp.co.uk`, `APP_URL`, webhook moved to the new domain; preview builds switched off; database password rotated |

---

## 16. Open items and backlog

**Before charging real customers**
- [ ] Live Stripe keys, live webhook with its own secret, live Customer portal, a real £3 test payment and refund (see [Deploying](#12-deploying-and-operating)).
- [ ] Business status (sole trader or limited company), VAT position, and a professional review of the terms and privacy notice (including the 14-day refund promise; add contact details and the business name).
- [ ] Confirm the daily cron actually ran (Vercel → Cron Jobs).
- [x] Housekeeping done: `SETUP_TOKEN` deleted; Vercel Ignored Build Step set to Only build production; Railway database password regenerated (22 Nov 2026) and `DATABASE_URL` in Vercel updated.
- [ ] Housekeeping still to do: confirm Railway backups are on; test a real photo upload on a phone.

**Product ideas offered but not started**
- Account deletion and a fuller data export in Settings.
- Sign out other sessions on password reset; rate-limit sign-in attempts.
- Receiving email (`hello@`, `support@`, `billing@`).
- Bulk-buy splitting (one purchase → several items) and multi-platform support beyond Vinted.
- List thumbnails still crop photos.
- Auto-capitalise newly typed category names.
- Checked-in automated tests (unit tests for `entitlement()`, report maths, and end-to-end flows).
- A TikTok/ad video for launch (AI-generated in HeyGen) is parked, not part of this repo.
