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

    const plat = async (name: string) => (await pool.query("select id from platforms where user_id=$1 and name=$2", [trial.id, name])).rows[0].id as number;
    const vinted = await plat("Vinted");
    const ebay = await plat("eBay");

    // list it (Vinted is pre-selected as the first platform)
    await page.goto(`${BASE}/items/${id}`);
    await page.fill(`#price_${vinted}`, "20");
    await page.click("button:has-text('Mark as listed')");
    await page.waitForTimeout(1500);
    const listed = (await pool.query("select status, list_price from items where id=$1", [id])).rows[0];
    check("listing it records the asking price", listed.status === "listed" && listed.list_price === "20.00", JSON.stringify(listed));

    // also list it on eBay at the same price (prefilled from the first listing)
    await page.goto(`${BASE}/items/${id}`);
    await page.click("summary:has-text('Also list on')");
    await page.click("label:has-text('eBay')");
    check("a second platform's price starts at the first price", (await page.inputValue(`#price_${ebay}`)) === "20.00");
    await page.click("button:has-text('Add listing')");
    await page.waitForTimeout(1500);
    const live = (await pool.query("select platform_id, price from listings where item_id=$1 and ended_at is null order by platform_id", [id])).rows;
    check("the item is now live on two platforms", live.length === 2, JSON.stringify(live));

    // set eBay's selling fee to 10% in Settings
    await page.goto(`${BASE}/settings/platforms`);
    await page.fill(`#fee_${ebay}`, "10");
    await page.click("button:has-text('Save fees')");
    await page.waitForTimeout(1500);
    const feePct = (await pool.query("select fee_percent::text as f from platforms where id=$1", [ebay])).rows[0].f;
    check("a platform's fee % can be saved in Settings", feePct === "10.00", feePct);

    // sell it on eBay, posted: the fee is pre-filled from the 10%, and I add £2 postage I paid
    await page.goto(`${BASE}/items/${id}`);
    await page.selectOption("#sold-platform", String(ebay));
    await page.fill("#price", "15");
    check("the fee is pre-filled from the platform's % (10% of £15 = £1.50)", (await page.inputValue("#fees")) === "1.50");
    await page.fill("#postagePaid", "2");
    await page.click("button:has-text('Mark as sold')");
    await page.waitForTimeout(1500);
    const sold = (await pool.query("select status, sold_price, sold_platform_id, handover, fees::text, postage_paid::text from items where id=$1", [id])).rows[0];
    check("selling it records the price, platform and posted handover", sold.status === "sold" && sold.sold_price === "15.00" && sold.sold_platform_id === ebay && sold.handover === "posted", JSON.stringify(sold));
    check("...and the fee and the postage I paid", sold.fees === "1.50" && sold.postage_paid === "2.00", JSON.stringify(sold));
    const stillLive = (await pool.query("select count(*)::int as n from listings where item_id=$1 and ended_at is null", [id])).rows[0].n;
    check("selling ends the listing on every platform", stillLive === 0);
    await page.goto(`${BASE}/items/${id}`);
    const t = await body(page);
    check("the item page shows the profit after fees and postage (£15 - £1.50 - £2 - £4 = £7.50) and where it sold", t.includes("£7.50") && /profit/i.test(t) && t.includes("eBay") && t.includes("Fees") && t.includes("Postage I paid"), t.slice(0, 400));

    // a collected item only completes once handed over
    const [boots2] = (await pool.query("insert into items (user_id, name, status, bought_at, buy_price) values ($1,'Collected lamp','bought','2026-01-01','2.00') returning id", [trial.id])).rows;
    await page.goto(`${BASE}/items/${boots2.id}`);
    await page.fill(`#price_${vinted}`, "10");
    await page.click("button:has-text('Mark as listed')");
    await page.waitForTimeout(1500);
    await page.goto(`${BASE}/items/${boots2.id}`);
    await page.selectOption("#sold-platform", String(vinted));
    await page.click("label:has-text('Collected by buyer')");
    await page.uncheck("input[name=handedOver]");
    await page.click("button:has-text('Mark as sold')");
    await page.waitForTimeout(1500);
    const waiting = (await pool.query("select status, handover from items where id=$1", [boots2.id])).rows[0];
    check("a collection not yet made stays 'sold'", waiting.status === "sold" && waiting.handover === "collected", JSON.stringify(waiting));
    await page.goto(`${BASE}/items/${boots2.id}`);
    check("...and offers 'Mark as handed over', not 'posted'", (await page.locator("button:has-text('Mark as handed over')").count()) === 1 && (await page.locator("button:has-text('Mark as posted')").count()) === 0);
    await page.click("button:has-text('Mark as handed over')");
    await page.waitForTimeout(1500);
    const done = (await pool.query("select status from items where id=$1", [boots2.id])).rows[0];
    check("handing it over completes the sale", done.status === "completed", JSON.stringify(done));

    // the To send worklist: Home links to it, parcels are grouped, a tick moves one on and Undo brings it back
    await page.goto(`${BASE}/`);
    check("the Home 'To send' tile opens the To send view", (await page.locator("a[href='/items?f=send']").count()) >= 1);
    await page.goto(`${BASE}/items?f=send`);
    const sendText = await body(page);
    check("To send lists the waiting parcel under its group", sendText.includes("No service chosen") && sendText.includes("Journey boots") && sendText.includes("Mark as posted"), sendText.slice(0, 400));
    check("...and nothing that has already been handed over", !sendText.includes("Collected lamp"));
    await page.click("button:has-text('Mark as posted')");
    await page.waitForTimeout(2000);
    check("ticking it off marks it posted", (await pool.query("select status from items where id=$1", [id])).rows[0].status === "posted");
    check("...and offers Undo, with the list now empty", (await page.locator("button:has-text('Undo')").count()) === 1 && (await body(page)).includes("Nothing waiting to be sent"));
    await page.click("button:has-text('Undo')");
    await page.waitForTimeout(2000);
    const undone = (await pool.query("select status, posted_at from items where id=$1", [id])).rows[0];
    check("Undo puts it back to 'sold' with no posted date", undone.status === "sold" && undone.posted_at === null, JSON.stringify(undone));
    await page.goto(`${BASE}/items`);
    const chipBoxes = await page.locator("a[href^='/items?f=']").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    check("the filter chips wrap onto two rows instead of scrolling", new Set(chipBoxes).size === 2, JSON.stringify(chipBoxes));

    // reports and CSV
    await page.goto(`${BASE}/reports?p=all`);
    await page.waitForTimeout(1500); // the charts draw in the browser after the page loads
    const rep = await body(page);
    check("reports add up both sales after fees (revenue £25.00, profit £15.50)", rep.includes("£25.00") && rep.includes("£15.50") && rep.includes("£3.50 fees and postage"), rep.slice(0, 300));
    // The second item was pre-set to the platforms used last time (Vinted and eBay), so each platform listed 2 items and sold 1
    check("reports show the selling platforms with their sell-through (each 1 of 2)", rep.includes("Selling platforms") && (rep.match(/50% \(1\/2\)/g) ?? []).length === 2, rep.slice(0, 600));
    check("reports show how items got to the buyer, with profit and the number sold", rep.includes("How items got to the buyer") && rep.includes("£7.50") && rep.includes("1 sold"), rep.slice(0, 600));
    const csv = await ctx.request.get(`${BASE}/reports/export`);
    const csvText = await csv.text();
    check("the CSV export includes the item and the fee columns", csv.status() === 200 && csvText.includes("Journey boots") && csvText.includes("Fees,Postage paid,Profit") && csvText.includes("Sold on,How it got there"));

    // settings pages open
    await page.goto(`${BASE}/settings`);
    await page.click("a[href='/settings/platforms']");
    await page.waitForURL(`${BASE}/settings/platforms`);
    const platNames = await page.locator("input[aria-label^='Rename ']").evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
    check("Settings > Platforms & postage lists the default platforms", ["Vinted", "eBay", "Depop", "Facebook Marketplace", "Gumtree"].every((n) => platNames.includes(n)), platNames.join(","));
    await page.goto(`${BASE}/settings`);
    await page.click("a[href='/settings/account']");
    await page.waitForURL(`${BASE}/settings/account`);
    check("Settings > Account opens with the email and password forms", (await page.locator("#new-email").count()) === 1 && (await page.locator("#current").count()) === 1);
    await ctx.close();

    // --- Isolation: another account can't open this item ---
    const other = await signIn("locked@example.com");
    await other.page.goto(`${BASE}/items/${id}`);
    // The page now streams (a loading placeholder first), so the status is 200 either way; what matters is what the person sees
    const otherBody = await body(other.page);
    check("another account can't open someone else's item (shows 'not found', nothing of the item)", otherBody.includes("could not be found") && !otherBody.includes("Journey boots"), otherBody.slice(0, 120));
    await other.ctx.close();

    // --- Expired trial: read-only ---
    const lk = await signIn("locked@example.com");
    await lk.page.goto(`${BASE}/items/new`);
    await lk.page.waitForURL(/\/billing/, { timeout: 10_000 }).catch(() => {}); // the redirect now happens just after the loading placeholder
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
