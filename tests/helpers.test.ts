// Small pure helpers: item profit, money parsing, dates, goal pro-rating and reporting periods.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { itemProfit, isStale } from "@/lib/items";
import { parseMoney, daysBetween, money } from "@/lib/format";
import { prorateGoal, resolvePeriod, bucketKey, listBuckets, addDays } from "@/lib/periods";

describe("itemProfit()", () => {
  const base = { soldPrice: null, buyPrice: "5.00", refundAmount: null } as const;
  it("is null while an item has no outcome yet", () => {
    assert.equal(itemProfit({ ...base, status: "bought" }), null);
    assert.equal(itemProfit({ ...base, status: "listed" }), null);
  });
  it("sold, posted and completed items: sold price minus cost", () => {
    for (const status of ["sold", "posted", "completed"] as const) {
      assert.equal(itemProfit({ ...base, status, soldPrice: "20.00" }), 15, status);
    }
  });
  it("a returned item: sold price minus refund minus cost", () => {
    assert.equal(itemProfit({ ...base, status: "returned", soldPrice: "20.00", refundAmount: "20.00" }), -5);
    assert.equal(itemProfit({ ...base, status: "returned", soldPrice: "20.00", refundAmount: "5.00" }), 10);
  });
  it("unsold and donated items are a loss of what they cost", () => {
    assert.equal(itemProfit({ ...base, status: "unsold" }), -5);
    assert.equal(itemProfit({ ...base, status: "donated" }), -5);
  });
});

describe("isStale()", () => {
  const ago = (n: number) => addDays(new Date().toISOString().slice(0, 10), -n);
  it("only listed items go stale, after the chosen number of days", () => {
    assert.equal(isStale({ status: "listed", listedAt: ago(40) }, 30), true);
    assert.equal(isStale({ status: "listed", listedAt: ago(5) }, 30), false);
    assert.equal(isStale({ status: "sold", listedAt: ago(90) }, 30), false);
    assert.equal(isStale({ status: "listed", listedAt: null }, 30), false);
  });
});

describe("parseMoney()", () => {
  it("accepts the ways people type prices", () => {
    assert.equal(parseMoney("1.5"), "1.50");
    assert.equal(parseMoney("£12"), "12.00");
    assert.equal(parseMoney("1,50"), "1.50");
    assert.equal(parseMoney(" 3.99 "), "3.99");
    assert.equal(parseMoney("0"), "0.00");
  });
  it("rejects empty, negative, too-precise and absurd values", () => {
    for (const bad of ["", "   ", "abc", "-4", "1.234", "1e3", "100001", null, undefined]) {
      assert.equal(parseMoney(bad as string | null | undefined), null, String(bad));
    }
  });
  it("formats money as pounds", () => {
    assert.equal(money("12.5"), "£12.50");
    assert.equal(money(null), "–");
  });
});

describe("daysBetween()", () => {
  it("counts whole days and never goes negative", () => {
    assert.equal(daysBetween("2026-01-03", "2026-01-10"), 7);
    assert.equal(daysBetween("2026-02-27", "2026-03-01"), 2);
    assert.equal(daysBetween("2026-01-10", "2026-01-03"), 0);
  });
});

describe("prorateGoal()", () => {
  it("a whole month is the whole monthly goal", () => {
    assert.equal(prorateGoal(310, "2026-01-01", "2026-01-31"), 310);
    assert.equal(prorateGoal(280, "2026-02-01", "2026-02-28"), 280);
  });
  it("a part month is scaled by its days", () => {
    assert.equal(prorateGoal(310, "2026-01-01", "2026-01-15"), 150);
  });
  it("a period across two months adds each month's share", () => {
    // 16 of 31 January days + 14 of 28 February days
    assert.equal(prorateGoal(310, "2026-01-16", "2026-02-14"), 160 + 155);
  });
  it("a whole year is twelve months of goal", () => {
    assert.equal(prorateGoal(100, "2026-01-01", "2026-12-31"), 1200);
  });
  it("a backwards range is 0", () => {
    assert.equal(prorateGoal(100, "2026-02-01", "2026-01-01"), 0);
  });
});

describe("resolvePeriod()", () => {
  const TODAY = "2026-11-22"; // a Sunday
  const p = (input: Parameters<typeof resolvePeriod>[0], earliest: string | null = null, today = TODAY) => resolvePeriod(input, today, earliest);

  it("month (the default), and going back", () => {
    assert.deepEqual([p({}).from, p({}).to], ["2026-11-01", "2026-11-30"]);
    assert.deepEqual([p({ p: "month", o: "-1" }).from, p({ p: "month", o: "-1" }).to], ["2026-10-01", "2026-10-31"]);
    assert.equal(p({ p: "month", o: "-11" }).from, "2025-12-01");
  });
  it("can never look into the future", () => {
    assert.equal(p({ p: "month", o: "3" }).from, "2026-11-01");
  });
  it("week runs Monday to Sunday", () => {
    const w = p({ p: "week" });
    assert.deepEqual([w.from, w.to], ["2026-11-16", "2026-11-22"]);
  });
  it("quarter", () => {
    const q = p({ p: "quarter" });
    assert.deepEqual([q.from, q.to], ["2026-10-01", "2026-12-31"]);
  });
  it("UK tax year runs 6 April to 5 April", () => {
    const t = p({ p: "taxyear" });
    assert.deepEqual([t.from, t.to], ["2026-04-06", "2027-04-05"]);
    const early = p({ p: "taxyear" }, null, "2026-03-01");
    assert.deepEqual([early.from, early.to], ["2025-04-06", "2026-04-05"]);
    assert.equal(p({ p: "taxyear", at: "2026-04-05" }).from, "2025-04-06");
  });
  it("calendar year", () => {
    const y = p({ p: "year" });
    assert.deepEqual([y.from, y.to], ["2026-01-01", "2026-12-31"]);
  });
  it("all time starts at the earliest purchase", () => {
    const a = p({ p: "all" }, "2025-03-09");
    assert.deepEqual([a.from, a.to, a.navigable], ["2025-03-09", TODAY, false]);
    assert.equal(p({ p: "all" }, null).from, TODAY);
  });
  it("custom range is used when valid, otherwise the last 30 days", () => {
    const ok = p({ p: "custom", from: "2026-01-01", to: "2026-01-31" });
    assert.deepEqual([ok.from, ok.to], ["2026-01-01", "2026-01-31"]);
    const bad = p({ p: "custom", from: "2026-02-01", to: "2026-01-01" });
    assert.deepEqual([bad.from, bad.to], ["2026-10-24", TODAY]);
    const junk = p({ p: "custom", from: "nope", to: "also nope" });
    assert.equal(junk.to, TODAY);
  });
  it("picks sensible chart buckets for the length of the period", () => {
    assert.equal(p({ p: "month" }).bucket, "day");
    assert.equal(p({ p: "quarter" }).bucket, "week");
    assert.equal(p({ p: "year" }).bucket, "month");
  });
});

describe("chart buckets", () => {
  it("weeks start on a Monday, months use year-month", () => {
    assert.equal(bucketKey("2026-11-18", "week"), "2026-11-16");
    assert.equal(bucketKey("2026-11-18", "month"), "2026-11");
    assert.equal(bucketKey("2026-11-18", "day"), "2026-11-18");
  });
  it("lists every bucket in a range with no gaps", () => {
    assert.equal(listBuckets("2026-11-01", "2026-11-30", "day").length, 30);
    assert.deepEqual(listBuckets("2026-10-15", "2026-12-02", "month").map((b) => b.key), ["2026-10", "2026-11", "2026-12"]);
  });
});
