# Hidden Gems

A mobile-first web app for resellers: record what you buy, list, sell and post, and see what you **really** make (profit, margin, ROI, stock value, goals). It started as a charity-shop-to-Vinted tracker for one person (it now supports any selling platform) and is being turned into a product other resellers can sign up to (free 30-day trial, then £3/month).

- **Live site:** https://www.hiddengemsapp.co.uk (the original `hidden-gems-seven.vercel.app` address still works)
- **Repo:** `ross-oliver-ai/HiddenGems` (default branch `main`)
- **Last updated:** 24 November 2026 (kept current with every change; see `CLAUDE.md`)

> **If you only read one section, read [Current state](#1-current-state) and [Working notes](#14-working-notes-and-gotchas). Before changing any screen, also read [Screens that other things describe](#screens-that-other-things-describe).**

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
| Error alerts: an email to the owner when something breaks on the server, plus an admin "Send a test alert" button (PR #47) | Built and tested (unit tests, and a browser run that hits a deliberate crash). **Verified live (23 Nov 2026)**: the test alert arrived in the hello@ inbox within a minute. A real crash alert has not been seen yet, as nothing has broken |
| Admin Overview with usage figures, and a filterable Users list (PR #46) | Built and tested in a phone-sized desktop browser. Overview seen working on the live site on a phone (23 Nov 2026) |
| Account deletion, full data download, Settings grouped into Your app / Your account / Admin (PR #45) | Built and tested in a phone-sized desktop browser. **Verified live (23 Nov 2026)** with a real test account that had a photo: the data download zip was correct, deleting removed the account and the photo from Blob. **Stripe cancellation verified (24 Nov 2026):** deleting a test account with an active sandbox subscription left it Cancelled in Stripe (the £3 payment stays, as it should), and on live Stripe deleting the real-payment test account sent `customer.subscription.deleted`, answered 200 |
| Public landing page and waitlist | Live |
| Self sign-up, email confirmation, password reset | Built; switched on with `SIGNUPS_OPEN=true` |
| Email change (user and admin) | Built, tested live |
| Free trial and read-only lock | Built, tested end to end, **on** |
| Stripe subscriptions (£3/month) | **Live since 24 Nov 2026** (live restricted key, live webhook, live Customer portal; billing is enforced). Checked with one real £3 payment: see [Going live with Stripe](#12-deploying-and-operating). Built and first tested end to end in the Stripe sandbox |
| Custom domain | Live: `www.hiddengemsapp.co.uk` (DNS at Fasthosts, certificate by Vercel) |
| Preview deployments | Off (Ignored Build Step = Only build production) |
| Multi-platform selling (platforms, listings, sold on, handover) | Built (PR 2); existing items were copied across by migration `0007`. Fees and postage paid are built too (PR 3, below). Reports by platform and by handover method are built too (PR 4, below). Not yet verified on the live site |
| Fees and postage paid (per-platform fee %, fees and postage on each sale, profit after both) | Built (PR 3). Not yet verified on the live site |
| Loading placeholders and "Show more" on Items (PR #32) | Built. Not yet verified on the live site. Items load 50 at a time; an admin-only timing readout is there to find out why pages feel slow |
| Automated tests | GitHub runs them on every pull request and on `main` (billing rules, report maths, migrations, a browser run through the core journey). See [Tests](#tests) |
| Trial-reminder emails (daily cron) | Built and registered in Vercel (Active, 08:00 UTC). Each run is now recorded and shown on the admin Overview's "Daily job" card (PR #48); the first scheduled run was confirmed there on 24 Nov 2026 ("Ran today at 08:47 UTC") |
| Daily job status on the admin Overview (PR #48) | Built and tested (unit tests and the browser run). On the live site a manual Run from Vercel fills the card ("Ran today at 22:07 UTC", 23 Nov 2026). The scheduled run recorded itself too: "Ran today at 08:47 UTC" on 24 Nov 2026 (Hobby plan crons can start anywhere in the 08:00 hour) |

**People and data.** The first testers (the owner's wife and a friend; the wife now uses the app from the new domain) are marked **"free forever"** (`billing_exempt`) and are never locked. The migration that shipped billing set `billing_exempt = true` for every account that existed at that moment. Admins are never billed either.

**Before real customers pay** (see [Open items](#16-open-items-and-backlog)): nothing blocks launch (24 Nov 2026). The owner is a sole trader under the £1,000 trading allowance, is happy with the terms for now and will have them reviewed once there are paying customers. The one thing deliberately put off is Railway Pro backups, until the promotion brings real sign-ups.

---

## 2. What the app does

### For sellers
- **Items.** Each item records name, brand, size, condition, notes, photo, category, **where from** (charity shop, car boot, online auction, your own wardrobe or any place you add), buy price and date. Search as you type (name, brand, where from) and filter chips (wrapped onto rows so none are hidden off-screen): All, In stock, To list, Listed, To send, Waiting for money, Sold, Returned/unsold. List cards show small platform tags (where it is live, or where it sold). **Waiting for money** lists posted parcels (posted, payment not yet in) with how long each has waited ("Waiting 5 days", or "Posted today"), longest wait first; the Home tile of the same name counts them. In-person sales skip it because they complete when handed over. Ordering follows the chip: Sold and To send show the newest sale first, Listed shows the longest-listed first (items with no date go last), and the other chips show the newest added first (`order` on each entry in `FILTERS`; no manual sort control yet). The list shows the first **50** items in that order; below them a "Showing 50 of 212" line and a **Show more** button add 50 at a time (the count is kept in the address as `n`, so Back from an item returns to the same place; search and the filter chips start again at 50). The line and button only appear when there are more to show. The total respects the filter and search.
- **Loading placeholders.** Every page in the app has a `loading.tsx`: greyed-out shapes that look like the real page (item cards on Items, tiles and a chart on Reports, a photo block on an item) with one small spinning gem (it stands still if the phone is set to reduce motion). They appear straight away when a link is tapped, while the data loads.
- **Timing readout (admin only).** Add `?timing=1` to `/items` while signed in as an admin to see how long each step took (sign-in check, two database round trips, the items query, live platforms). For tracking down slow pages; it is not shown to anyone else.
- **To send.** The "To send" chip (and the Home "To send" tile, which opens it directly) shows everything sold but not yet posted or handed over as a worklist grouped by how it goes: one group per postal service the seller has set up (A to Z, hidden services still appear while parcels wait), then No service chosen, Collection, Delivery and No method set. Empty groups are hidden; the longest-waiting sale is first. Each row shows the photo, name, the platform it sold on and how long ago it sold, with one-tap **Mark as posted** (postal) or **Mark as handed over** (collection and delivery), using today's date (change it from the item page if needed). A "marked as posted · Undo" bar stays for 10 seconds after a tick and puts the item back to "sold, to send". Search works inside it. Uses the same step rules as the item page; no database change.
- **Lifecycle** (see the diagram in [Data model](#5-data-model)). Bought → Listed → Sold → Posted → Completed, plus Returned (with refund amount), Unsold and Donated. Each step asks only for what it needs and validates (for example, you can't list before you bought). **Undo:** on a sold, posted or completed item a button undoes the most recent step ("Undo sale" asks first, because it clears the price, fees and postage and puts the item back on sale).
- **Selling on several platforms.** Each seller has a list of platforms (defaults Vinted, eBay, Depop, Facebook Marketplace, Gumtree). Listing an item means choosing one or more platforms, each with its own price (a new platform starts at the first platform's price; change it only if different) and an optional link. "Also list on…" adds platforms later; "Take off X" ends one listing; "Take off everywhere" puts it back to to-list. Price reductions are per platform and kept as history.
- **Selling and handover.** The sell step records **Sold on** (the platform) and how it got to the buyer: **By post** (with a postage service), **Collected by buyer** or **I delivered it**. Posted items go Sold → Posted → Completed as before. Collected and delivered items skip the "posted" step: an "Already handed over" tick (on by default) completes the sale straight away; unticked, the item stays "Sold, to send" with a "Mark as handed over" button. Selling ends the listing on every other platform.
- **Profit.** Sold, posted and completed items: sold price − fees − postage I paid − buy price. Returned: sold price − refund − fees − postage I paid − buy price (fees and postage already paid still count unless you edit them). Unsold or donated: −buy price (written off). Items still in stock have no profit yet. Older sales have no fees or postage, so their profit is unchanged.
- **Fees and postage paid.** Each platform can have an optional fee % (Settings → Platforms & postage → Selling fees; default 0, set by you). When you mark an item sold, "Fees (£)" is pre-filled as that % of the sold price and can be changed; "Postage I paid (£)" is blank by default. Both are stored as £ amounts on the sale, so changing a platform's % later never rewrites old profits. Both can be edited on a sold or returned item (Edit details). Fees count in the month of the sale.
- **Stale stock.** A listed item is "stale" once it has been listed for the user's chosen number of days (default 30).
- **Photos.** Taken or chosen on the phone, resized in the browser to JPEG, uploaded to Vercel Blob. Tap to enlarge and zoom.
- **Home.** Greeting, counts (to list, listed, to send, waiting for money), stock value at cost, and this month's profit goal with confetti when it's reached.
- **Reports.** Profit, margin, return on cost and average profit are after fees and postage paid; the profit card shows the fees and postage taken off. Period picker (week, month, quarter, UK tax year, year, all time, custom; the chips wrap onto rows rather than scrolling sideways) with jump-to-previous-period. Percentages (margin, return on cost, sell-through) are shown as whole numbers via `percent()` in `src/lib/format.ts`. KPIs: money spent, revenue, profit, margin, ROI, average profit, average days to sell, sell-through. Charts over time; rankings by category, where from ("Best places to buy") and postal service; **Selling platforms** (profit after fees, items sold, average days from first listing to sale, and sell-through for each platform, best first; sales only, so write-offs belong to no platform, and sales with no platform recorded show as "Not set". Sell-through is, of the distinct items listed on that platform in the period, how many sold there; an item listed on two platforms counts as listed on both but sold on one, and a relisted item counts once); **How items got to the buyer** (a bar of profit for By post / Collected by buyer / I delivered it, each labelled with how many items were sold that way); best and worst items; stock ageing buckets; the monthly goal pro-rated to the chosen period. Tap a chart to drill in.
- **CSV export** of all items (`/reports/export`), available on every plan, even when read-only. The place column is headed "Where from" (it was "Charity shop", so anyone reading the file by column name needs to update). "Listing link" holds the link of every listing (several are joined with ` | `). "Fees" and "Postage paid" columns sit before "Profit" so it adds up; "Sold on" and "How it got there" sit after "Sold for".
- **Your data: full download and account deletion.** Settings → Account has a **Your data** card. **Download all my data** (`/settings/account/download`, a plain GET so it works from any plan, even read-only) returns one zip, `hidden-gems-all-my-data-<date>.zip`, of spreadsheets (CSV, with the Excel byte-order mark): `items.csv` (the same file as the Reports download), `listings.csv` (each platform an item was listed on, with price, dates and link), `price-drops.csv`, `photos.csv` (a link to each item's photo; the photos themselves are not in the zip), `settings.csv` (account name, email, joined date, goal, stale days, platforms with fee %, postal services, where-from places and categories, hidden ones marked) and a `README.txt` that explains them and warns that photo links work for anyone who has them. The files are built in `src/lib/export.ts` (shared with the Reports CSV route). **Delete my account** is two steps: `/settings/account/delete` is a warning page (what goes, a download button, "Stripe keeps its own payment records") with a Continue button; `/settings/account/delete/confirm` asks for the email (any capitals) and the current password, and a red button deletes straight away. Order in `src/lib/delete-account.ts`: cancel any live Stripe subscription first (only if Stripe is switched on and the status isn't already cancelled; a 404 from Stripe counts as already gone), then delete every photo from Vercel Blob (100 at a time; skipped when Blob isn't configured), and only then delete the user row (everything else cascades), the account's sign-in attempts and any waitlist row for the email. If Stripe or Blob fails, nothing has been deleted and the person is told to try again, so a failed deletion never leaves a charged-but-deleted account. Afterwards the session is cleared, an "account deleted" email is sent as a record (best effort) and the person lands on the sign-in page with a "has been deleted" banner (`/login?deleted=1`). The password step uses the sign-in rate limiter. **Admin accounts can't delete themselves** (the page says so), so the app is never left without one. Stripe keeps its own payment records, as it must; the privacy page says so.
- **First-run checklist (new accounts only).** A "Getting started" card on Home with four steps: **Check your selling fees**, **Add your first find**, **List it for sale**, **Record your first sale**. Each step is a link to the right screen, and arriving from one shows a **spotlight**: the rest of the screen dims a little, the target is ringed (the ring pulses unless the phone's "reduce motion" setting is on), and a short caption with a "Got it" button sits beside it. The spotlight never blocks taps; a tap or key press anywhere fades it, "?tour=" is taken out of the address at once so a refresh doesn't bring it back, and if the target can't be found (a screen changed) it quietly does nothing. Steps tick themselves from the person's own data (any item; any listing; any item with a sold date), except fees: some platforms don't charge sellers, so 0% is a valid answer, and the step is ticked when the selling-fees form is saved (`users.fees_reviewed_at`). "List it" and "Record a sale" can't be opened until there is an item to open (the card says "Add an item first." / "List an item first."). "Hide this" (`users.checklist_hidden`) removes it for good; it also disappears when all four are done, and it is not shown to a read-only (expired-trial) account. It replaces the old "Nothing in stock yet" card while it is showing. **It is for new accounts only: migration `0010` set `checklist_hidden` for every account that existed at the time.** The four spotlight targets are listed under [Screens that other things describe](#screens-that-other-things-describe). Only tested in a phone-sized desktop browser, not on a real phone.
- **Help and feedback.** A signed-in page at `/help`, linked from Settings (it still opens when a trial has ended). It explains, with the real status pills, what each status means; how profit is worked out (what's included and that packaging, travel and storage are not); that every platform's fee starts at 0% and where to set it; how to Undo; where to download the CSV; what read-only means after the trial; and how to get in touch. The contact is `hello@hiddengemsapp.co.uk` (a constant in `src/lib/contact.ts`): a **Send feedback** button opens the person's own email app with the subject filled in, so there is no feedback form or storage. The terms and privacy pages give the same address. The status descriptions live in `src/lib/help.ts`, typed so a new status can't be added without explaining it. No database change.
- **Settings.** Colour theme (Blossom, Sage, Lavender, Apricot, Ocean, Berry) × light/dark/auto. The main Settings page is a short menu split into labelled groups, each with a small uppercase title in the theme colour and a thin line (`SettingsGroup`, `src/components/SettingsGroup.tsx`; `data-settings-group`): **Your app** (the colour theme card, **Platforms & postage** with selling platforms, their optional fee % and postal services, **Where from & categories**, **Targets** for the monthly profit goal and stale-after days), **Your account** (**Account**: change email, change password, download and delete your data; **Billing**; **Help and feedback**) and, for the admin only, **Admin** (Overview, Manage users, Waitlist, the database button), followed by the name, email and Sign out card. Rule of thumb for a new row: if it changes how the app works for your items, it goes under Your app; if it is about you, your money or getting help, under Your account.
- **Defaults for new accounts.** Categories: Women's Clothing, Men's Clothing, Kids' Clothing, Shoes, Bags & Accessories, Books, Home & Kitchen, Toys & Games, Electronics, Other. Postal services: Royal Mail, InPost, Evri. Platforms: Vinted, eBay, Depop, Facebook Marketplace, Gumtree. Where from: Car Boot, Charity Shop, Online Auction, Own Wardrobe (A to Z; existing accounts were given any that were missing by migration `0009`). The Add item form remembers the last place used (the newest item's, skipping any you have hidden); there is no separate default setting. New accounts start in **Blossom + Dark** mode.
- **Installable (PWA).** Add to Home Screen on iPhone (Safari) or Install on Android (Chrome). Full-screen, gem icon. Needs a connection (no offline mode).

### For the admin
- **Lands on the Overview.** An admin who signs in goes straight to the Overview (`/admin`) instead of Home (`landingPathFor()` in `src/lib/landing.ts`, used by the sign-in action and by the forced first password change; a forced password change still comes first). Only that moment is affected: opening the app while already signed in (the installed app's start address is `/`, and sessions last 30 days) and the Home tab still go to Home, and everyone who isn't an admin lands on Home.
- **Overview** (Settings → Admin → Overview, `/admin`): the usage figures, for everyone except admins. **Sign-ups** (accounts, joined in the last 7 and 30 days, how many haven't confirmed their email); **Are they using it?** (how many have added at least one item, how many never have, active in the last 7 and 30 days); **Plans** (On trial, Paid, Payment failed, Read-only, Free forever; each tile opens the Users list filtered to it); **Trial to paid** (of the people whose free trial has ended, how many ever subscribed, with a whole-number percentage; free-forever accounts are left out, someone who subscribed and then cancelled still counts as converted, and with only a few people one account moves it a lot); **Trials ending within 7 days** (soonest first); **Newest sign-ups** (the last five, with plan, item count and when they were last active); and **Across the whole app** (items recorded, items sold in the last 30 days, waitlist entries not yet invited). The sums are in `computeUsage()` (`src/lib/usage.ts`, pure, no database) and the queries in `src/lib/usage-data.ts`. **"Active" means the person added or changed an item** (`items.updated_at`, which every item change sets); nothing is tracked about page views or sign-ins, so someone who only looks at their reports isn't counted. No database change. **Refresh button:** a round refresh icon at the top right of the Overview (`RefreshButton`, `src/components/RefreshButton.tsx`) re-reads the figures from the server without leaving the page (`router.refresh()`), and the icon spins while it loads. It exists because an app installed to an iPhone's Home Screen has no pull-down-to-refresh; sellers don't have one (their screens change when they act), and it is only on the Overview.
- **Daily job** (Overview, above Error alerts): whether the daily trial-reminder job is really running. Shows "Ran today at 08:03 UTC" with what it did (accounts looked at and reminder emails sent, or that billing is off so none were due); "Hasn't run yet" before its first recorded run; a warning if the last run was more than 26 hours ago; and a red failure line with a scrubbed reason if the last run crashed (the crash also sends an error alert). It exists because Vercel's free plan keeps runtime logs for only about an hour, so its own logs can't answer "did it run this morning?".
- **Error alerts** (bottom of the Overview): says where alerts are emailed (`ALERT_EMAIL`, or the support address), lists the most recent problems (where, what, how many times, when last), shows "No problems recorded" when there are none, and has a **Send a test alert** button that records a test row and sends a real email, ignoring the limits below, so the whole chain can be proved on the live site. What triggers an alert: any uncaught server error (a page, an action or an API route crashing, including the daily job and photo upload), plus failures that are caught and swallowed on purpose (Stripe webhook, checkout, billing portal, checkout confirmation, waitlist sign-up, and the Stripe cancel or photo removal steps of account deletion). One email per distinct problem per hour, at most 20 different problems emailed per 24 hours; further occurrences are counted but not emailed. Nothing about a customer goes in the alert: no stack trace, no email address, no query values, no long tokens or numbers (see [Accounts and security](#6-accounts-sign-up-and-security) and Working notes).
- **Manage users** (Settings → Manage users): a row of filter chips with counts (All, On trial, Paid, Payment failed, Read-only, Free forever, Not confirmed, No items yet; `?show=` in the address, an unknown value shows everyone), the newest account first, "Add a user" folded away until tapped so the list comes first, and under each name how long ago they joined, how many items they have and when they were last active. Create accounts with a temporary password (the person must choose their own at first sign-in; admin-created accounts are pre-confirmed), reset passwords, change someone's sign-in email, disable or re-enable, make "free forever", extend a trial by 14 days, end a trial now. Each action that changes a trial or someone's access asks for confirmation. A plan badge shows each person's state (Trial: Nd left, Paid to date, Read-only, Free forever, …).
- **Waitlist** (Settings → Waitlist): emails collected by the landing page, with an "invited" toggle and a copy-all button.
- **Update database**: a manual button that applies pending migrations (a fallback; production deploys do this automatically).
- The admin account does not hold stock itself; it manages users.

### Public pages
Landing page (`/welcome`, shown at `/` to signed-out visitors). It leads with a worked example of one sale (sold for, fees, postage, what I paid, "You keep"), then the purchase-to-payout journey using the real status pills, three feature blocks drawn as pictures of the real screens (several platforms with a price each, the To send list, Reports), a short "small things" grid, the goal confetti, a short note on why it was built, the price and trial, and a five-question FAQ. The price and trial length are read from `priceLabel()` and `trialDays()` (so `PRICE_PENCE` and `TRIAL_DAYS` change the page too), and the join box is the waitlist form or a sign-up button depending on `signupsOpen()`. Sign-in, sign-up, confirm email, forgot/reset password, terms, privacy. The terms and the privacy notice each open with who runs the service (the owner's name as a sole trader, postal address and the support email, from `src/lib/contact.ts`), as UK online-selling rules expect those details to be easy to find.

---

## 3. Tech stack

| Layer | Choice |
|---|---|
| Language | **TypeScript** (strict) throughout, plus a little SQL (migrations) and CSS |
| Framework | **Next.js 16.4** (App Router, Turbopack), **React 19**, Server Components and **Server Actions** for all mutations |
| Styling | **Tailwind CSS 4** with CSS variables for themes; hand-built components (no UI kit). Font: Apple's rounded system font where the device has it, otherwise **Nunito**, bundled with the app (`next/font/local`) so PCs and Android phones match |
| Charts | **Recharts** |
| Database | **PostgreSQL** (Railway) via **Drizzle ORM** and `pg`; migrations generated by **drizzle-kit** |
| Validation | **Zod 4** |
| Auth | Own implementation: **bcryptjs** password hashes, **jose** signed JWT in an HTTP-only cookie |
| File storage | **Vercel Blob** (item photos) |
| Zip files | **fflate** (small, no dependencies; builds the full-data download) |
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
  instrumentation.ts           onRequestError: reports every uncaught server error to the alerts (Node runtime only)
  app/
    layout.tsx                 <html data-theme data-mode>, viewport, loads the bundled Nunito font
    fonts/                     nunito-latin-wght-normal.woff2 + its licence (SIL Open Font License)
    (app)/                     signed-in app
      page.tsx                 home dashboard
      items/                   list, new, [id] detail, actions.ts, lifecycle.ts (step router)
      loading.tsx              placeholder shown while any page loads; items/, items/[id]/ and reports/ have their own
      reports/                 page + export/route.ts (CSV of items)
      settings/                page (short menu), actions, account/ (change email, change password, Your data; download/route.ts = the zip; delete/ = warning page + confirm/ page + actions.ts), platforms/ (platforms, postal), lists/ (shops, categories; holds the shared list actions), targets/ (goal, stale days)
      help/                    Help and feedback page (statuses, profit, fees, Undo, contact)
      checklist-actions.ts     "Hide this" on the first-run checklist
      billing/                 page + actions (Checkout, Customer portal)
      admin/                   alert-actions.ts (test alert), page.tsx (Overview: usage figures, error alerts), users/ (list with filters), waitlist/, update-database action
    api/
      stripe/webhook/route.ts  Stripe events in
      cron/trial-reminders/    daily job (also clears old alerts)
      e2e-boom/route.ts        deliberate crash for the browser tests; 404 unless `E2E_BOOM=1`
      upload/route.ts          photo upload to Blob
    login/ signup/ verify/ forgot-password/ reset-password/
    change-password/ change-email/ confirm-email-change/ setup/
    welcome/ (landing: page.tsx, Mocks.tsx pictures of the real screens, GoalShowcase, WaitlistForm)  terms/  privacy/  manifest.ts  icons
  components/                  shared UI (PlanBadge, SettingsGroup, DeleteAccountForm, forms, charts, banner, pickers, PlatformPicker, SellFields, Checklist (Home card), Spotlight (the ring and caption), Loading placeholders, TimingReadout, …)
  db/  schema.ts index.ts      Drizzle schema and pooled connection
  lib/
    auth.ts session.ts password.ts   sessions, guards, hashing
    sign-in-rules.ts sign-in-limit.ts  sign-in rate limiting: the numbers and wording (pure), and the recording and counting of attempts (database)
    billing.ts stripe.ts             entitlement logic, Stripe client + webhook handling
    email.ts authEmails.ts trialEmails.ts emailChange.ts tokens.ts
    usage.ts usage-data.ts           the admin's usage figures: the sums (pure) and the queries
    export.ts delete-account.ts      the full data download (CSV builders and the zip), and permanent account deletion (Stripe, then photos, then data; dependencies can be swapped in tests)
    listings.ts listing-labels.ts    platforms, listings, selling, handover and undo logic (all DB rules live here; tests cover it)
    to-send.ts send-groups.ts        the To send worklist: the query, and the grouping (pure, no database)
    item-list.ts                     the Items list query: newest N matching items plus the total count (paging is in items.ts: PAGE_SIZE, parseShowCount)
    checklist-steps.ts checklist.ts  the first-run checklist: steps, spotlight captions (TOURS) and done-rules are pure; checklist.ts holds the queries
    contact.ts help.ts               the support email and feedback link, and who runs the service (name and address shown on the terms and privacy pages); the Help page's status descriptions
    job-status.ts job-runs.ts        the daily job's "last ran" note: what the Overview says about it (pure), and the database read/write
    alert-rules.ts alerts.ts         error alerts: scrubbing, signatures and the limits (pure); recording, emailing and the admin list (database)
    timing.ts                        timed() notes how long a step took, per request (for the admin timing readout)
    items.ts reports.ts periods.ts queries.ts format.ts defaults.ts themes.ts migrations.ts
scripts/  build-migrate.ts migrate.ts seed-admin.ts
tests/    *.test.ts (unit + database tests), e2e/journey.ts (browser), helpers/testdb.ts
.github/workflows/tests.yml    the automatic check on every pull request
drizzle/  0000…0011_*.sql + meta/ (journal and snapshots)
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
| `users` | Account, role (`admin`/`seller`), password hash, `must_change_password`, `disabled`, theme and colour mode, monthly goal, stale-after days, `email_verified_at`, `checklist_hidden` and `fees_reviewed_at` (the first-run checklist), and all billing fields (see below) |
| `shops` (shown in the app as **Where from**; the table keeps its old name), `categories`, `postal_services`, `platforms` | Per-user lookup lists (`archived` instead of delete). `platforms.fee_percent` is the optional selling fee % (default 0) used only to pre-fill the fee on a sale |
| `items` | One row per item with every lifecycle field (bought/listed/sold/posted/returned dates and prices), `status`, photo URL, `fees` and `postage_paid` (£ amounts on the sale, 0 = none), `sold_platform_id` and `handover` (`posted`/`collected`/`delivered`, shown as "By post" / "Collected by buyer" / "I delivered it") for the sale. The label says how it is sent, not that it has been posted: the status and `posted_at` say that. `listed_at` and `list_price` are a **summary of the live listings** (earliest date, first platform's price) kept in step by `src/lib/listings.ts`; the column `vinted_url` is **no longer written** (kept so rolling back is safe) |
| `listings` | One row per item per platform: `price`, optional `url`, `listed_at`, `ended_at` (null while live). Only one live listing per item per platform (partial unique index) |
| `price_changes` | History of asking-price reductions per item; `listing_id` says which platform's price changed (null on old rows) |
| `auth_tokens` | One-time email links (`verify_email`, `reset_password`, `change_email`); only a SHA-256 hash is stored, with expiry, used-at and an optional `payload` (the new email for `change_email`) |
| `login_attempts` | Recent sign-in attempts (email as typed, lower-cased; network address if readable; time) used for rate limiting. Rows for an email are deleted on a correct password or a password reset, and anything over a day old is purged on the next sign-in attempt |
| `stripe_events` | IDs of Stripe webhook events already handled |
| `waitlist` | Landing-page signups, with `invited_at` |
| `job_runs` | One row per scheduled job (today only `daily`): when it last ran, whether it worked, accounts checked, reminders sent, whether billing was off, a scrubbed error, and a run count. Updated by the cron route on every run |
| `error_alerts` | One row per distinct server problem (`signature` is the key: source, scrubbed route, error type and scrubbed message with numbers flattened): `count`, `first_seen_at`, `last_seen_at`, `last_emailed_at`, optional log `digest`, `is_test`. Holds scrubbed text only. Rows not seen for 30 days are deleted by the daily job |

**Billing columns on `users`:** `billing_exempt`, `trial_ends_at`, `stripe_customer_id`, `stripe_subscription_id`, `subscription_status`, `subscription_period_end`, `cancel_at_period_end`, `payment_failed_at`, `trial_reminder_7_sent_at`, `trial_reminder_1_sent_at`.

### Item lifecycle

```mermaid
stateDiagram-v2
  [*] --> bought: add item
  bought --> listed: list (price, date)
  listed --> listed: reduce price
  listed --> bought: unlist
  bought --> sold: sell
  listed --> sold: sell (platform, price, handover)
  sold --> posted: post (posted items only)
  sold --> completed: hand over (collected or delivered items)
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
  sold --> listed: undo sale (or to-list if it was never listed)
  posted --> sold: undo
  completed --> posted: undo (posted sales)
  completed --> sold: undo (collected or delivered)
```
Transitions are enforced in `src/app/(app)/items/lifecycle.ts` (a table of which statuses each step may start from); the listing, selling and handover rules themselves are in `src/lib/listings.ts`. "Handing over" only applies to collected or delivered sales; "post" only to posted ones. Relisting a returned item clears the sale, including the sold platform and handover. `undo` (the **Undo** button on the item page, `undoLastStep()` in `listings.ts`) reverses only the most recent step: sold goes back on sale (the sale details, including fees and postage, are cleared, behind a confirmation, and the listings the sale ended come back; an item that was never listed goes back to To list), posted goes back to sold, completed by post goes back to posted, and completed in person goes back to sold. The listings that come back are those whose end date equals the sale date, so if the sale date was edited afterwards, or a platform was taken off on the same day as the sale, the result can differ (it then goes back to To list rather than guessing). Returned, unsold and donated items have no Undo (use List it again / Put back in stock). `undosend` (the Undo on the To send list) puts a just-posted parcel, or a just-handed-over collection or delivery, back to "sold"; it refuses a completed postal sale and anything else that isn't that exact step.

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
| `0007_multi_platform` | Adds `platforms`, `listings`, `items.sold_platform_id`, `items.handover`, `price_changes.listing_id`, and the handover enum. Then copies existing data: five default platforms per user; a Vinted listing for every item that had been listed; sold items marked Vinted + posted; price changes linked to that listing. Original columns are untouched. Proven on old-style data by `tests/backfill.test.ts` |
| `0008_fees_and_postage` | Adds `items.fees`, `items.postage_paid` (both default 0) and `platforms.fee_percent` (default 0). Existing rows get 0, so no past profit changes. Proven by `tests/fees.test.ts` |
| `0013_job_runs` | Adds the `job_runs` table. No changes to existing data |
| `0012_error_alerts` | Adds the `error_alerts` table (and an index on `last_seen_at`) for error alerting. No changes to existing data |
| `0011_sign_in_attempts` | Adds the `login_attempts` table (and its indexes) for sign-in rate limiting. No changes to existing data |
| `0010_first_run_checklist` | Adds `users.checklist_hidden` and `users.fees_reviewed_at`, then sets `checklist_hidden` for every account that already exists so the first-run checklist is for new accounts only. Proven by `tests/checklist.test.ts` |
| `0009_where_from_starters` | Adds Car Boot, Charity Shop, Online Auction and Own Wardrobe to every existing account that doesn't already have a place with that name (any capitalisation, hidden or not). Nothing is renamed, hidden or deleted, and it does nothing if run twice. Proven by `tests/where-from.test.ts` |

Generate a new one with `npm run db:generate` after editing `schema.ts`; pass `--name` for a readable file name.

---

## 6. Accounts, sign-up and security

- **Sessions.** A signed JWT (HS256, `AUTH_SECRET`, 30 days) in the `hg_session` cookie (HTTP-only, SameSite=Lax, Secure in production). It holds only the user ID, so email and role changes take effect immediately. Cookies are per host, so signing in on a new domain needs a fresh sign-in.
- **Passwords.** bcrypt (cost 12). 10–72 characters. Login runs a dummy hash when the email is unknown so timing doesn't reveal which emails exist.
- **First run.** Set `SETUP_TOKEN` in Vercel and open `/setup`: it applies migrations and creates the admin. It refuses to run again once an admin exists. Delete `SETUP_TOKEN` afterwards. (`npm run db:seed` does the same from a computer.)
- **Self sign-up** (`SIGNUPS_OPEN=true`, needs email configured): name, email, password, tick-box for terms, a hidden honeypot field, a daily cap (`SIGNUPS_PER_DAY`, default 100). The account gets a trial end date and default lists; a confirmation email is sent; the person can't sign in until they confirm. If the email can't be sent, the account is removed so they can retry.
- **Email confirmation / password reset.** One-time links (24h and 1h). The confirmation page requires a button tap, so email scanners that pre-open links can't use the token up.
- **Change email.** User: Settings → Account → Change email → new address + current password → link sent to the **new** address → nothing changes until confirmed → notice sent to the old address. Max 3 requests/hour. Admin: set directly from Manage users (admin vouches for it). Either way the new address counts as confirmed, unused links to the old address are revoked, the Stripe customer email is updated (best effort), and addresses are lower-cased and unique.
- **Sign-in rate limiting.** Each sign-in attempt is recorded *before* the password is checked, then counted; the attempt is removed again if the password was right. More than **8** recent attempts for one email (typed any way: case and spaces are ignored) or **30** from one network address, within **15 minutes**, and the person is told to wait ("Too many sign-in attempts. Please wait N minutes…"). The limits are `SIGN_IN_LIMITS` in `src/lib/sign-in-rules.ts`. Rules worth knowing: it is keyed on what was typed, not on whether an account exists, so it reveals nothing about who has one; the wait applies even to the right password (otherwise guessing would never be slowed); blocked attempts are not recorded, so hammering the form can't extend the wait; recording first and counting second stops a burst of simultaneous guesses all slipping through; a correct sign-in or a completed password reset clears that email's count (so a locked-out person can always get back in by email); if the visitor's address can't be read, only the per-email limit applies. The address is the first entry of `x-forwarded-for` (Vercel sets it). Sign-in only: change email and change password also ask for the current password but are not limited yet.
- **Delete my account.** Needs the signed-in session plus the typed email and the current password (so a phone left unlocked can't delete an account in two taps), counted by the sign-in limiter. See Your data under [What the app does](#2-what-the-app-does) for the order of steps and what is kept.
- **Error alerts hold no customer data.** Alert rows and emails contain only a scrubbed summary (where, error type, a message with email addresses, query strings, anything after `params:`, long tokens, Stripe ids and long numbers removed, capped at 300 characters) and the Next.js log id; the full detail stays in Vercel's logs. The `/api/e2e-boom` test route is switched off unless `E2E_BOOM=1`.
- **Other protections.** Every query scoped to the signed-in user; the Stripe webhook verifies its signature; the cron route needs a bearer secret; uploads need a session; photos use unguessable random-suffix URLs (public if the URL is known).

**Known gaps:** the "current password" checks on Change email and Change password aren't rate limited (only sign-in is); someone can deliberately fail against another person's email to make them wait up to 15 minutes (they can reset their password to get in sooner); resetting a password doesn't sign out other sessions; photos are public-by-URL (long random addresses, so they can't be browsed or guessed, but anyone with a link can open one; the privacy notice and the download's README now say so; a signed or private-store design would be a bigger change); terms and privacy still need a professional review and contact details.

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
- **Account deletion** cancels the Stripe subscription immediately (`DELETE /v1/subscriptions/{id}`, `cancelSubscription` in `src/lib/stripe.ts`) before anything is removed; the resulting `customer.subscription.deleted` webhook finds no account and is ignored. Stripe keeps the customer and payment records.
- **Admin overrides:** make free forever, extend trial by 14 days (for trial or locked accounts), end trial now (for accounts on a trial).

**Stripe setup actually used:** **live mode since 24 Nov 2026** (the sandbox is still there for testing; switch the toggle in the dashboard). A live webhook destination at `https://www.hiddengemsapp.co.uk/api/stripe/webhook` with "Snapshot" payloads and the six events above (API version shown on it: `2026-11-18.endive`; the code reads the subscription renewal date from either the old or the new place, so it copes with both layouts). The API key is a **restricted** live key (`rk_live_…`) with **Write** on Checkout Sessions, Customer portal, Customers and Subscriptions and nothing else; a new kind of Stripe call needs its permission added to the key (Developers → API keys, editable without making a new key). The live Customer portal allows cancelling at the end of the period, changing the payment method and viewing invoices, with links to the terms and privacy pages. Public details: business name "Hidden Gems App" (shown on card statements as HIDDEN GEMS APP), support email hello@hiddengemsapp.co.uk. Radar fraud protection is the free Lite level; tax is handled manually (Stripe Tax is off, and the app sends no tax settings). There are no products in Stripe's catalogue because the £3 price is created inline at checkout. The Stripe client is hand-written `fetch` code in `src/lib/stripe.ts` (form-encoded, nested params). `STRIPE_API_BASE` exists only so tests can point at a fake Stripe.

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
| "Your Hidden Gems account has been deleted" | Account deleted by its owner (a record; sent best effort after the data has gone) | The deleted account's address |
| "Something went wrong on Hidden Gems" (and a TEST version from the admin button) | A server problem is recorded and not already emailed in the last hour | `ALERT_EMAIL`, else the support address. Scrubbed summary only |
| Trial reminders (about 7 days left, and the last two days) | Daily cron, only when billing is enforced | Verified, non-exempt, unsubscribed sellers |

Links are built from `APP_URL` (`https://www.hiddengemsapp.co.uk`), falling back to the Vercel production URL if unset. In non-production, `EMAIL_DEBUG_LOG=1` logs emails to the console instead of sending (used by tests).

---

## 9. Scheduled jobs

Only one, defined in `vercel.json`:

| Job | Schedule | What it does |
|---|---|---|
| `GET /api/cron/trial-reminders` | `0 8 * * *` (08:00 UTC daily) | Sends the two trial-reminder emails to eligible people (not admins, not free-forever, not subscribed, not disabled, verified email), recording `trial_reminder_7_sent_at` / `trial_reminder_1_sent_at` so nobody is emailed twice. Does nothing unless billing is enforced. Afterwards it also deletes error alerts not seen for 30 days (this part runs whether or not billing is on). |

Vercel calls it with `Authorization: Bearer $CRON_SECRET`; without the right secret it returns 401. Every run (including one started with the Run button in Vercel) is written to `job_runs`, and the admin Overview's **Daily job** card reads it, so use that to check it ran. In Vercel the job is listed under the project's **Schedules → Cron Jobs** tab (marked Legacy; Vercel says cron jobs will eventually move into Schedules, which would need a small change). On the free Hobby plan runtime logs last about an hour, so Vercel's logs only help right after a run, and the job may start anywhere in the 08:00 hour.

---

## 10. Integrations and where things live

| Service | Used for | Where to manage it |
|---|---|---|
| **GitHub** (`ross-oliver-ai/HiddenGems`) | Source of truth; pushes to `main` trigger production deploys | github.com |
| **Vercel** | Hosting, builds, env vars, cron, domains, Blob storage | vercel.com project settings |
| **Railway** | Postgres database (use the **public** connection URL in `DATABASE_URL`) | railway.com |
| **Vercel Blob** | Item photos (`items/<userId>/photo.jpg` with a random suffix) | Vercel → Storage |
| **Stripe** | Subscriptions, Checkout, Customer portal, webhooks | dashboard.stripe.com (**live mode** since 24 Nov 2026; the Sandbox is a toggle away) |
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
| `ALERT_EMAIL` | optional | Where error alerts go; defaults to the support address (`hello@hiddengemsapp.co.uk`) |
| `ALERTS` | optional | `off` stops recording and emailing alerts without a code change (emergency switch if alerts ever flood) |
| `SIGNUPS_OPEN` | optional | `true` opens self sign-up (needs email) |
| `SIGN_IN_LIMIT` | optional | `off` turns sign-in rate limiting off without a code change (an emergency switch: set it in Vercel and redeploy if people are being locked out by mistake). Anything else, or unset, leaves it on |
| `SIGNUPS_PER_DAY` | optional | Daily sign-up cap (default 100) |
| `BILLING_ENABLED` | optional | `true` starts enforcing trials (needs both Stripe keys) |
| `STRIPE_SECRET_KEY` | for billing | The live restricted key (`rk_live_…`, permissions in [Billing](#7-billing-free-trial-read-only-lock-stripe)); a sandbox key (`sk_test_…`) works for testing |
| `STRIPE_WEBHOOK_SECRET` | for billing | Signing secret of the live webhook destination (the sandbox one is different) |
| `STRIPE_PRICE_ID` | optional | A fixed Stripe Price; otherwise £3/month is created inline |
| `CRON_SECRET` | for the cron job | Any long random string |
| `TRIAL_DAYS`, `PRICE_PENCE` | optional | Trial length (1–365, default 30) and price in pence (default 300). Also changes the wording in the app and emails |
| `TEST_DATABASE_URL` | tests only | A throwaway Postgres for `npm test` / `npm run test:e2e`. **Wiped by the tests; the database name must contain `test`. Never set it in Vercel and never point it at the real database.** GitHub supplies its own in the workflow |
| `E2E_BOOM` | tests only | `1` switches on `/api/e2e-boom`, a route that crashes on purpose so the browser run can prove alerts are recorded. **Never set in Vercel** |
| `MIGRATE_ON_BUILD`, `EMAIL_DEBUG_LOG`, `STRIPE_API_BASE` | testing only | Force migrations on non-production builds; log emails; point Stripe calls at a fake server |

---

## 12. Deploying and operating

**Deploy.** Merging to `main` triggers a Vercel **production** build. `npm run build` is `tsx scripts/build-migrate.ts && next build`: on production builds it first applies pending migrations; **if a migration fails the build fails and the live site stays on the previous version.** Migrations are additive, so rollback is safe.

**Only production builds run.** In Vercel → project → Settings → **Build and Deployment** → **Ignored Build Step**, the behaviour is set to **Only build production**, so branches and pull requests don't get preview builds. (They used to fail anyway: preview deployments have no `DATABASE_URL`, deliberately, so previews can't touch real data, and the build trips over it.) If previews are ever wanted again, give Preview its own empty test database; do **not** add the production database URL to Preview.

**Regions.** The Railway database is in **EU West (Netherlands)**. Vercel's **Function Region** (Settings → Functions) is set to **London (`lhr1`)**; the default is Washington DC, which made every database query about 90ms. Keep the two close; changing the Vercel region needs a redeploy to take effect.

**Domain.** Added in Vercel (apex and `www`); DNS at Fasthosts; HTTPS certificates are automatic and free. Sign-in cookies are per host, so people sign in once on a new domain, and anyone who installed the app from the old address should re-add it from the new one.

**Going live with Stripe (done 24 Nov 2026; kept as the checklist for any repeat).**
1. Delete any sandbox test accounts that ever subscribed (Manage users) **before** swapping keys: sandbox customer IDs don't exist in live, so checkout would fail for them, and deleting afterwards can't cancel their sandbox subscriptions.
2. Activate the live Stripe account (business details, bank account, ID checks), then switch the dashboard from Sandbox to Live.
3. Create the live API key (Developers → API keys) and the **live webhook destination** (same URL, same six events, Snapshot payloads); the signing secret is different from the sandbox one. Configure the **Customer portal in live mode** too (sandbox settings don't carry over) and the public details (business name, support email, terms and privacy links).
4. In Vercel (Production) set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, make sure `STRIPE_PRICE_ID` is not set (sandbox price IDs don't exist in live) and `BILLING_ENABLED=true`, then **redeploy** (variable changes only reach new deployments).
5. Test with one real £3 payment on your own card, then refund it. Done on 24 Nov 2026 with a fresh account: Checkout (Apple Pay) took the £3, the app unlocked on return, the webhook answered 200 for `checkout.session.completed`, `invoice.paid` and `customer.subscription.created`; cancelling in the portal showed "cancelled, usable until 24 December" and two `customer.subscription.updated` events answered 200; the payment was refunded from Stripe's Payments page (Stripe keeps its fee on a refunded payment, about 25p on £3); deleting the account sent `customer.subscription.deleted` (200) and the Overview's Error alerts stayed clear. Not tried live: a failed renewal (`invoice.payment_failed`, covered in the sandbox).
**Backing out:** set `BILLING_ENABLED=false` and redeploy (billing goes off and nobody is locked), or put the sandbox keys back.

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
| `npm test` | Unit and database tests (needs `TEST_DATABASE_URL`) |
| `npm run test:e2e` | Browser run through the core journey (needs the built app running; see [Tests](#tests)) |

### Tests

**What runs automatically.** `.github/workflows/tests.yml` runs on every pull request and on `main`, using its own throwaway Postgres (no secrets, never the real database). It runs: type-check, lint, `npm test`, a production build, and `npm run test:e2e`. A green tick on the PR means all of them passed; a red cross means don't merge until it's understood.

**What is covered.**
- `tests/billing.test.ts`: every trial, lock and grace-period rule in `entitlement()`, plus the billing environment settings. The 7-day grace period and 30-day trial are hard-coded in the tests on purpose: they are promises made to customers.
- `tests/helpers.test.ts`: item profit, money parsing, goal pro-rating, reporting periods (week, month, quarter, UK tax year, year, custom) and chart buckets.
- `tests/reports.test.ts`: the report maths (spent, revenue, cost, write-offs, profit, margin, ROI, days to sell, sell-through, rankings, stock, goal) against a known set of items in a real database, including refunds, write-offs, items outside the period, and another account's items never leaking in.
- `tests/migrations.test.ts`: every migration applies in order to an empty database, with the expected tables, defaults, enum values and cascade deletes.
- `tests/listings.test.ts`: listing on several platforms, per-platform prices and reductions, taking listings off, selling (platform, handover, ends other listings, completes only once handed over), relisting, editing listings, and another account's data never being touched.
- `tests/undo.test.ts`: Undo last step: undoing a sale clears the sale details and brings back exactly the listings it ended (a platform taken off earlier stays off), never-listed items go to To list, an edited sale date doesn't resurrect listings, a re-sale afterwards works, posted / completed steps go back one place, nothing to undo before a sale or after a return or write-off, another account's item is untouched, and the button labels.
- `tests/item-list.test.ts` also covers the chips and ordering: Waiting for money uses posted items only, sold items run newest sale first, listed items longest-listed first, undated items last, and the default stays newest added.
- `tests/where-from.test.ts`: the starter list (Car Boot, Charity Shop, Online Auction, Own Wardrobe, A to Z); migration `0009` (an account with no places gets all four, an existing one gets only what is missing whatever the capitalisation, a place the seller hid stays hidden with no duplicate, items keep their place, running it twice changes nothing); new accounts are seeded; and the remembered place (newest item's, an item with no place doesn't wipe it, hidden places skipped, blank when none, never another account's).
- `tests/sign-in-limit.test.ts`: the address is read from the right header; the wait message; 8 wrong passwords allowed and the 9th waits; the wait ends when the oldest attempt is 15 minutes old; blocked attempts aren't recorded; another email isn't affected; email case and spaces ignored; a correct password or a reset clears only that email; the 30-per-address limit; no address means per-email only; a simultaneous burst can't all get through; old rows are purged; `SIGN_IN_LIMIT=off` records nothing.
- `tests/checklist.test.ts`: the four steps and their order; each ticks from the right fact; links point at the newest item to list / the newest listed item and fall back sensibly; the main button goes to the first step that can be opened; migration `0010` hides existing accounts but not new ones; the queries (counts, newest items, listings, sales, never another account's); saving the fees form counts even at 0% and keeps the first date; hiding sticks per account; an expired-trial account isn't offered it; and a **scan of the source** that fails if a `data-tour="…"` on a screen is missing from `TOURS` or a `TOURS` name is on no screen, and rejects unknown or sneaky names in the address.
- `tests/help.test.ts`: every status is explained once, in order, with a real sentence; Posted says where to find it; the support address and the feedback email link (subject encoded).
- `tests/to-send.test.ts`: the To send grouping (groups follow the services the seller has, A to Z; fixed groups after; empty groups hidden; longest-waiting first; every item in exactly one group), which items appear (only sold ones, never another account's, hidden services still shown, search), and Undo (posted and handed-over steps only, never a completed postal sale, never another account's item).
- `tests/item-list.test.ts`: the Items list: the first page is the newest 50 with the true total, "Show more" reaches older items until the oldest is visible, filters and search count only their matches (name, brand or shop), another account's items are never shown or counted, and the `n` in the address is read safely (whole numbers, at least one page, capped at 5000).
- `tests/platform-reports.test.ts`: the platform and handover reports with hand-checkable numbers (profit, sold, average days, sell-through with a relisted item counted once, sales with no platform shown as "Not set", platform profits adding up to the sales profit, empty periods, another account's sales never appearing).
- `tests/fees.test.ts`: profit after fees and postage in the reports (revenue, fees, margin, return on cost, average profit, best/worst), a fee landing in the month of the sale rather than a later return, the report agreeing with each item's own profit, another account's fees never leaking, and migration `0008` leaving old items unchanged with 0 fees. `tests/helpers.test.ts` also covers `percent()` (whole numbers, dash when empty) and `itemProfit()` with fees, returns and penny rounding, and `parseOptionalMoney()`.
- `tests/backfill.test.ts`: migration `0007` applied to old-style items (bought, listed, completed, returned, unsold, direct sale) leaves every old column unchanged and fills the new tables correctly.
- `tests/usage.test.ts`: the admin figures worked out by hand from eight known accounts (who counts as a seller, sign-ups, unconfirmed, plan split, started vs never, active in 7 and 30 days, trial to paid with free-forever left out, trials ending soon, newest sign-ups, totals without admins); a boundary (exactly 7 days ago isn't "last 7 days"); the database queries (item counts, latest change, only the last 30 days of sales, waitlist not yet invited). Broken on purpose: a looser time window, free-forever counted in trial to paid, admins in the totals, all-time sales.
- `tests/account-data.test.ts`: the full download (every file present, the right rows, only the signed-in person's data, Excel marker, empty account); deleting removes the person and everything they own and leaves others alone; the subscription is cancelled first, only when Stripe is on and it isn't already cancelled; a Stripe or Blob failure deletes nothing and can be retried; admins can't delete themselves. Broken on purpose: no admin guard, data deleted before photos, listings of everyone in the download.
- `tests/job-status.test.ts`: the daily job's note: what the Overview says in every state (not run yet, ran fine with the right counts and wording, billing off, failed with a reason, overdue after 26 hours but not at exactly 26, an old failure still shown as a failure), the time wording (today, yesterday, days ago, calendar days), one row updated per run with a run count, failures scrubbed and cleared by the next good run, recording never throws, and the cron route itself: records a run with the right secret, records nothing without it, and records a crash and still rethrows it so the alert goes out. Mutation-checked.
- `tests/landing.test.ts`: an admin lands on the Overview after signing in and everyone else on Home, and both the sign-in action and the forced password change use it (a forced change still comes first). Broken on purpose: always sending people to Home fails it.
- The browser run also checks the Overview's refresh button: a waitlist entry added behind the page's back doesn't show until the button is tapped, then does, without leaving the page. Broken on purpose: a button that does nothing fails it.
- `tests/alerts.test.ts`: scrubbing (emails, query strings, everything after `params:`, long tokens, Stripe ids, long numbers, length), signatures (same problem with different numbers is one; different source, route, type or message is another), redirects and not-found ignored; then against a real database: first error emails once to the right address, a repeat inside the hour only counts, an email again at exactly the hour, different problems email separately, a burst of 12 at once sends one email, the cap of 20 a day stops emails but still records, nothing about a customer reaches the email or database, `ALERTS=off`, the test alert ignores the limits, the 30-day purge, newest first, and that reporting never throws even if the email fails. Also the Next.js error hook. Mutation-checked (removing the cooldown, the scrubbing, the cap, the never-throws guard, the off switch and the `params:` rule each fails a test).
- `tests/e2e/journey.ts`: in a phone-sized browser: sign in, wrong password refused, add an item, list it on one platform then add a second, sell it on the second (listings end, platform and handover saved), a collected item that only completes once handed over, set a platform's fee %, sell with the fee pre-filled and postage paid, see the profit after both, see it in reports and the CSV, Settings → Platforms & postage, Settings → Account, another account can't open the item (shows "not found" and nothing of the item), an expired trial is read-only (can view and export, can't add), signed-out visitors are sent to sign in, the add form says "Where from" with the four starters and remembers the last place used, the CSV and Reports use "Where from" / "Best places to buy", a new account's Home shows the four-step checklist (two steps can't be opened yet), the fees step opens Settings with a spotlight ringing the fees card that doesn't block taps and fades on a tap or "Got it", a refresh or an unknown name does nothing, saving fees ticks it, adding and listing an item tick theirs and point at the item's List it and It sold steps, finishing makes it disappear, "Hide this" sticks, reduced motion stops the pulse, an expired trial and an account from before the checklist never see it, Settings links to a Help page that explains the stages, profit, fees and Undo and has a Send feedback email link (also open to an expired trial, closed to signed-out visitors), the terms and privacy pages give the contact address, a posted parcel counts on the Home "Waiting for money" tile and shows in that view with its days waiting, a completed collection offers Undo (back to sold) and a sold item offers Undo sale (clears the sale, listings come back, listed items have no Undo), Reports shows whole-number percentages, wrapping period chips and a help box that says fees and postage you paid are taken off, and the landing page shows the headline, the price and trial length and five questions that open when tapped, with a working Sign in link.

**Not covered yet** (checked by hand in Stripe sandbox instead): the Stripe webhook and checkout paths, the email flows (confirm, reset, change email), the admin pages, and the daily trial-reminder cron.

**Running them locally.** Create an empty Postgres database whose name contains `test`, then:
```bash
export TEST_DATABASE_URL=postgres://user:pass@localhost:5432/hg_test   # WIPED by the tests
npm test
npm run build            # or: npx next build
DATABASE_URL=$TEST_DATABASE_URL AUTH_SECRET=<32+ chars> BILLING_ENABLED=true \
  STRIPE_SECRET_KEY=sk_test_x STRIPE_WEBHOOK_SECRET=whsec_x npx next start -p 3100 &
npm run test:e2e         # resets the test database, then drives the app on :3100
```
Without `TEST_DATABASE_URL` the database tests are **skipped with a message**, not silently passed. The helper refuses to run if the database name doesn't contain `test`.

**Keeping tests honest.** A test that can't fail is worthless, so when adding one, break the code on purpose once to see it fail. (This was done for the first set: ignoring refunds, leaking another account's data, a longer grace period, a trial ending a day late and wrong profit maths were each caught; and for the listing logic: a sale not ending listings, the sold platform not being stored, and relist keeping the old sold platform; and for To send: newest-first ordering, collection landing in the wrong group, posted items leaking in, another account's items leaking, undo allowed on a completed postal sale, and empty groups showing; and for the platform reports: platform profit ignoring fees, sell-through counting a sale elsewhere, listings outside the period counted, wrong average days, handover profit ignoring fees, and a missing platform dropped instead of shown as "Not set"; and for fees: ignoring postage paid, ignoring fees on a returned item, reports or margin ignoring fees, a sale not storing its fees, and relist keeping them; and for the Items list: no limit, a total that ignored the search, another account's items leaking, oldest-first order, and no cap on the number shown; and for the Reports tidy-up: percentages left with decimals, period chips back to scrolling sideways, and the old "postage isn't included" help text; and for Waiting for money and sorting: sold ordering ignored, listed order reversed, the Waiting chip pointing at the wrong status and the "day/days" wording; and for the first-run checklist: the migration not hiding old accounts, the checklist ignoring "hidden", the sale step using the wrong fact, the sale fact reading the wrong column, a spotlight target removed from a screen, the spotlight ring blocking taps, "?tour=" left in the address, the reduced-motion rule removed, and saving fees not ticking the step; and for Help and feedback: the wrong support address, an extra link parameter, the Posted description changed, the status order swapped, the Settings link broken and the terms losing the contact address; and for Where from: new accounts not seeded, the migration matching names case-sensitively, the migration ignoring a hidden place, and the remembered place not skipping a hidden one; and for sign-in rate limiting: the limit off by one, blocked attempts being recorded, a correct password clearing everyone's failures, the per-address limit ignored, email case not normalised, the off switch ignored, and counting before recording; and for Undo: listings not brought back, a platform taken off earlier coming back too, fees not cleared, and completed-by-post going back to the wrong place.)

---

## 14. Working notes and gotchas

### Screens that other things describe

Several things in the app talk about screens, buttons and steps in words or point at them. A screen change that doesn't update them leaves customers with instructions that are wrong, which is worse than none. **Before merging any change to a screen, a label, a step or a setting's location, go through this table, and `grep -rn "old wording" src tests README.md` for the words you changed.** The first-run checklist and Help page are in front of every new customer from launch day.

| If you change… | Also check and update |
| --- | --- |
| **A screen the spotlight points at:** Settings → Platforms & postage (the *Selling fees* card, `data-tour="fees"` in `PlatformFeesForm.tsx`); the Add item form (the "What is it?" field, `add-item` in `ItemForm.tsx`, create mode only); an item's **List it** step (`list-step`) and **It sold!** step (`sell-step`) in `items/[id]/page.tsx` | The `data-tour` attribute must stay on the equivalent element. If you move or restyle the screen, move the attribute with it. If you remove the thing, delete its name from `TOURS` in `src/lib/checklist-steps.ts` **and** the step link that uses it. The caption in `TOURS` must still be true (keep captions general: "fill in this step", not a button's exact label). `tests/checklist.test.ts` **fails the build** if a `data-tour` is on no screen or a `TOURS` name is missing; the browser journey ("First-run checklist" checks) proves each ring lands on its target. In production a missing target is silent: the spotlight just doesn't show |
| **The steps themselves:** adding, removing or reordering a first-run step, or what counts as "done" | `checklistSteps()` and `ChecklistFacts` in `checklist-steps.ts`, the queries in `checklist.ts`, `Checklist.tsx`, the unit tests, the journey checks, the "First-run checklist" bullet in [What the app does](#2-what-the-app-does). Keep "done" derived from the person's data where you can |
| **The item lifecycle:** a status added, renamed or its meaning changed | `STATUS_LABEL`/`STATUS_STYLE` and the filter chips in `src/lib/items.ts`; `STATUS_HELP` and `STATUS_ORDER` in `src/lib/help.ts` (typed, so a new status won't compile until explained) and the Help page; the lifecycle diagram and tables in [Data model](#5-data-model); the landing page's four steps (`STEPS` in `src/app/welcome/page.tsx`) and its mock cards (`Mocks.tsx`); `undoOption()`; Home tiles |
| **Where fees are set** (Settings → Platforms & postage), or how a fee is pre-filled | Checklist step 1's link; the `fees` caption; the Help page's "Set your fees first" text and button; the landing FAQ if it mentions fees; the Settings bullet in What the app does |
| **How profit is worked out** (`itemProfit`, `src/lib/reports.ts`) | Reports' "how these numbers are worked out" box; the Help page's "How profit is worked out"; the landing page's profit card, mock figures and its "Your sales total isn't your profit" paragraph; the README Reports bullet. The mock figures must still add up |
| **Undo** (what it reverses, when it's offered) | The Help page's "Tapped the wrong button?"; `undoOption()` labels; the lifecycle section here; the landing page if it mentions undo |
| **The CSV export** (columns, where the button is; `itemsCsv` also feeds `items.csv` in the full download) | The Help page's "Keeping your own copy"; the landing FAQ ("read-only if you stop paying"); the terms ("download everything"); `tests/e2e/journey.ts` CSV checks |
| **Price, trial length, what happens when the trial ends** | The landing page and billing page read `priceLabel()` / `trialDays()`, but the **terms** page and the **Help** page's trial section state them in words, so update those by hand; the landing FAQ; the billing page; the README Billing section |
| **The support email** | One place: `SUPPORT_EMAIL` in `src/lib/contact.ts` (the Help page, terms and privacy read it). Check the new address actually receives mail |
| **Who runs the service (name, trading status, postal address)** | `OPERATOR_NAME` and `OPERATOR_ADDRESS` in `src/lib/contact.ts`, shown in the "Who runs Hidden Gems" section at the top of the **terms** and the "Who is responsible for your data" section at the top of the **privacy notice**. Change the name or address there if the business status changes (for example to a limited company), and tell whoever reviews the terms |
| **Where someone lands after signing in** | `landingPathFor()` in `src/lib/landing.ts` (admins: `/admin`; everyone else: Home). The browser run signs in as an admin and checks the Overview shows, and as a seller and checks Home. If the Overview moves, change it there |
| **Settings: a row added, renamed or moved** | The Settings menu (`settings/page.tsx`: pick the right group, Your app or Your account) and README Settings bullet; the Help page and the checklist text that say "Settings, then Platforms & postage"; the journey's Settings checks |
| **Filter chips or Home tiles** (names, what they show) | `FILTERS` in `src/lib/items.ts`, the Home tiles, the Help page's mention of "Waiting for money", the Items bullet in What the app does, the journey checks |
| **The platforms, "Where from" or postal-service starter lists** (`src/lib/defaults.ts`) | The landing page's mentions of platforms and where things come from; the journey's starter-list check; existing accounts need a data migration (see `0009`), not just a new default |
| **Settings → Account → Your data (download, delete) or the files in the download** | The Help page's "Keeping your own copy"; the privacy page's "Your rights" and photo wording; the terms' "Your data"; the download's `README.txt` (`src/lib/export.ts`); the landing FAQ if it mentions export or deletion; `tests/account-data.test.ts` and the journey's download and delete checks; the Delete pages' list of what goes |
| **The admin Overview or Users list** (what a figure counts, the filters, the plan names) | `computeUsage()` and `PLAN_GROUP_LABEL` in `src/lib/usage.ts`; `PlanBadge`; the Overview's headings and its explanatory text; the Admin bullets in What the app does; `tests/usage.test.ts` and the journey's admin checks. A change to what "active" means must change the Overview's note too |
| **The Daily job card on the admin Overview** (the states, the 26-hour rule, the wording) | `jobStatus()` and `JOB_OVERDUE_MS` in `src/lib/job-status.ts`; the card in `src/app/(app)/admin/page.tsx`; the Daily job bullet in What the app does; the Scheduled jobs section; `tests/job-status.test.ts` and the journey's Daily job checks. If the schedule in `vercel.json` changes, change `JOB_OVERDUE_MS` and the "around 08:00 UTC" wording |
| **The Error alerts card on the admin Overview** (what triggers an alert, the limits, who receives it, the test button) | `src/lib/alert-rules.ts` and `src/lib/alerts.ts`; `TestAlertForm`; the card's explanatory text in `src/app/(app)/admin/page.tsx`; the Error alerts bullet in What the app does; the Email table; `tests/alerts.test.ts` and the journey's Error alerts checks |
| **Any new page for signed-in users** | Whether it needs `requireUser` or `requireWritableUser` (read-only accounts must still see their data); the folder map; a journey check; whether the Help page should explain it |

When the **Help page**, **landing page**, **checklist captions** or **terms** change, say so under "README sections updated" in the PR description. They are customer-facing promises, and the landing page already has its own rule (see "Landing page copy must stay true" below).

- **This is a newer Next.js than most docs describe.** `AGENTS.md` tells coding agents to read `node_modules/next/dist/docs/` before writing code. Notable differences already hit: `proxy.ts` replaces `middleware.ts`; `params` and `searchParams` are Promises; route handlers that read headers are dynamic.
- **The checklist's "fees" step isn't derived from data on purpose.** A fee of 0% is a legitimate answer (some platforms don't charge sellers), so "any fee above 0" would leave the step undone for ever for those sellers. It is ticked when the fees form is saved. The other three steps come from the data; if someone undoes their only sale, step 4 becomes undone again and the checklist reappears until they hide it.
- **The spotlight lives in the signed-in layout.** It reads `?tour=` from the address, so any link can open it (`/settings/platforms?tour=fees`). Unknown names are ignored (checked against `TOURS`, which is a plain object, so names like `constructor` are rejected too). It waits up to about three seconds for the target, because pages stream in after a loading placeholder, then gives up silently.
- **Fonts.** `--font-sans` tries `ui-rounded` (Apple's own rounded font, which can't be bundled for other devices) first, then the bundled Nunito, so iPhones look as they always did and everything else gets a close match. Nunito is a little wider than Segoe UI: if a label wraps on a PC but not an iPhone, that's why. Only the Latin subset is bundled (covers £ and accents); to add characters outside it, add the other subset file from `@fontsource-variable/nunito`.
- **Landing page copy must stay true.** The pictures in `src/app/welcome/Mocks.tsx` use made-up example figures (labelled "Example") and never read the database. The FAQ promises no marketplace connection, no tax advice and read-only (not deleted) accounts after a lapse; change those answers if the app changes. The "Built by one person" note mentions the owner's wife; the owner can edit or remove it in `page.tsx`.
- **Server Actions body limit** is 6 MB (`next.config.ts`); photos are resized in the browser first (about 4 MB cap in the upload route).
- **Migrations ship with certain functions** (`outputFileTracingIncludes` for `/setup` and `/settings`) so the manual buttons can run them.
- **Inputs must stay at 16px** (set globally in `globals.css`) and the viewport sets `maximum-scale=1`, otherwise iPhones zoom in when a field is focused. Pinch-zoom is blocked on Android as a result.
- **Theme and mode** are `data-theme` / `data-mode` attributes on `<html>`, driven by the user's saved choice; signed-out pages follow the device setting.
- **Don't import the database at build time** in new top-level code: `src/db/index.ts` throws if `DATABASE_URL` is missing (that's why preview builds fail).
- **Test files run one at a time** (`--test-concurrency=1` in `npm test`) because they all share one throwaway database and several reset it; running them in parallel made them wipe each other's tables on GitHub.
- **Tests wipe their database.** Only ever point `TEST_DATABASE_URL` at a throwaway database. When behaviour changes, update the tests in the same PR; when adding logic that handles money, access or data, add a test for it.
- **Listings are the source of truth for what is on sale.** `items.listed_at` / `list_price` are only a summary and must be changed through `src/lib/listings.ts` (never directly), or the summary and the listings drift apart. New users get their platforms from `seedUserDefaults` (sign-up and admin create-user both call it).
- **Pages now stream.** Because pages have a `loading.tsx`, the placeholder is sent first and the real page replaces it. Two visible effects: a missing or someone else's item now returns HTTP 200 showing Next's "could not be found" message (not a hard 404; nothing of the item is sent), and a redirect from a page (for example a locked account opening Add item) happens just after the placeholder appears. The browser test waits for the redirect and checks the page text for this reason.
- **Slow pages: measure first.** Sign in as an admin and open `/items?timing=1` on the live site (twice, a minute apart). "Database round trip" is a plain `select 1`, the pure distance to Railway; the sign-in check and the items query on a visit after a pause also include opening a new connection, because the pool closes idle connections after 10 seconds (`src/db/index.ts`). **What it found (22 Nov 2026):** Vercel's functions were in Washington DC (the default) while Railway is in EU West (Netherlands), so every query cost about 90ms and a visit after a pause cost over a second of database waiting. Moving the functions to London took a round trip to about 11 to 18ms and a cold visit to about 0.2 seconds. Whenever the database or the functions move, keep them in the same part of the world.
- **Sign-in limit and the visitor's address.** The per-address limit (30) depends on reading the real visitor address from `x-forwarded-for`. If a hosting change ever made every visitor look like one address, everyone would be blocked after 30 wrong passwords in 15 minutes between them; the tell-tale is many different emails blocked at once. Fix: set `SIGN_IN_LIMIT=off` while investigating. Not yet verified live (see open items).
- **Rate-limit counts** for emails use tokens created in the last hour, whether or not they were used.
- **The daily job's "last ran" note.** The cron route writes it after each run, success or failure, and never lets the note itself break the job. A manual Run from Vercel counts as a run too, so a manual run can make a broken schedule look healthy for a day: the 26-hour rule is the safety net. Only the daily job is recorded; add a job name to `recordJobRun` when a second cron is added. The browser run calls the job with `CRON_SECRET` (default `x`; the CI workflow sets the same).
- **Error alerts: what they do and don't cover.** `instrumentation.ts` (`onRequestError`) catches uncaught server errors only; an error the code catches and handles never reaches it, which is why the swallowed failures (Stripe webhook, checkout and so on) call `recordError` explicitly. Browser-side errors (a button that does nothing on someone's phone) are **not** captured. There is no friendly `error.tsx` page yet, so a crash still shows Next.js's default error page. Alerts are scrubbed on purpose: never add a stack trace, request body, query values or an email address to `recordError`'s output. `recordError` never throws, and a failed alert email is only logged (not re-reported, to avoid a loop). The one-email-per-hour rule is an atomic `UPDATE ... WHERE last_emailed_at IS NULL OR < cutoff`, so a burst can't double-send. If alerts ever flood, set `ALERTS=off` in Vercel and redeploy.
- **Stripe: live and sandbox don't mix.** Customer, subscription and price IDs, API keys and webhook secrets are all separate between the two, so a sandbox ID stored on an account means nothing in live (the app would ask live Stripe for a customer it has never heard of). Only real accounts should exist while the live keys are in; clear out test accounts first (see the going-live list). The live key is restricted, so a Stripe call that fails with a permission error means the key needs that permission added; the failure shows up in Error alerts.
- **No pull-to-refresh in the installed iPhone app.** Apps added to the iPhone Home Screen don't get Safari's pull-down-to-refresh (Android's installed apps usually do), and nothing in this app blocks it. Closing and reopening the app, or leaving a screen and coming back, loads fresh data. Only the admin Overview has a refresh button (see What the app does → For the admin). A pull-down gesture for everyone was considered and not built (24 Nov 2026): sellers only see changes they make themselves, and a hand-built gesture risks accidental refreshes on forms and needs testing on a real iPhone.
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
| #25 | Removed "Vinted" from all wording (the app is platform-neutral in what users see); Settings → Account sub-page for change email and change password |
| #26 | Automated tests (billing rules, report maths, migrations, browser journey) and a GitHub check on every pull request |
| #27 | Multi-platform selling: platforms list, several listings per item with per-platform prices and reductions, sold-on and handover (posted / collected / delivered), Settings split into short pages, CSV listing links; migration `0007` copies existing items across |
| #28 | Fees and postage paid: per-platform fee % (default 0), editable fee and "postage I paid" on each sale, profit and reports after both, CSV columns; migration `0008` (all existing rows get 0) |
| #29 | Reports by selling platform (profit, sold, average days to sell, sell-through) and by handover method; CSV "Sold on" and "How it got there" columns. No migration |
| #30 | The handover chart shows profit (with the number sold beside each bar) instead of only the count, because its subtitle promised profit. No migration |
| #31 | "To send" worklist: chips wrap to two rows, a To send view groups waiting parcels by postal service plus Collection and Delivery, one-tap Mark as posted / handed over with Undo, the Home tile opens it. No migration |
| #32 | Items page: greyed-out loading placeholders with a spinning gem on every page, "Show more" (50 at a time with a "Showing X of N" count, replacing the hidden 200-item limit), and an admin-only `?timing=1` readout. Pages now stream, so a missing item shows "not found" with status 200. No migration |
| Region fix | Vercel function region changed from Washington DC to London (`lhr1`) in the Vercel settings after the timing readout showed about 90ms per database query; now 11 to 18ms. README only |
| #34 | Landing page redesign: leads with a worked sale, shows the real journey and screens, states the price and trial length (read from the billing settings), adds a FAQ and a short founder note. Copy only says what the app does (no marketplace connection, not tax advice). No migration |
| #35 | Landing page wording: no longer implies charity shops are the only source ("from the day you buy it", "charity shop, car boot, online auction, your own wardrobe"). Copy only, no migration |
| #36 | Reports tidy-up: the "How these numbers are worked out" box now says fees and postage you paid are taken off profit (it said postage wasn't included) and explains days to sell from first listing and return on cost; period chips wrap instead of scrolling sideways; margin, return on cost and shop returns show whole numbers. No migration |
| #37 | Undo last step on the item page: one button reverses the most recent step (sold back on sale with the sale details cleared and its listings restored, posted to sold, completed to posted or sold), with a confirmation when it clears a sale. No migration |
| #38 | Waiting for money: a chip on Items and a Home tile for posted parcels, with days waited on each card; Sold and To send now show the newest sale first and Listed shows the longest-listed first. No migration |
| #39 | Where from: "Charity shop" becomes "Where from" on the form, in Settings, Reports (Best places to buy) and the CSV column heading; new accounts start with Car Boot, Charity Shop, Online Auction and Own Wardrobe, and migration `0009` adds any that are missing to existing accounts (nothing renamed, hidden or deleted). The form already remembered the last place used; it now skips hidden ones. Reports show "Not set" for items with no place |
| #40 | Help and feedback: an in-app Help page (what each status means, how profit is worked out, setting fees, Undo, CSV, trial end), a Settings link, a Send feedback email button and `hello@hiddengemsapp.co.uk` on the terms and privacy pages; the Settings row now says "Where from & categories". No migration; the mailbox was set up on 23 Nov 2026 (forwarder plus Gmail "Send mail as") |
| #41 | First-run checklist for new accounts: a "Getting started" card on Home (fees, first item, list it, first sale) that ticks itself from the person's data, with a soft spotlight that points at the right place when they arrive from a step. Migration `0010` (`checklist_hidden`, `fees_reviewed_at`) hides it for every existing account. README now has a "Screens that other things describe" guide for changing screens safely |
| #42 | Bundled the Nunito rounded font (SIL Open Font License) so the app and landing page look the same on PCs and Android as on iPhones; iPhones still use Apple's own rounded font. No migration |
| #43 | Sign-in rate limiting: more than 8 wrong passwords for one email (or 30 from one network address) in 15 minutes means a short wait; a correct password or a completed password reset clears it; `SIGN_IN_LIMIT=off` is an emergency switch. Migration `0011` (`login_attempts`) |
| #45 | Account deletion (two steps: warning, then typed email and password; cancels the Stripe subscription, removes photos, then deletes everything), a full data download (zip of spreadsheets plus photo links), photo-link wording on the privacy page, and Settings split into Your app / Your account / Admin groups with a thin themed line. No migration; adds the `fflate` dependency |
| #46 | Admin Overview (sign-ups, who has added items and who is active, plan split, trial to paid, trials ending soon, newest sign-ups, app-wide totals) and a Users list with plan filter chips, newest first, each person's item count and last activity. No migration |
| #47 | Error alerts: uncaught server errors and deliberately-swallowed failures are recorded (scrubbed, no customer data) and emailed to the owner, once per problem per hour and at most 20 problems a day; Error alerts card and "Send a test alert" button on the admin Overview; daily job clears alerts older than 30 days. Migration `0012`. `ALERT_EMAIL` and `ALERTS=off` settings |
| #48 | Daily job status: every run of the trial-reminder job is recorded (when, worked or failed, what it did) and shown on the admin Overview, with a warning if it hasn't run for over 26 hours. Migration `0013` |
| Launch prep | Domain `hiddengemsapp.co.uk`, `APP_URL`, webhook moved to the new domain; preview builds switched off; database password rotated |
| Live Stripe (24 Nov 2026) | Switched from the Stripe sandbox to live mode (restricted live key, live webhook, live Customer portal) and proved it with a real £3 payment, a portal cancellation, a refund and an account deletion. No code change |
| #51 | "Who runs Hidden Gems" on the terms and "Who is responsible for your data" on the privacy notice: the owner's name, sole-trader status, postal address and the support email, held in `src/lib/contact.ts`. No migration |
| #52 | Admins land on the Overview (`/admin`) after signing in instead of Home. No migration |
| #53 | A round refresh button on the admin Overview (re-reads the figures without leaving the page), because the installed iPhone app has no pull-down-to-refresh. No migration |

---

## 16. Open items and backlog

**Before charging real customers**
- [x] Live Stripe keys, live webhook with its own secret, live Customer portal, a real £3 test payment, cancellation and refund (24 Nov 2026; see [Deploying](#12-deploying-and-operating)).
- [x] Business status (24 Nov 2026): sole trader, under £1,000 of trading income, so nothing needed with HMRC for now (the allowance is on total gross trading income, so revisit if it gets near); not VAT registered, and Stripe Tax is off.
- [ ] Terms and privacy notice: the owner is happy with them for now (24 Nov 2026) and will have them reviewed professionally once there are paying customers, including the 14-day refund promise and whether showing the owner's name (as a sole trader), address and contact email on both pages is enough.
- [ ] Not tested, by choice (24 Nov 2026): that a completed password reset clears a sign-in lockout on the live site (it is covered by the automated tests; the worst case is waiting 15 minutes).
- [x] `hello@hiddengemsapp.co.uk` receives and sends mail (23 Nov 2026): a Fasthosts forwarder sends it to the owner's Gmail, and Gmail's "Send mail as" replies from the hello@ address. The Help page, terms and privacy all send people there; nothing in the app checks it works, so send a test message now and then. If replies to other providers land in spam, send through Resend's SMTP (the domain is already verified there) instead of Gmail's.
- [x] Nunito font (PR #42) looks good on a PC (23 Nov 2026).
- [x] Android check: not done and not planned for now (no Android device; the owner is confident it will be fine, 24 Nov 2026). The font is bundled, so the risk is low.
- [x] Sign-in rate limiting works on the live site (23 Nov 2026): from a phone, the 9th wrong password for an account showed "wait 15 minutes", and signing in worked again once the wait was over (22:41). This also shows the visitor address is read correctly on Vercel. Note it locked the account's owner out too, as designed and listed under known gaps. Not yet tried: a password reset clearing the lockout, a different account signing in meanwhile, and a PC.
- [x] Account deletion and the data download checked on the live site (PR #45, 23 Nov 2026): the zip was correct, the account was deleted and signed out, the photo was gone from Vercel Blob, and the sign-in page showed the banner (which stays on screen while the address still has the deleted flag, harmless). Stripe cancellation checked too (24 Nov 2026): the sandbox subscription of a deleted test account showed Cancelled with its £3 payment kept, and a live one was cancelled the same way.
- [x] First-run checklist and spotlight tried on a real phone with a new account (23 Nov 2026): works.
- [x] Error alerts proven live (23 Nov 2026): the test alert from the Overview arrived in the hello@ inbox within a minute, not in spam.
- [x] (Confirmed 24 Nov 2026: the Overview showed "Ran today at 08:47 UTC".) Confirm the daily job ran by itself: after PR #48 is live, check the Overview's Daily job card after the next 08:00 UTC (it should say "Ran today at 08:xx UTC"). Starting it with Vercel's Run button (Schedules → Cron Jobs) fills the card straight away but only proves the job works, not that the schedule fires (a manual run was done on 23 Nov 2026 at 22:07 UTC and the card showed it).
- [x] Housekeeping done: `SETUP_TOKEN` deleted; Vercel Ignored Build Step set to Only build production; Railway database password regenerated (22 Nov 2026) and `DATABASE_URL` in Vercel updated.
- [x] A real photo upload from a phone works (23 Nov 2026).
- [ ] Housekeeping, deferred: confirm what the Postgres service's Backups tab shows (Hobby appears to have no volume backups). Do it with the Railway Pro upgrade below.
- [ ] Decision (24 Nov 2026, replaces the 22 Nov one): hold off on Railway Pro (about $20/month, for backups) until the promotion has brought real sign-ups, then upgrade at the first real sign-ups who add items or the first paying customer, whichever comes first. Until then the data is only as safe as one database without backups, which is why the terms tell people to keep their own copy and the CSV download is easy to find. A small scheduled export emailed to the owner was offered as a cheaper stop-gap and not built.

**Agreed and planned: multi-platform selling (design agreed 22 Nov 2026; all four PRs built)**
- PR 1 (done, #25): reword Vinted out of the UI; Settings → Account sub-page.
- Tests PR (#26) goes first so PR 2's migration and flow changes are protected.
- PR 2 (built, #27): per-user **platforms** list (defaults Vinted, eBay, Depop, Facebook Marketplace, Gumtree); an item can have several **listings**, each with its own price (new platforms default to the first price) and optional link; the sell step records **sold on** and **how it was handed over** (by post / collected by buyer / I delivered it). Collected and delivered items go straight to completed once handed over (an "Already handed over" tick, on by default; unticked they wait as sold with a "Mark as handed over" button). Price reductions are per platform. Settings is split into short pages (Platforms & postage, Shops & categories, Targets). The migration only adds tables and columns and copies existing items into them (every existing item becomes a Vinted listing); original columns are left untouched.
- PR 3 (built, #28): **fees** (optional per-platform fee %, default 0, set by the user; the sell step pre-fills an editable £ amount stored on the sale; editable on returned items) and **postage/delivery I paid**. Net profit = sold price − refund − fees − postage paid − cost; fees count in the month of the sale; old sales have none, so past numbers don't change.
- PR 4 (built, #29): reports **by platform** (profit, sold, average days to sell, sell-through) and **by handover method**, plus the CSV columns.

**Speed**
- [x] Read `/items?timing=1` on the live site (22 Nov 2026): the Vercel functions were in Washington; moved to London, round trips fell from about 90ms to 11 to 18ms.
- [ ] Optional, only if it still feels slow: keep database connections open longer than 10 seconds (saves roughly 0.1 to 0.2 seconds on a tap after a pause), and re-check with a real-sized list. Remove the timing readout once it's no longer needed.
- No index was added for the Items list: at a few thousand items per account the existing `(user_id, status)` index is enough. Revisit if the "Items and count" timing grows.

**Product ideas offered but not started**
- A friendly error page (`error.tsx`) instead of Next.js's default, and capturing browser-side errors (needs a service such as Sentry, or a small reporting endpoint).
- Sign out other sessions on password reset. (Rate limiting for sign-in is done, #43; the Change email / Change password current-password checks aren't covered.)
- Receiving email beyond `hello@` (`support@`, `billing@`).
- Bulk-buy splitting (one purchase → several items).
- List thumbnails still crop photos.
- Auto-capitalise newly typed category names.
- More automated tests: Stripe webhook and checkout, email flows, admin pages, the trial-reminder cron (the first set is in; see [Tests](#tests)).
- A TikTok/ad video for launch (AI-generated in HeyGen) is parked, not part of this repo.
