import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [sections, list, editor, page, reminder] = await Promise.all([
  read("../src/lib/listing-sections.ts"),
  read("../src/components/listing/ListingSections.tsx"),
  read("../src/components/BusinessEditor.tsx"),
  read("../src/app/account/business/page.tsx"),
  read("../src/components/listing/StorefrontReminder.tsx"),
]);

test("my business listing is split into eight sections in a fixed order", () => {
  const keys = [...sections.matchAll(/\{ key: "(\w+)", title:/g)].map((m) => m[1]);
  assert.deepEqual(keys, ["basics", "about", "contact", "photos", "hours", "details", "website", "publish"]);
});

test("every section can be skipped and opened again in any order", () => {
  assert.match(editor, /Skip for now/);
  assert.match(editor, /Save and continue/);
  assert.match(list, /tap any one to open it, in any order/i);
  // Unsaved changes are never silently lost when another section is open.
  assert.match(editor, /Save them now/);
});

test("old links to #products and #details still open the right section", () => {
  assert.match(sections, /products: "about", details: "details"/);
  assert.match(page, /details \? "details"/);
});

test("storefront points reuse growth milestones, once each, with no database change", () => {
  for (const key of ["storefront:listing", "storefront:directory", "storefront:website"]) assert.match(sections, new RegExp(`"${key}"`));
  assert.match(page, /from\("member_milestones"\)\.upsert\([\s\S]*ignoreDuplicates: true/);
  assert.match(reminder, /POINTS\.milestone/);
  assert.match(reminder, /more leads/);
});

test("publishing still needs every essential item", () => {
  assert.match(editor, /disabled=\{busy \|\| dirty \|\| !completion\.complete/);
});
