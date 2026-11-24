// Phase 8A: requests, quotes and transaction records; both members confirm; disputes; padding controls;
// business vetting documents; the no-money reminder. No payment, checkout, escrow or wallet anywhere.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const toUrl = (js) => `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
const load = async (p, swap = (s) => s) => import(toUrl(ts.transpileModule(swap((await read(p)).replace(/^import "server-only";$/m, "")), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText));
const R = await load("src/lib/records.ts", (s) => s.replace('import { INDUSTRY_NAMES } from "@/lib/industries";', 'const INDUSTRY_NAMES = ["Food & beverage", "Services"];'));
const V = await load("src/lib/vetting.ts");
const C = await load("src/lib/vetting-crypto.ts");
const L = await load("src/lib/legal-text.ts");
const sql = await read("supabase/migrations/0022_records.sql");

test("every new table has row level security; members can't write records directly", () => {
  for (const t of [...sql.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1])) {
    assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security`), t);
    assert.match(sql, new RegExp(`revoke all on public\\.${t} from anon`), t);
  }
  // Records change only through the functions (both sides confirm, disputes, void).
  assert.match(sql, /grant select on public\.transaction_records to authenticated;/);
  assert.doesNotMatch(sql, /grant (insert|update|delete)[^;]*transaction_records/);
  // Requests and quotes: members choose only the content; the sender is set by the database.
  assert.match(sql, /grant insert \(provider_id, title, category, details, needed_by\) on public\.service_requests/);
  assert.match(sql, /grant insert \(request_id, terms, amount, valid_until\) on public\.service_quotes/);
  assert.match(sql, /new\.requester_id := me/);
  assert.match(sql, /new\.provider_id := me/);
  // Only the two members (and admins reviewing) can read a record.
  assert.match(sql, /using \(requester_id = auth\.uid\(\) or provider_id = auth\.uid\(\) or public\.mod_level\(\) >= 2\)/);
  // Nothing is deleted or renamed.
  assert.doesNotMatch(sql, /drop table|drop column|rename (to|column)|delete from/i);
});

test("a record counts only when BOTH members confirm; one side is pending", () => {
  assert.match(sql, /status = case when other_ok then 'confirmed' else 'pending' end/);
  assert.match(sql, /from public\.transaction_records t where t\.status = 'confirmed'/);
  // Changing the amount or date after the other member confirmed asks them again.
  assert.match(sql, /amt is distinct from t\.amount/);
  const rec = { requester_id: "a", provider_id: "b", status: "pending", requester_confirmed_at: "x", provider_confirmed_at: null, held_status: null };
  assert.equal(R.needsMyConfirm(rec, "a"), false);
  assert.equal(R.needsMyConfirm(rec, "b"), true);
  assert.equal(R.needsMyConfirm({ ...rec, status: "confirmed" }, "b"), false);
  assert.equal(R.otherParty(rec, "a"), "b");
});

test("padding: only the first 3 per pair count until both businesses are vetted; void claws back", () => {
  assert.equal(R.PAIR_CAP, 3);
  assert.match(sql, /x\.rk <= 3 or \(public\.is_vetted\(x\.requester_id\) and public\.is_vetted\(x\.provider_id\)\)/);
  assert.match(sql, /partition by least\(t\.requester_id, t\.provider_id\), greatest\(t\.requester_id, t\.provider_id\)/);
  // Badge, reputation and points come from counted records only, so a void takes them back.
  assert.match(sql, /coalesce\(\(select r\.counted from public\.member_reputation\(uid\) r\), 0\) \* 20/);
  assert.equal(R.badgeLevel(0), null);
  assert.equal(R.badgeLevel(1), "Bronze");
  assert.equal(R.badgeLevel(5), "Silver");
  assert.equal(R.badgeLevel(15), "Gold");
  assert.equal(R.badgeLevel(40), "Platinum");
  assert.equal(R.nextBadge(3).name, "Silver");
});

test("ratings and endorsement tags: same list in the app and the database; amounts are never verified", () => {
  const tags = sql.match(/t <@ array\[([^\]]+)\]/)[1].match(/'(\w+)'/g).map((x) => x.slice(1, -1));
  assert.deepEqual(tags, R.TAG_KEYS);
  assert.deepEqual(R.cleanTags(["on_time", "on_time", "hacker", "fair_price"]), ["on_time", "fair_price"]);
  assert.equal(R.parseAmount("1,500.50"), 1500.5);
  assert.equal(R.parseAmount("PHP 2000"), 2000);
  assert.equal(R.parseAmount(""), null);
  assert.ok(Number.isNaN(R.parseAmount("-5")));
  assert.ok(Number.isNaN(R.parseAmount("abc")));
  assert.equal(R.peso(null), null);
  assert.match(sql, /amount numeric\(14, 2\) check \(amount is null or amount >= 0\),\s+-- typed by the members; FLAME PH never verifies it/);
  // Reputation never includes amounts.
  const rep = sql.slice(sql.indexOf("create or replace function public.member_reputation"), sql.indexOf("grant execute on function public.member_reputation"));
  assert.doesNotMatch(rep.split("as $$")[1], /amount/);
});

test("disputes hold the record for moderator review; void and keep are admin actions; founder can undo", async () => {
  assert.match(sql, /elsif new\.target_type = 'record' then/);
  assert.match(sql, /set held_status = status, status = 'disputed'/);
  assert.match(sql, /'void_record', 'keep_record'\]/);
  assert.match(sql, /elsif a\.action = 'void_record' then\s+perform public\.release_record\(a\.target_id, true\)/);
  const M = await load("src/lib/moderation.ts");
  assert.equal(M.TARGETS.record, "transaction record");
  assert.deepEqual(M.actionsFor(1, "record").includes("void_record"), false);
  assert.ok(M.actionsFor(2, "record").includes("void_record"));
  assert.ok(M.actionsFor(2, "record").includes("keep_record"));
  assert.equal(M.actionsFor(2, "post").includes("void_record"), false);
  const page = await read("src/app/(member)/records/[id]/page.tsx");
  assert.match(page, /\/report\?type=record&id=/);
  assert.equal(R.recordErrorCode("ERROR: blocked_words"), "blocked_words");
  assert.equal(R.recordErrorCode("record_locked"), "record_locked");
  assert.equal(R.recordErrorCode('violates check constraint "service_quotes_terms_check"'), "bad_terms");
});

test("the no-money reminder is exactly the owner's text, on every confirmed record, with no way to close it", async () => {
  assert.equal(L.NO_MONEY_EN, "FLAME PH only records that this deal happened. No money passes through FLAME PH. Payment and delivery are between you and the other member.");
  assert.equal(L.NO_MONEY_TL, "Ang FLAME PH ay nagtatala lang na nangyari ang deal na ito. Walang pera na dumadaan sa FLAME PH. Ang bayad at delivery ay sa pagitan ninyo ng kabilang member.");
  const page = await read("src/app/(member)/records/[id]/page.tsx");
  assert.match(page, /\{showsNoMoney\(r\) && \(\s*<section aria-label="Reminder"><FixedNotice><p>\{NO_MONEY_EN\}<\/p><p lang="fil">\{NO_MONEY_TL\}<\/p><\/FixedNotice><\/section>/);
  assert.doesNotMatch(page, /"use client"|dismiss|useState/i);
  assert.equal(R.showsNoMoney({ status: "confirmed", held_status: null }), true);
  assert.equal(R.showsNoMoney({ status: "disputed", held_status: "confirmed" }), true);
  assert.equal(R.showsNoMoney({ status: "pending", held_status: null }), false);
});

test("there is no payment, checkout, escrow or wallet in Phase 8A", async () => {
  const files = ["supabase/migrations/0022_records.sql", "src/lib/records.ts", "src/app/account/record-actions.ts", "src/app/account/vetting-actions.ts"];
  for (const dir of ["src/app/(member)/requests", "src/app/(member)/records"]) {
    for (const e of await readdir(new URL(`../${dir}`, import.meta.url), { recursive: true })) if (e.endsWith(".tsx")) files.push(`${dir}/${e}`);
  }
  for (const f of files) {
    const text = (await read(f)).replace(/--[^\n]*|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(text, /checkout|escrow|wallet|paymongo|payment_intent|gcash|stripe/i, f);
  }
});

test("vetting: separate consent, reviewers only, encrypted at rest, retention enforced", async () => {
  // Members never get the stored path or key; the due list is for the server only.
  assert.match(sql, /grant select \(id, user_id, business_id, doc_type, file_name, mime, size_bytes, uploaded_at, deleted_at, delete_reason\) on public\.vetting_documents to authenticated/);
  assert.match(sql, /revoke all on function public\.vetting_documents_due\(\) from public, anon, authenticated/);
  assert.match(sql, /not public\.has_consent\(d\.user_id, 'vetting'\)/);
  assert.match(sql, /b\.verification_decided_at < now\(\) - interval '1 year'/);
  assert.deepEqual(V.DOC_KEYS, ["dti_sec", "mayors_permit", "bir"]);
  assert.match(sql, /doc_type in \('dti_sec', 'mayors_permit', 'bir'\)/);
  // AES-256-GCM round trip; a changed byte or the wrong key is refused.
  const k = C.vettingKey({ SUPABASE_SERVICE_ROLE_KEY: "test" });
  assert.equal(k.key.length, 32);
  assert.equal(C.vettingKey({ SUPABASE_SERVICE_ROLE_KEY: "test" }).id, k.id);
  assert.notEqual(C.vettingKey({ SUPABASE_SERVICE_ROLE_KEY: "other" }).id, k.id);
  assert.equal(C.vettingKey({}), null);
  const plain = Buffer.from("%PDF-1.4 hello");
  const blob = C.encryptDoc(plain, k.key);
  assert.ok(!blob.includes(plain));
  assert.deepEqual(C.decryptDoc(blob, k.key), plain);
  const bad = Buffer.from(blob); bad[bad.length - 1] ^= 1;
  assert.throws(() => C.decryptDoc(bad, k.key));
  assert.throws(() => C.decryptDoc(blob, C.vettingKey({ SUPABASE_SERVICE_ROLE_KEY: "other" }).key));
  assert.equal(C.sniffMime(plain), "application/pdf");
  assert.equal(C.sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(C.sniffMime(Buffer.from("<html>")), null);
  assert.equal(V.safeFileName("../../etc/passwd"), ".._.._etc_passwd");
  // Upload: consent 4 checked, file type sniffed, encrypted before storing.
  const act = await read("src/app/account/vetting-actions.ts");
  assert.match(act, /if \(!state\.vetting\?\.granted\) back\("error=consent"\)/);
  assert.match(act, /encryptDoc\(buf, k!\.key\)/);
  assert.match(act, /contentType: "application\/octet-stream"/);
  // Viewing: reviewers only, never their own, logged, not cached.
  const route = await read("src/app/api/vetting/doc/[id]/route.ts");
  // Admins and founders (moderation level 2+); national reviewers (0031) only for partner documents.
  assert.match(route, /const moderator = !lvlErr && \(Number\(lvl\) \|\| 0\) >= 2;/);
  assert.match(route, /if \(!moderator && partnerReviewer !== true\) return deny\(403\);/);
  assert.match(route, /if \(!moderator && doc\.purpose !== "partner" && doc\.purpose !== "offer" && doc\.purpose !== "sample" && doc\.purpose !== "batch"\) return deny\(403\);/);
  // Complaint evidence (0035): the national team or the two sides of that complaint only.
  assert.match(route, /if \(!party && partnerReviewer !== true\) return deny\(403\);/);
  assert.match(route, /doc\.user_id === user\.id\) return deny\(403\)/);
  assert.match(route, /vetting_access_log"\)\.insert/);
  assert.match(route, /no-store/);
  // Withdrawing consent deletes right away (vetting page and Settings); a daily job deletes the rest on schedule.
  assert.match(act, /purgeMemberDocs\(admin, user\.id, "consent_withdrawn"\)/);
  assert.match(await read("src/app/account/consent-actions.ts"), /changed\.includes\("vetting"\) && !choices\.vetting/);
  const cron = JSON.parse(await read("vercel.json")).crons.map((c) => c.path);
  assert.ok(cron.includes("/api/cron/vetting-retention"));
  assert.ok(cron.includes("/api/cron/digest"));
  // The old direct upload (no consent, not encrypted) now points to Business vetting.
  assert.doesNotMatch(await read("src/components/BusinessEditor.tsx"), /onDocs|upload\(f, "private-docs"\)/);
});

test("pages are reachable: Workspace, More, the Inbox count and member pages", async () => {
  const more = JSON.parse(await read("src/content/more.json"));
  const hrefs = more.groups.flatMap((g) => g.items.map((i) => i.href));
  for (const h of ["/requests", "/records", "/account/vetting"]) assert.ok(hrefs.includes(h), h);
  const ws = await read("src/app/(member)/workspace/page.tsx");
  for (const h of ['"/requests"', '"/records"', '"/account/vetting"']) assert.ok(ws.includes(h), h);
  assert.match(await read("src/lib/member-shell-data.ts"), /recordsWaiting\(supabase, user\.id\)/);
  assert.match(await read("src/components/people/RelationshipActions.tsx"), /\/requests\/new\?to=\$\{memberId\}/);
});
