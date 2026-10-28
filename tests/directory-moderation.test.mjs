import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("legacy directory data remains protected while duplicate pages stay out of the sitemap", () => {
  const helper = read("src/lib/directory.ts");
  const directory = read("src/app/directory/page.tsx");
  const detail = read("src/app/directory/[slug]/page.tsx");
  const sitemap = read("src/app/sitemap.ts");
  assert.match(helper, /eq\("status", "active"\)/);
  assert.match(helper, /active\.has\(business\.owner_id\)/);
  assert.match(directory, /publicBusinesses<Biz>/);
  assert.match(detail, /publicBusinessBySlug<B>/);
  assert.match(detail, /publicBusinesses<B>/);
  assert.doesNotMatch(sitemap, /publicBusinesses/);
  assert.doesNotMatch(sitemap, /paths\.add\(`\/directory\/\$\{/);
});

test("database policy blocks businesses owned by suspended members", () => {
  const migration = read("supabase/migrations/0014_directory_moderation.sql");
  assert.match(migration, /drop policy if exists businesses_public/);
  assert.match(migration, /profiles\.status = 'active'/);
  assert.match(migration, /b\.published and p\.status = 'active'/);
});

test("admins can hide, restore, ban, and guarded-delete listings", () => {
  const actions = read("src/app/admin/actions.ts");
  const page = read("src/app/admin/directory/page.tsx");
  assert.match(actions, /action === "hide"/);
  assert.match(actions, /action === "restore"/);
  assert.match(actions, /action === "ban_owner"/);
  assert.match(actions, /action === "delete_business"/);
  assert.match(actions, /ctx\.roles\.includes\("super_admin"\)/);
  assert.match(actions, /confirmation.*DELETE/);
  assert.match(actions, /status === "suspended".*businesses/s);
  assert.match(page, /Hide listing/);
  assert.match(page, /Ban owner \+ hide all listings/);
  assert.match(page, /Permanently delete this business/);
});

test("signed-in members can report listings with validation and rate limits", () => {
  const actions = read("src/app/directory/[slug]/actions.ts");
  const page = read("src/app/directory/[slug]/page.tsx");
  assert.match(actions, /requireUser/);
  assert.match(actions, /business-report/);
  assert.match(actions, /count.*>= 5/s);
  assert.match(actions, /business\.owner_id === user\.id/);
  assert.match(page, /Report this listing/);
  assert.match(page, /business owner will not see who reported/i);
});

test("inquiries are rejected for suspended business owners", () => {
  const inquiry = read("src/app/api/inquiry/route.ts");
  assert.match(inquiry, /ownerProfile/);
  assert.match(inquiry, /ownerProfile\?\.status !== "active"/);
});
