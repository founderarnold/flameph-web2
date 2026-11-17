// Phase 4B: moderation roles, reports, the 24-hour queue, actions by role, appeals, the automatic layer and the audit log.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const toUrl = (js) => `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
const load = async (p) => {
  const src = (await read(p)).replace(/^import "server-only";$/m, "");
  return import(toUrl(ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText));
};
const sql = await read("supabase/migrations/0019_moderation.sql");
const M = await load("src/lib/moderation.ts");
const fn = (name) => sql.slice(sql.indexOf(`function public.${name}`), sql.indexOf("$$;", sql.indexOf(`function public.${name}`)));

test("database update 0019 only adds; new tables have row-level security and visitors are locked out", () => {
  assert.doesNotMatch(sql, /drop table|drop column|truncate|delete from/i);
  for (const t of ["member_restrictions", "moderation_keywords", "moderation_reports", "moderation_actions", "moderation_appeals"]) {
    assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security`), t);
    assert.match(sql, new RegExp(`revoke all on public\\.${t} from anon`), t);
  }
});

test("roles reuse public.roles: chapter head, admin, founder; names are assigned in Admin > Members", async () => {
  assert.match(fn("mod_level"), /when 'super_admin' then 3 when 'admin' then 2 when 'chapter_leader' then 1/);
  assert.equal(M.ROLE_LABELS.super_admin, "Founder");
  assert.equal(M.ROLE_LABELS.chapter_leader, "Chapter head");
  const members = await read("src/app/admin/members/page.tsx");
  assert.match(members, /Chapter head \(moderates their chapter\)/);
});

test("actions by role match the database: chapter head < admin < founder", () => {
  assert.deepEqual(M.actionsFor(1, "post"), ["dismiss", "hide_in_group", "warn", "mute_7d"]);
  assert.deepEqual(M.actionsFor(2, "listing"), ["dismiss", "warn", "mute_7d", "mute", "suspend", "verify", "remove_listing"]);
  assert.ok(M.actionsFor(3, "member").includes("ban"));
  assert.ok(!M.actionsFor(2, "member").includes("ban"));
  const body = fn("moderate");
  assert.match(body, /when 1 then array\['dismiss', 'hide_in_group', 'warn', 'mute_7d'\]/);
  assert.match(body, /when 2 then array\[[^\]]*'remove_listing'\]/);
  assert.match(body, /else array\[[^\]]*'ban'\]/);
  assert.match(fn("override_action"), /mod_level\(\) < 3/);
  assert.match(fn("decide_appeal"), /mod_level\(\) < 3/);
});

test("a moderator can never act on a report about their own business, and doesn't see it", () => {
  const body = fn("moderate");
  assert.match(body, /if r\.target_owner_id = me then raise exception 'own_business'/);
  assert.match(body, /b\.owner_id = me\) then raise exception 'own_business'/);
  assert.match(sql, /target_owner_id is distinct from auth\.uid\(\)\s+and \(public\.mod_level\(\) >= 2/);
  assert.match(fn("override_action"), /'own_business'/);
});

test("24-hour clock: chapter queue first, then automatic escalation to admins, logged", () => {
  assert.match(sql, /due_at timestamptz not null default now\(\) \+ interval '24 hours'/);
  const esc = fn("escalate_overdue_reports");
  assert.match(esc, /due_at <= now\(\)/);
  assert.match(esc, /'escalate'/);
  assert.match(sql, /escalation_reason := 'no_chapter'/);
  assert.equal(M.clockText(new Date(Date.now() + 5 * 3600e3 + 60e3).toISOString()), "5h 1m left");
  assert.match(M.clockText(new Date(Date.now() - 2 * 3600e3).toISOString()), /^overdue 2h/);
  const q = [
    { id: "other", chapter_id: "c2", group_id: null, escalated_at: null, due_at: "2026-01-01T01:00:00Z", created_at: "" },
    { id: "industry", chapter_id: null, group_id: "g-food", escalated_at: null, due_at: "2026-01-01T02:00:00Z", created_at: "" },
    { id: "mine", chapter_id: "c1", group_id: null, escalated_at: null, due_at: "2026-01-01T03:00:00Z", created_at: "" },
    { id: "late", chapter_id: "c2", group_id: null, escalated_at: "2026-01-01T00:00:00Z", due_at: "2026-01-01T04:00:00Z", created_at: "" },
  ];
  assert.deepEqual(M.sortQueue(q, 1, ["c1"]).map((x) => x.id), ["mine", "industry", "other", "late"]);
  assert.equal(M.sortQueue(q, 2, []).at(0).id, "late");
});

test("audit log can't be changed by anyone, and every action writes to it", () => {
  assert.match(sql, /grant select on public\.moderation_actions to authenticated;/);
  assert.doesNotMatch(sql, /grant [^;]*(insert|update|delete)[^;]* on public\.moderation_actions/);
  for (const f of ["moderate", "override_action", "decide_appeal", "escalate_overdue_reports", "feed_auto_report", "moderation_keywords_log"]) {
    assert.match(fn(f), /insert into public\.moderation_actions/, f);
  }
});

test("appeals: only for actions on your own account, founders decide, 7-day target", () => {
  assert.match(sql, /due_at timestamptz not null default now\(\) \+ interval '7 days'/);
  assert.match(fn("file_appeal"), /a\.target_owner_id is distinct from me/);
  assert.match(sql, /moderation_appeals_read on public\.moderation_appeals for select to authenticated\s+using \(appellant_id = auth\.uid\(\) or public\.mod_level\(\) = 3\)/);
});

test("automatic layer: mutes, keywords and spam patterns, after the Phase 4 limits; held items join the queue", () => {
  const check = fn("feed_moderation_check");
  assert.match(check, /raise exception 'moderator_mute'/);
  assert.match(check, /raise exception 'blocked_words'/);
  assert.match(sql, /create trigger feed_posts_zmoderation before insert on public\.feed_posts/);
  assert.match(sql, /create trigger feed_comments_zmoderation before insert on public\.feed_comments/);
  assert.match(fn("moderation_text_check"), /hold:spam_pattern/);
  assert.match(fn("feed_auto_report"), /'automatic'/);
  assert.match(sql, /moderation_keywords_founder_add on public\.moderation_keywords for insert to authenticated with check \(public\.mod_level\(\) = 3\)/);
});

test("Report button on posts, comments, members and listings; report form, notices and queue pages", async () => {
  const card = await read("src/components/feed/PostCard.tsx");
  assert.match(card, /reportHref\("post"/);
  assert.match(card, /reportHref\("comment"/);
  assert.match(await read("src/components/people/RelationshipActions.tsx"), /reportHref\("member"/);
  assert.match(await read("src/components/listing/BusinessProfile.tsx"), /type: "listing"/);
  const actions = await read("src/app/account/moderation-actions.ts");
  for (const rpc of ["moderate", "override_action", "decide_appeal", "file_appeal"]) assert.match(actions, new RegExp(`rpc\\("${rpc}"`));
  const queue = await read("src/app/admin/moderation/page.tsx");
  assert.match(queue, /escalate_overdue_reports/);
  assert.match(queue, /sortQueue/);
  assert.match(await read("src/app/account/notices/page.tsx"), /Appeal this decision/);
  assert.equal(M.modErrorCode('duplicate key value violates unique constraint "moderation_reports_once"'), "duplicate");
  assert.equal(M.modErrorCode("own_business"), "own_business");
  const more = JSON.parse(await read("src/content/more.json"));
  assert.ok(more.groups.some((g) => g.items.some((i) => i.href === "/account/notices")));
  assert.ok(more.notListed["/report"]);
});
