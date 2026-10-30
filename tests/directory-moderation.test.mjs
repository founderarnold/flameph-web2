import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("legacy directory data remains protected while duplicate pages stay out of the sitemap", () => {
  const config = read("next.config.ts");
  const sitemap = read("src/app/sitemap.ts");
  assert.match(config, /source: "\/directory"[\s\S]*pages\.flameph\.org\/directory[\s\S]*permanent: true/);
  assert.match(config, /source: "\/directory\/:path\*"[\s\S]*pages\.flameph\.org\/directory[\s\S]*permanent: true/);
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

test("public listing interaction is owned by FlamePH Pages", () => {
  const config = read("next.config.ts");
  assert.match(config, /pages\.flameph\.org\/directory/);
  assert.match(config, /flameph-pages\.vercel\.app\/business/);
});

test("inquiries are rejected for suspended business owners", () => {
  const inquiry = read("src/app/api/inquiry/route.ts");
  assert.match(inquiry, /ownerProfile/);
  assert.match(inquiry, /ownerProfile\?\.status !== "active"/);
});
