// Partner accreditation, Step 4: commission rates and ledger (Admin > Partners > Commissions, /partner-us/commissions).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const toUrl = (js) => `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
const load = async (p) => import(toUrl(ts.transpileModule(await read(p), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText));
const SQL = () => read("supabase/migrations/0034_partner_commissions.sql");

test("0034: row level security on every new table, no browser writes, testers and coordinators see no ledger", async () => {
  const sql = await SQL();
  const tables = ["commission_rules", "commission_entries", "commission_lines", "commission_payouts", "commission_history"];
  for (const t of tables) {
    assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security;`), t);
    assert.match(sql, new RegExp(`revoke all on public\\.${t} from anon, authenticated;`), t);
  }
  const policies = sql.match(/create policy[\s\S]*?;/g).join("\n");
  assert.doesNotMatch(policies, /chapter_tester|chapter_coordinator/);
  assert.doesNotMatch(policies, /for (insert|update|delete|all)/);
  assert.match(sql, /using \(public\.is_commission_desk\(\) or \(partner_user_id = auth\.uid\(\) and status = 'approved'\)\);/);
  assert.match(sql, /create policy commission_payouts_read on public\.commission_payouts for select to authenticated using \(public\.is_commission_desk\(\)\);/);
  // Team notes, approvers and payout links are not granted to partners.
  for (const t of ["commission_rules", "commission_entries", "commission_lines"]) {
    const grant = sql.match(new RegExp(`grant select \\([^)]*\\)\\s*on public\\.${t} to authenticated;`))[0];
    assert.doesNotMatch(grant, /internal_note|approved_by|recorded_by|payout_id/, t);
  }
  for (const f of ["commission_reconcile(date, date)", "commission_balances(date, date)", "commission_rule_for(uuid, text, uuid, date)", "commission_is_finance(uuid)"]) {
    assert.ok(sql.includes(`revoke all on function public.${f} from public, anon, authenticated;`), f);
  }
});

test("0034: money rule, two-person approvals, database-written lines, append-only history", async () => {
  const sql = await SQL();
  assert.match(sql, /A RECORD ONLY/);
  assert.match(sql, /flameph\.org never collects, holds, pays out or moves money/);
  assert.doesNotMatch(sql, /paymongo|gcash|bank_account|wallet/i);
  assert.match(sql, /x\.role in \('super_admin', 'finance'\)/);
  assert.match(sql, /commission_rule: a second person approves \(not the one who wrote it\)/);
  assert.match(sql, /commission_entry: a second person approves \(not the one who recorded it\)/);
  assert.match(sql, /commission_payout: a second person approves \(not the one who prepared it\)/);
  assert.match(sql, /only collected sales count/);
  assert.match(sql, /commission_line: lines are written only by the database when an entry is approved/);
  assert.match(sql, /refunds would be more than the sale''s net amount/);
  assert.match(sql, /the buyer is an excluded account in this territory/);
  assert.match(sql, /the place of delivery is outside the territory/);
  assert.match(sql, /give the MarketplacePH Online Store payment reference/);
  assert.match(sql, /append_only: commission_history rows cannot be changed/);
  assert.match(sql, /a default rate is never left empty/);
  // The seeded defaults are the program's targets.
  assert.match(sql, /\('default', 'supplier', 1\.00, 1\.00, 1\.00, 2\.00\), \('default', 'service_provider', 3\.00, 2\.00, 3\.00, 4\.00\), \('default', 'toll_manufacturer', 2\.00, 1\.00, 2\.00, 3\.00\)/);
  const undo = await read("supabase/rollback/0034_partner_commissions_undo.sql");
  assert.match(undo, /drop table if exists public\.commission_entries;/);
  assert.match(undo, /commission records exist; keep 0034/);
});

test("default targets: supplier 5%, service provider 12%, toll manufacturer 8%", async () => {
  const C = await load("src/lib/commission.ts");
  assert.equal(C.totalPct(C.DEFAULT_TARGETS.supplier), 5);
  assert.equal(C.totalPct(C.DEFAULT_TARGETS.service_provider), 12);
  assert.equal(C.totalPct(C.DEFAULT_TARGETS.toll_manufacturer), 8);
  assert.deepEqual(Object.values(C.DEFAULT_TARGETS.service_provider), [3, 2, 3, 4]);
});

test("simulation matches the database ledger to the centavo, refunds reverse exactly", async () => {
  const C = await load("src/lib/commission.ts");
  const s = C.splitCommission(90000, C.DEFAULT_TARGETS.supplier);
  assert.equal(s.total, 4500);
  assert.deepEqual(s.lines.map((l) => l.amount), [900, 900, 900, 1800]);
  // Same as the database test: net 333.33 at 5% -> 16.67, the city line takes the rounding.
  const r = C.splitCommission(333.33, C.DEFAULT_TARGETS.supplier);
  assert.equal(r.total, 16.67);
  assert.deepEqual(r.lines.map((l) => l.amount), [3.33, 3.33, 3.33, 6.68]);
  // A refund of 30,000 on the 5% sale: -1,500 split -300, -300, -300, -600 (database test 6).
  const back = C.splitCommission(-30000, C.DEFAULT_TARGETS.supplier);
  assert.deepEqual(back.lines.map((l) => l.amount), [-300, -300, -300, -600]);
  // Rounding half away from zero, like PostgreSQL round(numeric, 2), also for negatives.
  assert.equal(C.splitCommission(0.1, { national_pct: 0, regional_pct: 0, provincial_pct: 0, city_pct: 5 }).total, 0.01);
  assert.equal(C.splitCommission(-0.1, { national_pct: 0, regional_pct: 0, provincial_pct: 0, city_pct: 5 }).total, -0.01);
  // Lines always add up, for many amounts and rates.
  for (const net of [1, 7.77, 999.99, 12345.67, 100000000]) for (const k of ["supplier", "service_provider", "toll_manufacturer"]) {
    const x = C.splitCommission(net, C.DEFAULT_TARGETS[k]);
    assert.equal(Math.round(x.lines.reduce((n, l) => n + l.amount, 0) * 100), Math.round(x.total * 100), `${net} ${k}`);
  }
  // Payout of 1,003.33 with 10% withholding (database test 7): 100.33 kept, 903.00 sent.
  assert.deepEqual(C.withholding(1003.33, 10), { withholding: 100.33, net: 903 });
});

test("forms: money, percent and CSV cells are safe", async () => {
  const C = await load("src/lib/commission.ts");
  assert.equal(C.parseMoney("₱12,500.50"), 12500.5);
  assert.equal(C.parseMoney(""), null);
  assert.equal(C.parseMoney("12.345"), undefined);
  assert.equal(C.parseMoney("-5"), undefined);
  assert.equal(C.parsePct("0.5"), 0.5);
  assert.equal(C.parsePct("31"), undefined);
  assert.equal(C.parsePct(""), 0);
  assert.equal(C.csvCell("=HYPERLINK(1)"), "'=HYPERLINK(1)");
  assert.equal(C.csvCell("-300.00"), "-300.00");
  assert.equal(C.csvCell('A "B", C'), '"A ""B"", C"');
  assert.equal(C.dbReason("commission_entry: only collected sales count; add the date"), "only collected sales count; add the date");
  assert.equal(C.levelOfKey("province:0305400000"), "provincial");
});

test("screens: money notice on every commission page, finance-only actions, partner page in More", async () => {
  const pages = [
    "src/app/admin/partners/commissions/page.tsx", "src/app/admin/partners/commissions/new/page.tsx", "src/app/admin/partners/commissions/[id]/page.tsx",
    "src/app/admin/partners/commissions/payouts/page.tsx", "src/app/admin/partners/commissions/payouts/[id]/page.tsx", "src/app/admin/partners/commissions/reconcile/page.tsx",
    "src/app/admin/partners/commissions/rules/page.tsx", "src/app/admin/partners/commissions/rules/[id]/page.tsx", "src/app/admin/partners/commissions/simulate/page.tsx",
  ];
  for (const p of pages) assert.match(await read(p), /<CommissionTabs /, p);
  assert.match(await read("src/components/admin/CommissionTabs.tsx"), /<PartnerMoneyNotice compact \/>/);
  const partner = await read("src/app/partner-us/commissions/page.tsx");
  assert.match(partner, /<PartnerMoneyNotice \/>/);
  assert.doesNotMatch(partner, /createAdminClient|internal_note|payout/);
  const actions = await read("src/app/admin/partners/commissions/actions.ts");
  assert.match(actions, /const FINANCE = \["super_admin", "finance"\] as const;/);
  assert.match(actions, /const NATIONAL = \["super_admin", "admin", "national_reviewer"\] as const;/);
  for (const fn of ["recordEntry", "approveEntry", "preparePayout", "movePayout"]) {
    assert.match(actions, new RegExp(`export async function ${fn}[\\s\\S]{0,400}adminContext\\(\\[\\.\\.\\.FINANCE\\]\\)|async function load(Entry|Payout)[\\s\\S]{0,120}FINANCE`), fn);
  }
  assert.doesNotMatch(actions, /fetch\(|paymongo|transfer\(/i);
  const more = JSON.parse(await read("src/content/more.json"));
  assert.ok(more.groups.flatMap((g) => g.items).some((i) => i.href === "/partner-us/commissions"));
  const tabs = await read("src/components/admin/PartnerTabs.tsx");
  assert.match(tabs, /\["commissions", "Commissions", "\/admin\/partners\/commissions"\]/);
  const layout = await read("src/app/admin/layout.tsx");
  assert.match(layout, /commissionDesk && <li><Link[^>]*href="\/admin\/partners\/commissions">Commissions<\/Link><\/li>/);
  // Finance never sees partner applications or documents.
  assert.match(await read("src/app/admin/partners/page.tsx"), /ctx\.roles\.includes\("finance"\)\) redirect\("\/admin\/partners\/commissions"\)/);
});
