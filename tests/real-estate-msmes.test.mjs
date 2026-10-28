import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [landing, propertyPage, referralPage, careersPage, disclaimer, forms, nav, migration] = await Promise.all([
  read("src/app/real-estate-for-msmes/page.tsx"),
  read("src/app/real-estate-for-msmes/find-property/page.tsx"),
  read("src/app/real-estate-for-msmes/referral-partner/page.tsx"),
  read("src/app/real-estate-for-msmes/careers/page.tsx"),
  read("src/components/real-estate/RealEstateDisclaimer.tsx"),
  read("src/lib/forms.ts"),
  read("src/content/nav.json"),
  read("supabase/migrations/0013_real_estate_funnels.sql"),
]);

test("the permanent route and all three separate journeys exist", () => {
  assert.match(nav, /Real Estate for MSMEs/);
  assert.match(landing, /Find the Right/);
  assert.match(propertyPage, /real-estate-property/);
  assert.match(referralPage, /real-estate-referral-partner/);
  assert.match(careersPage, /real-estate-career/);
});
test("forms record explicit consent and route to the real-estate administrator", () => {
  for (const type of ["real-estate-property", "real-estate-referral-partner", "real-estate-career"]) {
    const start = forms.indexOf(`\"${type}\":`);
    assert.ok(start > 0, type);
    const block = forms.slice(start, start + 6000);
    assert.match(block, /notificationAudience: "real-estate"/);
    assert.match(block, /type: "checkbox", required: true/);
  }
  assert.match(forms, /forward this property inquiry/);
  assert.match(forms, /does not authorize me to perform regulated real-estate activities/);
});

test("database domains are separated and private by default", () => {
  for (const table of ["property_inquiries", "corporate_h_referral_partners", "corporate_h_applications"]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`, "i"));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(migration, /user_id = auth\.uid\(\)/);
  assert.doesNotMatch(migration, /create policy[^;]+for insert to (?:anon|authenticated)/i);
});

test("regulated activity and outcome claims remain qualified", () => {
  assert.match(landing, /independent organizations/);
  assert.match(landing, /does not make anyone a licensed broker or accredited salesperson/);
  assert.match(disclaimer, /Nothing on this page guarantees/);
  assert.match(careersPage, /does not automatically complete accreditation, licensing/);
});
