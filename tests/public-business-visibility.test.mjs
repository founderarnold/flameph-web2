import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/0006_enforce_public_business_visibility.sql", import.meta.url), "utf8");
const directory = await readFile(new URL("../src/app/directory/page.tsx", import.meta.url), "utf8");
const detail = await readFile(new URL("../src/app/directory/[slug]/page.tsx", import.meta.url), "utf8");
const sitemap = await readFile(new URL("../src/app/sitemap.ts", import.meta.url), "utf8");
const inquiry = await readFile(new URL("../src/app/api/inquiry/route.ts", import.meta.url), "utf8");
const ridesafe = await readFile(new URL("../src/app/ridesafe/RideSafeHome.tsx", import.meta.url), "utf8");
const sharedFilter = await readFile(new URL("../src/lib/public-business.ts", import.meta.url), "utf8");

const eligibility = /published[\s\S]*publication_status = 'published'[\s\S]*lifecycle_status = 'approved'/i;

test("business RLS is the authoritative public visibility boundary", () => {
  const policy = migration.slice(migration.indexOf("create policy businesses_public"), migration.indexOf("drop policy if exists products_public"));
  assert.match(policy, eligibility);
  assert.doesNotMatch(migration, /drop policy if exists businesses_owner_/i);
  assert.doesNotMatch(migration, /\b(?:delete from|truncate|drop table)\b/i);
});

test("child records cannot expose an unpublished business", () => {
  const products = migration.slice(migration.indexOf("create policy products_public"), migration.indexOf("drop policy if exists reviews_public"));
  const reviews = migration.slice(migration.indexOf("create policy reviews_public"), migration.indexOf("create index if not exists businesses_public_directory_idx"));
  assert.match(products, eligibility);
  assert.match(reviews, eligibility);
  assert.match(reviews, /reviews_self_insert[\s\S]*with check/i);
});

test("public statistics and tracking use publication eligibility", () => {
  const tracking = migration.slice(migration.indexOf("create or replace function public.track_business"), migration.indexOf("create or replace function public.public_stats"));
  const stats = migration.slice(migration.indexOf("create or replace function public.public_stats"));
  assert.match(tracking, eligibility);
  assert.match(stats, eligibility);
  assert.match(stats, /select count\(\*\) from public_businesses/i);
});

test("directory, detail, related listings and sitemap share one explicit predicate", () => {
  assert.match(sharedFilter, /published: true[\s\S]*publication_status: "published"[\s\S]*lifecycle_status: "approved"/i);
  assert.match(directory, /filters: PUBLIC_BUSINESS_FILTERS/i);
  assert.equal(detail.match(/PUBLIC_BUSINESS_FILTERS/g)?.length, 3);
  assert.match(sitemap, /filters: PUBLIC_BUSINESS_FILTERS/i);
  assert.match(directory, /const q = \(sp\.q/i);
  assert.match(directory, /!sp\.sector[\s\S]*!sp\.region/i);
  assert.match(directory, /name="q"[\s\S]*name="sector"[\s\S]*name="region"/i);
});

test("service-role and browser discovery queries include all eligibility fields", () => {
  for (const source of [inquiry, ridesafe]) {
    assert.match(source, /\.eq\("published", true\)/i);
    assert.match(source, /\.eq\("publication_status", "published"\)/i);
    assert.match(source, /\.eq\("lifecycle_status", "approved"\)/i);
  }
});
