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

## Accounts
Nobody can sign up. As admin, go to Settings → Manage users, add a person with a temporary password, and give it to them. They must choose their own password at first sign-in. Each user's data is private to them.

## Scripts
- `npm run db:generate` after changing `src/db/schema.ts`, then `npm run db:migrate`
- `npm run typecheck`
