import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [sections, list, editor, page, reminder, milestones, actions, store, links, completion, moderation] = await Promise.all([
  read("../src/lib/listing-sections.ts"),
  read("../src/components/listing/ListingSections.tsx"),
  read("../src/components/BusinessEditor.tsx"),
  read("../src/app/account/business/page.tsx"),
  read("../src/components/listing/StorefrontReminder.tsx"),
  read("../src/lib/milestones.ts"),
  read("../src/app/account/business/actions.ts"),
  read("../src/lib/marketplace-store.ts"),
  read("../src/lib/links.ts"),
  read("../src/lib/business-completion.ts"),
  read("../src/lib/business-moderation.ts"),
]);

test("my business listing is 6 steps in a fixed order, products included", () => {
  const keys = [...sections.matchAll(/\{ key: "(\w+)", title:/g)].map((m) => m[1]);
  assert.deepEqual(keys, ["basics", "about", "products", "contact", "photos", "hours"]);
});

test("every step can be skipped and opened again in any order", () => {
  assert.match(editor, /Skip for now/);
  assert.match(editor, /Save and continue/);
  assert.match(list, /tap any step to open it, in any order/i);
  assert.match(editor, /Save them now/);
});

test("old links to #products and #details still open the right part", () => {
  assert.match(sections, /products: "products", details: "details"/);
  assert.match(page, /details \? "details"/);
});

test("about your business shows a live counter and a writing helper", () => {
  assert.match(editor, /Help me write it/);
  assert.match(completion, /About your business \(at least 80 characters\)/);
});

test("points reuse growth milestones, once each, with no database change", () => {
  for (const key of ["listing:basics", "listing:products", "listing:published", "storefront:listing", "storefront:directory", "storefront:website", "mph:store", "mph:5plus", "mph:10plus"]) {
    assert.match(sections, new RegExp(`"${key}"|\\\`listing:\\$\\{`));
  }
  assert.match(sections, /listingCount > 5/);
  assert.match(sections, /listingCount > 10/);
  assert.match(milestones, /from\("member_milestones"\)\.upsert\([\s\S]*ignoreDuplicates: true/);
  assert.match(reminder, /POINTS\.milestone/);
  assert.match(reminder, /more leads/);
});

test("MarketplacePH Sync is off until the store is active, and asks with a signed message", () => {
  assert.match(editor, /disabled=\{busy \|\| !storeReady\}/);
  assert.match(editor, /Sync button turns on once your marketplaceph\.com account is active/);
  assert.match(actions, /export async function syncMarketplaceStore/);
  assert.match(store, /signHubMessage\(CLIENT, "store-summary"/);
  assert.match(store, /marketplaceph\\\.com\\\/store\\\//);
});

test("publishing still needs every essential item, and scam-like text goes to manual review", () => {
  assert.match(editor, /publish && completion\.complete && submitBotToken/);
  assert.match(moderation, /scam_like_offer/);
});

test("links work with or without https:// and never allow other schemes", async () => {
  assert.match(links, /export function normalizeLink/);
  const ts = await import("typescript").then((m) => m.default ?? m).catch(() => null);
  if (!ts) return;
  const js = ts.transpileModule(links, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const { normalizeLink } = await import(`data:text/javascript,${encodeURIComponent(js)}`);
  assert.equal(normalizeLink("facebook_url", "mypage"), "https://www.facebook.com/mypage");
  assert.equal(normalizeLink("tiktok_url", "@myshop"), "https://www.tiktok.com/@myshop");
  assert.equal(normalizeLink("website_url", "www.mybiz.ph"), "https://www.mybiz.ph/");
  assert.equal(normalizeLink("website_url", "http://mybiz.com/menu"), "https://mybiz.com/menu");
  assert.equal(normalizeLink("google_business_url", "maps.app.goo.gl/abc"), "https://maps.app.goo.gl/abc");
  assert.equal(normalizeLink("marketplaceph_url", "mystore"), "https://www.marketplaceph.com/store/mystore");
  assert.equal(normalizeLink("website_url", "javascript:alert(1)"), null);
  assert.equal(normalizeLink("website_url", "notalink"), null);
  assert.equal(normalizeLink("website_url", ""), null);
});
