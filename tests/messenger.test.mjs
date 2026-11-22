// Phase 8: member-to-member messages, the business inbox, notification choices with a working unsubscribe,
// and block/report from inside a conversation.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const toUrl = (js) => `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
const load = async (p, swap = (s) => s) => import(toUrl(ts.transpileModule(swap((await read(p)).replace(/^import "server-only";$/m, "")), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText));
const M = await load("src/lib/messages.ts");
const P = await load("src/lib/notification-prefs.ts");
const I = await load("src/lib/inbox.ts");
const U = await load("src/lib/unsubscribe.ts", (s) => s.replace('import { ORG } from "@/lib/site";', 'const ORG = { url: "https://flameph.org" };'));
const sql = await read("supabase/migrations/0021_messenger.sql");

test("only the two members in a conversation can read it; sending is checked again in the database", () => {
  assert.match(sql, /alter table public\.conversations enable row level security/);
  assert.match(sql, /alter table public\.direct_messages enable row level security/);
  assert.match(sql, /create policy conversations_members on public\.conversations for select to authenticated\s+using \(auth\.uid\(\) = member_a or auth\.uid\(\) = member_b\)/);
  assert.match(sql, /create policy direct_messages_read on public\.direct_messages for select to authenticated\s+using \(public\.is_conversation_member\(conversation_id\)\)/);
  // Members can only add a message (conversation + text); never change, delete or spoof the sender.
  assert.match(sql, /grant insert \(conversation_id, body\) on public\.direct_messages to authenticated/);
  assert.doesNotMatch(sql, /grant (update|delete)[^;]*direct_messages/);
  assert.match(sql, /revoke all on public\.direct_messages from anon/);
  for (const rule of ["not_active_member", "moderator_mute", "'blocked'", "message_rate_limit", "blocked_words", "new_conversation_limit"]) assert.ok(sql.includes(rule), rule);
  assert.match(sql, /new\.sender_id := me/);
  // Every new table has row level security.
  for (const t of [...sql.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1])) {
    assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security`), t);
  }
});

test("unread count: only the other member's newer messages count, and the Messages icon is in the top bar on every member screen", async () => {
  const me = "a", c = { member_a: "a", member_b: "b", last_message_at: "2026-11-17T10:00:00Z", last_sender_id: "b", a_read_at: "2026-11-17T09:00:00Z", b_read_at: null };
  assert.equal(M.otherMember(c, me), "b");
  assert.equal(M.hasUnread(c, me), true);
  assert.equal(M.hasUnread({ ...c, a_read_at: "2026-11-17T10:01:00Z" }, me), false);
  assert.equal(M.hasUnread({ ...c, last_sender_id: "a" }, me), false);
  const top = await read("src/components/Header.tsx");
  assert.match(top, /href="\/messages"/);
  assert.match(top, /CountBadge count=\{member\.unread\}/);
  const layout = await read("src/app/layout.tsx");
  assert.match(layout, /unreadMessages\(\), inboxCount\(\)/);
  const data = await read("src/lib/member-shell-data.ts");
  assert.match(data, /rpc\("unread_direct_messages"\)/);
  // RideSafe hides the top bar, so it shows its own Messages button with the count.
  const rs = await read("src/app/ridesafe/RideSafeHome.tsx");
  assert.match(rs, /rpc\("unread_direct_messages"\)/);
  assert.match(rs, /href="\/messages"/);
  // Messages is reached from the top bar, not a bottom tab.
  const tabs = await read("src/components/shell/MemberTabsNav.tsx");
  assert.doesNotMatch(tabs, /\/messages/);
});

test("Business inbox: leads, quote requests, Friend requests and notifications", async () => {
  assert.equal(I.inquiryKind({ kind: "quote" }), "quote");
  assert.equal(I.inquiryKind({ kind: null, message: "[Quote request] 200 pcs" }), "quote");
  assert.equal(I.inquiryKind({ message: "How much?" }), "inquiry");
  const page = await read("src/app/(member)/workspace/inbox/page.tsx");
  for (const id of ['id="leads"', 'id="quotes"', 'id="requests"', 'id="notifications"']) assert.ok(page.includes(id), id);
  assert.match(sql, /add column if not exists kind text not null default 'inquiry'/);
  const api = await read("src/app/api/inquiry/route.ts");
  assert.match(api, /notify\(biz\.owner_id, quote \? "quotes" : "leads"/);
});

test("notification choices per type, with defaults that keep today's emails", async () => {
  assert.deepEqual(P.NOTIFY_KEYS, ["messages", "leads", "quotes", "requests", "records"]);
  assert.equal(P.DEFAULT_PREFS.leads_email, true);
  assert.equal(P.DEFAULT_PREFS.requests_email, false);
  assert.equal(P.mergePrefs({ leads_email: false, junk: 1 }).leads_email, false);
  assert.equal(P.mergePrefs(null).messages_push, true);
  const sql22 = sql + await read("supabase/migrations/0022_records.sql");
  for (const col of P.PREF_COLUMNS) assert.match(sql22.replace(/add column if not exists (\w+) boolean/g, "$1 boolean"), new RegExp(`${col} boolean not null default ${P.DEFAULT_PREFS[col]}`), col);
  assert.deepEqual(P.columnsOff("leads"), ["leads_email"]);
  assert.deepEqual(P.columnsOff("all"), ["messages_email", "leads_email", "quotes_email", "requests_email", "records_email"]);
  assert.deepEqual(P.columnsOff("digest"), []);
});

test("unsubscribe links are signed per member and topic, and every notification email carries one", async () => {
  const k = "test-secret", u = "11111111-1111-1111-1111-111111111111";
  const sig = U.signUnsubscribe(u, "leads", k);
  assert.ok(sig && sig.length === 32);
  assert.equal(U.verifyUnsubscribe(u, "leads", sig, k), true);
  assert.equal(U.verifyUnsubscribe(u, "all", sig, k), false, "a link for one topic can't turn off another");
  assert.equal(U.verifyUnsubscribe("22222222-2222-2222-2222-222222222222", "leads", sig, k), false, "or another member's emails");
  assert.equal(U.verifyUnsubscribe(u, "leads", "x", k), false);
  const notify = await read("src/lib/notify.ts");
  assert.match(notify, /headers: unsubscribeHeaders\(userId, type\)/);
  assert.match(notify, /Stop these emails: \$\{off\}/);
  const digest = await read("src/app/api/cron/digest/route.ts");
  assert.match(digest, /unsubscribeUrl\(p\.id, "digest"\)/);
  assert.match(digest, /headers: unsubscribeHeaders\(p\.id, "digest"\)/);
  // A visit (GET) never changes anything; mail apps' one-click POST and the confirm button do.
  const api = await read("src/app/api/unsubscribe/route.ts");
  assert.match(api, /export async function GET[\s\S]*NextResponse\.redirect/);
  assert.ok(!/applyUnsubscribe/.test(api.slice(api.indexOf("export async function GET"))));
  const apply = await read("src/lib/unsubscribe-apply.ts");
  assert.match(apply, /consent_key: "marketing", granted: false/);
});

test("block and report from inside a conversation; moderators see only the reported message", async () => {
  const page = await read("src/app/(member)/messages/[id]/page.tsx");
  assert.match(page, /reportHref\("message", m\.id, here\)/);
  assert.match(page, /reportHref\("member", other, here\)/);
  assert.match(page, /action=\{setBlock\}/);
  const mod = await read("src/lib/moderation.ts");
  assert.match(mod, /message: "message"/);
  assert.match(sql, /elsif new\.target_type = 'message' then/);
  assert.match(sql, /new\.reporter_id in \(c\.member_a, c\.member_b\)/);
  assert.match(sql, /when 'message' then \(select 'Private message: ' \|\| left\(m\.body, 400\)/);
  assert.equal(M.msgErrorCode('new row ... "direct_messages_body_check"'), "empty");
  assert.equal(M.msgErrorCode("blocked"), "blocked");
  assert.equal(M.msgErrorCode("ERROR: blocked_words"), "blocked_words");
  assert.equal(M.msgErrorCode('relation "public.conversations" does not exist'), "unavailable");
});
