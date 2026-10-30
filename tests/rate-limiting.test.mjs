import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [migration, limiter, signup, otpRequest, otpVerify, business, forms, inquiry, newsletter] = await Promise.all([
  read("../supabase/migrations/0010_rate_limiting.sql"),
  read("../src/lib/rate-limit.ts"),
  read("../src/app/api/auth/signup/route.ts"),
  read("../src/app/api/auth/otp/request/route.ts"),
  read("../src/app/api/auth/otp/verify/route.ts"),
  read("../src/app/api/business/submit/route.ts"),
  read("../src/app/api/submit/route.ts"),
  read("../src/app/api/inquiry/route.ts"),
  read("../src/app/api/newsletter/route.ts"),
]);

test("rate-limit buckets are atomic, private, and store only hashed keys", () => {
  assert.match(migration, /create table if not exists public\.rate_limit_buckets/i);
  assert.match(migration, /key_hash text not null/i);
  assert.doesNotMatch(migration, /\b(?:email|mobile|ip_address)\s+text\b/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all[\s\S]*public, anon, authenticated/i);
  assert.match(migration, /grant execute[\s\S]*to service_role/i);
});

test("sensitive-operation defaults are centralized and configurable", () => {
  assert.match(limiter, /signup:\s*\{ limit: positiveInt\("RATE_LIMIT_SIGNUP_MAX", 3/i);
  assert.match(limiter, /business_submit:\s*\{ limit: positiveInt\("RATE_LIMIT_BUSINESS_MAX", 5/i);
  assert.match(limiter, /otp_request:\s*\{ limit: positiveInt\("RATE_LIMIT_OTP_MAX", 5/i);
  assert.match(limiter, /RATE_LIMIT_OTP_COOLDOWN_SECONDS", 900/i);
  assert.match(limiter, /retry-after/i);
  assert.match(limiter, /NODE_ENV === "development" \? "flameph-development-only" : ""/);
  assert.match(limiter, /if \(!keyHash\) return null/);
  assert.doesNotMatch(limiter, /setInterval|permanent/i);
});

test("signup and OTP creation paths use the central limiter", () => {
  assert.match(signup, /checkRateLimit\(req, "signup"\)/);
  assert.match(otpRequest, /body\.createUser === true[\s\S]*checkRateLimit\(req, "signup"\)/);
  assert.match(otpRequest, /checkRateLimit\(req, "otp_request", \{ identifier: email \}\)/);
});

test("failed OTP verification cools down temporarily and success clears failures", () => {
  assert.match(otpVerify, /otp_verify_failure[\s\S]*increment: false/);
  assert.match(otpVerify, /if \(error\)[\s\S]*otp_verify_failure[\s\S]*increment: true/);
  assert.match(otpVerify, /clearRateLimit\("otp_verify_failure", limit\.keyHash\)/);
  assert.match(migration, /blocked_until/i);
});

test("business limits are account-keyed rather than shared-IP keyed", () => {
  assert.match(business, /checkRateLimit\(req, "business_submit", \{ identifier: user\.id \}\)/);
  assert.match(business, /retryAfterHeaders/);
});

test("public writes share the central limiter and old ad-hoc counters are gone", () => {
  assert.match(forms, /checkRateLimit\(req, "public_form"\)/);
  assert.match(inquiry, /checkRateLimit\(req, "inquiry", \{ identifier: `\$\{biz\.id\}:\$\{who\}` \}\)/);
  assert.match(newsletter, /checkRateLimit\(req, "newsletter", \{ identifier: email \}\)/);
  assert.doesNotMatch(forms, /MAX_PER_HOUR|\.select\("id", \{ count: "exact"/);
  assert.doesNotMatch(inquiry, /\.select\("id", \{ count: "exact"/);
});

test("limiter failure is fail-closed on protected routes", () => {
  for (const route of [signup, otpRequest, otpVerify, business, forms, inquiry, newsletter]) {
    assert.match(route, /if \(!limit\)[\s\S]*status: 503/);
  }
});
