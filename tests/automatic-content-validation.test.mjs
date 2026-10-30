import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

async function loadModerationModule() {
  const source = (await read("src/lib/business-moderation.ts")).replace('import "server-only";', "");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

const genuineDescription = "We prepare affordable made-to-order meals and merienda for families, offices, school events, and community celebrations in our city.";
const valid = (name) => ({ name, description: genuineDescription, products: "Packed meals, pancit, kakanin and event food trays", city: "Manila", province: "Metro Manila", contact_phone: "+639178264395", contact_email: "hello@localbiz.ph" });

test("S: strong gibberish across the listing is high risk and remains correctable", async () => {
  const { moderateBusinessContent } = await loadModerationModule();
  const assessment = moderateBusinessContent({ ...valid("aeVQeeRkxWZQhpNBkl"), description: "aEVQeeRkxWZQhpNBklaEVQeeRkxWZQhpNBklaEVQeeRkxWZQhpNBklaEVQeeRkxWZQhpNBkl", contact_phone: "1111111111" }, { others: [], recentSubmissions: 0 });
  assert.equal(assessment.riskLevel, "high");
  assert.ok(assessment.suspiciousFields.includes("business_name"));
  assert.ok(assessment.suspiciousFields.includes("description"));
});

test("T: corrected content becomes low risk and the API resubmits the same record", async () => {
  const { moderateBusinessContent } = await loadModerationModule();
  assert.equal(moderateBusinessContent(valid("Juan's Kusina"), { others: [], recentSubmissions: 0 }).riskLevel, "low");
  const route = await read("src/app/api/business/submit/route.ts");
  assert.match(route, /record_business_moderation/);
  assert.match(route, /p_business_id:\s*businessId/);
  assert.doesNotMatch(route, /from\("businesses"\)\.insert/);
});

test("U: acronyms, numbers and Filipino business names are not suspicious by name alone", async () => {
  const { moderateBusinessContent } = await loadModerationModule();
  for (const name of ["J&J Store", "3M Supplies", "KKB Sari-Sari Store", "Aling Nena's Lutong Bahay"]) {
    assert.equal(moderateBusinessContent(valid(name), { others: [], recentSubmissions: 0 }).riskLevel, "low", name);
  }
});

test("duplicate and recognizable spam signals are queued without deleting records", async () => {
  const { moderateBusinessContent } = await loadModerationModule();
  const duplicate = moderateBusinessContent(valid("Juan's Kusina"), { others: [{ name: "Juan's Kusina" }], recentSubmissions: 0 });
  assert.equal(duplicate.riskLevel, "needs_review");
  assert.ok(duplicate.reasonCategories.includes("duplicate_business_name"));
  assert.equal(moderateBusinessContent({ ...valid("qwerty business"), description: "test business test business test business test business test business test business" }, { others: [], recentSubmissions: 0 }).riskLevel, "high");
});

test("V: database and all direct public query paths require low risk", async () => {
  const migration = await read("supabase/migrations/0012_automatic_content_validation.sql");
  assert.match(migration, /businesses_high_risk_never_public_check[\s\S]*risk_level = 'low' or \(not published and publication_status <> 'published'\)/);
  assert.match(migration, /new\.risk_level <> 'low'[\s\S]*new\.published = false/);
  assert.match(migration, /BUSINESS_HIGH_SUSPICION/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.businesses/i);
  for (const path of ["src/lib/public-business.ts", "src/app/api/inquiry/route.ts", "src/app/ridesafe/RideSafeHome.tsx"]) {
    assert.match(await read(path), /risk_level["']?,?\s*["']low|risk_level:\s*["']low/);
  }
});

test("W: legacy cleanup quarantines only the previously proven strongest class", async () => {
  const migration = await read("supabase/migrations/0012_automatic_content_validation.sql");
  assert.match(migration, /classification = 'obviously_suspicious'/);
  assert.doesNotMatch(migration, /classification\s+in\s*\(/i);
  assert.doesNotMatch(migration, /delete\s+from/i);
});

test("owner feedback is friendly while admin controls expose review evidence and actions", async () => {
  const editor = await read("src/components/BusinessEditor.tsx");
  const route = await read("src/app/api/business/submit/route.ts");
  const admin = await read("src/app/admin/directory/page.tsx");
  assert.match(editor, /Business Information Needs Correction/);
  assert.doesNotMatch(editor, /moderation_reason_categories|reasonCategories|threshold|score/i);
  assert.match(route, /fields: assessment\.suspiciousFields/);
  for (const action of ["approve_legitimate", "request_correction", "keep_quarantined", "reject", "suspend"]) assert.match(admin, new RegExp(action));
  assert.match(admin, /moderationHistory/);
});
