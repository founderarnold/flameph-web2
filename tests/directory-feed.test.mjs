import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { directoryCategory, isApprovedListing, toFeedItem } from "../src/lib/directory-feed.ts";
import { WAITING_FILTER, waitingLabel } from "../src/lib/business-review-queue.ts";

const approved = { published: true, publication_status: "published", lifecycle_status: "approved", risk_level: "low" };

test("only published, approved, low-risk listings go to the shared directory", () => {
  assert.equal(isApprovedListing({ name: "A", slug: "a", sector: null, city: null, province: null, ...approved }), true);
  for (const change of [{ published: false }, { publication_status: "unpublished" }, { lifecycle_status: "draft" }, { lifecycle_status: "submitted" }, { risk_level: "needs_review" }, { risk_level: "high" }]) {
    assert.equal(isApprovedListing({ name: "A", slug: "a", sector: null, city: null, province: null, ...approved, ...change }), false, JSON.stringify(change));
  }
});

test("flameph.org industries map onto the directory sections", () => {
  assert.equal(directoryCategory("Food & beverage"), "food");
  assert.equal(directoryCategory("Agriculture", "Fisheries and aquaculture"), "retail");
  assert.equal(directoryCategory("Manufacturing", "Packaging and printing"), "retail");
  assert.equal(directoryCategory("Technology", "Electronics and gadgets"), "services");
  assert.equal(directoryCategory("Services", "Education and tutoring"), "services");
  assert.equal(directoryCategory("Services", "Real estate"), "real_estate");
  assert.equal(directoryCategory("Services", "Legal services"), "professional");
  assert.equal(directoryCategory("Other"), null);
  assert.equal(directoryCategory(null), null);
});

test("a feed item carries public fields only, with an https picture and the profile link", () => {
  const media = (p) => (p.startsWith("http") ? p : `https://x.supabase.co/storage/v1/object/public/media/${p}`);
  const item = toFeedItem({
    name: "Chael Fingerlings", slug: "chael-fingerlings-1xxg", sector: "Agriculture", subsector: null, city: "Lubao", province: "Pampanga",
    logo_url: null, photos: ["biz/1.jpg"], verified: false, updated_at: "2026-11-22T00:00:00Z",
    contact_email: "x@example.com", contact_phone: "0917", owner_id: "secret",
  }, "https://www.flameph.org", media);
  assert.deepEqual(Object.keys(item).sort(), ["category", "city", "logo_url", "name", "sector", "slug", "updated_at", "url", "verified"]);
  assert.equal(item.city, "Lubao, Pampanga");
  assert.equal(item.logo_url, "https://x.supabase.co/storage/v1/object/public/media/biz/1.jpg");
  assert.equal(item.url, "https://www.flameph.org/members/chael-fingerlings-1xxg");
  assert.equal(toFeedItem({ name: "B", slug: "b", sector: null, city: null, province: null, logo_url: "http://plain.example/logo.png" }, "https://www.flameph.org", (p) => p).logo_url, null);
});

test("the feed route is public, read only and uses the approved-listing rule", async () => {
  const src = await readFile(new URL("../src/app/api/directory/listings/route.ts", import.meta.url), "utf8");
  assert.match(src, /export async function GET\(/);
  assert.doesNotMatch(src, /export async function (POST|PUT|PATCH|DELETE)/);
  assert.match(src, /publicBusinesses/);
  assert.match(src, /isApprovedListing/);
});

test("admins see submitted and not-yet-submitted listings by default, and can approve them", async () => {
  assert.match(WAITING_FILTER, /lifecycle_status\.in\.\(submitted,draft\)/);
  assert.match(WAITING_FILTER, /verification_status\.eq\.pending/);
  assert.ok(waitingLabel({ published: false, lifecycle_status: "submitted", risk_level: "needs_review" }));
  assert.ok(waitingLabel({ published: false, lifecycle_status: "draft", risk_level: "needs_review" }));
  assert.equal(waitingLabel({ published: true, lifecycle_status: "approved", risk_level: "low" }), null);
  assert.equal(waitingLabel({ published: false, lifecycle_status: "draft", risk_level: "high" }), null);
  assert.equal(waitingLabel({ published: false, lifecycle_status: "needs_correction", risk_level: "high" }), null);
  const page = await readFile(new URL("../src/app/admin/directory/page.tsx", import.meta.url), "utf8");
  assert.match(page, /q\.or\(WAITING_FILTER\)/);
  assert.match(page, /value="approve_legitimate" className="btn btn-primary">Approve and publish/);
  const home = await readFile(new URL("../src/app/admin/page.tsx", import.meta.url), "utf8");
  assert.match(home, /\.or\(WAITING_FILTER\)/);
});

test("isApprovedListing checks exactly the PUBLIC_BUSINESS_FILTERS fields and values", async () => {
  const { PUBLIC_BUSINESS_FILTERS } = await import("../src/lib/public-business.ts");
  const base = { name: "A", slug: "a", sector: null, city: null, province: null };
  assert.equal(isApprovedListing({ ...base, ...PUBLIC_BUSINESS_FILTERS }), true);
  for (const key of Object.keys(PUBLIC_BUSINESS_FILTERS)) {
    assert.equal(isApprovedListing({ ...base, ...PUBLIC_BUSINESS_FILTERS, [key]: "other" }), false, key);
  }
});

test("profile pages do not 404 for visitors: they read the server-checked list, not a plain visitor query", async () => {
  for (const path of ["../src/app/members/[slug]/page.tsx", "../src/app/directory/[slug]/page.tsx"]) {
    const src = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(src, /publicBusinessBySlug/);
    assert.doesNotMatch(src, /list<B>\(\{ table: "businesses"/);
  }
});
