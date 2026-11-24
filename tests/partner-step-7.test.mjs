// Partner accreditation, Step 7: Toll Manufacturer / FLAME Signature (/partner-us/offers with kind 'manufacturer',
// /partner-us/signature, Admin > Partners > FLAME Signature offers, licences and batches).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const toUrl = (js) => `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
const compile = async (p) => ts.transpileModule(await read(p), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
// signature.ts imports ./offers: inline it so the module loads on its own.
const loadSig = async () => {
  const offers = toUrl(await compile("src/lib/offers.ts"));
  return import(toUrl((await compile("src/lib/signature.ts")).replace(/from "\.\/offers"/g, `from "${offers}"`)));
};
const SQL = () => read("supabase/migrations/0037_signature_manufacturing.sql");
const code = (sql) => sql.replace(/--.*$/gm, "");

test("0037: extends the shared offer table, nothing dropped or renamed, every new table has row level security", async () => {
  const sql = await SQL();
  // REUSE: the same offer table (kind 'manufacturer'), history, conflicts, scores, territories, samples and files.
  assert.match(sql, /kind in \('supplier', 'service', 'manufacturer'\)/);
  assert.doesNotMatch(sql, /create table if not exists public\.(signature_offers|manufacturer_offers|toll_offers)\b/);
  assert.doesNotMatch(code(sql), /drop table|drop column|rename/i);
  for (const t of ["signature_sites", "signature_products", "signature_reviews", "signature_licences", "signature_batches", "signature_history"]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${t} \\(`), t);
    assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security;`), t);
  }
  const policies = sql.match(/create policy[\s\S]*?;/g).join("\n");
  assert.doesNotMatch(policies, /chapter_tester|chapter_coordinator|finance/);
  assert.doesNotMatch(policies, /for (insert|update|delete|all)/);   // no browser writes
  // The licence's team-only note is not readable by the manufacturer.
  const grant = sql.match(/grant select \(id, ref_no[^;]*on public\.signature_licences to authenticated;/)[0];
  assert.doesNotMatch(grant, /internal_note/);
  const undo = await read("supabase/rollback/0037_signature_manufacturing_undo.sql");
  assert.match(undo, /drop table if exists public\.signature_batches/);
  assert.match(undo, /raise exception/);   // refuses while FLAME Signature data exists
});

test("0037: the spec's rules are enforced in the database", async () => {
  const sql = await SQL();
  // Accredited toll manufacturers only; sites with FDA License to Operate; products need a site.
  assert.match(sql, /'toll_manufacturer' = any\(p\.categories\)/);
  assert.match(sql, /lto_no/);
  // Regulatory AND legal review of this version must clear before choosing; products approved only after regulatory.
  assert.match(sql, /signature_cleared\(/);
  assert.match(sql, /the regulatory review of this version must clear the proposal before a product is approved/);
  assert.match(sql, /array\['lto_valid', 'product_registration', 'labeling', 'gmp_haccp', 'testing', 'traceability', 'recall'\]/);
  assert.match(sql, /array\['formula_ownership', 'ip_license', 'trademark_scope', 'confidentiality', 'liability', 'territory_rights'\]/);
  assert.match(sql, /constraint signature_reviews_cleared check \(outcome <> 'cleared' or checklist @> public\.signature_review_items\(review_type\)\)/);
  // Separate manufacturing vs distribution rights; plants inside the manufacturing rights.
  assert.match(sql, /mfg_appointment_ids uuid\[\]/);
  assert.match(sql, /dist_appointment_ids uuid\[\]/);
  assert.match(sql, /a\.rights = 'manufacturing'/);
  assert.match(sql, /a\.rights = 'distribution'/);
  assert.match(sql, /these sites are outside the manufacturing rights/);
  // Trademark only on approved SKUs, in licensed territories, while active.
  assert.match(sql, /create or replace function public\.signature_mark_allowed\(prod uuid, area text default null, d date default current_date\)/);
  assert.match(sql, /every product must be an approved product of this proposal/);
  // Batches: production needs a licence, expiry within shelf life, release by the national team only, recall final.
  assert.match(sql, /a production batch under the FLAME Signature mark needs an active licence/);
  assert.match(sql, /beyond the product''s shelf life/);
  assert.match(sql, /only the national team releases, holds, rejects or recalls a batch, never their own/);
  assert.match(sql, /constraint signature_batches_released check \(status not in \('released', 'recalled'\) or batch_type = 'production'\)/);
  // Files: batch purpose for certificates of analysis, retention by expiry.
  assert.match(sql, /purpose = 'batch' and doc_type in \('coa', 'lab_report', 'batch_photo', 'other'\)/);
  // History is append-only.
  assert.match(sql, /history cannot be deleted/);
});

test("same five score parts and pass mark as supplier offers, with FLAME Signature labels", async () => {
  const S = await loadSig();
  const O = await import(toUrl(await compile("src/lib/offers.ts")));
  assert.deepEqual(Object.keys(S.SIGNATURE_SCORE_LABELS), O.SCORE_KEYS);
  assert.equal(S.SIGNATURE_STEPS.length, O.OFFER_STEPS.length);
  assert.match(S.SIGNATURE_SCORE_LABELS.compliance_reliability.label, /regulatory/i);
});

test("review checklists match the database, and a review clears only with every item ticked", async () => {
  const S = await loadSig();
  const sql = await SQL();
  for (const t of ["regulatory", "legal"]) {
    const db = sql.match(new RegExp(`when '${t}' then array\\[([^\\]]+)\\]`))[1].split(",").map((x) => x.trim().replace(/'/g, ""));
    assert.deepEqual(S.reviewKeys(t), db, t);
    assert.equal(S.canClear(t, db), true);
    assert.equal(S.canClear(t, db.slice(1)), false);
  }
  const rows = [
    { revision: 1, review_type: "regulatory", outcome: "cleared", created_at: "2026-11-20T01:00:00Z" },
    { revision: 2, review_type: "regulatory", outcome: "not_cleared", created_at: "2026-11-21T01:00:00Z" },
    { revision: 2, review_type: "regulatory", outcome: "cleared", created_at: "2026-11-22T01:00:00Z" },
    { revision: 2, review_type: "legal", outcome: "cleared", created_at: "2026-11-22T02:00:00Z" },
  ];
  assert.deepEqual(S.reviewState(rows, 2), { regulatory: "cleared", legal: "cleared", cleared: true });
  assert.deepEqual(S.reviewState(rows, 1), { regulatory: "cleared", legal: null, cleared: false });
  assert.equal(S.reviewState([...rows, { revision: 2, review_type: "legal", outcome: "not_cleared", created_at: "2026-11-23T00:00:00Z" }], 2).cleared, false);
});

test("comparison per 100 g or ml with VAT, and the shelf-life limit on batch expiry", async () => {
  const S = await loadSig();
  assert.deepEqual(S.per100({ toll_price: 25, net_content: "250 g" }, "non_vat"), { value: 10, unit: "g" });
  assert.deepEqual(S.per100({ toll_price: 50, net_content: "1 L" }, "vat_exclusive"), { value: 5.6, unit: "ml" });
  assert.equal(S.per100({ toll_price: 50, net_content: "12 pcs" }, "non_vat"), null);
  const [a, b] = S.compareSignature([
    { id: "a", vat_basis: "non_vat", products: [{ product_type: "food", toll_price: 25, net_content: "250 g" }] },
    { id: "b", vat_basis: "non_vat", products: [{ product_type: "food", toll_price: 30, net_content: "200 g" }] },
  ]);
  assert.equal(a.isBest["food:g"], true);
  assert.equal(a.suggestedPriceScore, 30);
  assert.equal(b.suggestedPriceScore, 20);   // 30 * 10 / 15
  assert.equal(S.maxExpiry("2026-01-31", 1), "2026-02-28");
  assert.equal(S.maxExpiry("2026-03-15", 12), "2027-03-15");
  assert.ok(S.LOT_RE.test("L-2026/11.05"));
  assert.ok(!S.LOT_RE.test("-bad"));
  const sql = await SQL();
  assert.match(sql, new RegExp(S.LOT_RE.source.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&").slice(0, 10)));
});

test("what is missing before sending: plants, products with a plant, current FDA licence where needed, recall plan", async () => {
  const S = await loadSig();
  const blank = Object.fromEntries(["title", "signature_category", "formulation_ownership", "rnd_support", "valid_until", "vat_basis", "serviceable_areas", "lead_time_days",
    "packaging_supply", "sample_availability", "qc_testing", "traceability", "batch_record_years", "recall_plan", "recall_contact", "commission_pct"].map((k) => [k, null]));
  const all = S.signatureMissing(blank, [], [], "2026-11-24");
  assert.ok(all.some((m) => /At least one manufacturing site/.test(m.what)));
  assert.ok(all.some((m) => /Recall plan/.test(m.what)));
  const full = { ...blank, title: "Sauces", signature_category: "sauces_condiments", formulation_ownership: "flame", rnd_support: true, valid_until: "2027-03-01",
    vat_basis: "non_vat", serviceable_areas: "Luzon", lead_time_days: 14, packaging_supply: "manufacturer", sample_availability: "free", qc_testing: "Each batch",
    traceability: "Lot codes", batch_record_years: 3, recall_plan: "Written plan", recall_contact: "QA head", commission_pct: 8 };
  const site = { id: "s1", site_name: "Plant 1", lto_no: "LTO-1", lto_valid_until: "2027-01-01" };
  const prod = { product_name: "Chili garlic", site_id: "s1", fda_needed: true };
  assert.deepEqual(S.signatureMissing(full, [site], [prod], "2026-11-24"), []);
  assert.ok(S.signatureMissing(full, [{ ...site, lto_no: null, lto_valid_until: null }], [prod], "2026-11-24").some((m) => /FDA License to Operate/.test(m.what)));
  assert.ok(S.signatureMissing(full, [{ ...site, lto_valid_until: "2026-11-01" }], [prod], "2026-11-24").some((m) => /expired/.test(m.what)));
  assert.ok(S.signatureMissing(full, [site], [{ ...prod, site_id: null }], "2026-11-24").some((m) => /choose where it is made/.test(m.what)));
});

test("pages: proposals in My Best Offers, FLAME Signature desk, admin review with both reviews, licences and batches", async () => {
  const actions = await read("src/app/partner-us/offers/actions.ts");
  assert.match(actions, /error=not_manufacturer/);
  assert.match(actions, /manufacturer: "toll_manufacturer"/);
  const list = await read("src/app/partner-us/offers/page.tsx");
  assert.match(list, /name="kind" value="manufacturer"/);
  for (const f of ["saveSignatureStep", "saveSite", "deleteSite", "saveSigProduct", "deleteSigProduct"]) {
    assert.match(await read("src/app/partner-us/offers/signature-actions.ts"), new RegExp(`export async function ${f}\\(`), f);
  }
  const batches = await read("src/app/partner-us/signature/actions.ts");
  for (const f of ["saveBatch", "deleteBatch", "uploadBatchFile", "deleteBatchFile"]) assert.match(batches, new RegExp(`export async function ${f}\\(`), f);
  assert.match(batches, /purpose: "batch", batch_id: b\.id/);
  const admin = await read("src/app/admin/partners/offers/actions.ts");
  assert.match(admin, /export async function saveSignatureReview\(/);
  assert.match(admin, /export async function decideProduct\(/);
  assert.match(admin, /error=reviews/);
  const sig = await read("src/app/admin/partners/signature/actions.ts");
  for (const f of ["createLicence", "saveLicence", "licenceStatus", "batchStatus", "signatureNote"]) assert.match(sig, new RegExp(`export async function ${f}\\(`), f);
  assert.match(await read("src/app/admin/partners/offers/compare/page.tsx"), /<SignatureCompare/);
  const tabs = await read("src/components/admin/PartnerTabs.tsx");
  assert.match(tabs, /\/admin\/partners\/offers\?kind=manufacturer/);
  assert.match(tabs, /\/admin\/partners\/signature"/);
  assert.match(await read("src/app/api/vetting/doc/[id]/route.ts"), /doc\.purpose !== "batch"/);
  const more = JSON.parse(await read("src/content/more.json"));
  assert.ok(more.groups.flatMap((g) => g.items).some((i) => i.href === "/partner-us/signature"));
  const rights = await read("src/lib/data-rights-server.ts");
  assert.match(rights, /signature_products\(product_name/);
  assert.match(rights, /table: "signature_batches"/);
  // Sample testers can pick FLAME Signature products, and the test keeps the proposal.
  assert.match(await read("src/app/partner-us/samples/actions.ts"), /sameSignature/);
  // Every screen with a commission figure shows the money notice.
  for (const p of ["src/app/partner-us/offers/[id]/SignatureOffer.tsx", "src/app/admin/partners/offers/[id]/SignatureSections.tsx", "src/app/admin/partners/offers/compare/SignatureCompare.tsx"]) {
    assert.match(await read(p), /<PartnerMoneyNotice/, p);
  }
});
