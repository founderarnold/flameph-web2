// Partner accreditation, Step 2: Supplier Best Offer (/partner-us/offers and Admin > Partners > Supplier offers).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const toUrl = (js) => `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
const load = async (p) => import(toUrl(ts.transpileModule(await read(p), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText));
const SQL = () => read("supabase/migrations/0032_supplier_offers.sql");

test("0032: row level security on every new table, no browser writes, testers and coordinators see nothing", async () => {
  const sql = await SQL();
  for (const t of ["supplier_offers", "supplier_offer_items", "supplier_offer_history", "supplier_offer_conflicts", "supplier_offer_scores"]) {
    assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security;`), t);
    assert.match(sql, new RegExp(`revoke all on public\\.${t} from anon, authenticated;`), t);
  }
  assert.match(sql, /create policy supplier_offers_read on public\.supplier_offers for select to authenticated\s+using \(user_id = auth\.uid\(\) or public\.is_partner_reviewer\(\)\);/);
  assert.match(sql, /create policy supplier_offer_scores_read on public\.supplier_offer_scores for select to authenticated\s+using \(public\.is_partner_reviewer\(\)\);/);
  assert.match(sql, /create policy supplier_offer_conflicts_read on public\.supplier_offer_conflicts for select to authenticated\s+using \(public\.is_partner_reviewer\(\)\);/);
  // Chapter roles never appear in a read rule for offers.
  const policies = sql.match(/create policy[\s\S]*?;/g).join("\n");
  assert.doesNotMatch(policies, /chapter_tester|chapter_coordinator|finance/);
  // No insert/update/delete policies: the server is the only writer.
  assert.doesNotMatch(policies, /for (insert|update|delete|all)/);
});

test("0032: accredited suppliers only; status moves; versions; selection gate; weights", async () => {
  const sql = await SQL();
  assert.match(sql, /'supplier' = any\(p\.categories\)/);
  assert.match(sql, /only accredited suppliers can make offers/);
  assert.match(sql, /new\.revision := old\.revision \+ 1;/);
  assert.match(sql, /select 80 \$\$/);
  assert.match(sql, /x\.role in \('super_admin', 'admin', 'national_reviewer'\)/);
  assert.match(sql, /declare no conflict of interest before deciding/);
  assert.match(sql, /declare no conflict of interest before scoring/);
  for (const [k, max] of [["price_value", 30], ["quality_samples", 25], ["compliance_reliability", 20], ["commission_benefits", 15], ["logistics_support", 10]]) {
    assert.match(sql, new RegExp(`${k} int not null check \\(${k} between 0 and ${max}\\)`), k);
  }
  assert.match(sql, /member_price <= regular_price/);
  assert.match(sql, /append_only: supplier_offer_history rows cannot be changed/);
  assert.match(sql, /a declared conflict cannot be taken back/);
  // Offer files reuse the encrypted store; other purposes keep their own document types; switch 4 never deletes them.
  assert.match(sql, /check \(purpose in \('vetting', 'partner', 'offer'\)\)/);
  assert.match(sql, /purpose = 'offer' and doc_type in \('product_photo', 'price_list', 'spec_sheet', 'certification', 'fda', 'other'\)/);
  assert.match(sql, /d\.purpose = 'offer'\s+and \(o\.id is null or \(o\.status in \('not_selected', 'withdrawn'\) and o\.updated_at < now\(\) - interval '1 year'\)\)/);
  const undo = await read("supabase/rollback/0032_supplier_offers_undo.sql");
  assert.match(undo, /drop table if exists public\.supplier_offers;/);
  assert.match(undo, /supplier offers exist; keep 0032/);
});

test("weights add up to 100, pass mark 80 and the compliance gate", async () => {
  const O = await load("src/lib/offers.ts");
  assert.equal(O.SCORE_PARTS.reduce((n, p) => n + p.max, 0), 100);
  assert.deepEqual(O.SCORE_PARTS.map((p) => p.max), [30, 25, 20, 15, 10]);
  assert.equal(O.PASS_MARK, 80);
  const s = (total, pass, revision = 1) => ({ reviewer_id: "r", revision, total, compliance_pass: pass });
  assert.deepEqual(O.offerResult([], 1), { scores: 0, average: null, compliance: "not_checked", canSelect: false });
  assert.equal(O.offerResult([s(89, true), s(82, true)], 1).average, 85.5);
  assert.equal(O.offerResult([s(89, true), s(82, true)], 1).canSelect, true);
  assert.equal(O.offerResult([s(100, false)], 1).canSelect, false, "compliance gate");
  assert.equal(O.offerResult([s(79, true)], 1).canSelect, false, "below 80");
  assert.equal(O.offerResult([s(95, true, 1)], 2).scores, 0, "old version scores do not count");
  assert.equal(O.cleanScore("30", 30), 30);
  assert.equal(O.cleanScore("31", 30), null);
  assert.equal(O.cleanScore("2.5", 30), null);
});

test("normalized landed cost per unit, VAT, member discount, quantity prices", async () => {
  const O = await load("src/lib/offers.ts");
  // Pack of 100 at 380, delivery 20 per pack, VAT included: 400 per pack, 4.00 per piece.
  assert.deepEqual(O.landedCost({ member_price: 380, shipping_per_unit: 20, base_qty: 100 }, "vat_inclusive"), { perSellUnit: 400, perBaseUnit: 4, perBaseUnitExact: 4 });
  // Bundle of 500 at 1,700 without VAT: 1,904 with VAT, 3.81 per piece.
  assert.equal(O.landedCost({ member_price: 1700, shipping_per_unit: 0, base_qty: 500 }, "vat_exclusive").perBaseUnit, 3.81);
  assert.equal(O.memberDiscount({ regular_price: 450, member_price: 380 }), 15.6);
  assert.equal(O.memberDiscount({ regular_price: null, member_price: 380 }), null);
  assert.equal(O.tierPrice({ member_price: 380, tiers: [{ min_qty: 50, price: 360 }, { min_qty: 100, price: 340 }] }, 60), 360);
  assert.equal(O.tierPrice({ member_price: 380, tiers: [{ min_qty: 50, price: 360 }] }, 10), 380);
  assert.deepEqual(O.parseTiers([{ min: "100", price: "340" }, { min: "50", price: "360" }, { min: "", price: "" }], 380), [{ min_qty: 50, price: 360 }, { min_qty: 100, price: 340 }]);
  assert.equal(O.parseTiers([{ min: "50", price: "400" }], 380), "bad", "tier above member price");
  assert.equal(O.parseTiers([{ min: "1", price: "300" }], 380), "bad", "tier from 1 unit");
  assert.equal(O.parseMoney("₱1,250.50"), 1250.5);
  assert.ok(Number.isNaN(O.parseMoney("12.345")));
  assert.equal(O.parseMoney(""), null);
});

test("side-by-side comparison of three offers: lowest per piece, suggested price score", async () => {
  const O = await load("src/lib/offers.ts");
  const it = (member_price, base_qty, shipping_per_unit = 0, regular_price = null) => ({ member_price, base_qty, shipping_per_unit, regular_price, base_unit: "piece", tiers: [] });
  const out = O.compareOffers([
    { id: "a", vat_basis: "vat_inclusive", items: [it(380, 100, 20, 450)] },      // 4.00 per piece
    { id: "b", vat_basis: "vat_exclusive", items: [it(1700, 500, 0, 2000)] },     // 3.808 per piece
    { id: "c", vat_basis: "non_vat", items: [it(240, 50, 10, 260)] },             // 5.00 per piece
  ]);
  const by = Object.fromEntries(out.map((r) => [r.id, r]));
  assert.equal(by.b.isBest.piece, true);
  assert.equal(by.a.isBest.piece, false);
  assert.equal(by.b.suggestedPriceScore, 30);
  assert.equal(by.a.suggestedPriceScore, 29);
  assert.equal(by.c.suggestedPriceScore, 23);
  assert.equal(by.a.lowest.piece, 4);
  assert.equal(by.c.avgDiscount, 7.7);
});

test("sending needs the basics, a product and a photo", async () => {
  const O = await load("src/lib/offers.ts");
  const full = { title: "Bags", product_group: "packaging", valid_until: "2027-01-31", vat_basis: "vat_inclusive", serviceable_areas: "QC", shipping_terms: "delivery_fee", lead_time_days: 5, sample_availability: "free", commission_pct: 0 };
  assert.deepEqual(O.offerMissing(full, 1, 1, "2026-11-22"), []);
  assert.deepEqual(O.offerMissing(full, 0, 0, "2026-11-22").map((m) => m.step), [2, 4]);
  assert.ok(O.offerMissing({ ...full, valid_until: "2026-11-01" }, 1, 1, "2026-11-22").some((m) => /passed/.test(m.what)));
  assert.ok(O.offerMissing({ ...full, commission_pct: null }, 1, 1, "2026-11-22").some((m) => m.step === 5), "commission 0 is fine, blank is not");
});

test("money notice in English and Taglish wherever a commission figure shows; never dismissible", async () => {
  const O = await load("src/lib/offers.ts");
  assert.match(O.MONEY_NOTICE.en, /No money passes through flameph\.org/);
  assert.match(O.MONEY_NOTICE.en, /MarketplacePH Online Store/);
  assert.match(O.MONEY_NOTICE.tl, /Walang perang dumadaan sa flameph\.org/);
  const notice = await read("src/components/PartnerMoneyNotice.tsx");
  assert.doesNotMatch(notice, /onClick|useState|<button/i);
  for (const p of ["src/app/partner-us/offers/[id]/page.tsx", "src/app/admin/partners/offers/[id]/page.tsx", "src/app/admin/partners/offers/compare/page.tsx"]) {
    const src = await read(p);
    assert.match(src, /commission_pct/, p);
    assert.match(src, /<PartnerMoneyNotice/, p);
  }
  // No payment, checkout or wallet anywhere in the offer pages.
  for (const p of ["src/app/partner-us/offers/actions.ts", "src/app/admin/partners/offers/actions.ts"]) assert.doesNotMatch(await read(p), /paymongo|checkout|wallet|payout\(/i, p);
});

test("national team only: offer pages and actions check the role; chapter roles have no way in", async () => {
  for (const p of ["src/app/admin/partners/offers/page.tsx", "src/app/admin/partners/offers/[id]/page.tsx", "src/app/admin/partners/offers/compare/page.tsx"]) {
    assert.match(await read(p), /adminContext\(\["super_admin", "admin", "national_reviewer"\]\)/, p);
  }
  const actions = await read("src/app/admin/partners/offers/actions.ts");
  assert.match(actions, /const NATIONAL = \["super_admin", "admin", "national_reviewer"\] as const;/);
  assert.match(actions, /nobody reviews their own offer/);
  assert.match(actions, /error=coi_first/);
  assert.match(await read("src/app/admin/layout.tsx"), /partnerNational && <li><Link[^>]*href="\/admin\/partners\/offers"/);
  // Offer files open through the logged viewer, for the national team.
  assert.match(await read("src/app/api/vetting/doc/[id]/route.ts"), /doc\.purpose !== "offer"/);
});

test("supplier pages: accredited suppliers only, five screens, More lists My Best Offers", async () => {
  const O = await load("src/lib/offers.ts");
  assert.equal(O.OFFER_STEPS.length, 5);
  const actions = await read("src/app/partner-us/offers/actions.ts");
  assert.match(actions, /error=not_supplier/);
  assert.match(actions, /\.eq\("user_id", user\.id\)/);
  assert.match(actions, /snapshot: \{ offer: full, items: items \?\? \[\] \}/);
  const more = JSON.parse(await read("src/content/more.json"));
  assert.ok(more.groups.flatMap((g) => g.items).some((i) => i.href === "/partner-us/offers"));
  assert.match(await read("src/lib/data-rights-server.ts"), /table: "supplier_offers"/);
});
