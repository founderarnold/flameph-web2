import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/0005_protect_existing_businesses.sql", import.meta.url), "utf8");
const adminPage = await readFile(new URL("../src/app/admin/directory/page.tsx", import.meta.url), "utf8");

test("legacy protection never deletes or merges a business", () => {
  assert.doesNotMatch(migration, /\b(?:delete from public\.businesses|truncate|drop table public\.businesses)\b/i);
  assert.match(migration, /on conflict \(business_id\) do nothing/i);
  assert.match(migration, /was_published boolean not null/i);
});

test("automatic quarantine requires three independent random-text signals", () => {
  const quarantineUpdate = migration.slice(
    migration.indexOf("update public.businesses b"),
    migration.indexOf("insert into public.audit_log"),
  );
  assert.match(migration, /when random_name and random_description and random_products then 'obviously_suspicious'/i);
  assert.match(quarantineUpdate, /classification = 'obviously_suspicious'/i);
  assert.match(quarantineUpdate, /publication_status = 'unpublished'/i);
  assert.doesNotMatch(quarantineUpdate, /incomplete|uncertain/i);
});

test("legitimate, incomplete, duplicate, and uncertain rows retain visibility pending review", () => {
  assert.match(migration, /when classification in \('incomplete', 'uncertain'\) then 'queued_for_review'/i);
  assert.match(migration, /Incomplete, duplicate and uncertain records remain in their existing state/i);
  assert.match(migration, /else 'kept_public'/i);
});

test("admin report covers every required legacy classification total", () => {
  for (const label of ["Total", "Presumed legitimate", "Incomplete", "High suspicion", "Uncertain", "Duplicates", "Manual review"]) {
    assert.match(adminPage, new RegExp(label, "i"));
  }
  assert.match(adminPage, /No records were deleted/i);
  assert.match(adminPage, /reviewLegacyBusiness/i);
});

test("legacy review is transactional, admin-gated, and audited", () => {
  assert.match(migration, /auth\.role\(\)[\s\S]*public\.is_admin\(\)/i);
  assert.match(migration, /else auth\.uid\(\)/i);
  assert.doesNotMatch(migration.slice(migration.indexOf("create or replace function public.review_business_legacy_assessment")), /if not public\.is_trusted\(\)/i);
  assert.match(migration, /security definer/i);
  assert.match(migration, /business_legacy_' \|\| p_decision/i);
  assert.match(migration, /restore_public[\s\S]*lifecycle_status = 'approved', publication_status = 'published'/i);
});
