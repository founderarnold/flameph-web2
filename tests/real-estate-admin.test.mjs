import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("super admins receive dedicated real-estate navigation and pages", () => {
  const layout = read("src/app/admin/layout.tsx");
  const overview = read("src/app/admin/real-estate/page.tsx");
  const list = read("src/app/admin/real-estate/[section]/page.tsx");
  assert.match(layout, /Real Estate overview/);
  assert.match(layout, /Property inquiries/);
  assert.match(layout, /Referral partners/);
  assert.match(layout, /Career applications/);
  assert.match(overview, /adminContext\(\["super_admin", "admin"\]\)/);
  assert.match(list, /adminContext\(\["super_admin", "admin"\]\)/);
});

test("real-estate status changes are table and status allowlisted", () => {
  const actions = read("src/app/admin/actions.ts");
  const config = read("src/lib/real-estate-admin.ts");
  assert.match(actions, /getRealEstateAdminSection\(section\)/);
  assert.match(actions, /config\.statuses\.includes/);
  assert.match(config, /property_inquiries/);
  assert.match(config, /corporate_h_referral_partners/);
  assert.match(config, /corporate_h_applications/);
});

test("admins can export each real-estate table safely", () => {
  const route = read("src/app/admin/export/[kind]/route.ts");
  assert.match(route, /REAL_ESTATE_ADMIN_SECTIONS/);
  assert.match(route, /spreadsheet formula injection/i);
  assert.match(route, /realEstate\.dataColumn/);
});
