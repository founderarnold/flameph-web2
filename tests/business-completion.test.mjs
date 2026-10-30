import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [migration, completion, editor, page, api, listing] = await Promise.all([
  read("../supabase/migrations/0011_business_completion.sql"),
  read("../src/lib/business-completion.ts"),
  read("../src/components/BusinessEditor.tsx"),
  read("../src/app/account/business/page.tsx"),
  read("../src/app/api/business/submit/route.ts"),
  read("../src/lib/listing.ts"),
]);

test("database submission requires every essential profile item", () => {
  for (const key of ["business_name", "category", "description", "representative", "city", "province", "verified_contact", "photo"]) {
    assert.match(migration, new RegExp(`array_append\\(missing, '${key}'\\)`, "i"));
  }
  assert.match(migration, /char_length\(coalesce\(trim\(business\.description\)[\s\S]*< 80/i);
  assert.match(migration, /profile\.email_verified_at is null or not has_reply_channel/i);
  assert.match(migration, /logo_url[\s\S]*cardinality\(business\.photos\)/i);
});

test("privileged submission rechecks requirements inside the transaction", () => {
  assert.match(migration, /missing := public\.business_submission_missing_requirements/i);
  assert.match(migration, /raise exception 'BUSINESS_INCOMPLETE:%'/i);
  assert.match(migration, /revoke all on function public\.business_submission_missing_requirements[\s\S]*authenticated/i);
  assert.match(migration, /grant execute[\s\S]*to service_role/i);
});

test("API checks completeness before consuming bot and rate-limit attempts", () => {
  const requirementsAt = api.indexOf('admin.rpc("business_submission_missing_requirements"');
  const turnstileAt = api.indexOf("verifyTurnstile(");
  const rateAt = api.indexOf('checkRateLimit(req, "business_submit"');
  assert.ok(requirementsAt > 0 && requirementsAt < turnstileAt && turnstileAt < rateAt);
  assert.match(api, /status: 422/);
  assert.match(api, /missing\.includes\("business_not_found"\)[\s\S]*status: 404/);
});

test("editor mirrors the authoritative checklist and requires saved changes", () => {
  assert.match(editor, /businessCompletion\(biz, ownerName, verification\.email_verified\)/);
  assert.match(editor, /Required before review/);
  assert.match(editor, /Save your latest changes before submitting/);
  assert.match(editor, /dirty \|\| !completion\.complete/);
  assert.match(page, /select\("full_name"\)/);
  assert.match(page, /ownerName=\{profile\?\.full_name \?\? ""\}/);
});

test("formal registration evidence is optional and inclusive", () => {
  assert.doesNotMatch(migration.slice(migration.indexOf("business_submission_missing_requirements"), migration.indexOf("create or replace function public.submit_business_for_review")), /verification_docs|verification_status|verified\b/i);
  assert.match(editor, /Formal registration documents are optional/i);
  assert.match(editor, /Aspiring entrepreneurs, home-based sellers, informal microbusinesses and startups/i);
  assert.match(editor, /DTI, SEC, CDA, BMBE/i);
});

test("supporting links include official website, Facebook and Google Business Profile", () => {
  assert.match(listing, /facebook_url/);
  assert.match(listing, /website_url/);
  assert.match(listing, /google_business_url/);
  assert.match(migration, /add column if not exists google_business_url text/i);
});

test("client and database use the same meaningful-description threshold", () => {
  assert.match(completion, /text\(b\.description\)\.length >= 80/);
  assert.match(migration, /business\.description[\s\S]*< 80/i);
});
