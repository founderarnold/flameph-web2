import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [verifier, widget, auth, signup, businessApi, businessEditor, migration, submitApi, inquiryApi, newsletterApi, env] = await Promise.all([
  read("../src/lib/turnstile.ts"),
  read("../src/components/Turnstile.tsx"),
  read("../src/components/AuthForm.tsx"),
  read("../src/app/api/auth/signup/route.ts"),
  read("../src/app/api/business/submit/route.ts"),
  read("../src/components/BusinessEditor.tsx"),
  read("../supabase/migrations/0009_turnstile_business_submission.sql"),
  read("../src/app/api/submit/route.ts"),
  read("../src/app/api/inquiry/route.ts"),
  read("../src/app/api/newsletter/route.ts"),
  read("../.env.example"),
]);

test("Siteverify is server-only, bounded, and validates action and hostname", () => {
  assert.match(verifier, /import "server-only"/);
  assert.match(verifier, /challenges\.cloudflare\.com\/turnstile\/v0\/siteverify/);
  assert.match(verifier, /result\.action !== expectedAction/);
  assert.match(verifier, /allowedHostnames\(\)/);
  assert.match(verifier, /AbortController[\s\S]*8000/);
  assert.match(verifier, /token\.length > 2048/);
  assert.match(verifier, /idempotency_key/);
});

test("production fails closed while development has an explicit test path", () => {
  assert.match(verifier, /NODE_ENV === "development" && token === "development-bypass"/);
  assert.match(verifier, /status: 503, error: "Bot protection is not configured/);
  assert.match(widget, /NODE_ENV === "development"/);
  assert.match(env, /NEXT_PUBLIC_TURNSTILE_SITE_KEY=/);
  assert.match(env, /TURNSTILE_SECRET_KEY=/);
  assert.doesNotMatch(env, /NEXT_PUBLIC_TURNSTILE_SECRET/);
});

test("authentication sends CAPTCHA tokens to Supabase native server validation", () => {
  assert.match(auth, /auth\.signUp\([\s\S]*captchaToken: turnstileToken/);
  assert.match(auth, /auth\.signInWithOtp\([\s\S]*captchaToken: turnstileToken/);
  assert.match(auth, /auth\.signInWithPassword\([\s\S]*captchaToken: turnstileToken/);
  assert.doesNotMatch(signup, /createAdminClient|admin\.createUser|service_role/i);
});

test("business submission cannot bypass the server Turnstile check", () => {
  assert.match(businessApi, /verifyTurnstile\(req, body\.turnstileToken, "business_submit"\)/);
  assert.match(businessApi, /getSession\(\)/);
  assert.match(businessApi, /createAdminClient\(\)/);
  assert.doesNotMatch(businessEditor, /supabase!\.rpc\("submit_business_for_review"/);
  assert.match(businessEditor, /fetch\("\/api\/business\/submit"/);
  assert.match(migration, /drop function if exists public\.submit_business_for_review\(uuid\)/i);
  assert.match(migration, /TRUSTED_SERVER_REQUIRED/);
  assert.match(migration, /revoke all[\s\S]*public, anon, authenticated/i);
  assert.match(migration, /grant execute[\s\S]*to service_role/i);
});

test("high-risk public writes validate distinct Turnstile actions", () => {
  assert.match(submitApi, /verifyTurnstile\(req, body\.context\?\.turnstileToken, "public_form"\)/);
  assert.match(inquiryApi, /verifyTurnstile\(req, b\.turnstileToken, "inquiry"\)/);
  assert.match(newsletterApi, /verifyTurnstile\(req, body\.turnstileToken, "newsletter"\)/);
});

test("the secret never enters the client widget", () => {
  assert.match(widget, /NEXT_PUBLIC_TURNSTILE_SITE_KEY/);
  assert.doesNotMatch(widget, /TURNSTILE_SECRET_KEY|siteverify/);
  assert.doesNotMatch(auth, /TURNSTILE_SECRET_KEY/);
  assert.doesNotMatch(businessEditor, /TURNSTILE_SECRET_KEY/);
});
