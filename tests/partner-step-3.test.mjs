// Partner accreditation, Step 3: territories and appointments (Admin > Partners > Territories, /partner-us/territories).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const toUrl = (js) => `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
const load = async (p) => import(toUrl(ts.transpileModule(await read(p), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText));
const SQL = () => read("supabase/migrations/0033_partner_territories.sql");

test("0033: row level security on every new table, no browser writes, chapter roles and finance see nothing", async () => {
  const sql = await SQL();
  for (const t of ["ph_regions", "ph_cities", "territorial_appointments", "territory_areas", "territory_reviews", "territory_history", "territory_nominations"]) {
    assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security;`), t);
  }
  for (const t of ["territorial_appointments", "territory_areas", "territory_reviews", "territory_history", "territory_nominations"]) {
    assert.match(sql, new RegExp(`revoke all on public\\.${t} from anon, authenticated;`), t);
  }
  const policies = sql.match(/create policy[\s\S]*?;/g).join("\n");
  assert.doesNotMatch(policies, /chapter_tester|chapter_coordinator|finance/);
  assert.doesNotMatch(policies, /for (insert|update|delete|all)/);
  assert.match(sql, /using \(public\.is_partner_reviewer\(\) or \(partner_user_id = auth\.uid\(\) and status in \('active', 'suspended', 'ended'\)\)\);/);
  // Team-only note and overlap details are not granted to members.
  const grant = sql.match(/grant select \(id, partner_user_id[\s\S]*?on public\.territorial_appointments to authenticated;/)[0];
  assert.doesNotMatch(grant, /internal_note|overlap_reason|overlap_with/);
  assert.match(sql, /revoke all on function public\.territory_conflicts\(uuid\) from public, anon, authenticated;/);
});

test("0033: national team only, overlap rule, sub-partners nominate only, append-only history", async () => {
  const sql = await SQL();
  assert.match(sql, /x\.role in \('super_admin', 'admin', 'national_reviewer'\)/);
  assert.match(sql, /only the national team appoints, and never for itself/);
  assert.match(sql, /only the national team approves, suspends or ends, and never for itself/);
  assert.match(sql, /\(a\.exclusivity = 'exclusive' or b\.exclusivity = 'exclusive'\)/);
  assert.match(sql, /daterange\(a\.start_date, a\.end_date, '\[\]'\) && daterange\(b\.start_date, b\.end_date, '\[\]'\)/);
  assert.match(sql, /approve the overlap with a reason/);
  assert.match(sql, /constraint territorial_appointments_overlap_reason check \(not overlap_approved or overlap_reason is not null\)/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /areas must be inside the main appointment/);
  assert.match(sql, /only the partner of an active appointment can nominate inside it/);
  assert.match(sql, /territory_nomination: only the national team decides/);
  assert.match(sql, /append_only: territory_history rows cannot be changed/);
  assert.match(sql, /append_only: territory_reviews rows cannot be changed/);
  const undo = await read("supabase/rollback/0033_partner_territories_undo.sql");
  assert.match(undo, /drop table if exists public\.territorial_appointments;/);
  assert.match(undo, /alter table public\.ph_provinces drop column if exists psgc_code;/);
  assert.match(undo, /territory appointments or nominations exist; keep 0033/);
});

test("PSGC lists: 18 regions, 83 provinces, 1,642 cities and municipalities (149 cities), same in code and in 0033", async () => {
  const G = await load("src/content/ph-psgc.ts");
  assert.equal(G.PH_REGIONS.length, 18);
  assert.equal(G.PH_PROVINCES.length, 83);
  assert.equal(G.PH_PLACES.length, 1642);
  assert.equal(G.PH_PLACES.filter((p) => p[4] === 1).length, 149);
  const sql = await SQL();
  const regions = new Set(G.PH_REGIONS.map((r) => r[0]));
  for (const [code, name, , region] of G.PH_PLACES) {
    assert.ok(regions.has(region), name);
    assert.ok(sql.includes(`('${code}', '${name.replace(/'/g, "''")}', `), `${code} ${name} in 0033`);
  }
  for (const [code, name, region] of G.PH_PROVINCES) assert.ok(sql.includes(`('${name.replace(/'/g, "''")}', '${code}', '${region}')`), name);
  // Every province in 0023's ph_provinces gets a code.
  const p0023 = (await read("supabase/migrations/0023_member_journey.sql")).split("on conflict (name)")[0];
  const names = [...p0023.matchAll(/\('([^']+)', '[^']+'\)/g)].map((m) => m[1]);
  assert.deepEqual(names.sort(), G.PH_PROVINCES.map((p) => p[1]).sort());
  const angeles = G.PH_PLACES.find((p) => p[0] === "0330100000");
  assert.equal(G.PH_PROVINCES.find((p) => p[0] === angeles[2])[1], "Pampanga");
});

test("overlap rule in code matches the database rule", async () => {
  const T = await load("src/lib/territory.ts");
  const pampanga = { region_code: "0300000000", province_code: "0305400000", city_code: null };
  const angeles = { region_code: "0300000000", province_code: "0305400000", city_code: "0330100000" };
  const ncr = { region_code: "1300000000", province_code: null, city_code: null };
  const ph = { region_code: null, province_code: null, city_code: null };
  assert.ok(T.covers(pampanga, angeles)); assert.ok(!T.covers(angeles, pampanga));
  assert.ok(T.areasOverlap(angeles, pampanga)); assert.ok(!T.areasOverlap(ncr, pampanga)); assert.ok(T.areasOverlap(ph, ncr));
  const base = { id: "a", partner_user_id: "A", parent_id: null, rights: "distribution", category_key: "packaging", exclusivity: "exclusive", channels: ["group_order"], start_date: "2027-01-01", end_date: "2027-12-31", status: "active", areas: [pampanga] };
  const other = { ...base, id: "b", partner_user_id: "B", exclusivity: "non_exclusive", areas: [angeles], status: "draft" };
  assert.equal(T.conflicts(other, base), true);
  assert.equal(T.conflicts({ ...other, channels: ["chapter_events"] }, base), false);
  assert.equal(T.conflicts({ ...other, category_key: "beverages" }, base), false);
  assert.equal(T.conflicts({ ...other, start_date: "2028-01-01", end_date: "2028-06-30" }, base), false);
  assert.equal(T.conflicts({ ...other, partner_user_id: "A" }, base), false);
  assert.equal(T.conflicts({ ...other, parent_id: "a" }, base), false);
  assert.equal(T.conflicts(other, { ...base, exclusivity: "non_exclusive" }), false);
  assert.equal(T.conflicts(other, { ...base, status: "ended" }), false);
});

test("categories, excluded accounts, dates and money words", async () => {
  const T = await load("src/lib/territory.ts");
  const groups = { packaging: "Packaging", other: "Other" };
  assert.deepEqual(T.categoryFrom("packaging", "", groups, "supplier"), { key: "packaging", label: "Packaging" });
  assert.deepEqual(T.categoryFrom("", "Rice Milling", groups, "supplier"), { key: "other:rice-milling", label: "Rice Milling" });
  assert.deepEqual(T.categoryFrom("packaging", "Bookkeeping", groups, "service_provider"), { key: "service:bookkeeping", label: "Bookkeeping" });
  assert.equal(T.categoryFrom("", "x", groups, "supplier"), null);
  assert.deepEqual(T.parseExcluded(" SM Supermarkets \n\nsm supermarkets; Government agencies "), ["SM Supermarkets", "Government agencies"]);
  assert.equal(T.parseExcluded(Array.from({ length: 40 }, (_, i) => `A${i}`).join("\n")).length, 30);
  assert.equal(T.addMonths("2026-11-30", 3), "2027-02-28");
  assert.equal(T.addMonths("2026-01-15", 12), "2027-01-15");
  assert.equal(T.shownStatus({ status: "active", start_date: "2026-01-01", end_date: "2026-06-30" }, "2026-11-23").key, "expired");
  assert.equal(T.reviewDue({ status: "active", next_review_date: "2026-11-23" }, "2026-11-23"), true);
  assert.equal(T.parseAmount("₱1,200,000.50"), 1200000.5);
  assert.equal(T.parseAmount("abc"), undefined);
  assert.equal(T.dbReason('new row ... territory: a sub-partner\'s areas must be inside the main appointment\'s areas'), "a sub-partner's areas must be inside the main appointment's areas");
  assert.match(T.TARGET_NOTE.en, /not promised sales, payments or commissions/);
  assert.match(T.APPOINT_RULE.en, /cannot appoint anyone/);
});

test("pages: national team only in admin, partner page shows the money notice with targets, More lists My territories", async () => {
  const actions = await read("src/app/admin/partners/territories/actions.ts");
  assert.match(actions, /const NATIONAL = \["super_admin", "admin", "national_reviewer"\] as const;/);
  assert.match(actions, /error=own/);
  for (const p of ["src/app/admin/partners/territories/page.tsx", "src/app/admin/partners/territories/[id]/page.tsx", "src/app/admin/partners/territories/new/page.tsx", "src/app/admin/partners/territories/nominations/page.tsx"]) {
    assert.match(await read(p), /adminContext\(\["super_admin", "admin", "national_reviewer"\]\)/, p);
  }
  const mine = await read("src/app/partner-us/territories/page.tsx");
  assert.match(mine, /<PartnerMoneyNotice compact \/>/);
  assert.match(mine, /requireUser\("\/partner-us\/territories"\)/);
  assert.doesNotMatch(mine, /internal_note|overlap_reason/);
  const partnerActions = await read("src/app/partner-us/territories/actions.ts");
  assert.doesNotMatch(partnerActions, /territorial_appointments"\)\.(insert|update)/);
  const more = JSON.parse(await read("src/content/more.json"));
  assert.ok(more.groups.flatMap((g) => g.items).some((i) => i.href === "/partner-us/territories"));
  assert.match(await read("src/app/admin/layout.tsx"), /href="\/admin\/partners\/territories">Territories</);
});
