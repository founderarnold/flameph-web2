import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/0007_new_business_draft_default.sql", import.meta.url), "utf8");
const editor = await readFile(new URL("../src/components/BusinessEditor.tsx", import.meta.url), "utf8");
const preview = await readFile(new URL("../src/app/account/business/preview/page.tsx", import.meta.url), "utf8");
const visibility = await readFile(new URL("../supabase/migrations/0006_enforce_public_business_visibility.sql", import.meta.url), "utf8");
const sitemap = await readFile(new URL("../src/app/sitemap.ts", import.meta.url), "utf8");

test("every insert is forced to draft and unpublished before trust is considered", () => {
  const insertBranch = migration.slice(migration.indexOf("if tg_op = 'INSERT'"), migration.indexOf("if not public.is_trusted()"));
  assert.match(insertBranch, /new\.lifecycle_status = 'draft'/i);
  assert.match(insertBranch, /new\.publication_status = 'unpublished'/i);
  assert.match(insertBranch, /new\.published = false/i);
  assert.match(insertBranch, /new\.approved_at = null/i);
  assert.match(insertBranch, /new\.published_at = null/i);
  assert.match(insertBranch, /return new/i);
  assert.doesNotMatch(migration, /\b(?:delete from|truncate|drop table)\b/i);
});

test("the browser cannot submit lifecycle or publication decisions", () => {
  const payload = editor.slice(editor.indexOf("const payload"), editor.indexOf("const extras"));
  assert.doesNotMatch(payload, /(?:published|publication_status|lifecycle_status)\s*:/i);
  assert.match(editor, /Publication is controlled by FLAME PH/i);
});

test("drafts remain excluded from public discovery and sitemap", () => {
  assert.match(visibility, /create policy businesses_public[\s\S]*publication_status = 'published'[\s\S]*lifecycle_status = 'approved'/i);
  assert.match(sitemap, /PUBLIC_BUSINESS_FILTERS/i);
});

test("owners get an authenticated private preview without using the public route", () => {
  assert.match(preview, /requireUser\("\/account\/business\/preview"\)/i);
  assert.match(preview, /\.eq\("owner_id", user\.id\)/i);
  assert.match(preview, /visible only inside your signed-in account/i);
  assert.doesNotMatch(preview, /createPublicClient|ListingTracker|\/directory\/\$\{/i);
  assert.match(editor, /href="\/account\/business\/preview"/i);
});
