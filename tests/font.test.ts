import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

// The rounded look on PCs and Android depends on three things staying in step:
// the font file, the layout that loads it, and the CSS stack that uses it.
test("the bundled rounded font is shipped, loaded and used", () => {
  assert.ok(existsSync("src/app/fonts/nunito-latin-wght-normal.woff2"), "font file missing");
  assert.ok(existsSync("src/app/fonts/NUNITO-LICENSE.txt"), "licence file missing");
  const layout = readFileSync("src/app/layout.tsx", "utf8");
  assert.match(layout, /nunito-latin-wght-normal\.woff2/);
  assert.match(layout, /variable:\s*"--font-nunito"/);
  assert.match(layout, /className=\{nunito\.variable\}/);
  const css = readFileSync("src/app/globals.css", "utf8");
  const stack = css.match(/--font-sans:\s*([^;]+);/)?.[1] ?? "";
  assert.match(stack, /var\(--font-nunito\)/);
  assert.ok(stack.indexOf("ui-rounded") < stack.indexOf("var(--font-nunito)"), "Apple's rounded font should come first");
});
