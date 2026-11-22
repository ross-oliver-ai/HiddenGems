// End-to-end check of the core journey in a real browser on a phone-sized screen:
// sign in -> add an item -> list it -> sell it -> see the profit -> see it in reports and the CSV,
// plus the read-only lock for an expired trial.
//
// Usage (see README "Tests"): start the built app against the TEST database, then `npm run test:e2e`.
// The app must be started with BILLING_ENABLED=true and any STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET values.
import { chromium } from "playwright";
import { Pool } from "pg";
import { resetAndMigrate, pointAppAtTestDatabase } from "../helpers/testdb";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3100").replace(/\/$/, "");
const PASSWORD = "journey-password-123";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`PASS ${name}`); } else { failed++; console.log(`FAIL ${name} ${detail}`); }
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${BASE}/login`)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`The app didn't come up at ${BASE}`);
}

async function main() {
  const url = pointAppAtTestDatabase();
  await resetAndMigrate(url);
  const { hashPassword } = await import("@/lib/password");
  const { seedUserDefaults } = await import("@/lib/defaults");
  const dbm = await import("@/db");
  const s = await import("@/db/schema");
  const hash = await hashPassword(PASSWORD);
  const day = 86_400_000;

  const mk = async (email: string, trialDays: number) => {
    const [u] = await dbm.db.insert(s.users).values({
      email, name: "Journey", passwordHash: hash, mustChangePassword: false, emailVerifiedAt: new Date(),
      trialEndsAt: new Date(Date.now() + trialDays * day), colorMode: "light",
    }).returning();
    await seedUserDefaults(u.id);
    return u;
  };
  const trial = await mk("trial@example.com", 20);
  const locked = await mk("locked@example.com", -2);
  await dbm.db.insert(s.items).values({ userId: locked.id, name: "Locked user coat", status: "bought", boughtAt: "2026-01-01", buyPrice: "3.00" });
  const pool = new Pool({ connectionString: url, max: 1 });

  await waitForServer();
  const browser = await chromium.launch();
  const phone = { viewport: { width: 390, height: 844 } };

  async function signIn(email: string) {
    const ctx = await browser.newContext(phone);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/login`);
    await page.fill("input[name=email]", email);
    await page.fill("input[name=password]", PASSWORD);
    await page.click("button[type=submit]");
    await page.waitForURL(`${BASE}/`, { timeout: 30_000 });
    return { ctx, page };
  }
  const body = (page: import("playwright").Page) => page.innerText("body");

  try {
    // --- A normal seller ---
    const { ctx, page } = await signIn("trial@example.com");
    check("signs in and lands on the home page", (await body(page)).includes("To list"));

    // wrong password is refused
    const bad = await browser.newContext(phone); const bp = await bad.newPage();
    await bp.goto(`${BASE}/login`); await bp.fill("input[name=email]", "trial@example.com"); await bp.fill("input[name=password]", "wrong-password-1"); await bp.click("button[type=submit]");
    await bp.waitForTimeout(1500);
    check("a wrong password is refused", bp.url().includes("/login")); await bad.close();

    // add an item
    await page.goto(`${BASE}/items/new`);
    await page.fill("#name", "Journey boots");
    await page.fill("#buyPrice", "4");
    await page.selectOption("#categoryId", { label: "Shoes" });
    await page.click("button[type=submit]:has-text('Save')");
    await page.waitForURL(/\/items(\/\d+)?$/, { timeout: 30_000 });
    const { rows } = await pool.query("select id, status, buy_price from items where user_id=$1 and name='Journey boots'", [trial.id]);
    check("the new item is saved as 'to list' with the right price", rows.length === 1 && rows[0].status === "bought" && rows[0].buy_price === "4.00", JSON.stringify(rows));
    const id = rows[0]?.id;

    // list it
    await page.goto(`${BASE}/items/${id}`);
    await page.fill("input[name=price]", "20");
    await page.click("button:has-text('Mark as listed')");
    await page.waitForTimeout(1500);
    const listed = (await pool.query("select status, list_price from items where id=$1", [id])).rows[0];
    check("listing it records the asking price", listed.status === "listed" && listed.list_price === "20.00", JSON.stringify(listed));

    // sell it
    await page.goto(`${BASE}/items/${id}`);
    await page.fill("input[name=price]", "15");
    await page.click("button:has-text('Mark as sold')");
    await page.waitForTimeout(1500);
    const sold = (await pool.query("select status, sold_price from items where id=$1", [id])).rows[0];
    check("selling it records the price", sold.status === "sold" && sold.sold_price === "15.00", JSON.stringify(sold));
    await page.goto(`${BASE}/items/${id}`);
    const t = await body(page);
    check("the item page shows the profit (£15 - £4 = £11)", t.includes("£11.00") && /profit/i.test(t), t.slice(0, 300));

    // reports and CSV
    await page.goto(`${BASE}/reports?p=all`);
    const rep = await body(page);
    check("reports show the sale (revenue £15.00, profit £11.00)", rep.includes("£15.00") && rep.includes("£11.00"));
    const csv = await ctx.request.get(`${BASE}/reports/export`);
    const csvText = await csv.text();
    check("the CSV export includes the item", csv.status() === 200 && csvText.includes("Journey boots"));

    // settings pages open
    await page.goto(`${BASE}/settings`);
    await page.click("a[href='/settings/account']");
    await page.waitForURL(`${BASE}/settings/account`);
    check("Settings > Account opens with the email and password forms", (await page.locator("#new-email").count()) === 1 && (await page.locator("#current").count()) === 1);
    await ctx.close();

    // --- Isolation: another account can't open this item ---
    const other = await signIn("locked@example.com");
    const resp = await other.page.goto(`${BASE}/items/${id}`);
    check("another account can't open someone else's item (404)", resp?.status() === 404, String(resp?.status()));
    await other.ctx.close();

    // --- Expired trial: read-only ---
    const lk = await signIn("locked@example.com");
    await lk.page.goto(`${BASE}/items/new`);
    check("an expired trial is sent to the billing page when adding", lk.page.url().includes("/billing"), lk.page.url());
    await lk.page.goto(`${BASE}/items`);
    check("...but can still see their items", (await body(lk.page)).includes("Locked user coat"));
    const lcsv = await lk.ctx.request.get(`${BASE}/reports/export`);
    check("...and still export their CSV", lcsv.status() === 200 && (await lcsv.text()).includes("Locked user coat"));
    await lk.ctx.close();

    // --- Signed out ---
    const anon = await browser.newContext(phone); const ap = await anon.newPage();
    await ap.goto(`${BASE}/items`); await ap.waitForLoadState();
    check("signed-out visitors are sent to sign in", ap.url().includes("/login"), ap.url());
    await anon.close();
  } finally {
    await browser.close();
    await pool.end();
    await dbm.pool.end();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
