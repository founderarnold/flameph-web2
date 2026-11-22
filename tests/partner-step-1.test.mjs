// Partner accreditation, Step 1: four partner roles and the shared partner application at /partner-us.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const toUrl = (js) => `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
const load = async (p) => import(toUrl(ts.transpileModule(await read(p), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText));
const SQL = () => read("supabase/migrations/0031_partner_roles_applications.sql");

test("0031: four partner roles; coordinators and testers belong to a chapter; existing roles kept", async () => {
  const sql = await SQL();
  assert.match(sql, /role in \('super_admin', 'admin', 'chapter_leader', 'editor', 'chapter_coordinator', 'chapter_tester', 'national_reviewer', 'finance'\)/);
  assert.match(sql, /role not in \('chapter_coordinator', 'chapter_tester'\) or chapter_id is not null/);
  assert.match(sql, /select public\.has_role\(array\['super_admin', 'admin', 'national_reviewer'\]\);/);
  const auth = await read("src/lib/auth.ts");
  assert.match(auth, /"chapter_coordinator" \| "chapter_tester" \| "national_reviewer" \| "finance"/);
  // Partner roles are not moderators or content editors: the old helpers are untouched.
  assert.doesNotMatch(sql, /function public\.(is_admin|is_staff|mod_level)\(/);
});

test("0031: row level security on every new table; no browser writes; TIN never readable", async () => {
  const sql = await SQL();
  for (const t of ["partner_applications", "partner_reviews", "partner_profiles"]) {
    assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security;`), t);
    assert.match(sql, new RegExp(`revoke all on public\\.${t} from anon, authenticated;`), t);
  }
  const grant = sql.match(/grant select \(([^)]+)\) on public\.partner_applications to authenticated/)[1];
  assert.doesNotMatch(grant, /tin_enc|tin_key_id/);
  assert.match(sql, /using \(user_id = auth\.uid\(\) or public\.is_partner_reviewer\(\)\)/);
  assert.match(sql, /not internal and exists \(select 1 from public\.partner_applications a where a\.id = application_id and a\.user_id = auth\.uid\(\)\)/);
  // Coordinators: a short list from their own chapter only, through a function.
  assert.match(sql, /r\.role = 'chapter_coordinator'/);
  assert.match(sql, /returns table \(id uuid, category text, legal_name text, city text, province text, status text, submitted_at timestamptz, chapter_id uuid\)/);
  // History can't be edited; status moves are checked; nothing is sent without both boxes.
  assert.match(sql, /append_only: partner_reviews rows cannot be changed/);
  assert.match(sql, /cannot move from % to %/);
  assert.match(sql, /privacy_ack_at is not null and declaration_at is not null/);
});

test("0031: partner documents reuse the encrypted vetting store, 5 MB at the bucket, switch 4 never deletes them", async () => {
  const sql = await SQL();
  assert.match(sql, /add column if not exists purpose text not null default 'vetting'/);
  assert.match(sql, /set file_size_limit = 5242880/);
  assert.match(sql, /where d\.deleted_at is null and d\.purpose = 'vetting'/);
  assert.match(sql, /d\.purpose = 'partner'\s+and \(a\.id is null or \(a\.status in \('rejected', 'withdrawn'\) and a\.updated_at < now\(\) - interval '1 year'\)\)/);
  const server = await read("src/lib/vetting-server.ts");
  assert.match(server, /scope: "vetting" \| "all" = "vetting"/);
  assert.match(await read("src/lib/data-rights-server.ts"), /purgeMemberDocs\(admin, userId, "member_removed", "all"\)/);
  const undo = await read("supabase/rollback/0031_partner_roles_applications_undo.sql");
  assert.match(undo, /drop table if exists public\.partner_applications;/);
});

test("form rules: conditional fields and documents by category", async () => {
  const P = await load("src/lib/partner.ts");
  assert.deepEqual(P.CATEGORY_KEYS, ["supplier", "service_provider", "toll_manufacturer"]);
  assert.deepEqual(P.requiredDocs("supplier", { regulated: "No" }), ["dti_sec", "mayors_permit", "bir", "gov_id"]);
  assert.deepEqual(P.requiredDocs("supplier", { regulated: "Yes" }), ["dti_sec", "mayors_permit", "bir", "gov_id", "fda"]);
  assert.ok(P.requiredDocs("toll_manufacturer", {}).includes("fda"));
  assert.ok(P.requiredDocs("service_provider", { licensed: "Yes" }).includes("prc"));
  // A hidden conditional answer is dropped, an invalid choice is ignored.
  assert.deepEqual(P.cleanDetails("supplier", { regulated: "No", fda_lto_no: "X-1", delivery: "Teleport" }), { regulated: "No" });
  assert.deepEqual(P.cleanDetails("supplier", { regulated: "Yes", fda_lto_no: " CFRR-123 " }), { regulated: "Yes", fda_lto_no: "CFRR-123" });
  const empty = { category: "supplier", legal_name: null, registration_type: null, registration_no: null, tin_last3: null, rep_name: null, biz_email: null, biz_phone: null, city: null, province: null, coverage: null, details: { regulated: "Yes" } };
  const m = P.missingItems(empty, []);
  assert.ok(m.some((x) => x.step === 3 && /FDA License/.test(x.what)));
  assert.ok(m.some((x) => x.step === 4 && /FDA License/.test(x.what)));
  const full = { ...empty, legal_name: "A", registration_type: "dti", registration_no: "1", tin_last3: "789", rep_name: "B", biz_email: "a@b.ph", biz_phone: "09171234567", city: "QC", province: "Metro Manila", coverage: "city",
    details: { products: "x", supplier_type: "Wholesaler", monthly_capacity: "1", delivery: "We deliver", regulated: "No" } };
  assert.deepEqual(P.missingItems(full, ["dti_sec", "mayors_permit", "bir", "gov_id"]), []);
  assert.ok(P.validTin("123-456-789") && P.validTin("123-456-789-000") && !P.validTin("12345"));
  assert.ok(P.validEmail("sales@shop.ph") && !P.validEmail("nope"));
  assert.ok(P.validPhone("0917 123 4567") && P.validPhone("+63 2 8123 4567") && !P.validPhone("abc"));
  assert.equal(P.formatTinMasked("789"), "•••-•••-789");
  assert.equal(P.PARTNER_DOC_MAX_BYTES, 4 * 1024 * 1024);
  assert.equal(P.STORAGE_CAP_BYTES, 5 * 1024 * 1024);
});

test("server: only the national team decides; reasons required; nobody reviews their own; admins assign partner roles only", async () => {
  const a = await read("src/app/admin/partners/actions.ts");
  assert.match(a, /const NATIONAL = \["super_admin", "admin", "national_reviewer"\] as const;/);
  assert.match(a, /decideApplication[\s\S]*adminContext\(\[\.\.\.NATIONAL\]\)/);
  assert.match(a, /if \(decision !== "approved" && reasons\.length === 0\) back\("error=reasons"\);/);
  assert.match(a, /if \(app!\.user_id === ctx\.user\.id\) back\("error=own"\);/);
  assert.match(a, /supabase\.rpc\("partner_chapter_applications"\)/);
  const set = await read("src/app/admin/actions.ts");
  assert.match(set, /if \(SITE\.includes\(role\) && !ctx\.roles\.includes\("super_admin"\)\) return back\("denied"\);/);
  assert.match(set, /await ctx\.audit\(`role_\$\{op\}`, "roles", userId, \{ role, chapter_id: chapterId \}\);/);
  const apply = await read("src/app/partner-us/actions.ts");
  assert.match(apply, /if \(!EDITABLE\.includes\(app\.status\)\)/);
  assert.match(apply, /if \(fd\.get\("privacy_ack"\) !== "yes" \|\| fd\.get\("declaration"\) !== "yes"\) back\("error=boxes"\);/);
  assert.match(apply, /encryptDoc\(buf, k!\.key\)/);
  assert.match(apply, /sniffMime\(buf\)/);
});

test("pages: /partner-us in the site menu, More and sitemap; /partners and /partner-us link to each other; same layout", async () => {
  const nav = JSON.parse(await read("src/content/nav.json"));
  assert.ok(nav.find((g) => g.key === "partners").items.some((i) => i.href === "/partner-us"));
  const more = await read("src/content/more.json");
  assert.match(more, /"href": "\/partner-us"/);
  assert.match(await read("src/app/partners/page.tsx"), /href="\/partner-us"/);
  const hub = await read("src/app/partner-us/page.tsx");
  assert.match(hub, /href="\/partners"/);
  assert.match(hub, /<PageHero /);
  // No page-level header, footer or bottom bar of its own: the site layout supplies them, as on the homepage.
  for (const p of ["src/app/partner-us/page.tsx", "src/app/partner-us/apply/page.tsx", "src/app/partner-us/apply/[id]/page.tsx"]) {
    const s = await read(p);
    assert.doesNotMatch(s, /<Header|<Footer|MemberTabsNav/, p);
  }
  assert.match(await read("src/lib/hero-pages.ts"), /"\/partner-us":/);
  // Photos are made smaller in the phone before upload, on partner and vetting uploads alike.
  assert.match(await read("src/components/ShrinkPhotoInput.tsx"), /c\.toBlob\(ok, "image\/jpeg", 0\.82\)/);
});
