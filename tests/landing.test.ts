import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { landingPathFor } from "../src/lib/landing";

test("an admin lands on the Overview after signing in; everyone else lands on Home", () => {
  assert.equal(landingPathFor("admin"), "/admin");
  assert.equal(landingPathFor("user"), "/");
  assert.equal(landingPathFor("seller"), "/");
  assert.equal(landingPathFor(""), "/");
});

test("sign-in and the forced first password change both use it, and a forced change still comes first", () => {
  const login = readFileSync("src/app/login/actions.ts", "utf8");
  assert.match(login, /landingPathFor\(user\.role\)/);
  assert.match(login, /user\.mustChangePassword \? "\/change-password"/);
  const change = readFileSync("src/app/change-password/actions.ts", "utf8");
  assert.match(change, /redirect\(landingPathFor\(user\.role\)\)/);
});
