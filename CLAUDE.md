# Instructions for Claude working on this repo

## Keep README.md up to date, every time
`README.md` is the single reference for how this app works. **Any change that alters what it describes must update the README in the same pull request.** Before opening a PR, check this list and edit whatever applies:

- **Current state** table (what's live, what's in sandbox, what's switched on) and the **Last updated** date at the top.
- **What the app does** when a feature is added, changed or removed (sellers, admin or public pages).
- **Architecture / folder map** when files, routes, patterns or integrations change.
- **Data model** and the **Migrations** table whenever a migration is added (file name and one line on what it does).
- **Accounts and security**, including the "known gaps" list, when auth, emails or protections change.
- **Billing** when access states, flows, Stripe events or admin overrides change.
- **Email** table for any new or changed email; **Scheduled jobs** for any new cron.
- **Integrations** and **Environment variables** for any new service or variable.
- **Deploying and operating** for any change to how it's built, deployed or switched on.
- **Working notes and gotchas** for anything a future developer would trip over.
- **Project history**: add a row for each shipped change.
- **Open items and backlog**: tick off what's done, add what's newly discovered.

In the PR description, say which README sections were updated, or write "No README impact" if none apply. Keep it accurate rather than long: don't describe things that aren't built, and mark anything not yet verified live.

## Ways of working
- The owner works from a phone and merges only by saying "merge". Open a PR, describe it in plain English with what was tested, and wait.
- Don't add unrequested features; propose them and wait.
- This is a newer Next.js than most documentation describes; see `AGENTS.md` and read `node_modules/next/dist/docs/` before writing Next.js code.
- Run `npm test` (and the other checks the README's Tests section lists) before opening a PR, add or update tests when behaviour changes, and make sure the GitHub "Tests" check is green before saying a PR is ready. Never point `TEST_DATABASE_URL` at a real database.
