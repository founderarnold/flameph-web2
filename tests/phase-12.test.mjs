// Phase 12: security, privacy and abuse hardening.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const toUrl = (js) => `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
const load = async (p, swap = (s) => s) => import(toUrl(ts.transpileModule(swap(await read(p)), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText));
const SQL = () => read("supabase/migrations/0028_privacy_security.sql");

test("RLS review fixes: protected profile fields, helpers only answer about the caller, server-only functions", async () => {
  const sql = await SQL();
  for (const f of ["created_at", "consent_privacy", "consent_marketing", "consent_at", "closed_at"]) assert.match(sql, new RegExp(`new\\.${f} = old\\.${f};`), f);
  assert.match(sql, /coalesce\(auth\.role\(\), ''\) in \('anon', 'authenticated'\)/);
  assert.match(sql, /when uid is not distinct from auth\.uid\(\) or k = 'records' or not public\.caller_is_client\(\) then/);
  assert.match(sql, /and \(not public\.caller_is_client\(\) or auth\.uid\(\) in \(a, b\)\)/);
  assert.match(sql, /if public\.caller_is_client\(\) and public\.mod_level\(\) < 1 then return 0; end if;/);
  for (const f of ["release_record(uuid, boolean)", "member_id_for_verified_email(text)", "ecosystem_badges(text, uuid[])", "consume_rate_limit(text, text, integer, integer, integer, boolean)"]) assert.ok(sql.includes(`'public.${f}'`), f);
  assert.match(sql, /execute format\('revoke all on function %s from public, anon, authenticated', f\);/);
  // Every new table has row level security, and members can't write to any of them directly.
  for (const t of ["privacy_requests", "retention_runs", "security_incidents", "security_signals"]) {
    assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security;`), t);
    assert.match(sql, new RegExp(`revoke all on public\\.${t} from anon, authenticated;`), t);
  }
  // A suspended or closed account can't sign in to the other sites.
  assert.match(await read("src/app/sso/authorize/route.ts"), /if \(prof && prof\.status !== "active"\) \{\n\s+callback\.searchParams\.set\("error", "not_active"\);/);
});

test("data rights: access and portability (download), correction, objection, closure and erasure, with DPO tools", async () => {
  const page = await read("src/app/account/privacy/page.tsx");
  assert.match(page, /href="\/account\/privacy\/download"/);
  for (const k of ["correction", "objection", "access", "portability"]) assert.match(page, new RegExp(`<RequestForm kind="${k}"`), k);
  for (const a of ["closeAccount", "eraseAccount", "reopenAccount", "saveSuggestionChoice"]) assert.match(page, new RegExp(`action=\\{${a}\\}`), a);
  const dl = await read("src/app/account/privacy/download/route.ts");
  assert.match(dl, /buildMemberExport\(admin, user\.id\)/);                      // only ever the caller's own data
  assert.match(dl, /checkRateLimit\(req, "data_export", \{ identifier: user\.id \}\)/);
  assert.match(dl, /action: "privacy_export_self"/);
  const server = await read("src/lib/data-rights-server.ts");
  for (const t of ["profiles", "member_consents", "feed_posts", "transaction_records", "ai_messages", "ecosystem_access_log", "privacy_requests"]) assert.ok(server.includes(`table: "${t}"`), t);
  // Nothing unreadable or secret goes in the file: tables holding hashed IPs or push keys are read column by column.
  for (const t of ["ai_messages", "submissions", "push_subscriptions"]) {
    const sel = server.match(new RegExp(`table: "${t}", column: "[a-z_]+", select: "([^"]+)"`))?.[1] ?? "";
    assert.ok(sel && !/ip_hash|p256dh|auth\b/.test(sel), t);
  }
  assert.match(server, /admin\.rpc\("privacy_erase_prepare", \{ p_user: userId \}\)/);
  assert.match(server, /admin\.auth\.admin\.deleteUser\(userId\)/);
  const sql = await SQL();
  assert.match(sql, /kind text not null check \(kind in \('access', 'correction', 'erasure', 'objection', 'portability', 'closure'\)\)/);
  assert.match(sql, /case when p_kind = 'erasure' then now\(\) \+ interval '7 days' end/);
  assert.match(sql, /if p_kind in \('erasure', 'closure'\) then perform public\.privacy_close_account\(me, rid\); end if;/);
  assert.match(sql, /if exists \(select 1 from public\.roles where user_id = p_user\) then raise exception 'has_staff_role'; end if;/);
  assert.match(sql, /where p\.status = 'closed' and p\.closed_at < now\(\) - interval '1 year'/);
  assert.match(sql, /and not p\.hide_from_suggestions/);
  for (const f of ["src/app/admin/privacy/page.tsx", "src/app/admin/privacy/incidents/page.tsx", "src/app/admin/privacy/security/page.tsx", "src/app/admin/privacy/export/[userId]/route.ts"]) assert.match(await read(f), /adminContext\(\["super_admin", "admin"\]\)/, f);

  const dr = await load("src/lib/data-rights.ts");
  // 15 working days skip weekends: Friday 2026-11-20 (Manila) + 1 working day = Monday 2026-11-23.
  assert.equal(dr.addWorkingDays(new Date("2026-11-20T02:00:00Z"), 1).toISOString().slice(0, 10), "2026-11-23");
  assert.equal(dr.addWorkingDays(new Date("2026-11-20T02:00:00Z"), 15).toISOString().slice(0, 10), "2026-12-11");
  assert.equal(dr.privacyError("ERROR: already_open"), "already_open");
});

test("retention: one schedule, the same in the app, the Privacy Notice and the daily database job", async () => {
  const { RETENTION, DB_RETENTION_KEYS } = await load("src/lib/retention.ts");
  const sql = await SQL();
  const rules = Object.fromEntries([...sql.matchAll(/\('([a-z_]+)',\s*'[^']+',\s*interval '(\d+) (days|year|years)'\)/g)].map((m) => [m[1], Number(m[2]) * (m[3].startsWith("year") ? 365 : 1)]));
  assert.deepEqual(Object.keys(rules).sort(), [...DB_RETENTION_KEYS].sort());
  for (const k of DB_RETENTION_KEYS) assert.equal(rules[k], RETENTION.find((r) => r.key === k).days, k);
  for (const k of DB_RETENTION_KEYS) if (!["privacy_requests", "retention_runs"].includes(k)) assert.ok(sql.includes(`retention_keep('${k}')`), `enforced: ${k}`);
  assert.match(await read("src/app/legal/privacy/page.tsx"), /\{RETENTION\.map\(\(r\) =>/);
  const cron = JSON.parse(await read("vercel.json")).crons.map((c) => c.path);
  for (const p of ["/api/cron/privacy", "/api/cron/security", "/api/cron/vetting-retention"]) assert.ok(cron.includes(p), p);
});

test("breach: detection signals, the 72-hour clock, NPC draft and member notice", async () => {
  const b = await load("src/lib/breach.ts", (s) => s.replace('import { ORG } from "@/lib/site";', 'const ORG = { emailPrimary: "dpo@example.test", secNo: "SEC-1", address: "Pampanga" };'));
  const inc = { id: "i", title: "Leaked list", summary: "A list of member emails was exposed", aware_at: "2026-11-20T00:00:00Z", deadline_at: "2026-11-23T00:00:00Z", severity: "high", data_involved: "names and emails", affected_count: 40, real_risk: true, measures: "Key revoked", member_advice: "Watch for phishing", contained_at: null, npc_notified_at: null, npc_reference: null, members_notified_at: null, members_notified_count: null, status: "open", created_at: "", closed_at: null };
  assert.equal(b.hoursLeft(inc, new Date("2026-11-22T00:00:00Z")), 24);
  assert.equal(b.nextSteps(inc).length, 3);                                            // contain, NPC, members
  assert.equal(b.nextSteps({ ...inc, contained_at: "x", real_risk: false }).length, 1); // no real risk: record only, then close
  const n = b.memberNotice(inc);
  for (const part of ["What happened:", "Data involved:", "What we did:", "What you can do:", "Data Protection Officer", "Ano ang nangyari:"]) assert.ok(n.text.includes(part), part);
  assert.match(b.npcDraft(inc), /Number of data subjects affected \(estimate\): 40/);
  const sql = await SQL();
  for (const k of ["rls_off", "private_bucket_public", "anon_function", "role_granted:", "bulk_export:", "vetting_reads:", "signin_lockouts:", "ecosystem_spike:", "privacy_overdue:", "incident_deadline:"]) assert.ok(sql.includes(`'${k}`), k);
  assert.match(sql, /create trigger security_incidents_no_delete before delete on public\.security_incidents/);
  assert.match(sql, /new\.deadline_at := new\.aware_at \+ interval '72 hours';/);
  const cron = await read("src/app/api/cron/security/route.ts");
  assert.match(cron, /const tell = found\.filter\(\(s\) => s\.severity !== "info" && !s\.emailed_at\);/);
  assert.match(await read("src/app/admin/privacy/actions.ts"), /title: note\.subject\.slice\(0, 140\)/);
});

test("abuse: account-age limits on 7 actions, plain messages for each, data download rate limit, append-only logs", async () => {
  const sql = await SQL();
  assert.match(sql, /foreach t in array array\['conversations', 'direct_messages', 'friendships', 'service_requests', 'transaction_records', 'deals', 'moderation_reports'\] loop/);
  const codes = [...sql.matchAll(/raise exception '(new_account_[a-z_]+)'/g)].map((m) => m[1]);
  const maps = (await Promise.all(["src/lib/feed-rules.ts", "src/lib/messages.ts", "src/lib/group-order.ts", "src/lib/records.ts", "src/lib/moderation.ts"].map(read))).join("\n");
  for (const c of new Set(codes)) assert.match(maps, new RegExp(`\\b${c}: "`), c);
  assert.match(await read("src/lib/rate-limit.ts"), /data_export: \{ limit: positiveInt\("RATE_LIMIT_DATA_EXPORT_MAX", 3, 20\), windowSeconds: 86400/);
  assert.match(sql, /foreach t in array array\['audit_log', 'moderation_actions', 'vetting_access_log', 'member_consents', 'retention_runs'\] loop/);
  assert.match(sql, /if current_setting\('flameph\.retention', true\) = 'on' then return old; end if;/);
});

test("consent switches gate what they say", async () => {
  // 1 Terms: turning it off is a tracked closure request; turning it back on withdraws it.
  const ca = await read("src/app/account/consent-actions.ts");
  assert.match(ca, /kind: "closure", source: "consent_switch", status: "open"/);
  assert.match(ca, /\.eq\("kind", "closure"\)\.eq\("source", "consent_switch"\)\.eq\("status", "open"\)/);
  // 2 Records: the database refuses records without it, and only counts records of members who have it on.
  const rec = await read("supabase/migrations/0022_records.sql");
  assert.match(rec, /if not public\.has_consent\(me, 'records'\) then raise exception 'records_consent'; end if;/);
  assert.match(rec, /where public\.has_consent\(uid, 'records'\) and exists/);
  // 3 Badge: never shared without it; turning it off tells the sites at once.
  assert.match(await read("supabase/migrations/0025_ecosystem_sso_badges.sql"), /when not public\.has_consent\(l\.user_id, 'ecosystem_badge'\) then 'consent_off'/);
  assert.match(ca, /changed\.includes\("ecosystem_badge"\) && !choices\.ecosystem_badge/);
  // 4 Vetting: upload refused without it; turning it off deletes the documents.
  const va = await read("src/app/account/vetting-actions.ts");
  assert.match(va, /if \(!state\.vetting\?\.granted\) back\("error=consent"\);/);
  assert.match(ca, /purgeMemberDocs\(admin, user\.id, "consent_withdrawn"\)/);
  // 5 Marketing: the weekly email and its push go only to members with it on; the flag follows the consent log and
  //   members can no longer flip it directly (Phase 12).
  assert.match(await read("src/app/api/cron/digest/route.ts"), /\.eq\("consent_marketing", true\)\.eq\("status", "active"\)/);
  assert.match(await read("supabase/migrations/0015_member_consents.sql"), /update public\.profiles set consent_marketing = new\.granted where id = new\.user_id;/);
  assert.match(await read("src/lib/unsubscribe-apply.ts"), /consent_key: "marketing", granted: false/);
  // Notification choices gate push and email per type.
  const notify = await read("src/lib/notify.ts");
  assert.match(notify, /if \(prefs\[`\$\{type\}_push`\]\) push = /);
  assert.match(notify, /if \(prefs\[`\$\{type\}_email`\] && note\.email\)/);
});
