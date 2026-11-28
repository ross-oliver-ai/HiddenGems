// "Suggest details from photo": the rules, the call to the AI (with a fake in place of the network), and the database side.
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { dbSkipReason, pointAppAtTestDatabase, resetAndMigrate } from "./helpers/testdb";
import { AI_MODELS, costMicroUsd, microUsdToPounds, poundsLabel } from "@/lib/ai-pricing";
import { DEFAULT_AI_SETTINGS, buildPrompt, decideAi, monthStart, parseSuggestion, type AiSettings } from "@/lib/ai-rules";
import { AiUnavailableError, askClaude } from "@/lib/ai-claude";
import { CONDITIONS } from "@/lib/items";

const lists = { categories: [{ id: 7, name: "Coats" }, { id: 8, name: "Books" }], conditions: CONDITIONS };
const on: AiSettings = { ...DEFAULT_AI_SETTINGS, enabled: true };

describe("AI cost estimates", () => {
  it("works out millionths of a dollar from the list prices", () => {
    // 2,400 in at $0.10 per million = 240; 250 out at $0.50 per million = 125
    assert.equal(costMicroUsd("claude-haiku-5-5", 2400, 250), 365);
    // 2,400 in at $2 = 4,800; 250 out at $10 = 2,500
    assert.equal(costMicroUsd("claude-sonnet-5-5", 2400, 250), 7300);
  });
  it("counts an unknown model as free rather than guessing", () => assert.equal(costMicroUsd("mystery", 1000, 1000), 0));
  it("turns dollars into estimated pounds and short labels", () => {
    assert.ok(Math.abs(microUsdToPounds(1_000_000) - 0.77) < 1e-9);
    assert.equal(poundsLabel(0), "£0.00");
    assert.equal(poundsLabel(0.0003), "under 1p");
    assert.equal(poundsLabel(0.056), "6p");
    assert.equal(poundsLabel(1.5), "£1.50");
  });
  it("offers Haiku first, and it is the cheaper of the two", () => {
    assert.equal(AI_MODELS[0].id, DEFAULT_AI_SETTINGS.model);
    assert.ok(AI_MODELS[0].inputPerMTok < AI_MODELS[1].inputPerMTok);
  });
});

describe("decideAi()", () => {
  const ok = { settings: on, keyPresent: true, userUsesThisMonth: 0, spentMicroUsdThisMonth: 0 };
  it("ships switched off", () => {
    assert.equal(DEFAULT_AI_SETTINGS.enabled, false);
    const d = decideAi({ ...ok, settings: DEFAULT_AI_SETTINGS });
    assert.ok(!d.ok && d.reason === "off");
  });
  it("allows a normal request", () => assert.deepEqual(decideAi(ok), { ok: true }));
  it("refuses without a key on the server, even when switched on", () => {
    const d = decideAi({ ...ok, keyPresent: false });
    assert.ok(!d.ok && d.reason === "no_key");
  });
  it("stops one person at their monthly limit, with a friendly message", () => {
    assert.deepEqual(decideAi({ ...ok, userUsesThisMonth: 199 }), { ok: true });
    const d = decideAi({ ...ok, userUsesThisMonth: 200 });
    assert.ok(!d.ok && d.reason === "user_limit" && /1st/.test(d.message));
  });
  it("stops everyone once estimated spend reaches the ceiling, without telling sellers why", () => {
    const justUnder = Math.floor(((10 - 0.01) / 0.77) * 1_000_000);
    assert.deepEqual(decideAi({ ...ok, spentMicroUsdThisMonth: justUnder }), { ok: true });
    const d = decideAi({ ...ok, spentMicroUsdThisMonth: Math.ceil((10 / 0.77) * 1_000_000) });
    assert.ok(!d.ok && d.reason === "budget" && !/£|budget|spend/i.test(d.message));
  });
});

describe("monthStart()", () => {
  it("is the first of the UK month", () => assert.equal(monthStart("2026-11-28").toISOString(), "2026-11-01T00:00:00.000Z"));
});

describe("parseSuggestion()", () => {
  it("reads a normal reply and matches category and condition to the lists", () => {
    const s = parseSuggestion('{"name":"Navy Barbour wax jacket","brand":"Barbour","size":"M","category":"coats","condition":"very good"}', lists);
    assert.deepEqual(s, { name: "Navy Barbour wax jacket", brand: "Barbour", size: "M", categoryId: 7, condition: "Very good" });
  });
  it("copes with text around the JSON", () => {
    const s = parseSuggestion('Sure! ```json\n{"name":"Red mug","brand":null,"size":null,"category":null,"condition":null}\n```', lists);
    assert.equal(s.name, "Red mug");
    assert.equal(s.brand, null);
  });
  it("turns guesses it can't back up into nothing", () => {
    const s = parseSuggestion('{"name":"  Blue   vase ","brand":"unknown","size":"N/A","category":"Furniture","condition":"Mint"}', lists);
    assert.deepEqual(s, { name: "Blue vase", brand: null, size: null, categoryId: null, condition: null });
  });
  it("shortens over-long values instead of failing", () => {
    const s = parseSuggestion(JSON.stringify({ name: "x".repeat(500), brand: "y".repeat(200), size: "z".repeat(99) }), lists);
    assert.equal(s.name?.length, 120);
    assert.equal(s.brand?.length, 60);
    assert.equal(s.size?.length, 30);
  });
  it("ignores values of the wrong type", () => {
    const s = parseSuggestion('{"name":42,"brand":["a"],"size":{"x":1},"category":7,"condition":true}', lists);
    assert.deepEqual(s, { name: null, brand: null, size: null, categoryId: null, condition: null });
  });
  it("rejects a reply with no usable JSON", () => {
    for (const bad of ["", "I can't tell", "{not json}", "[1,2,3]", "}{"]) assert.throws(() => parseSuggestion(bad, lists), `should reject ${JSON.stringify(bad)}`);
  });
});

describe("buildPrompt()", () => {
  it("lists the seller's own categories and the condition choices, and says never to guess a brand", () => {
    const p = buildPrompt({ categories: ["Coats", "Books"], conditions: CONDITIONS, hasTag: false });
    assert.match(p, /"Coats", "Books"/);
    assert.match(p, /"New with tags"/);
    assert.match(p, /Never guess a brand/);
    assert.match(p, /The image is the item/);
  });
  it("prefers the UK size when a tag shows several, and otherwise copies what is printed", () => {
    const p = buildPrompt({ categories: [], conditions: CONDITIONS, hasTag: true });
    assert.match(p, /give the UK size on its own, like "UK 10"/);
    assert.match(p, /If there is no UK size, copy what is printed/);
    assert.match(p, /never guess|Otherwise null/i);
  });
  it("mentions the tag image only when there is one", () => {
    assert.match(buildPrompt({ categories: [], conditions: CONDITIONS, hasTag: true }), /second image is its tag/);
    assert.doesNotMatch(buildPrompt({ categories: [], conditions: CONDITIONS, hasTag: false }), /second image/);
  });
});

describe("askClaude()", () => {
  const images = [{ mediaType: "image/jpeg" as const, base64: "AAAA" }, { mediaType: "image/jpeg" as const, base64: "BBBB" }];
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("sends the key, model, low effort and both photos, and reads the text and token counts", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const fake = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return reply({ content: [{ type: "thinking", thinking: "…" }, { type: "text", text: '{"name":"Mug"}' }], usage: { input_tokens: 2100, output_tokens: 40 } });
    }) as unknown as typeof fetch;
    const r = await askClaude({ apiKey: "sk-test", model: "claude-haiku-5-5", prompt: "P", images }, fake);
    assert.deepEqual(r, { text: '{"name":"Mug"}', inputTokens: 2100, outputTokens: 40 });
    assert.equal(seen!.url, "https://api.anthropic.com/v1/messages");
    const headers = seen!.init.headers as Record<string, string>;
    assert.equal(headers["x-api-key"], "sk-test");
    assert.ok(headers["anthropic-version"]);
    const body = JSON.parse(seen!.init.body as string);
    assert.equal(body.model, "claude-haiku-5-5");
    assert.equal(body.output_config.effort, "low");
    assert.deepEqual(body.messages[0].content.map((c: { type: string }) => c.type), ["image", "image", "text"]);
    assert.equal(body.messages[0].content[0].source.data, "AAAA");
  });
  it("turns an error answer into AiUnavailableError without leaking the key or the photo", async () => {
    const fake = (async () => reply({ error: { message: "bad key sk-test" } }, 401)) as unknown as typeof fetch;
    await assert.rejects(askClaude({ apiKey: "sk-test", model: "m", prompt: "P", images }, fake), (e: Error) => e instanceof AiUnavailableError && !/sk-test|AAAA/.test(e.message) && /401/.test(e.message));
  });
  it("turns a network failure and an unreadable reply into AiUnavailableError", async () => {
    const down = (async () => { throw new Error("socket sk-test"); }) as unknown as typeof fetch;
    await assert.rejects(askClaude({ apiKey: "sk-test", model: "m", prompt: "P", images }, down), (e: Error) => e instanceof AiUnavailableError && !/sk-test/.test(e.message));
    const junk = (async () => reply({ nope: true })) as unknown as typeof fetch;
    await assert.rejects(askClaude({ apiKey: "k", model: "m", prompt: "P", images }, junk), AiUnavailableError);
  });
});

describe("suggesting details (database)", { skip: dbSkipReason }, () => {
  let dbm: typeof import("@/db");
  let svc: typeof import("@/lib/ai-service");
  let userId = 0;
  let otherId = 0;
  const NOW = new Date("2026-11-28T10:00:00Z");
  const img = [{ mediaType: "image/jpeg" as const, base64: "AAAA" }];
  const good = async () => ({ text: '{"name":"Navy Barbour wax jacket","brand":"Barbour","size":"M","category":"Coats","condition":"Good"}', inputTokens: 2000, outputTokens: 100 });
  const rows = async () => (await dbm.pool.query("select * from ai_usage order by id")).rows;

  before(async () => {
    const url = pointAppAtTestDatabase();
    await resetAndMigrate(url);
    dbm = await import("@/db");
    svc = await import("@/lib/ai-service");
  });
  after(async () => { await dbm?.pool.end(); });
  beforeEach(async () => {
    await dbm.pool.query("truncate users, app_settings restart identity cascade");
    userId = (await dbm.pool.query("insert into users (email, name, password_hash) values ('a@example.com','A','x') returning id")).rows[0].id;
    otherId = (await dbm.pool.query("insert into users (email, name, password_hash) values ('b@example.com','B','x') returning id")).rows[0].id;
  });

  const run = (o: { userId?: number; ask?: typeof import("@/lib/ai-claude").askClaude; apiKey?: string | undefined } = {}) =>
    svc.suggestDetails({ userId: o.userId ?? userId, images: img, categories: [{ id: 7, name: "Coats" }] }, { ask: o.ask ?? good, now: NOW, apiKey: "apiKey" in o ? o.apiKey : "sk-test" });

  it("is off until the admin switches it on, and then nothing is sent or recorded", async () => {
    assert.deepEqual(await svc.getAiSettings(), DEFAULT_AI_SETTINGS);
    let called = false;
    const r = await run({ ask: async () => { called = true; return good(); } });
    assert.ok(!r.ok && r.status === 503);
    assert.equal(called, false);
    assert.equal((await rows()).length, 0);
  });

  it("saves the admin's settings in one row and reads them back", async () => {
    await svc.saveAiSettings({ enabled: true, model: "claude-sonnet-5-5", monthlyLimitPerUser: 50, monthlyBudgetPounds: 3 });
    await svc.saveAiSettings({ enabled: true, model: "claude-sonnet-5-5", monthlyLimitPerUser: 60, monthlyBudgetPounds: 3 });
    assert.equal((await dbm.pool.query("select count(*)::int n from app_settings")).rows[0].n, 1);
    assert.deepEqual(await svc.getAiSettings(), { enabled: true, model: "claude-sonnet-5-5", monthlyLimitPerUser: 60, monthlyBudgetPounds: 3 });
  });

  it("returns the suggestion and records tokens and cost when it is on", async () => {
    await svc.saveAiSettings(on);
    const r = await run();
    assert.ok(r.ok);
    if (r.ok) assert.deepEqual(r.suggestion, { name: "Navy Barbour wax jacket", brand: "Barbour", size: "M", categoryId: 7, condition: "Good" });
    const [row] = await rows();
    assert.equal(row.user_id, userId);
    assert.equal(row.model, "claude-haiku-5-5");
    assert.equal(row.input_tokens, 2000);
    assert.equal(row.output_tokens, 100);
    assert.equal(row.cost_micro_usd, costMicroUsd("claude-haiku-5-5", 2000, 100));
    assert.equal(row.ok, true);
  });

  it("uses the model the admin chose", async () => {
    await svc.saveAiSettings({ ...on, model: "claude-sonnet-5-5" });
    let model = "";
    await run({ ask: async (i) => { model = i.model; return good(); } });
    assert.equal(model, "claude-sonnet-5-5");
  });

  it("will not call the AI at all without a key on the server", async () => {
    await svc.saveAiSettings(on);
    let called = false;
    const r = await run({ apiKey: undefined, ask: async () => { called = true; return good(); } });
    assert.ok(!r.ok && r.status === 503);
    assert.equal(called, false);
  });

  it("stops one person at their limit but not other people, and counts only this month", async () => {
    await svc.saveAiSettings({ ...on, monthlyLimitPerUser: 2 });
    await dbm.pool.query("insert into ai_usage (user_id, created_at, model) values ($1, '2026-10-30T12:00:00Z', 'claude-haiku-5-5')", [userId]); // last month: doesn't count
    assert.ok((await run()).ok);
    assert.ok((await run()).ok);
    const third = await run();
    assert.ok(!third.ok && third.status === 429);
    assert.ok((await run({ userId: otherId })).ok, "someone else still can");
  });

  it("stops everyone at the spend ceiling", async () => {
    await svc.saveAiSettings({ ...on, monthlyBudgetPounds: 1 });
    await dbm.pool.query("insert into ai_usage (user_id, created_at, model, cost_micro_usd) values ($1, '2026-11-10T12:00:00Z', 'claude-haiku-5-5', 1400000)", [otherId]); // about £1.08 spent by someone else
    const r = await run();
    assert.ok(!r.ok && r.status === 503);
  });

  it("a reply it can't use is an error for the seller, but still costs and is recorded as unusable", async () => {
    await svc.saveAiSettings(on);
    const r = await run({ ask: async () => ({ text: "Sorry, I can't help", inputTokens: 1500, outputTokens: 10 }) });
    assert.ok(!r.ok && r.status === 502);
    const [row] = await rows();
    assert.equal(row.ok, false);
    assert.equal(row.input_tokens, 1500);
  });

  it("if the AI can't be reached, the seller is told kindly and nothing is recorded", async () => {
    await svc.saveAiSettings(on);
    const r = await run({ ask: async () => { throw new AiUnavailableError("AI service answered 529"); } });
    assert.ok(!r.ok && r.status === 502 && !/529/.test(r.message));
    assert.equal((await rows()).length, 0);
  });

  it("sums the month for the admin figures and ignores earlier months", async () => {
    await svc.saveAiSettings(on);
    await run();
    await run({ ask: async () => ({ text: "nope", inputTokens: 1000, outputTokens: 5 }) });
    await dbm.pool.query("insert into ai_usage (user_id, created_at, model, input_tokens, cost_micro_usd) values ($1, '2026-10-15T12:00:00Z', 'claude-haiku-5-5', 9999, 9999)", [userId]);
    const m = await svc.aiMonthSummary(NOW);
    assert.equal(m.requests, 2);
    assert.equal(m.failed, 1);
    assert.equal(m.inputTokens, 3000);
    assert.equal(m.outputTokens, 105);
  });

  it("deleting an account deletes its usage rows", async () => {
    await svc.saveAiSettings(on);
    await run();
    await dbm.pool.query("delete from users where id=$1", [userId]);
    assert.equal((await rows()).length, 0);
  });
});
