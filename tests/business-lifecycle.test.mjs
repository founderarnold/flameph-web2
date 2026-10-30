import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/0004_business_lifecycle.sql", import.meta.url), "utf8");
const editor = await readFile(new URL("../src/components/BusinessEditor.tsx", import.meta.url), "utf8");

test("lifecycle migration is additive and preserves existing published rows", () => {
  assert.match(migration, /add column if not exists lifecycle_status/i);
  assert.match(migration, /add column if not exists publication_status/i);
  assert.match(migration, /when published then 'approved'/i);
  assert.match(migration, /when published then 'published'/i);
  assert.doesNotMatch(migration, /\b(?:truncate|drop table|delete from)\b/i);
});

test("new businesses default to draft and unpublished", () => {
  assert.match(migration, /lifecycle_status set default 'draft'/i);
  assert.match(migration, /publication_status set default 'unpublished'/i);
  assert.match(migration, /new\.lifecycle_status = 'draft'/i);
  assert.match(migration, /new\.publication_status = 'unpublished'/i);
  assert.match(migration, /new\.published = false/i);
});

test("members cannot change protected publication or lifecycle fields", () => {
  assert.match(migration, /new\.lifecycle_status = old\.lifecycle_status/i);
  assert.match(migration, /new\.publication_status = old\.publication_status/i);
  assert.match(migration, /new\.published = old\.published/i);
  assert.match(migration, /publication_status <> 'published' or lifecycle_status = 'approved'/i);
});

test("business editor no longer submits a publication decision", () => {
  const payloadBlock = editor.slice(editor.indexOf("const payload"), editor.indexOf("const extras"));
  assert.doesNotMatch(payloadBlock, /published\s*:/i);
  assert.doesNotMatch(editor, /Show my business publicly/i);
  assert.match(editor, /Publication is controlled by FLAME PH/i);
});

