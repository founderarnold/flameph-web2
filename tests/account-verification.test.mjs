import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/0008_account_verification.sql", import.meta.url), "utf8");
const signupRoute = await readFile(new URL("../src/app/api/auth/signup/route.ts", import.meta.url), "utf8");
const authForm = await readFile(new URL("../src/components/AuthForm.tsx", import.meta.url), "utf8");
const editor = await readFile(new URL("../src/components/BusinessEditor.tsx", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../src/app/account/page.tsx", import.meta.url), "utf8");
const businessSubmitApi = await readFile(new URL("../src/app/api/business/submit/route.ts", import.meta.url), "utf8");
const turnstileMigration = await readFile(new URL("../supabase/migrations/0009_turnstile_business_submission.sql", import.meta.url), "utf8");

test("password signup cannot use an admin client to bypass email confirmation", () => {
  assert.doesNotMatch(signupRoute, /createAdminClient|admin\.createUser|email_confirm\s*:\s*true|service_role/i);
  assert.match(authForm, /auth\.signUp\s*\(/);
  assert.match(authForm, /email_verification_required:\s*true/);
  assert.match(authForm, /if \(data\.session\)[\s\S]*auth\.signOut\(\)[\s\S]*signInWithOtp/);
});

test("email proof is server-owned and a password-only session cannot self-verify", () => {
  assert.match(migration, /email_verification_required boolean not null default true/i);
  assert.match(migration, /new\.email_verified_at = old\.email_verified_at/i);
  assert.match(migration, /new\.email_verification_required = old\.email_verification_required/i);
  assert.match(migration, /jsonb_array_elements[\s\S]*item->>'method'[\s\S]*<> 'password'/i);
  assert.match(migration, /proved_in_session[\s\S]*email_verification_required = false/i);
});

test("legacy automatic confirmations are not accepted as proof", () => {
  assert.match(migration, /raw_app_meta_data->>'email_unverified'/i);
  assert.match(migration, /raw_user_meta_data->>'email_verification_required'/i);
  assert.match(migration, /email_verified_at = case[\s\S]*else null/i);
});

test("business submission is gated in the database and remains private", () => {
  assert.match(migration, /business\.owner_id <> uid/i);
  assert.match(migration, /raise exception 'EMAIL_NOT_VERIFIED'/i);
  assert.match(migration, /raise exception 'MOBILE_NOT_VERIFIED'/i);
  assert.match(migration, /lifecycle_status = 'submitted', publication_status = 'unpublished'/i);
  assert.match(migration, /'business_submitted'/i);
  assert.match(editor, /fetch\("\/api\/business\/submit"/i);
  assert.match(businessSubmitApi, /admin\.rpc\("submit_business_for_review"/i);
  assert.match(turnstileMigration, /grant execute[\s\S]*to service_role/i);
});

test("mobile verification is optional until a real SMS provider exists", () => {
  assert.match(migration, /'require_mobile_for_submission', false/i);
  assert.match(migration, /'sms_provider_configured', false/i);
  assert.match(editor, /SMS verification is not configured yet/i);
  assert.doesNotMatch(migration, /twilio|vonage|messagebird|api[_-]?key/i);
});

test("dashboard and editor use persisted account verification status", () => {
  assert.match(dashboard, /rpc\("account_verification_status"\)/i);
  assert.match(dashboard, /done:\s*verification\.email_verified/i);
  assert.match(editor, /Send verification email/i);
  assert.match(editor, /verification\.email_verified/i);
});
