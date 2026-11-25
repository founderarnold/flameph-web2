import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { decide, emailSignals, personSignals, businessExtraSignals, reasonLabel } from "../src/lib/listing-review-rules.ts";
import { DIRECTORY_VIEWS, pageInfo, viewOf } from "../src/lib/business-review-queue.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const clean = { riskLevel: "low", reasonCategories: [], signals: [] };
const base = { lifecycle: "draft", ownerActive: true, legacyState: "none", lastAdminAction: null, content: clean, extra: [] };

test("root cause: Directory verification forms never use a field named id (it hid the pressed button)", async () => {
  const page = await read("src/app/admin/directory/page.tsx");
  assert.doesNotMatch(page, /name="id"/);
  assert.match(page, /name="business_id"/);
  const actions = await read("src/app/admin/actions.ts");
  assert.match(actions, /fd\.get\("business_id"\)/);
  // A refused or unknown action is shown to the admin, never a silent return.
  assert.match(actions, /error: "unknown-action"/);
  assert.match(actions, /error: "save-failed"/);
});

test("a normal listing publishes with no documents, photo or mini website", () => {
  const extra = [...emailSignals({ email: "ian.m@gmail.com", confirmed: true, domainAcceptsMail: true }), ...personSignals({ full_name: "Ian Mohametano", city: "Los Banos" }), ...businessExtraSignals({ name: "Flame Signature Printing Services", sector: "Services", city: "Los Baños", province: "Laguna" })];
  assert.deepEqual(extra, []);
  assert.equal(decide({ ...base, extra }).outcome, "publish");
  for (const name of ["Chael Fingerlings 🐟", "Mintels: Your #1 Customized Mini PCs and Tablets", "Karen’s Sari- Sari Store", "J&J Store", "MDPS"]) {
    assert.deepEqual(businessExtraSignals({ name, sector: "Retail", city: "Angeles City", province: "Pampanga" }), [], name);
  }
  for (const n of ["José Rizal", "Ma. Cristina Dela Cruz-Santos", "Ian Mohametano", "Arnold Relova"]) assert.deepEqual(personSignals({ full_name: n }), [], n);
});

test("manual review only for unreal or unconfirmed email, or unreadable personal or business details", () => {
  const hold = (extra) => decide({ ...base, extra }).outcome;
  assert.equal(hold(emailSignals({ email: "karen@gmail.com", confirmed: false, domainAcceptsMail: true })), "hold");
  assert.equal(hold(emailSignals({ email: "test@example.com", confirmed: true, domainAcceptsMail: null })), "hold");
  assert.equal(hold(emailSignals({ email: "a@mailinator.com", confirmed: true, domainAcceptsMail: null })), "hold");
  assert.equal(hold(emailSignals({ email: "a@nosuchdomain-xyz.ph", confirmed: true, domainAcceptsMail: false })), "hold");
  assert.deepEqual(emailSignals({ email: "a@company.ph", confirmed: true, domainAcceptsMail: null }), [], "mail check not possible is never held against the member");
  assert.equal(hold(personSignals({ full_name: "asdfgh qwerty" })), "hold");
  assert.equal(hold(personSignals({ full_name: "Jx 12345 $$$" })), "hold");
  assert.equal(hold(personSignals({ full_name: "" })), "hold");
  assert.equal(hold(personSignals({ full_name: "Pedro Reyes", mobile: "09111111111" })), "hold");
  assert.equal(hold(businessExtraSignals({ name: "Jx ★★★★ $$$ ###", sector: "Retail", city: "Cebu", province: "Cebu" })), "hold");
  assert.equal(hold(businessExtraSignals({ name: "Shop", sector: "", city: "Cebu", province: "" })), "hold");
  // Strong content signals hold; weak ones are notes only.
  assert.equal(decide({ ...base, content: { riskLevel: "needs_review", reasonCategories: ["meaningless_description"], signals: [{ category: "meaningless_description", strong: true }] } }).outcome, "hold");
  assert.equal(decide({ ...base, content: { riskLevel: "low", reasonCategories: ["description_too_short"], signals: [{ category: "description_too_short", strong: false }] } }).outcome, "publish");
});

test("older flagged listings, admin decisions and banned owners are never published automatically", () => {
  assert.equal(decide({ ...base, legacyState: "pending", legacyClass: "obviously_suspicious" }).outcome, "skip");
  assert.equal(decide({ ...base, legacyState: "confirmed", legacyClass: "obviously_suspicious" }).outcome, "skip");
  for (const a of ["business_hide", "business_reject", "business_suspend", "business_keep_quarantined", "business_ban_owner", "business_unpublish"]) assert.equal(decide({ ...base, lastAdminAction: a }).outcome, "skip", a);
  for (const l of ["rejected", "suspended"]) assert.equal(decide({ ...base, lifecycle: l }).outcome, "skip", l);
  assert.equal(decide({ ...base, ownerActive: false }).outcome, "skip");
  assert.equal(decide({ ...base, content: { riskLevel: "high", reasonCategories: ["spam_terms"], signals: [{ category: "spam_terms", strong: true }] } }).outcome, "high");
  // An admin's approval is kept: findings become notes, only high risk takes it down.
  assert.equal(decide({ ...base, lastAdminAction: "business_approve_legitimate", extra: [{ code: "email_disposable", hold: true }] }).outcome, "publish");
});

test("every reason has a plain-language sentence", () => {
  for (const code of ["email_not_verified", "email_fake_pattern", "email_disposable", "email_domain_dead", "owner_name_unreadable", "owner_name_odd_characters", "business_name_odd_characters", "duplicate_business_name", "meaningless_description", "spam_terms", "legacy_high_suspicion", "admin_hold", "random_name_token", "no_media"]) {
    assert.ok(reasonLabel(code).endsWith("."), code);
    assert.doesNotMatch(reasonLabel(code), /_/, code);
  }
  assert.match(reasonLabel("missing_basics:category|province"), /Missing basic details: category, province\./);
});

test("admin queue: groups, paging with First, Back and Next", async () => {
  assert.deepEqual(DIRECTORY_VIEWS.map((v) => v.key), ["review", "docs", "flagged", "live", "off", "all"]);
  assert.equal(viewOf(undefined), "review");
  assert.equal(viewOf(undefined, "1"), "all", "old ?all=1 links still work");
  assert.deepEqual(pageInfo(1, 273), { current: 1, last: 14, from: 1, to: 20, hasPrev: false, hasNext: true });
  assert.deepEqual(pageInfo(14, 273), { current: 14, last: 14, from: 261, to: 273, hasPrev: true, hasNext: false });
  assert.equal(pageInfo(99, 10).current, 1);
  assert.equal(pageInfo(1, 0).from, 0);
  const page = await read("src/app/admin/directory/page.tsx");
  for (const label of ["First", "Back", "Next", "Check waiting listings now", "Why it is waiting"]) assert.match(page, new RegExp(label));
});

test("saving a listing runs the automatic check; an hourly job catches the rest", async () => {
  const save = await read("src/app/account/business/actions.ts");
  assert.match(save, /checkListingAfterSave\(/);
  const cron = await read("src/app/api/cron/directory/route.ts");
  assert.match(cron, /CRON_SECRET/);
  assert.match(await read("vercel.json"), /\/api\/cron\/directory/);
  const review = await read("src/lib/listing-auto-review.ts");
  assert.match(review, /record_business_moderation/);
  assert.match(review, /business_auto_published/);
  assert.doesNotMatch(review, /verified:\s*true/, "the automatic check never gives the Verified badge");
});
