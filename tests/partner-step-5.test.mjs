// Partner accreditation, Step 5: chapter sample tests and member complaints (cases, fixes, penalties, sanctions).
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const toUrl = (js) => `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
const load = async (p) => import(toUrl(ts.transpileModule(await read(p), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText));
const SQL = () => read("supabase/migrations/0035_partner_samples_complaints.sql");
const TABLES = ["partner_sample_tests", "complaint_targets", "partner_complaints", "partner_complaint_events", "partner_corrective_actions", "partner_penalty_terms", "partner_penalties", "partner_sanctions"];

test("0035: row level security on every new table, no browser writes, team-only complaint columns hidden", async () => {
  const sql = await SQL();
  for (const t of TABLES) {
    assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security;`), t);
    assert.match(sql, new RegExp(`public\\.${t}[,\\s]`), t);
  }
  assert.match(sql, /public\.partner_corrective_actions, public\.partner_penalty_terms, public\.partner_penalties, public\.partner_sanctions from anon, authenticated;/);
  const policies = sql.match(/create policy[\s\S]*?;/g).join("\n");
  assert.doesNotMatch(policies, /for (insert|update|delete|all)/);
  assert.doesNotMatch(policies, /to anon/);
  // Members see their own complaints; partners only once sent; team notes are internal.
  assert.match(sql, /using \(public\.is_partner_reviewer\(\) or complainant_id = auth\.uid\(\) or \(partner_user_id = auth\.uid\(\) and status <> 'draft'\)\);/);
  assert.match(sql, /using \(public\.is_partner_reviewer\(\) or \(not internal and public\.complaint_party\(complaint_id\)\)\);/);
  const grant = sql.match(/grant select \([^)]*\) on public\.partner_complaints to authenticated;/)[0];
  assert.doesNotMatch(grant, /assigned_to|alerted_at|changed_by|change_note/);
  // Testers see only their own tests (and coordinators their chapter's); partners get results through a function without the tester.
  assert.match(sql, /using \(public\.is_partner_reviewer\(\) or tester_id = auth\.uid\(\) or public\.partner_coordinates\(chapter_id\)\);/);
  assert.match(sql, /revoke all on function public\.complaints_overdue\(\) from public, anon, authenticated;/);
});

test("0035: national team alone decides; chapters test and report", async () => {
  const sql = await SQL();
  assert.match(sql, /partner_sample: only chapter testers \(for their chapter\) and the national team record sample tests/);
  assert.match(sql, /partner_sample: nobody tests their own products/);
  assert.match(sql, /partner_sample: a national team member other than the tester reviews the test/);
  assert.match(sql, /partner_complaint: only the national team moves a complaint from % to %/);
  assert.match(sql, /partner_complaint: appeals are decided by the founder/);
  assert.match(sql, /partner_penalty: only the national team proposes penalties/);
  assert.match(sql, /partner_penalty: a second national team member approves/);
  assert.match(sql, /partner_sanction: a second national team member makes it active/);
  assert.match(sql, /partner_sanction: only the founder approves a termination/);
  assert.match(sql, /penalty_terms: a second national team member makes the terms active/);
});

test("0035: complaint workflow, consent, response targets and evidence", async () => {
  const sql = await SQL();
  assert.match(sql, /'draft', 'open', 'investigating', 'corrective_action', 'resolved', 'appealed', 'closed'/);
  for (const i of ["late", "missing", "damaged", "defective", "unsatisfactory_service", "safety", "other"]) assert.ok(sql.includes(`'${i}'`), i);
  assert.match(sql, /partner_complaint: consent is required to send/);
  assert.match(sql, /partner_complaint: appeals are allowed within 7 days of the resolution/);
  assert.match(sql, /partner_complaint: a closed complaint cannot be changed/);
  assert.match(sql, /append_only: partner_complaint_events rows cannot be changed/);
  assert.match(sql, /partner_complaint: due dates follow the response targets/);
  assert.match(sql, /'critical', 4, 3, true/);
  assert.match(sql, /'purpose', 'sample'|'sample', 'complaint'|purpose in \([^)]*'sample'[^)]*'complaint'/);
});

test("0035: penalties are proposals only, with partner response, legal review and money recorded only", async () => {
  const sql = await SQL();
  assert.match(sql, /partner_penalty: a late-delivery penalty needs the delay to be the partner/);
  assert.match(sql, /partner_penalty: record the legal review before approving/);
  assert.match(sql, /partner_penalty: wait for the partner/);
  assert.match(sql, /partner_penalty: finance records the settlement made by MarketplacePH Online Store/);
  assert.match(sql, /least\(/);
  assert.doesNotMatch(sql, /paymongo|gcash|bank_account|wallet/i);
  assert.match(sql, /partner_sanction: a termination is final/);
  const undo = await read("supabase/rollback/0035_partner_samples_complaints_undo.sql");
  assert.match(undo, /drop table if exists public\.partner_complaints/);
});

test("late penalty: 0.5% of the delayed value per day, capped at 5%", async () => {
  const C = await load("src/lib/partner-cases.ts");
  assert.equal(C.latePenalty(9000, 0.5, 4, 5), 180);
  assert.equal(C.latePenalty(100000, 0.5, 30, 5), 5000);
  assert.equal(C.latePenalty(10000, 0.3, 4, 3), 120);
  assert.equal(C.latePenalty(1, 0.5, 1, 5), 0.01);
  assert.deepEqual(C.DEFAULT_TERMS, { ratePerDay: 0.5, capPct: 5 });
  assert.equal(C.parseAmount("₱9,000.50"), 9000.5);
  assert.ok(Number.isNaN(C.parseAmount("abc")));
  assert.equal(C.parseAmount(""), null);
});

test("complaint helpers: missing fields, overdue, appeal window, severity", async () => {
  const C = await load("src/lib/partner-cases.ts");
  assert.deepEqual(C.complaintMissing({ order_reference: "X", issue: "late", description: "d", desired_remedy: "refund", remedy_note: null }), []);
  assert.ok(C.complaintMissing({ order_reference: "", issue: null, description: "", desired_remedy: "other", remedy_note: null }).length >= 4);
  const now = Date.parse("2026-11-23T00:00:00Z");
  assert.equal(C.overdue({ status: "open", first_response_due_at: "2026-11-22T00:00:00Z", resolve_due_at: "2026-12-01T00:00:00Z" }, now), "first_response");
  assert.equal(C.overdue({ status: "investigating", first_response_due_at: "2026-11-22T00:00:00Z", resolve_due_at: "2026-11-22T12:00:00Z" }, now), "resolution");
  assert.equal(C.overdue({ status: "resolved", first_response_due_at: "2026-11-01T00:00:00Z", resolve_due_at: "2026-11-02T00:00:00Z" }, now), null);
  assert.equal(C.canAppeal({ status: "resolved", resolved_at: "2026-11-20T00:00:00Z", appealed_at: null }, now), true);
  assert.equal(C.canAppeal({ status: "resolved", resolved_at: "2026-11-10T00:00:00Z", appealed_at: null }, now), false);
  assert.equal(C.canAppeal({ status: "resolved", resolved_at: "2026-11-20T00:00:00Z", appealed_at: "2026-11-21T00:00:00Z" }, now), false);
  assert.equal(C.defaultSeverity("safety"), "critical");
  for (const k of ["late", "missing", "damaged", "defective", "unsatisfactory_service", "safety", "other"]) assert.ok(C.ISSUES[k]?.label && C.ISSUES[k]?.fil, k);
  assert.equal(C.sampleTotal(25).includes("25"), true);
  assert.equal(C.SAMPLE_SCORES.length, 5);
});

test("pages exist, show the money notice next to amounts, and are linked", async () => {
  for (const p of [
    "src/app/partner-us/complaints/page.tsx", "src/app/partner-us/complaints/new/page.tsx", "src/app/partner-us/complaints/[id]/page.tsx",
    "src/app/partner-us/samples/page.tsx", "src/app/partner-us/samples/[id]/page.tsx",
    "src/app/admin/partners/complaints/page.tsx", "src/app/admin/partners/complaints/[id]/page.tsx", "src/app/admin/partners/complaints/settings/page.tsx",
    "src/app/admin/partners/penalties/page.tsx", "src/app/admin/partners/sanctions/page.tsx",
    "src/app/admin/partners/samples/page.tsx", "src/app/admin/partners/samples/[id]/page.tsx", "src/app/api/cron/partner-cases/route.ts",
  ]) await access(new URL(`../${p}`, import.meta.url));
  for (const p of ["src/app/partner-us/complaints/page.tsx", "src/app/partner-us/complaints/[id]/page.tsx", "src/app/admin/partners/complaints/[id]/page.tsx", "src/app/admin/partners/penalties/page.tsx", "src/app/admin/partners/complaints/settings/page.tsx"]) {
    assert.match(await read(p), /<PartnerMoneyNotice/, p);
  }
  const more = await read("src/content/more.json");
  assert.match(more, /"\/partner-us\/complaints"/);
  assert.match(more, /"\/partner-us\/samples"/);
  const layout = await read("src/app/admin/layout.tsx");
  for (const h of ["/admin/partners/samples", "/admin/partners/complaints", "/admin/partners/penalties", "/admin/partners/sanctions"]) assert.ok(layout.includes(h), h);
  const vercel = JSON.parse(await read("vercel.json"));
  assert.ok(vercel.crons.some((c) => c.path === "/api/cron/partner-cases"));
  const cron = await read("src/app/api/cron/partner-cases/route.ts");
  assert.match(cron, /Bearer \$\{secret\}/);
  const doc = await read("src/app/api/vetting/doc/[id]/route.ts");
  assert.match(doc, /doc\.purpose === "complaint"/);
  assert.match(doc, /vetting_access_log/);
  const rights = await read("src/lib/data-rights-server.ts");
  for (const t of ["partner_complaints", "partner_sample_tests", "partner_penalties", "partner_sanctions"]) assert.ok(rights.includes(`table: "${t}"`), t);
});

test("testers never see prices; partners never see who tested", async () => {
  const sql = await SQL();
  const targets = sql.match(/create or replace function public\.partner_sample_targets\(\)[\s\S]*?\$\$;/)[0];
  assert.doesNotMatch(targets, /price|commission/i);
  const results = sql.match(/create or replace function public\.my_sample_results\(\)[\s\S]*?\$\$;/)[0];
  assert.doesNotMatch(results.split("as $$")[1], /tester_id|chapter_id/);
  const page = await read("src/app/partner-us/samples/page.tsx");
  assert.doesNotMatch(page, /member_price|regular_price|commission_pct/);
});
