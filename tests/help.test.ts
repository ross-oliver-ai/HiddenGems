// The Help page's content and the support contact: every status is explained, in order, and the feedback link is right.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { STATUS_HELP, STATUS_ORDER } from "@/lib/help";
import { STATUS_LABEL } from "@/lib/items";
import { SUPPORT_EMAIL, feedbackHref } from "@/lib/contact";

describe("Help page statuses", () => {
  it("explains every status the app has, once each, in the order an item moves", () => {
    const all = Object.keys(STATUS_LABEL).sort();
    assert.deepEqual([...STATUS_ORDER].sort(), all);
    assert.equal(new Set(STATUS_ORDER).size, STATUS_ORDER.length);
    assert.deepEqual(STATUS_ORDER.slice(0, 5), ["bought", "listed", "sold", "posted", "completed"]);
  });
  it("gives each one a real sentence", () => {
    for (const s of STATUS_ORDER) assert.ok(STATUS_HELP[s].trim().length > 15 && STATUS_HELP[s].endsWith("."), s);
  });
  it("says where Posted items are found", () => {
    assert.match(STATUS_HELP.posted, /Waiting for money/);
  });
});

describe("support contact", () => {
  it("is the hello@ address", () => {
    assert.equal(SUPPORT_EMAIL, "hello@hiddengemsapp.co.uk");
  });
  it("builds an email link with the subject filled in and safely encoded", () => {
    assert.equal(feedbackHref(), "mailto:hello@hiddengemsapp.co.uk?subject=Hidden%20Gems%20feedback");
    assert.equal(feedbackHref("Bug & fix?"), "mailto:hello@hiddengemsapp.co.uk?subject=Bug%20%26%20fix%3F");
  });
});
