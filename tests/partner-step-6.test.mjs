// Partner accreditation, Step 6: Service Provider Best Offer (/partner-us/offers with kind 'service' and Admin >
// Partners > Service offers).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const toUrl = (js) => `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
const compile = async (p) => ts.transpileModule(await read(p), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
// service-offers.ts imports ./offers: inline it so the module loads on its own.
const loadService = async () => {
  const offers = toUrl(await compile("src/lib/offers.ts"));
  return import(toUrl((await compile("src/lib/service-offers.ts")).replace(/from "\.\/offers"/g, `from "${offers}"`)));
};
const SQL = () => read("supabase/migrations/0036_service_offers.sql");

test("0036: extends the shared offer table, new tables have row level security, no browser writes, chapters see nothing", async () => {
  const sql = await SQL();
  // REUSE: the same offer table, history, conflicts and scores; nothing dropped or renamed.
  assert.match(sql, /alter table public\.supplier_offers add column if not exists kind text not null default 'supplier';/);
  assert.doesNotMatch(sql, /create table if not exists public\.service_offers\b/);
  const code = sql.replace(/--.*$/gm, "");
  assert.doesNotMatch(code, /drop table|drop column|rename/i);
  for (const t of ["service_offer_packages", "service_offer_references"]) {
    assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security;`), t);
    assert.match(sql, new RegExp(`revoke all on public\\.${t} from anon, authenticated;`), t);
  }
  const policies = sql.match(/create policy[\s\S]*?;/g).join("\n");
  assert.doesNotMatch(policies, /chapter_tester|chapter_coordinator|finance/);
  assert.doesNotMatch(policies, /for (insert|update|delete|all)/);
  assert.match(policies, /public\.is_partner_reviewer\(\) or exists \(select 1 from public\.supplier_offers o where o\.id = offer_id and o\.user_id = auth\.uid\(\)\)/);
});

test("0036: service rules: accredited providers only, packages, measurable acceptance, licence, no blanket guarantee, references", async () => {
  const sql = await SQL();
  assert.match(sql, /'service_provider' = any\(p\.categories\)/);
  assert.match(sql, /only accredited service providers can make service offers/);
  assert.match(sql, /the kind of offer is fixed/);
  assert.match(sql, /add at least one service package before sending/);
  assert.match(sql, /the licence has expired/);
  assert.match(sql, /no blanket satisfaction guarantee/);
  assert.match(sql, /acceptance_criteria text not null check \(char_length\(acceptance_criteria\) between 10 and 1500\)/);
  assert.match(sql, /member_rate <= normal_rate/);
  assert.match(sql, /client_consent boolean not null check \(client_consent\)/);
  assert.match(sql, /only the national team checks references, never their own/);
  assert.match(sql, /declare no conflict of interest before checking references/);
  // Supplier offers keep exactly the Step 2 rules.
  assert.match(sql, /only accredited suppliers can make offers/);
  assert.match(sql, /add at least one product before sending/);
  assert.match(sql, /kind = 'supplier' and title is not null and product_group is not null/);
  // Offer files: portfolio and licence join the offer purpose only.
  assert.match(sql, /purpose = 'offer' and doc_type in \('product_photo', 'price_list', 'spec_sheet', 'certification', 'fda', 'other', 'portfolio', 'prc'\)/);
  const undo = await read("supabase/rollback/0036_service_offers_undo.sql");
  assert.match(undo, /service offers exist; keep 0036/);
  assert.match(undo, /drop table if exists public\.service_offer_packages;/);
});

test("the page check for a blanket guarantee is the same rule as the database", async () => {
  const S = await loadService();
  const sql = await SQL();
  const dbRe = sql.match(/select coalesce\(t, ''\) ~\* '([^']+)'/)[1];
  assert.equal(S.BLANKET_GUARANTEE.source, dbRe);
  for (const t of ["100% satisfaction", "We guarantee customer satisfaction", "Satisfaction guaranteed or your money back", "one hundred percent satisfied"]) {
    assert.equal(S.hasBlanketGuarantee(t), true, t);
  }
  for (const t of ["Books closed by day 10", "50 fully satisfied clients", "Errors corrected free within 5 days", null]) {
    assert.equal(S.hasBlanketGuarantee(t), false, String(t));
  }
});

test("same five score parts and pass mark as supplier offers, with service labels", async () => {
  const S = await loadService();
  const O = await import(toUrl(await compile("src/lib/offers.ts")));
  assert.deepEqual(Object.keys(S.SERVICE_SCORE_LABELS), O.SCORE_KEYS);
  assert.match(S.SERVICE_SCORE_LABELS.quality_samples.label, /Qualifications and customer results/);
  assert.match(S.SERVICE_SCORE_LABELS.compliance_reliability.label, /service levels/);
  assert.match(S.SERVICE_SCORE_LABELS.price_value.label, /Cost/);
  assert.equal(S.SERVICE_STEPS.length, O.OFFER_STEPS.length);
});

test("comparison: lowest member rate with VAT per pricing basis, and a suggested cost score", async () => {
  const S = await loadService();
  const pk = (rate_basis, member_rate, normal_rate = null, unit_label = null) => ({ rate_basis, member_rate, normal_rate, unit_label });
  const out = S.compareServiceOffers([
    { id: "a", vat_basis: "non_vat", packages: [pk("month", 2800, 3500), pk("hour", 500)] },
    { id: "b", vat_basis: "vat_exclusive", packages: [pk("month", 2500)] },      // 2,800 with VAT
    { id: "c", vat_basis: "vat_inclusive", packages: [pk("month", 4000, 4000), pk("unit", 150, null, "per employee")] },
  ]);
  const [a, b, c] = out;
  assert.equal(a.lowest.month, 2800);
  assert.equal(b.lowest.month, 2800);
  assert.equal(a.isBest.month, true);
  assert.equal(b.isBest.month, true);
  assert.equal(c.isBest.month, false);
  assert.equal(a.suggestedPriceScore, 30);
  assert.equal(c.suggestedPriceScore, 21);            // 30 * 2800 / 4000
  assert.equal(c.lowest["unit:per employee"], 150);
  assert.equal(a.avgDiscount, 20);
  assert.equal(S.basisLabel("unit:per employee"), "per employee");
  assert.equal(S.basisLabel("hour"), "per hour");
});

test("what is missing before sending a service offer", async () => {
  const S = await loadService();
  const blank = Object.fromEntries(["title", "service_category", "profession", "qualifications", "license_required", "license_body", "license_no", "license_valid_until",
    "valid_until", "vat_basis", "service_mode", "serviceable_areas", "free_trial", "availability", "lead_time_days", "response_hours", "correction_policy", "refund_policy",
    "confidentiality", "handles_personal_data", "commission_pct", "portfolio"].map((k) => [k, null]));
  const all = S.serviceMissing(blank, [], 0, 0, "2026-11-24");
  assert.ok(all.some((m) => m.what.startsWith("At least one service package")));
  assert.ok(all.some((m) => m.what.startsWith("At least one past client")));
  assert.ok(all.some((m) => m.what.startsWith("Your portfolio")));
  const full = { ...blank, title: "Bookkeeping", service_category: "accounting_tax", profession: "CPA", qualifications: "CPA since 2015", license_required: true,
    license_body: "PRC", license_no: "123", license_valid_until: "2027-01-01", valid_until: "2027-03-01", vat_basis: "non_vat", service_mode: "both",
    serviceable_areas: "Remote nationwide", free_trial: "none", availability: "Mon-Sat", lead_time_days: 3, response_hours: 24, correction_policy: "Fixed free in 5 days",
    refund_policy: "Unmet part refunded in proportion", confidentiality: "Encrypted", handles_personal_data: true, commission_pct: 12, portfolio: "40 clients" };
  const pkg = { name: "Monthly", scope: "Books", acceptance_criteria: "Reports by day 10", exclusions: null, description: null, milestones: [] };
  assert.deepEqual(S.serviceMissing(full, [pkg], 1, 0, "2026-11-24"), []);
  assert.ok(S.serviceMissing({ ...full, license_valid_until: "2026-11-01" }, [pkg], 1, 0, "2026-11-24").some((m) => /expired/.test(m.what)));
  assert.ok(S.serviceMissing(full, [{ ...pkg, acceptance_criteria: "100% satisfaction guaranteed" }], 1, 0, "2026-11-24").some((m) => /100% satisfaction/.test(m.what)));
  assert.deepEqual(S.serviceMissing({ ...full, license_required: false, license_body: null, license_no: null }, [pkg], 1, 1, "2026-11-24"), []);
  assert.deepEqual(S.parseMilestones([{ title: "Set up", days: "7" }, { title: "", days: "" }]), [{ title: "Set up", due_days: 7 }]);
  assert.equal(S.parseMilestones([{ title: "", days: "7" }]), "bad");
  assert.deepEqual(S.referenceSummary([{ verification: "verified", client_rating: 5 }, { verification: "verified", client_rating: 4 }, { verification: "pending", client_rating: null }]), { verified: 2, total: 3, rating: 4.5 });
});

test("service pages: one My Best Offers page for both kinds, shared actions, admin tab, More and data export", async () => {
  const actions = await read("src/app/partner-us/offers/actions.ts");
  assert.match(actions, /error=not_provider/);
  assert.match(actions, /insert\(\{ user_id: user\.id, application_id: app\?\.id \?\? null, kind \}\)/);
  assert.match(actions, /snapshot: \{ offer: full, packages: items \?\? \[\], references: refs \?\? \[\] \}/);
  assert.doesNotMatch(actions, /export async function ownOffer/);   // the helper is not a server action
  const own = await read("src/app/partner-us/offers/own.ts");
  assert.match(own, /^import "server-only";/);
  const svc = await read("src/app/partner-us/offers/service-actions.ts");
  for (const f of ["saveServiceStep", "savePackage", "deletePackage", "saveReference", "deleteReference"]) assert.match(svc, new RegExp(`export async function ${f}\\(`), f);
  assert.match(svc, /hasBlanketGuarantee/);
  const list = await read("src/app/partner-us/offers/page.tsx");
  assert.match(list, /name="kind" value="service"/);
  assert.match(list, /name="kind" value="supplier"/);
  const tabs = await read("src/components/admin/PartnerTabs.tsx");
  assert.match(tabs, /\["service_offers", "Service offers", "\/admin\/partners\/offers\?kind=service"\]/);
  assert.match(await read("src/app/admin/layout.tsx"), /href="\/admin\/partners\/offers\?kind=service">Service offers/);
  const adminActions = await read("src/app/admin/partners/offers/actions.ts");
  assert.match(adminActions, /export async function checkReference\(/);
  assert.match(adminActions, /offer\.kind === "service" \? isServiceReason : isOfferReason/);
  assert.match(await read("src/app/admin/partners/offers/compare/page.tsx"), /error=mixed/);
  const more = JSON.parse(await read("src/content/more.json"));
  assert.ok(more.groups.flatMap((g) => g.items).some((i) => i.href === "/partner-us/offers" && /service providers/.test(i.label)));
  const rights = await read("src/lib/data-rights-server.ts");
  assert.match(rights, /service_offer_packages\(name/);
  assert.match(rights, /service_offer_references\(client_name/);
  // Customer results reuse member_reputation (confirmed deals only, never amounts).
  assert.match(await read("src/lib/service-offers-server.ts"), /db\.rpc\("member_reputation", \{ uid \}\)/);
  // Every screen with a commission figure shows the money notice.
  for (const p of ["src/app/partner-us/offers/[id]/ServiceOffer.tsx", "src/app/admin/partners/offers/[id]/ServiceSections.tsx", "src/app/admin/partners/offers/compare/ServiceCompare.tsx"]) {
    assert.match(await read(p), /<PartnerMoneyNotice/, p);
  }
});
