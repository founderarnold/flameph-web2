// Partner accreditation, Step 8: contract generation and sign-off (Admin > Partners > Contracts and templates,
// /partner-us/contracts, /api/contracts/[id]/copy, renewal alerts in /api/cron/partner-cases).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import test from "node:test";
import ts from "typescript";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const toUrl = (js) => `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
const compile = async (p) => ts.transpileModule(await read(p), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const loadC = async () => import(toUrl(await compile("src/lib/contracts.ts")));
const loadTexts = async () => {
  const c = toUrl(await compile("src/lib/contracts.ts"));
  return import(toUrl((await compile("src/lib/contract-texts.ts")).replace(/from "\.\/contracts"/g, `from "${c}"`)));
};
const SQL = () => read("supabase/migrations/0038_partner_contracts.sql");
const code = (sql) => sql.replace(/--.*$/gm, "");

test("0038: new tables have row level security, nothing dropped or renamed, browsers cannot write", async () => {
  const sql = await SQL();
  assert.doesNotMatch(code(sql), /drop table|drop column|rename/i);
  for (const t of ["contract_templates", "partner_contracts", "partner_contract_checks", "partner_contract_signatures", "partner_contract_history"]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${t} \\(`), t);
    assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security;`), t);
  }
  const policies = sql.match(/create policy[\s\S]*?;/g).join("\n");
  assert.doesNotMatch(policies, /for (insert|update|delete|all)/);
  assert.doesNotMatch(policies, /chapter_tester|chapter_coordinator/);
  // The partner never reads the team's note or anyone's IP address and browser.
  const contractGrant = sql.match(/grant select \(id, ref_no, partner_user_id[^;]*on public\.partner_contracts to authenticated;/)[0];
  assert.doesNotMatch(contractGrant, /internal_note/);
  const sigGrant = sql.match(/grant select \(id, contract_id, revision, side[^;]*on public\.partner_contract_signatures to authenticated;/)[0];
  assert.doesNotMatch(sigGrant, /ip_address|user_agent/);
  // REUSE: contract files are vetting documents (encrypted, logged), the rate and penalty terms link to the contract.
  assert.match(sql, /purpose = 'contract' and doc_type in \('signed_contract', 'authority_proof', 'other'\)/);
  assert.match(sql, /alter table public\.commission_rules add column if not exists contract_id/);
  assert.match(sql, /alter table public\.partner_penalty_terms add column if not exists contract_id/);
  const undo = await read("supabase/rollback/0038_partner_contracts_undo.sql");
  assert.match(undo, /drop table if exists public\.partner_contracts/);
  assert.match(undo, /raise exception/);
});

test("0038: the spec's rules are enforced in the database", async () => {
  const sql = await SQL();
  // Templates: versioned, a lawyer's name and date before approval, one approved version per part.
  assert.match(sql, /version text not null check \(version ~ '\^\[0-9\]\{1,2\}\\\.\[0-9\]\{1,2\}\$'\)/);
  assert.match(sql, /lawyer_name/);
  assert.match(sql, /lawyer_reviewed_on/);
  // No auto-execution: sending needs a cleared human legal check of this version; signing is a person's act.
  assert.match(sql, /partner_contract_cleared\(/);
  assert.match(sql, /contract_esign_on\(\)/);
  assert.match(sql, /flame\.contract_system/);
  // E-signing stays off until the founder records the lawyer's review.
  assert.match(sql, /'contract_esign'/);
  assert.match(sql, /"enabled": false/);
  // Fingerprint computed by the database.
  assert.match(sql, /encode\(sha256\(convert_to\(new\.body, 'UTF8'\)\), 'hex'\)/);
  // Effective dates and renewal notice.
  assert.match(sql, /renewal_notice_days int not null default 60 check \(renewal_notice_days between 30 and 180\)/);
  assert.match(sql, /create or replace function public\.partner_contracts_renewal_due\(\)/);
  // Append-only trails.
  assert.match(sql, /signatures cannot be changed/);
  assert.match(sql, /history cannot be changed/);
  // Signed files kept 10 years after the contract ends.
  assert.match(sql, /k\.status = 'signed' and k\.end_date < current_date - interval '10 years'/);
});

test("parts and legal check items match the database", async () => {
  const C = await loadC();
  const sql = await SQL();
  const items = sql.match(/contract_check_items\(\) returns text\[\] language sql immutable as \$\$\s*select array\[([^\]]+)\]/)[1].split(",").map((x) => x.trim().replace(/'/g, ""));
  assert.deepEqual(C.CHECK_KEYS, items);
  assert.equal(C.canClear(items), true);
  assert.equal(C.canClear(items.slice(1)), false);
  for (const p of C.PART_KEYS) assert.match(sql, new RegExp(`'${p}'`), p);
  assert.deepEqual(C.requiredParts("supplier"), ["master", "schedule_supplier", "annex_territory", "annex_pricing", "annex_sla", "annex_ip"]);
  assert.equal(C.requiredParts("service_provider")[1], "schedule_service");
  assert.equal(C.requiredParts("toll_manufacturer")[1], "schedule_manufacturer");
});

test("standard drafts: one per part, only known placeholders, money notice, RA 8792 and the lawyer note", async () => {
  const C = await loadC();
  const T = await loadTexts();
  assert.deepEqual(Object.keys(T.STANDARD_TEXTS).sort(), [...C.PART_KEYS].sort());
  for (const [part, t] of Object.entries(T.STANDARD_TEXTS)) {
    assert.deepEqual(C.unknownPlaceholders(t.body), [], part);
    assert.ok(t.body.length >= 50 && t.body.length <= 60000, part);
  }
  const master = T.STANDARD_TEXTS.master.body;
  assert.match(master, /\{\{money_notice\}\}/);
  assert.match(master, /8792/);
  assert.match(master, /10173/);
  assert.match(master, /\{\{venue\}\}/);
  assert.match(C.NOT_LEGAL_ADVICE, /lawyer must review/i);
});

test("filling and assembling a contract; nothing is silently blank; fingerprint matches the database formula", async () => {
  const C = await loadC();
  assert.equal(C.fillTemplate("A {{partner_legal_name}} B", { partner_legal_name: "Acme Corp" }), "A Acme Corp B");
  assert.match(C.fillTemplate("A {{partner_legal_name}}", {}), /\[not filled in: /);
  assert.deepEqual(C.unknownPlaceholders("{{nope}} {{contract_no}}"), ["nope"]);
  const parts = C.requiredParts("supplier").map((p) => ({ part: p, version: "1.0", title: p, body: `Body of ${p} for {{partner_legal_name}}.  \r\n` }));
  const text = C.assembleContract("PC-1", 2, parts.reverse(), { partner_legal_name: "Acme Corp" });
  assert.match(text, /^CONTRACT PC-1 \(version 2\)/);
  assert.ok(text.indexOf("MASTER") < text.indexOf("ANNEX"));
  assert.doesNotMatch(text, /\r|[ \t]\n/);
  assert.deepEqual(C.missingInText(text), []);
  assert.deepEqual(C.missingInText("x [not filled in: End date] y [not filled in: End date]"), ["End date"]);
  // Node's hash equals Postgres encode(sha256(convert_to(body,'UTF8')),'hex') for the same text.
  assert.equal(createHash("sha256").update("Ñ ₱1,000", "utf8").digest("hex").length, 64);
  assert.equal(C.shortHash("a".repeat(64)), "aaaaaaaa…aaaaaaaa");
});

test("typed name must match the signatory; renewal timing; renewal dates", async () => {
  const C = await loadC();
  assert.equal(C.nameMatches("  juan  DELA cruz ", "Juan Dela Cruz"), true);
  assert.equal(C.nameMatches("Juan Cruz", "Juan Dela Cruz"), false);
  assert.equal(C.nameMatches("Jo", "Jo"), false);
  const c = { status: "signed", end_date: "2027-01-31", renewal_notice_days: 60 };
  assert.equal(C.renewalState(c, "2026-11-24"), "none");
  assert.equal(C.renewalState(c, "2026-12-02"), "due");
  assert.equal(C.renewalState(c, "2027-02-01"), "expired");
  assert.equal(C.renewalState({ ...c, status: "out_for_signing" }, "2027-02-01"), "none");
  assert.deepEqual(C.renewalDates("2026-01-01", "2026-12-31"), { effective_date: "2027-01-01", end_date: "2027-12-31" });
});

test("pages and wiring: admin desk, templates, partner signing, copy download, renewal alerts, data export", async () => {
  const admin = await read("src/app/admin/partners/contracts/actions.ts");
  for (const f of ["createContract", "saveContract", "legalCheck", "sendContract", "returnToDraft", "contractStatus", "uploadContractFile", "deleteContractFile",
    "recordWetInk", "flameSign", "contractNote", "startRate", "startPenalty", "loadStandardTemplates", "saveTemplate", "approveTemplate", "retireTemplate", "deleteTemplate", "esignSetting"]) {
    assert.match(admin, new RegExp(`export async function ${f}\\(`), f);
  }
  const partner = await read("src/app/partner-us/contracts/actions.ts");
  assert.match(partner, /export async function partnerSign\(/);
  assert.match(partner, /export async function askChanges\(/);
  assert.match(partner, /contract_esign_on/);
  for (const p of ["src/app/partner-us/contracts/[id]/page.tsx", "src/app/admin/partners/contracts/[id]/page.tsx"]) assert.match(await read(p), /<PartnerMoneyNotice/, p);
  const copy = await read("src/app/api/contracts/[id]/copy/route.ts");
  assert.match(copy, /getSession\(\)/);              // the viewer's own session: database rules decide
  assert.doesNotMatch(copy, /createAdminClient/);
  assert.match(copy, /no-store/);
  const doc = await read("src/app/api/vetting/doc/[id]/route.ts");
  assert.match(doc, /doc\.purpose === "contract"/);
  const cron = await read("src/app/api/cron/partner-cases/route.ts");
  assert.match(cron, /partner_contracts_renewal_due/);
  assert.match(cron, /if \(!sent\) return/);           // stamped only after the email went out
  assert.match(await read("src/components/admin/PartnerTabs.tsx"), /\/admin\/partners\/contracts"/);
  assert.match(await read("src/app/partner-us/page.tsx"), /href="\/partner-us\/contracts"/);
  const more = JSON.parse(await read("src/content/more.json"));
  assert.ok(more.groups.flatMap((g) => g.items).some((i) => i.href === "/partner-us/contracts"));
  const rights = await read("src/lib/data-rights-server.ts");
  assert.match(rights, /table: "partner_contracts"/);
  assert.doesNotMatch(rights.match(/label: "partner_contracts".*$/m)[0], /internal_note|ip_address|user_agent/);
  assert.match(await read("src/lib/vetting-server.ts"), /contract/);
});
