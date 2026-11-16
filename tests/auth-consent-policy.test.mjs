import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const load = async (p) => {
  const js = ts.transpileModule(await read(p), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
};

const migration = await read("supabase/migrations/0015_member_consents.sql");
const authForm = await read("src/components/AuthForm.tsx");
const middleware = await read("src/middleware.ts");
const consents = await read("src/lib/consents.ts");
const cont = await read("src/app/auth/continue/route.ts");
const callback = await read("src/app/auth/callback/route.ts");
const confirm = await read("src/app/auth/confirm/page.tsx");
const emailLink = await read("src/components/EmailLinkSignIn.tsx");
const actions = await read("src/app/account/consent-actions.ts");
const prompt = await read("src/app/account/consent/page.tsx");
const settings = await read("src/app/account/settings/page.tsx");
const legalPage = await read("src/components/LegalPage.tsx");
const pages = { terms: await read("src/app/legal/terms/page.tsx"), privacy: await read("src/app/legal/privacy/page.tsx"), guidelines: await read("src/app/membership/terms/page.tsx") };
const policy = await load("src/lib/policy.ts");
const { safeNext } = await load("src/lib/safe-next.ts");
const legalText = await load("src/lib/legal-text.ts");

// ---- 1. hardening ------------------------------------------------------------
test("after sign-in, only same-site paths are followed (no open redirects)", async () => {
  for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "evil.com", "", null, undefined]) assert.equal(safeNext(bad), "/account", String(bad));
  assert.equal(safeNext("/account/settings?x=1"), "/account/settings?x=1");
  assert.equal(safeNext("/sso/authorize?client=flamepos"), "/sso/authorize?client=flamepos");
  for (const f of [callback, confirm, emailLink, authForm]) assert.match(f, /safeNext/);
  assert.match(await read("src/app/login/page.tsx"), /next=\{safeNext\(next\)\}/);
  assert.match(await read("src/app/join/page.tsx"), /safeNext\(next, "\/account\/profile\?welcome=1"\)/);
});

test("passwords are 8 to 72 characters everywhere", async () => {
  assert.match(authForm, /minLength=\{mode === "join" \? 8 : 1\} maxLength=\{72\}/);
  assert.match(await read("src/components/PasswordForm.tsx"), /password\.length < 8 \|\| password\.length > 72/);
  assert.match(await read("src/app/api/auth/signup/route.ts"), /password\.length < 8 \|\| password\.length > 72/);
});

test("every sign-in route passes through the consent check once", async () => {
  assert.match(authForm, /window\.location\.assign\(`\/auth\/continue\?next=/);
  assert.match(callback, /\/auth\/continue\?next=/);
  assert.match(confirm, /\/auth\/continue\?next=/);
  assert.match(emailLink, /\/auth\/continue\?next=/);
  assert.match(cont, /needsConsentPrompt/);
  assert.match(cont, /\/account\/consent\?next=/);
});

// ---- 2/3. guests unchanged, members forked -------------------------------------
test("visitors without a sign-in cookie skip all auth work on the home page", async () => {
  assert.match(middleware, /matcher: \["\/", "\/account\/:path\*"/);
  const cookieCheck = middleware.indexOf("signedInCookie");
  const getUser = middleware.indexOf("auth.getUser()");
  assert.ok(cookieCheck > 0 && cookieCheck < getUser, "cookie check must come before any Supabase call");
  assert.match(middleware, /if \(!signedInCookie \|\| request\.nextUrl\.searchParams\.get\("view"\) === "public"\) return response;/);
  assert.match(middleware, /if \(isHome && data\.user\)/);
  assert.match(middleware, /"private, no-store"/);
});

// ---- 4. live policies ----------------------------------------------------------
test("policy pages are live: versioned, dated, no draft label, no open blanks", async () => {
  assert.equal(policy.POLICY_VERSION, "1.0");
  assert.match(policy.POLICY_EFFECTIVE, /^\d{4}-\d{2}-\d{2}$/);
  assert.doesNotMatch(legalPage, /Draft|legal_status|getSettings/);
  assert.match(legalPage, /Version \{POLICY_VERSION\} · Effective/);
  for (const [k, src] of Object.entries(pages)) {
    assert.match(src, /<LegalPage title=/, k);
    assert.doesNotMatch(src, /\[OWNER|OWNER:|Draft/, k);
  }
  assert.deepEqual(Object.values(policy.POLICY_PAGES).map((p) => p.href).sort(), ["/legal/privacy", "/legal/terms", "/membership/terms"]);
  assert.match(migration, /insert into public\.policy_versions \(version, effective_on\) values \('1\.0', date '2026-11-17'\)/);
  assert.match(migration, new RegExp(`'${policy.POLICY_VERSION.replace(".", "\\.")}', date '${policy.POLICY_EFFECTIVE}'`), "database version matches the code");
});

test("owner-supplied reminders are used word for word", async () => {
  assert.equal(legalText.NO_MONEY_EN, "FLAME PH only records that this deal happened. No money passes through FLAME PH. Payment and delivery are between you and the other member.");
  assert.ok(legalText.INVESTOR_WARNING_EN.startsWith("INVESTOR / FUNDER POST. Offers to raise or invest money may count as the sale of securities"));
  assert.ok(legalText.INVESTOR_WARNING_TL.endsWith("Walang transaksyon na ginagawa sa loob ng FLAME PH."));
  assert.match(pages.terms, /NO_MONEY_EN[\s\S]*NO_MONEY_TL/);
  assert.match(pages.guidelines, /INVESTOR_WARNING_EN[\s\S]*INVESTOR_WARNING_TL/);
});

// ---- 5. separate switches, off by default --------------------------------------
test("five separate consents; only switch 1 is required", async () => {
  assert.deepEqual(policy.CONSENTS.map((c) => c.key), ["terms", "records", "ecosystem_badge", "vetting", "marketing"]);
  assert.deepEqual(policy.CONSENTS.filter((c) => c.required).map((c) => c.key), ["terms"]);
  for (const c of policy.CONSENTS) assert.ok(c.en && c.tl, `${c.key} has English and Taglish wording`);
});

test("sign-up switches start off and each one is sent separately", async () => {
  assert.match(authForm, /CONSENT_KEYS\.map\(\(k\) => \[k, false\]\)/);
  assert.match(authForm, /<Switch[\s\S]*name=\{`c_\$\{c\.key\}`\}[\s\S]*checked=\{consents\[c\.key\]\}/);
  assert.doesNotMatch(authForm, /type="checkbox"/, "no bundled checkbox left on the Join form");
  assert.match(authForm, /consentData = \{ consents, policy_version: POLICY_VERSION \}/);
  assert.match(authForm, /email_verification_required: true,\s*\.\.\.consentData/);
  assert.match(authForm, /consentQuery/);
  const fresh = policy.choicesFrom(() => null);
  assert.ok(Object.values(fresh).every((v) => v === false), "missing means off");
});

test("consent log: own rows only, append-only, server time, version and source", async () => {
  assert.match(migration, /alter table public\.member_consents enable row level security/);
  assert.match(migration, /alter table public\.policy_versions enable row level security/);
  assert.match(migration, /for select to authenticated using \(user_id = auth\.uid\(\) or public\.is_admin\(\)\)/);
  assert.match(migration, /for insert to authenticated with check \(user_id = auth\.uid\(\)\)/);
  assert.doesNotMatch(migration, /on public\.member_consents for (update|delete|all)/);
  assert.match(migration, /revoke update, delete, truncate on public\.member_consents from anon, authenticated/);
  assert.match(migration, /new\.created_at = now\(\)/);
  assert.match(migration, /policy_version text not null references public\.policy_versions\(version\)/);
  assert.match(migration, /source text not null check \(source in \('signup', 'prompt', 'settings'\)\)/);
  assert.match(migration, /with \(security_invoker = true\)/);
  assert.doesNotMatch(migration, /chapter_leader|is_staff\(\)/, "chapter leaders cannot read other members' consents");
});

test("sign-up trigger keeps its old behaviour and never fails because of consents", async () => {
  assert.match(migration, /insert into public\.profiles \(id, full_name, consent_privacy, consent_marketing, consent_at, business_stage, referred_by\)/);
  assert.match(migration, /exception when others then\s+raise warning/);
});

// ---- 6. existing members -------------------------------------------------------
test("existing members are asked, never locked out", async () => {
  assert.match(prompt, /Not now/);
  assert.match(prompt, /href=\{next\}/);
  assert.match(consents, /if \(error\) return \{ ready: false, state: \{\} \}/, "missing table never blocks sign-in");
  assert.match(consents, /return ready && !hasCurrentTerms\(state\)/);
  assert.doesNotMatch(await read("src/app/account/layout.tsx"), /needsConsentPrompt|redirect\(/, "member pages are not gated");
});

// ---- 7. withdraw any consent ---------------------------------------------------
test("settings lets members withdraw every consent and shows their history", async () => {
  assert.match(settings, /<ConsentSwitches on=\{on\} \/>/);
  assert.match(settings, /consent history/i);
  assert.match(actions, /recordConsents\(supabase, user\.id, choices, source, state\)/);
  assert.match(actions, /account closure request/);
  assert.match(await read("src/lib/member-nav.ts"), /\{ href: "\/account\/settings", label: "Settings" \}/);
});

test("saving consents shows that it is working and confirms afterwards", async () => {
  const btn = await read("src/components/SubmitButton.tsx");
  assert.match(btn, /useFormStatus/);
  assert.match(btn, /disabled=\{disabled \|\| pending\}/);
  assert.match(prompt, /<SubmitButton[^>]*>Save my choices<\/SubmitButton>/);
  assert.match(settings, /<SubmitButton[^>]*>Save choices<\/SubmitButton>/);
  assert.match(actions, /consents=saved/);
  assert.match(actions, /back === "\/" \? "\/account" : back/);
  assert.match(await read("src/app/account/page.tsx"), /sp\.consents === "saved"/);
});
