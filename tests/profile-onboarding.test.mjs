// Phase 3A: business profile fields, completion meter, first-run onboarding, privacy controls.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
// Loads a TS module; "@/..." imports are resolved by inlining the named modules (small, dependency-free files only).
const load = async (p, deps = {}) => {
  let src = await read(p);
  for (const [spec, url] of Object.entries(deps)) src = src.replaceAll(`"${spec}"`, `"${url}"`);
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return { mod: await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`), url: `data:text/javascript;base64,${Buffer.from(js).toString("base64")}` };
};

const migration = await read("supabase/migrations/0016_profile_onboarding.sql");
const industries = await load("src/lib/industries.ts");
const privacy = (await load("src/lib/privacy.ts")).mod;
const completionDep = await load("src/lib/business-completion.ts");
const psgcDep = await load("src/content/ph-psgc.ts");
const provincesDep = await load("src/content/ph-provinces.ts");
const townsDep = await load("src/lib/ph-towns.ts", { "@/content/ph-psgc": psgcDep.url, "@/content/ph-provinces": provincesDep.url });
const completion = (await load("src/lib/profile-completion.ts", { "@/lib/business-completion": completionDep.url, "@/lib/ph-towns": townsDep.url })).mod;
const regions = (await load("src/content/ph-regions.ts")).mod;
const provinces = (await load("src/content/ph-provinces.ts")).mod;
const onboarding = (await load("src/lib/onboarding.ts")).mod;

test("database update: additive, row-level security on both new tables, TIN never shown", () => {
  assert.doesNotMatch(migration, /drop table|drop column|delete from|truncate/i);
  for (const t of ["business_registrations", "member_follows"]) {
    assert.match(migration, new RegExp(`alter table public\\.${t} enable row level security`));
    assert.match(migration, new RegExp(`revoke all on public\\.${t} from anon`));
  }
  const view = migration.slice(migration.indexOf("function public.business_registration_view"), migration.indexOf("revoke all on function"));
  assert.doesNotMatch(view, /bir_tin/, "the TIN must never be returned to others");
  assert.match(view, /r\.visibility = 'public' or \(r\.visibility = 'members' and auth\.uid\(\) is not null\)/);
  assert.match(migration, /member_follows_insert .* with check \(follower_id = auth\.uid\(\)\)/);
  assert.match(migration, /member_follows_delete .* using \(follower_id = auth\.uid\(\)\)/);
  assert.match(migration, /default 'private'/, "registration numbers start private");
});

test("industry taxonomy keeps the existing sector words", async () => {
  const listing = await read("src/lib/listing.ts");
  assert.match(listing, /export const SECTORS = INDUSTRY_NAMES;/);
  assert.deepEqual(industries.mod.INDUSTRY_NAMES, ["Food & beverage", "Retail / sari-sari", "Agriculture", "Manufacturing", "Services", "Beauty & wellness", "Crafts & fashion", "Technology", "Tourism", "Other"]);
  assert.ok(industries.mod.subsOf("Food & beverage").length > 3);
});

test("every province has a region", () => {
  for (const p of provinces.PROVINCES) assert.ok(regions.regionOf(p), `no region for ${p}`);
  assert.equal(regions.regionOf("Pampanga"), "Region III (Central Luzon)");
  assert.equal(regions.regionOf(null), null);
});

test("privacy: members-only details are removed for visitors, kept for members", () => {
  const b = { name: "X", contact_phone: "0917", contact_email: "a@b.c", facebook_url: "https://fb.com/x", field_visibility: { phone: "members", links: "members" } };
  const visitor = privacy.forViewer(b, false);
  assert.equal(visitor.contact_phone, null);
  assert.equal(visitor.facebook_url, null);
  assert.equal(visitor.contact_email, "a@b.c");
  assert.deepEqual(visitor.hidden_groups.sort(), ["links", "phone"]);
  assert.equal(privacy.forViewer(b, true).contact_phone, "0917");
  // Listings saved before this update (no choices) stay as they were: public.
  assert.equal(privacy.forViewer({ contact_phone: "1" }, false).contact_phone, "1");
  assert.deepEqual(privacy.visibilityFromForm((n) => (n === "members_email" ? "on" : null)), { phone: "public", email: "members", chat: "public", links: "public", products: "public" });
});

test("completion meter: specific next steps with links, done at 100%", () => {
  const empty = completion.memberCompletion({ profile: null, business: null, follows: 0, emailVerified: false });
  assert.equal(empty.percent, 0);
  assert.equal(empty.next[0].label, "Confirm your email");
  for (const s of empty.steps) assert.match(s.href, /^\/(welcome|account)/);
  const full = completion.memberCompletion({
    profile: { full_name: "Maria Santos", province: "Pampanga", city: "San Fernando City", business_stage: "grow", industries: ["Agriculture"], chapter_id: "c1" },
    business: { name: "Farm", sector: "Agriculture", subsector: "Fruits", description: "x".repeat(90), city: "San Fernando", province: "Pampanga", contact_phone: "0917", photos: ["a.jpg"] },
    follows: 3, emailVerified: true,
  });
  assert.equal(full.complete, true, JSON.stringify(full.next));
  assert.equal(full.percent, 100);
  // A city typed by hand (not picked from the list) still asks the member to choose it.
  const typed = completion.memberCompletion({ profile: { province: "Pampanga", city: "San Fernando" }, business: null, follows: 0, emailVerified: true });
  assert.equal(typed.steps.find((s) => s.key === "location").done, false);
});

test("onboarding: four steps in order, each skippable; new members start there", async () => {
  assert.deepEqual([...onboarding.STEPS], ["industries", "chapter", "follow", "profile"]);
  assert.equal(onboarding.stepOf("nope"), "industries");
  const page = await read("src/app/(member)/welcome/page.tsx");
  assert.match(page, /Not now/);
  assert.match(page, /Skip setup, go to my feed/);
  assert.match(await read("src/app/join/page.tsx"), /safeNext\(next, "\/welcome"\)/);
  const actions = await read("src/app/account/onboarding-actions.ts");
  assert.match(actions, /feedResult\("onboarded"\)/);
});

test("Home shows the completion meter until done, and follow buttons", async () => {
  const home = await read("src/app/(member)/home/page.tsx");
  assert.match(home, /\{firstPage && !meter\.complete && \(/);
  assert.match(home, /SuggestedMemberCard/);
  assert.match(home, /href="\/members"/);
});

test("privacy is applied where business details are shown", async () => {
  assert.match(await read("src/components/listing/BusinessProfile.tsx"), /forViewer\(business, isMember/);
  assert.match(await read("src/app/ridesafe/RideSafeHome.tsx"), /forViewer\(b, Boolean\(auth\.session\)\)/);
  assert.match(await read("src/app/account/settings/page.tsx"), /<PrivacyControls/);
});
