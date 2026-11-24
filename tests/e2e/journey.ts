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
  const hider = await mk("hider@example.com", 20);
  const guesser = await mk("guesser@example.com", 20);
  await mk("forgetful@example.com", 20);
  const adminUser = await mk("admin@example.com", 20);
  const leaver = await mk("leaver@example.com", 20);
  await dbm.db.insert(s.items).values({ userId: leaver.id, name: "Leaver's scarf", status: "bought", boughtAt: "2026-01-01", buyPrice: "3.00" });
  const old = await mk("old@example.com", 20); // stands in for an account that existed before the checklist: the migration hid it
  await dbm.db.insert(s.items).values({ userId: locked.id, name: "Locked user coat", status: "bought", boughtAt: "2026-01-01", buyPrice: "3.00" });
  const pool = new Pool({ connectionString: url, max: 1 });
  await pool.query("update users set checklist_hidden = true where id = $1", [old.id]);
  await pool.query("update users set role = 'admin' where id = $1", [adminUser.id]);

  await waitForServer();
  const browser = await chromium.launch();
  const phone = { viewport: { width: 390, height: 844 } };

  async function signIn(email: string, extra: Record<string, unknown> = {}) {
    const ctx = await browser.newContext({ ...phone, ...extra });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/login`);
    await page.fill("input[name=email]", email);
    await page.fill("input[name=password]", PASSWORD);
    await page.click("button[type=submit]");
    await page.waitForURL(`${BASE}/`, { timeout: 30_000 });
    return { ctx, page };
  }
  // Pages stream in behind a loading placeholder, so wait for the network to settle before reading the text
  const body = async (page: import("playwright").Page) => {
    await page.waitForLoadState("networkidle").catch(() => {});
    return page.innerText("body");
  };

  try {
    // --- A visitor who isn't signed in sees the landing page ---
    {
      const vctx = await browser.newContext(phone);
      const vp = await vctx.newPage();
      await vp.goto(`${BASE}/`);
      const t = await body(vp);
      check("a signed-out visitor sees the landing page headline", /actually keep/i.test(t) && (await vp.locator("h1").count()) === 1, t.slice(0, 200));
      check("...with the price and the trial length", t.includes("Free for 30 days, then £3 a month"), t.slice(0, 400));
      check("...and the questions people ask", (await vp.locator("details").count()) === 5);
      await vp.locator("details").first().locator("summary").click();
      check("...which open when tapped", (await vp.locator("details[open]").count()) === 1);
      await vp.getByRole("link", { name: "Sign in" }).first().click();
      await vp.waitForURL(/\/login/);
      check("...and the Sign in link goes to the sign-in page", vp.url().includes("/login"));
      await vctx.close();
    }

    // --- A normal seller ---
    const { ctx, page } = await signIn("trial@example.com");
    // Home streams in after its loading placeholder, so wait for the real content rather than reading the page at once
    await page.getByText("To list").first().waitFor({ timeout: 15_000 }).catch(() => {});
    check("signs in and lands on the home page", (await body(page)).includes("To list"));

    // wrong password is refused
    const bad = await browser.newContext(phone); const bp = await bad.newPage();
    await bp.goto(`${BASE}/login`); await bp.fill("input[name=email]", "trial@example.com"); await bp.fill("input[name=password]", "wrong-password-1"); await bp.click("button[type=submit]");
    await bp.waitForTimeout(1500);
    check("a wrong password is refused", bp.url().includes("/login")); await bad.close();

    // --- First-run checklist (new account) ---
    const ring = page.locator("[data-spotlight-ring]");
    const covers = (tour: string) => page.evaluate((t) => {
      const r = document.querySelector("[data-spotlight-ring]")?.getBoundingClientRect();
      const e = document.querySelector(`[data-tour="${t}"]`)?.getBoundingClientRect();
      return !!r && !!e && r.top <= e.top && r.left <= e.left && r.bottom >= e.bottom && r.right >= e.right;
    }, tour);
    await page.goto(BASE);
    await page.waitForSelector("[data-checklist]");
    const stepIds = await page.locator("[data-checklist-step]").evaluateAll((els) => els.map((e) => e.getAttribute("data-checklist-step")));
    const ck = await body(page);
    check("a new account's Home shows 'Getting started' with four steps, none done", ck.includes("Getting started") && ck.includes("0 of 4 done") && JSON.stringify(stepIds) === JSON.stringify(["fees", "first-item", "list", "sale"]), ck.slice(0, 300));
    check("...and 'list it' and 'record a sale' aren't links yet (nothing to open)", (await page.locator("[data-checklist-step=list] a, [data-checklist-step=sale] a").count()) === 0 && ck.includes("Add an item first."));
    check("...in place of the old 'Nothing in stock yet' card", !ck.includes("Nothing in stock yet"));
    await page.click("[data-checklist-step=fees] a");
    await page.waitForURL(/\/settings\/platforms/);
    await ring.waitFor({ timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(900);
    check("the fees step opens Settings with a spotlight ring and a caption", (await ring.count()) === 1 && (await page.locator("[data-spotlight-caption]").innerText()).includes("selling fee"));
    check("...ringing the fees card (and it has left '?tour=' out of the address)", (await covers("fees")) && !page.url().includes("tour="), page.url());
    check("...without blocking taps (the ring ignores them)", (await ring.evaluate((e) => getComputedStyle(e).pointerEvents)) === "none");
    await page.waitForTimeout(700);
    await page.click("input[name^=fee_] >> nth=0");
    await page.waitForTimeout(300);
    check("...and a tap anywhere fades it", (await ring.count()) === 0);
    await page.reload();
    await page.waitForTimeout(1500);
    check("...and a refresh doesn't bring it back", (await ring.count()) === 0);
    await page.goto(`${BASE}/settings/platforms?tour=bogus`);
    await page.waitForTimeout(1500);
    check("an unknown tour name does nothing", (await ring.count()) === 0);
    await page.goto(`${BASE}/settings/platforms?tour=fees`);
    await ring.waitFor({ timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(700);
    await page.click("[data-spotlight-caption] button:has-text('Got it')");
    check("'Got it' closes the spotlight", (await ring.count()) === 0);
    await page.click("button:has-text('Save fees')"); // every fee left at 0: still counts as checked
    await page.waitForTimeout(1500);
    await page.goto(BASE);
    await page.waitForSelector("[data-checklist]");
    check("saving the fees form (even all 0%) ticks 'Check your selling fees'", (await page.locator("[data-checklist-step=fees]").getAttribute("data-done")) === "true" && (await body(page)).includes("1 of 4 done"));

    // add an item
    await page.goto(`${BASE}/items/new?tour=add-item`);
    await ring.waitFor({ timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(900);
    check("'Add your first find' points at the name field on the add form", (await ring.count()) === 1 && (await covers("add-item")));
    await page.goto(`${BASE}/items/new`);
    check("the add form asks 'Where from' (not 'Charity shop')", (await page.locator("label[for=shop]").innerText()).trim() === "Where from" && !(await body(page)).includes("Charity shop"));
    const startOptions = await page.locator("#shop option").allInnerTexts();
    check("...and a new account's list starts with Car Boot, Charity Shop, Online Auction, Own Wardrobe (A to Z)", JSON.stringify(startOptions.slice(1, 5)) === JSON.stringify(["Car Boot", "Charity Shop", "Online Auction", "Own Wardrobe"]), JSON.stringify(startOptions));
    await page.fill("#name", "Journey boots");
    await page.fill("#buyPrice", "4");
    await page.selectOption("#shop", { label: "Car Boot" });
    await page.selectOption("#categoryId", { label: "Shoes" });
    await page.click("button[type=submit]:has-text('Save')");
    await page.waitForURL(/\/items(\/\d+)?$/, { timeout: 30_000 });
    const { rows } = await pool.query("select id, status, buy_price from items where user_id=$1 and name='Journey boots'", [trial.id]);
    check("the new item is saved as 'to list' with the right price", rows.length === 1 && rows[0].status === "bought" && rows[0].buy_price === "4.00", JSON.stringify(rows));
    const id = rows[0]?.id;
    await page.goto(BASE);
    await page.waitForSelector("[data-checklist]");
    check("adding an item ticks 'Add your first find' (2 of 4 done)", (await page.locator("[data-checklist-step=first-item]").getAttribute("data-done")) === "true" && (await body(page)).includes("2 of 4 done"));
    await page.click("[data-checklist-step=list] a");
    await page.waitForURL(new RegExp(`/items/${id}$`));
    await ring.waitFor({ timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(900);
    check("'List it for sale' opens that item and points at its List it step", (await ring.count()) === 1 && (await covers("list-step")));
    await page.goto(`${BASE}/items/new`);
    check("the next item starts on the same 'Where from' as the last one", (await page.inputValue("#shop")) === "Car Boot");

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
    await page.goto(BASE);
    await page.waitForSelector("[data-checklist]");
    check("listing it ticks 'List it for sale' (3 of 4 done)", (await page.locator("[data-checklist-step=list]").getAttribute("data-done")) === "true" && (await body(page)).includes("3 of 4 done"));
    await page.click("[data-checklist-step=sale] a");
    await page.waitForURL(new RegExp(`/items/${id}$`));
    await ring.waitFor({ timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(900);
    check("'Record your first sale' opens the listed item and points at its sell step", (await ring.count()) === 1 && (await covers("sell-step")));

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
    await page.goto(BASE);
    await page.waitForSelector("text=Waiting for money, text=To send", { timeout: 15_000 }).catch(() => {});
    check("recording the first sale finishes the checklist and it goes away", !(await body(page)).includes("Getting started") && (await page.locator("[data-checklist]").count()) === 0);
    await page.goto(`${BASE}/items/${id}`);
    const t = await body(page);
    check("the item page shows the profit after fees and postage (£15 - £1.50 - £2 - £4 = £7.50) and where it sold", t.includes("£7.50") && /profit/i.test(t) && t.includes("eBay") && t.includes("Fees") && t.includes("Postage I paid"), t.slice(0, 400));
    check("a sold item's page offers 'Undo sale'", t.includes("Undo sale"));

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
    // a posted parcel is "waiting for money": Home counts it and the Items chip lists it with how long it has waited
    await page.goto(`${BASE}`);
    const homeText = await body(page);
    check("Home has a 'Waiting for money' tile counting the posted parcel", homeText.includes("Waiting for money") && (await page.locator("a[href='/items?f=waiting']").first().innerText()).trim().startsWith("1"), homeText.slice(0, 300));
    await page.goto(`${BASE}/items?f=waiting`);
    const waitText = await body(page);
    check("the 'Waiting for money' view lists it with the days waiting", waitText.includes("Journey boots") && waitText.includes("Posted today") && !waitText.includes("Collected lamp"), waitText.slice(0, 300));
    // the To send "Undo" bar is gone once the page changes, so undo from the item page instead
    await page.goto(`${BASE}/items/${id}`);
    await page.click("button:has-text('Undo: not posted yet')");
    await page.waitForTimeout(2000);
    const undone = (await pool.query("select status, posted_at from items where id=$1", [id])).rows[0];
    check("Undo puts it back to 'sold' with no posted date", undone.status === "sold" && undone.posted_at === null, JSON.stringify(undone));
    await page.goto(`${BASE}/items`);
    const chipBoxes = await page.locator("a[href^='/items?f=']").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    check("the filter chips wrap onto several rows instead of scrolling", new Set(chipBoxes).size >= 2, JSON.stringify(chipBoxes));

    // reports and CSV
    await page.goto(`${BASE}/reports?p=all`);
    await page.waitForTimeout(1500); // the charts draw in the browser after the page loads
    const rep = await body(page);
    check("reports add up both sales after fees (revenue £25.00, profit £15.50)", rep.includes("£25.00") && rep.includes("£15.50") && rep.includes("£3.50 fees and postage"), rep.slice(0, 300));
    // The second item was pre-set to the platforms used last time (Vinted and eBay), so each platform listed 2 items and sold 1
    check("reports show percentages as whole numbers (no 62.00%)", !/\d+\.\d+%/.test(rep), (rep.match(/\d+\.\d+%/g) ?? []).join(","));
    const periodTops = await page.locator("a[href^='/reports?p=']").evaluateAll((els) => els.slice(0, 7).map((e) => Math.round(e.getBoundingClientRect().top)));
    check("the report period chips wrap onto rows instead of scrolling sideways", new Set(periodTops).size >= 2, JSON.stringify(periodTops));
    await page.locator("summary:has-text('How these numbers are worked out')").click();
    const help = await body(page);
    check("the 'how these numbers are worked out' box says fees and postage you paid are taken off", /fees and any postage you paid/.test(help) && !/buyers pay it/.test(help));
    check("reports call the shop table 'Best places to buy', not 'Best charity shops'", rep.includes("Best places to buy") && !rep.includes("charity shops"), rep.slice(0, 200));
    check("reports show the selling platforms with their sell-through (each 1 of 2)", rep.includes("Selling platforms") && (rep.match(/50% \(1\/2\)/g) ?? []).length === 2, rep.slice(0, 600));
    check("reports show how items got to the buyer, with profit and the number sold", rep.includes("How items got to the buyer") && rep.includes("£7.50") && rep.includes("1 sold"), rep.slice(0, 600));
    const csv = await ctx.request.get(`${BASE}/reports/export`);
    const csvText = await csv.text();
    check("the CSV export includes the item and the fee columns", csv.status() === 200 && csvText.includes("Journey boots") && csvText.includes("Fees,Postage paid,Profit") && csvText.includes("Sold on,How it got there"));
    check("...with a 'Where from' column showing Car Boot, and no 'Charity shop' heading", csvText.includes("Where from") && csvText.includes("Car Boot") && !csvText.includes("Charity shop"), csvText.slice(0, 200));

    // Undo last step (the collected lamp is now completed)
    await page.goto(`${BASE}/items/${boots2.id}`);
    check("a completed collection offers 'Undo: not handed over yet'", (await page.locator("button:has-text('Undo: not handed over yet')").count()) === 1);
    await page.click("button:has-text('Undo: not handed over yet')");
    await page.waitForTimeout(1500);
    const unhanded = (await pool.query("select status, posted_at from items where id=$1", [boots2.id])).rows[0];
    check("...and Undo puts it back to 'sold' with no handed-over date", unhanded.status === "sold" && unhanded.posted_at === null, JSON.stringify(unhanded));
    await page.goto(`${BASE}/items/${boots2.id}`);
    page.once("dialog", (d) => d.accept());
    await page.click("button:has-text('Undo sale')");
    await page.waitForTimeout(2000);
    const unsold2 = (await pool.query("select status, sold_price, sold_at, fees::text from items where id=$1", [boots2.id])).rows[0];
    const relive = (await pool.query("select count(*)::int as n from listings where item_id=$1 and ended_at is null", [boots2.id])).rows[0].n;
    check("'Undo sale' (after confirming) clears the sale and puts it back on sale on both platforms it was listed on (Vinted and eBay)", unsold2.status === "listed" && unsold2.sold_price === null && unsold2.sold_at === null && unsold2.fees === "0.00" && relive === 2, JSON.stringify([unsold2, relive]));
    await page.goto(`${BASE}/items/${boots2.id}`);
    check("a listed item has no Undo button", (await page.locator("button:has-text('Undo')").count()) === 0);
    await page.goto(`${BASE}/settings`);
    check("Settings lists 'Where from & categories' and a 'Help and feedback' link", (await body(page)).includes("Where from & categories") && (await page.locator("a[href='/help']").count()) === 1);
    await page.click("a[href='/help']");
    await page.waitForURL(/\/help$/);
    await page.waitForSelector("text=How profit is worked out", { timeout: 15_000 }).catch(() => {}); // the page streams in after the loading placeholder
    const helpText = await body(page);
    check("the Help page explains the stages, profit, fees and Undo", ["How an item moves", "How profit is worked out", "Set your fees first", "Tapped the wrong button?"].every((t) => helpText.includes(t)), helpText.slice(0, 200));
    check("...showing a pill for every status", (await page.locator("span.rounded-full:text-is('Sold, to send')").count()) === 1 && helpText.includes("Waiting for money"));
    check("...with a Send feedback button that opens an email to hello@hiddengemsapp.co.uk", (await page.locator("a:has-text('Send feedback')").getAttribute("href")) === "mailto:hello@hiddengemsapp.co.uk?subject=Hidden%20Gems%20feedback");

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
    check("...and a 'Your data' card with a download button and a delete link", (await page.locator("[data-your-data] a[href='/settings/account/download']").count()) === 1 && (await page.locator("[data-your-data] a[href='/settings/account/delete']").count()) === 1);
    const zip = await ctx.request.get(`${BASE}/settings/account/download`);
    const zipBytes = await zip.body();
    check("the download is a zip file named for Hidden Gems", zip.status() === 200 && zip.headers()["content-type"] === "application/zip" && /hidden-gems-all-my-data-.*\.zip/.test(zip.headers()["content-disposition"] ?? "") && zipBytes.subarray(0, 2).toString() === "PK", String(zip.status()));
    check("...and it holds the item I entered", zipBytes.includes(Buffer.from("items.csv")) && zipBytes.includes(Buffer.from("photos.csv")));
    await page.goto(`${BASE}/settings`);
    const groups = await page.locator("[data-settings-group] h2").allInnerTexts();
    check("Settings has two labelled groups, 'Your app' then 'Your account' (no Admin group for a seller)", JSON.stringify(groups.map((g) => g.trim().toLowerCase())) === JSON.stringify(["your app", "your account"]), JSON.stringify(groups));
    const topOf = async (sel: string) => (await page.locator(sel).first().boundingBox())?.y ?? -1;
    const gTop = [await topOf("[data-settings-group] >> nth=0"), await topOf("[data-settings-group] >> nth=1")];
    const order = { g: gTop, targets: await topOf("a[href='/settings/targets']"), account: await topOf("a[href='/settings/account']"), billing: await topOf("a[href='/billing']"), help: await topOf("a[href='/help']") };
    check("...with Targets under 'Your app', and Account, Billing and Help under 'Your account'", order.targets > order.g[0] && order.targets < order.g[1] && order.account > order.g[1] && order.billing > order.g[1] && order.help > order.g[1], JSON.stringify(order));
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
    await lk.page.goto(BASE);
    await lk.page.waitForSelector("text=To list", { timeout: 15_000 }).catch(() => {});
    check("an expired trial doesn't get the first-run checklist (it can't add anything)", (await lk.page.locator("[data-checklist]").count()) === 0);
    await lk.page.goto(`${BASE}/settings`);
    check("an expired trial still sees the Help and feedback link in Settings", (await lk.page.locator("a[href='/help']").count()) === 1);
    await lk.page.goto(`${BASE}/help`);
    await lk.page.waitForSelector("text=How profit is worked out", { timeout: 15_000 }).catch(() => {});
    const lhelp = await body(lk.page);
    check("...and can open the Help page (it isn't blocked like adding is)", lk.page.url().endsWith("/help") && lhelp.includes("How profit is worked out"), lk.page.url());
    await lk.ctx.close();

    // --- Hiding the checklist, reduced motion, and accounts that existed before it ---
    const hd = await signIn("hider@example.com", { reducedMotion: "reduce" });
    await hd.page.waitForSelector("[data-checklist]", { timeout: 15_000 });
    await hd.page.goto(`${BASE}/settings/platforms?tour=fees`);
    await hd.page.waitForSelector("[data-spotlight-ring]", { timeout: 10_000 });
    check("with reduced motion on, the spotlight ring doesn't pulse", (await hd.page.locator("[data-spotlight-ring]").evaluate((e) => getComputedStyle(e).animationName)) === "none");
    await hd.page.goto(BASE);
    await hd.page.waitForSelector("[data-checklist]");
    await hd.page.click("button:has-text('Hide this')");
    await hd.page.waitForTimeout(1500);
    check("'Hide this' removes the checklist", (await hd.page.locator("[data-checklist]").count()) === 0);
    await hd.page.reload();
    await hd.page.waitForTimeout(1500);
    check("...and it stays hidden", (await hd.page.locator("[data-checklist]").count()) === 0 && (await pool.query("select checklist_hidden from users where id=$1", [hider.id])).rows[0].checklist_hidden === true);
    await hd.ctx.close();
    const od = await signIn("old@example.com");
    await od.page.waitForSelector("text=To list", { timeout: 15_000 }).catch(() => {});
    check("an account that existed before the checklist never sees it", (await od.page.locator("[data-checklist]").count()) === 0 && (await body(od.page)).includes("Nothing in stock yet"));
    await od.ctx.close();

    // --- Sign-in rate limiting ---
    const tryLogin = async (email: string, password: string) => {
      const c = await browser.newContext(phone); const p = await c.newPage();
      await p.goto(`${BASE}/login`); await p.fill("input[name=email]", email); await p.fill("input[name=password]", password); await p.click("button[type=submit]");
      await p.waitForTimeout(1500);
      const r = { url: p.url(), text: await body(p) }; await c.close(); return r;
    };
    let last = { url: "", text: "" };
    for (let i = 0; i < 8; i++) last = await tryLogin("guesser@example.com", `wrong-guess-${i}`);
    check("eight wrong passwords are each just refused", last.text.includes("Email or password is incorrect") && !last.text.includes("Too many"), last.text.slice(0, 160));
    last = await tryLogin("guesser@example.com", "wrong-guess-9");
    check("the ninth is told to wait", last.text.includes("Too many sign-in attempts") && /wait \d+ minutes?/.test(last.text), last.text.slice(0, 200));
    last = await tryLogin("guesser@example.com", PASSWORD);
    check("...even with the right password, until the wait is over", last.url.includes("/login") && last.text.includes("Too many sign-in attempts"), last.url);
    last = await tryLogin("GUESSER@example.com", PASSWORD);
    check("...however the email is typed", last.text.includes("Too many sign-in attempts"));
    const bystander = await signIn("trial@example.com"); await bystander.page.getByText("To list").first().waitFor({ timeout: 15_000 }).catch(() => {});
    check("someone else can still sign in", (await body(bystander.page)).includes("To list")); await bystander.ctx.close();
    last = await tryLogin("nobody-here@example.com", "whatever-it-is");
    check("an email with no account gets the same plain message as a wrong password", last.text.includes("Email or password is incorrect"));

    // Waiting isn't the only way back in: resetting the password by email clears it
    const { createToken } = await import("@/lib/tokens");
    const raw = await createToken(guesser.id, "reset_password");
    const rc = await browser.newContext(phone); const rp = await rc.newPage();
    await rp.goto(`${BASE}/reset-password?token=${raw}`);
    await rp.fill("input[name=password]", "A-brand-new-pass-77"); await rp.fill("input[name=confirm]", "A-brand-new-pass-77"); await rp.click("button[type=submit]");
    await rp.waitForURL(/\/login\?reset=1/, { timeout: 15_000 }).catch(() => {}); await rc.close();
    last = await tryLogin("guesser@example.com", "A-brand-new-pass-77");
    check("a password reset lifts the wait", !last.url.includes("/login"), last.url + " " + last.text.slice(0, 120));

    // A few slips followed by the right password: signs in, and the slips are forgotten
    for (let i = 0; i < 7; i++) await tryLogin("forgetful@example.com", `slip-${i}`);
    last = await tryLogin("forgetful@example.com", PASSWORD);
    check("seven slips then the right password still signs in", !last.url.includes("/login"), last.url);
    for (let i = 0; i < 7; i++) last = await tryLogin("forgetful@example.com", `slip-again-${i}`);
    check("...and the slips were forgotten (seven more are still fine)", !last.text.includes("Too many"), last.text.slice(0, 120));

    // --- Deleting an account: two steps, then it's all gone ---
    const lv = await signIn("leaver@example.com");
    await lv.page.goto(`${BASE}/settings/account/delete`);
    const warn = await body(lv.page);
    check("deleting starts with a warning page that says what goes and offers a download first", warn.includes("This can't be undone") && warn.includes("Download all my data") && warn.includes("Stripe keeps its own payment records"), warn.slice(0, 200));
    check("...and nothing is deleted just by opening it", Number((await pool.query("select count(*) n from users where id=$1", [leaver.id])).rows[0].n) === 1);
    await lv.page.click("[data-delete-continue]");
    await lv.page.waitForURL(/\/delete\/confirm/);
    await lv.page.fill("#delete-email", "someone-else@example.com"); await lv.page.fill("#delete-password", PASSWORD);
    await lv.page.click("[data-delete-form] button[type=submit]");
    await lv.page.waitForTimeout(1500);
    check("a different email typed in is refused and nothing is deleted", (await body(lv.page)).toLowerCase().includes("email") && Number((await pool.query("select count(*) n from users where id=$1", [leaver.id])).rows[0].n) === 1);
    await lv.page.fill("#delete-email", "leaver@example.com"); await lv.page.fill("#delete-password", "not-the-password");
    await lv.page.click("[data-delete-form] button[type=submit]");
    await lv.page.waitForTimeout(1500);
    check("a wrong password is refused and nothing is deleted", Number((await pool.query("select count(*) n from users where id=$1", [leaver.id])).rows[0].n) === 1 && lv.page.url().includes("/delete/confirm"), lv.page.url());
    await lv.page.fill("#delete-email", "LEAVER@example.com"); await lv.page.fill("#delete-password", PASSWORD);
    await lv.page.click("[data-delete-form] button[type=submit]");
    await lv.page.waitForURL(/\/login\?deleted=1/, { timeout: 20_000 }).catch(() => {});
    const bye = await body(lv.page);
    check("the right email (any capitals) and password delete it, sign out, and say so on the sign-in page", lv.page.url().includes("/login?deleted=1") && bye.includes("has been deleted"), lv.page.url());
    check("...the account and its items are gone from the database", Number((await pool.query("select count(*) n from users where email=$1", ["leaver@example.com"])).rows[0].n) === 0 && Number((await pool.query("select count(*) n from items where user_id=$1", [leaver.id])).rows[0].n) === 0);
    await lv.page.goto(`${BASE}/items`); await lv.page.waitForLoadState();
    check("...and they're signed out", lv.page.url().includes("/login"), lv.page.url());
    await lv.ctx.close();

    // --- The admin overview and Users list ---
    const sellerTry = await signIn("trial@example.com");
    await sellerTry.page.goto(`${BASE}/admin`);
    await sellerTry.page.waitForURL(`${BASE}/`, { timeout: 10_000 }).catch(() => {}); // the redirect happens just after the loading placeholder
    check("a seller who opens the admin overview is sent back to Home", !sellerTry.page.url().includes("/admin") && !(await body(sellerTry.page)).includes("Trials ending"), sellerTry.page.url());
    await sellerTry.ctx.close();
    const ad = await signIn("admin@example.com");
    await ad.page.goto(`${BASE}/settings`);
    const adminLinks = await ad.page.locator("a[href='/admin'], a[href='/admin/users'], a[href='/admin/waitlist']").allInnerTexts();
    check("an admin's Settings has an Admin group with Overview, Manage users and Waitlist", (await ad.page.locator("[data-settings-group] h2").allInnerTexts()).map((t) => t.trim().toLowerCase()).includes("admin") && adminLinks.map((t) => t.replace("→", "").trim()).join("|") === "Overview|Manage users|Waitlist", adminLinks.join("|"));
    await ad.page.goto(`${BASE}/admin`);
    await ad.page.getByText("Sign-ups").first().waitFor({ timeout: 15_000 });
    const ov = await body(ad.page);
    const sellerCount = Number((await pool.query("select count(*) n from users where role <> 'admin'")).rows[0].n);
    check("the Overview's account count is everyone except admins", new RegExp(`${sellerCount}\\s*accounts`).test(ov), ov.slice(0, 300));
    check("...and shows the headings for sign-ups, use, plans, trial to paid, trials ending and newest sign-ups", ["Sign-ups", "Are they using it?", "Plans", "Trial to paid", "Trials ending within 7 days", "Newest sign-ups", "Across the whole app"].every((h) => ov.toLowerCase().includes(h.toLowerCase())), ov.slice(0, 200));
    check("...names the account that has used the app and the locked account in the lists", ov.includes("locked@example.com") || ov.includes("trial@example.com"));
    await ad.page.goto(`${BASE}/admin/users?show=readonly`);
    await ad.page.getByText("Newest first").waitFor({ timeout: 15_000 });
    const ro = await body(ad.page);
    check("Users filtered to Read-only lists the locked account and not the one on trial", ro.includes("locked@example.com") && !ro.includes("hider@example.com"), ro.slice(0, 300));
    check("...with filter chips and a count on each", (await ad.page.locator("[data-user-filters] a").count()) === 8 && (await ad.page.locator("[data-user-filters] a[aria-current=page]").innerText()).includes("Read-only"));
    check("...and 'Add a user' is folded away until it's tapped, so the list comes first", (await ad.page.locator("[data-add-user][open]").count()) === 0 && !(await ad.page.locator("[data-add-user] #name").first().isVisible().catch(() => false)));
    await ad.page.goto(`${BASE}/admin/users?show=bogus`);
    check("an unknown filter just shows everyone", (await ad.page.locator("[data-user-filters] a[aria-current=page]").innerText()).startsWith("All"));

    // --- Error alerts ---
    await ad.page.goto(`${BASE}/admin`);
    await ad.page.locator("[data-error-alerts]").waitFor({ timeout: 15_000 });
    const alertCard = await ad.page.locator("[data-error-alerts]").innerText();
    check("the Overview has an 'Error alerts' card that says no problems are recorded yet", (await ad.page.getByText("Error alerts").count()) >= 1 && alertCard.includes("No problems recorded"), alertCard.slice(0, 300));
    check("...with a 'Send a test alert' button", (await ad.page.locator("[data-test-alert] button:has-text('Send a test alert')").count()) === 1);
    await ad.page.locator("[data-test-alert] button:has-text('Send a test alert')").click();
    await ad.page.locator("[data-test-alert] [role=status], [data-test-alert] [role=alert]").first().waitFor({ timeout: 20_000 });
    const testRow = (await pool.query("select * from error_alerts where signature = 'test-alert'")).rows;
    check("tapping it records a test alert and tells me what happened", testRow.length === 1 && testRow[0].is_test === true && (await ad.page.locator("[data-test-alert]").innerText()).length > 20, JSON.stringify(testRow));

    const boom1 = await ad.ctx.request.get(`${BASE}/api/e2e-boom`);
    const boom2 = await ad.ctx.request.get(`${BASE}/api/e2e-boom`);
    const boomRows = (await pool.query("select * from error_alerts where is_test = false")).rows;
    check("a deliberate server crash is recorded once, with a count of 2 after a repeat", boom1.status() === 500 && boom2.status() === 500 && boomRows.length === 1 && boomRows[0].count === 2 && boomRows[0].source === "route", JSON.stringify(boomRows));
    check("...and the stored summary has no email address or long token in it", !JSON.stringify(boomRows).includes("ada@example.com") && !JSON.stringify(boomRows).includes("abcdefghijklmnopqrstuvwxyz0123456789"), JSON.stringify(boomRows));
    await ad.page.goto(`${BASE}/admin`);
    await ad.page.locator("[data-error-alerts]").waitFor({ timeout: 15_000 });
    const alertCard2 = await ad.page.locator("[data-error-alerts]").innerText();
    check("the Overview then lists the problem with its count", alertCard2.includes("route") && alertCard2.includes("Deliberate test error") && !alertCard2.includes("ada@example.com"), alertCard2.slice(0, 400));

    // --- Daily job status ---
    await pool.query("delete from job_runs");
    await ad.page.goto(`${BASE}/admin`);
    await ad.page.locator("[data-daily-job]").waitFor({ timeout: 15_000 });
    check("before the daily job has ever run, the Overview says it hasn't run yet (calmly)", (await ad.page.locator("[data-daily-job]").getAttribute("data-daily-job")) === "never" && (await ad.page.locator("[data-daily-job]").innerText()).includes("Hasn't run yet"));
    const noSecret = await ad.ctx.request.get(`${BASE}/api/cron/trial-reminders`);
    check("the daily job refuses a caller without the secret, and that isn't recorded as a run", noSecret.status() === 401 && Number((await pool.query("select count(*) n from job_runs")).rows[0].n) === 0);
    const cronRun = await ad.ctx.request.get(`${BASE}/api/cron/trial-reminders`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? "x"}` } });
    check("with the secret it runs, and records it", cronRun.status() === 200 && Number((await pool.query("select count(*) n from job_runs where ok = true")).rows[0].n) === 1, String(cronRun.status()));
    await ad.page.goto(`${BASE}/admin`);
    await ad.page.locator("[data-daily-job]").waitFor({ timeout: 15_000 });
    const jobCard = await ad.page.locator("[data-daily-job]").innerText();
    check("the Overview then says it ran today, with the UTC time", (await ad.page.locator("[data-daily-job]").getAttribute("data-daily-job")) === "ok" && /Ran today at \d\d:\d\d UTC/.test(jobCard), jobCard.slice(0, 300));
    await pool.query("update job_runs set last_run_at = now() - interval '2 days'");
    await ad.page.goto(`${BASE}/admin`);
    await ad.page.locator("[data-daily-job]").waitFor({ timeout: 15_000 });
    check("...and warns when it hasn't run for over a day", (await ad.page.locator("[data-daily-job]").getAttribute("data-daily-job")) === "overdue" && (await ad.page.locator("[data-daily-job]").innerText()).includes("longer ago than it should be"));
    await ad.ctx.close();

    // --- Signed out ---
    const anon = await browser.newContext(phone); const ap = await anon.newPage();
    await ap.goto(`${BASE}/items`); await ap.waitForLoadState();
    check("signed-out visitors are sent to sign in", ap.url().includes("/login"), ap.url());
    await ap.goto(`${BASE}/help`); await ap.waitForLoadState();
    check("...and the Help page needs a sign-in too", ap.url().includes("/login"), ap.url());
    await ap.goto(`${BASE}/terms`);
    check("the terms give a contact email", (await body(ap)).includes("hello@hiddengemsapp.co.uk"));
    await ap.goto(`${BASE}/privacy`);
    check("...and so does the privacy notice", (await body(ap)).includes("hello@hiddengemsapp.co.uk"));
    check("the privacy notice says who is responsible for the data (name and address)", (await body(ap)).includes("Ross Oliver") && (await body(ap)).includes("Cannon Field"));
    await ap.goto(`${BASE}/terms`);
    check("the terms say who runs the service (name, address and email)", (await body(ap)).includes("Ross Oliver") && (await body(ap)).includes("Cannon Field") && (await body(ap)).includes("sole trader"));
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
