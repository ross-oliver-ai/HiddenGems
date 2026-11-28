// Saving an item before the AI has finished reading its photo: the AI finishes afterwards, fills only what is empty,
// and the item is flagged "Check details" until the seller has looked at it. The AI and the photo download are faked.
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { dbSkipReason, pointAppAtTestDatabase, resetAndMigrate } from "./helpers/testdb";
import { fetchItemPhoto, readImageFile } from "@/lib/ai-image";
import { UNTITLED_NAME } from "@/lib/ai-rules";
import { blobPhotoUrl } from "@/lib/photo-url";
import { FILTERS } from "@/lib/items";
import type { SuggestResult } from "@/lib/ai-service";

const BLOB = "https://abc123.public.blob.vercel-storage.com/items/1/photo-xyz.jpg";

describe("photo addresses and downloads", () => {
  it("accepts only this app's own Blob photos", () => {
    assert.equal(blobPhotoUrl(BLOB), BLOB);
    assert.equal(blobPhotoUrl("http://abc.public.blob.vercel-storage.com/x.jpg"), null);
    assert.equal(blobPhotoUrl("https://evil.example.com/x.jpg"), null);
    assert.equal(blobPhotoUrl("https://abc.public.blob.vercel-storage.com.evil.example.com/x.jpg"), null);
    assert.equal(blobPhotoUrl(""), null);
  });
  it("downloads a saved photo as an AI image, and refuses anything else", async () => {
    const ok = (type: string, bytes = 10) => (async () => new Response(new Uint8Array(bytes), { headers: { "content-type": type } })) as unknown as typeof fetch;
    const img = await fetchItemPhoto(BLOB, ok("image/jpeg"));
    assert.equal(img?.mediaType, "image/jpeg");
    assert.equal(img?.base64.length, 16); // 10 bytes
    assert.equal(await fetchItemPhoto(BLOB, ok("text/html")), null);
    assert.equal(await fetchItemPhoto(BLOB, ok("image/jpeg", 2_000_000)), null);
    let called = false;
    assert.equal(await fetchItemPhoto("https://evil.example.com/x.jpg", (async () => { called = true; return new Response("x"); }) as unknown as typeof fetch), null);
    assert.equal(called, false, "never fetches an address that isn't one of our photos");
    assert.equal(await fetchItemPhoto(BLOB, (async () => { throw new Error("offline"); }) as unknown as typeof fetch), null);
    assert.equal(await fetchItemPhoto(BLOB, (async () => new Response("no", { status: 404 })) as unknown as typeof fetch), null);
  });
  it("reads an uploaded tag photo, and says when it can't be used", async () => {
    assert.equal(await readImageFile(null), null);
    assert.equal(await readImageFile(new File([], "t.jpg", { type: "image/jpeg" })), null); // nothing chosen
    assert.equal(await readImageFile(new File(["x"], "t.gif", { type: "image/gif" })), "bad");
    const good = await readImageFile(new File(["abc"], "t.jpg", { type: "image/jpeg" }));
    assert.ok(good && good !== "bad" && good.base64 === "YWJj");
  });
  it("has a Check details chip that applies no status filter", () => {
    const f = FILTERS.find((x) => x.id === "check")!;
    assert.equal(f.check, true);
    assert.equal(f.statuses, null);
  });
});

describe("finishing an item after it was saved (database)", { skip: dbSkipReason }, () => {
  let dbm: typeof import("@/db");
  let bg: typeof import("@/lib/ai-background");
  let list: typeof import("@/lib/item-list");
  let userId = 0;
  let otherId = 0;
  let catId = 0;
  const photo = async () => ({ mediaType: "image/jpeg" as const, base64: "AAAA" });
  const answer = (over: Partial<{ name: string; brand: string | null; size: string | null; categoryId: number | null; condition: string | null }> = {}): typeof import("@/lib/ai-service").suggestDetails =>
    async (): Promise<SuggestResult> => ({ ok: true, suggestion: { name: "Black Moschino Jeans corduroy jacket", brand: "Moschino Jeans", size: "UK 10", categoryId: catId, condition: "Very good", ...over } });
  const item = async (o: { name?: string; brand?: string | null; photo?: string | null; check?: boolean; user?: number } = {}) =>
    (await dbm.pool.query(
      "insert into items (user_id, name, brand, photo_url, ai_check, bought_at, buy_price) values ($1,$2,$3,$4,$5,'2026-11-28',2) returning id",
      [o.user ?? userId, o.name ?? UNTITLED_NAME, o.brand ?? null, "photo" in o ? o.photo : BLOB, o.check ?? true],
    )).rows[0].id as number;
  const get = async (id: number) => (await dbm.pool.query("select * from items where id=$1", [id])).rows[0];

  before(async () => {
    const url = pointAppAtTestDatabase();
    await resetAndMigrate(url);
    dbm = await import("@/db");
    bg = await import("@/lib/ai-background");
    list = await import("@/lib/item-list");
  });
  after(async () => { await dbm?.pool.end(); });
  beforeEach(async () => {
    await dbm.pool.query("truncate users restart identity cascade");
    userId = (await dbm.pool.query("insert into users (email, name, password_hash) values ('a@example.com','A','x') returning id")).rows[0].id;
    otherId = (await dbm.pool.query("insert into users (email, name, password_hash) values ('b@example.com','B','x') returning id")).rows[0].id;
    catId = (await dbm.pool.query("insert into categories (user_id, name) values ($1,'Women''s Clothing') returning id", [userId])).rows[0].id;
  });

  it("ships with items not flagged", async () => {
    const id = await item({ check: false });
    assert.equal((await get(id)).ai_check, false);
    assert.equal(await list.checkCount(userId), 0);
  });

  it("replaces 'Untitled item' and fills every empty box, and leaves the item flagged", async () => {
    const id = await item();
    await bg.fillItemInBackground({ userId, itemId: id }, { suggest: answer(), fetchPhoto: photo });
    const r = await get(id);
    assert.equal(r.name, "Black Moschino Jeans corduroy jacket");
    assert.equal(r.brand, "Moschino Jeans");
    assert.equal(r.size, "UK 10");
    assert.equal(r.category_id, catId);
    assert.equal(r.condition, "Very good");
    assert.equal(r.ai_check, true);
  });

  it("never overwrites a name or brand the seller typed", async () => {
    const id = await item({ name: "My own name", brand: "Mine" });
    await bg.fillItemInBackground({ userId, itemId: id }, { suggest: answer(), fetchPhoto: photo });
    const r = await get(id);
    assert.equal(r.name, "My own name");
    assert.equal(r.brand, "Mine");
    assert.equal(r.size, "UK 10"); // the empty ones still fill
  });

  it("sends the tag photo with the item photo when there is one", async () => {
    const id = await item();
    let sent = 0;
    const tag = { mediaType: "image/jpeg" as const, base64: "BBBB" };
    await bg.fillItemInBackground({ userId, itemId: id, tag }, { suggest: async (i) => { sent = i.images.length; return answer()(i); }, fetchPhoto: photo });
    assert.equal(sent, 2);
  });

  it("leaves 'Untitled item' and the flag alone when the AI can't help", async () => {
    const id = await item();
    await bg.fillItemInBackground({ userId, itemId: id }, { suggest: async () => ({ ok: false, status: 503, message: "off" }), fetchPhoto: photo });
    const r = await get(id);
    assert.equal(r.name, UNTITLED_NAME);
    assert.equal(r.ai_check, true);
  });

  it("does nothing and doesn't throw when the photo can't be downloaded, there is no photo, or the item is gone", async () => {
    let asked = false;
    const spy = (async () => { asked = true; return { ok: false, status: 503, message: "x" } as SuggestResult; }) as typeof import("@/lib/ai-service").suggestDetails;
    const a = await item();
    await bg.fillItemInBackground({ userId, itemId: a }, { suggest: spy, fetchPhoto: async () => null });
    const b = await item({ photo: null });
    await bg.fillItemInBackground({ userId, itemId: b }, { suggest: spy, fetchPhoto: photo });
    await bg.fillItemInBackground({ userId, itemId: 99999 }, { suggest: spy, fetchPhoto: photo });
    assert.equal(asked, false);
    assert.equal((await get(a)).name, UNTITLED_NAME);
  });

  it("never touches someone else's item", async () => {
    const id = await item({ user: otherId });
    await bg.fillItemInBackground({ userId, itemId: id }, { suggest: answer(), fetchPhoto: photo });
    assert.equal((await get(id)).name, UNTITLED_NAME);
  });

  it("never lets a failure escape", async () => {
    const id = await item();
    await bg.fillItemInBackground({ userId, itemId: id }, { suggest: async () => { throw new Error("boom"); }, fetchPhoto: photo });
    assert.equal((await get(id)).name, UNTITLED_NAME);
  });

  it("lists only the flagged items on Check details, counted per seller", async () => {
    const a = await item({ name: "Flagged" });
    await item({ name: "Fine", check: false });
    await item({ name: "Someone else's", user: otherId });
    assert.equal(await list.checkCount(userId), 1);
    const r = await list.itemList({ userId, statuses: null, term: "", show: 50, check: true });
    assert.deepEqual(r.rows.map((x) => x.item.id), [a]);
    assert.equal(r.total, 1);
    const all = await list.itemList({ userId, statuses: null, term: "", show: 50 });
    assert.equal(all.total, 2);
  });
});
