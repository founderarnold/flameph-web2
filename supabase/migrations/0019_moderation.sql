-- Phase 4B: moderation roles and tools. Only adds; nothing existing is deleted or renamed.
--
-- Roles reuse public.roles (0001), so more people can be named from Admin > Members without code changes:
--   member       everyone (no row)
--   chapter head roles.role = 'chapter_leader' with roles.chapter_id
--   admin        roles.role = 'admin'
--   founder      roles.role = 'super_admin'
--
-- Reports go to a queue with a 24-hour clock. Chapter heads see their chapter and the industry groups; anything not
-- acted on in 24 hours moves to the admin queue (escalated_at is stamped and logged). Every moderation step is written
-- to moderation_actions, which nobody can edit or delete. A moderator can never act on a report about their own
-- business or content. Members can appeal; founders decide appeals with a 7-day target.

-- ---------------------------------------------------------------------------
-- Who is a moderator, and where.
-- ---------------------------------------------------------------------------
-- 0 member, 1 chapter head, 2 admin, 3 founder (the highest role the signed-in member has).
create or replace function public.mod_level() returns int
language sql stable security definer set search_path = public as $$
  select coalesce(max(case r.role when 'super_admin' then 3 when 'admin' then 2 when 'chapter_leader' then 1 else 0 end), 0)
  from public.roles r where r.user_id = auth.uid();
$$;
revoke all on function public.mod_level() from public;
grant execute on function public.mod_level() to authenticated;

-- A chapter head's area: their chapter, their chapter's group, and the industry groups.
create or replace function public.in_chapter_scope(ch uuid, grp uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.roles r where r.user_id = auth.uid() and r.role = 'chapter_leader' and r.chapter_id is not null and r.chapter_id = ch)
    or exists (select 1 from public.community_groups g where g.id = grp
               and (g.kind = 'industry' or g.chapter_id in (select r.chapter_id from public.roles r where r.user_id = auth.uid() and r.role = 'chapter_leader')));
$$;
revoke all on function public.in_chapter_scope(uuid, uuid) from public;
grant execute on function public.in_chapter_scope(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Restrictions a moderator puts on a member (mute for some days, or a ban).
-- ---------------------------------------------------------------------------
create table if not exists public.member_restrictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('mute', 'ban')),
  until timestamptz,                     -- null = until lifted
  action_id bigint,
  created_at timestamptz not null default now(),
  lifted_at timestamptz
);
create index if not exists member_restrictions_user on public.member_restrictions (user_id) where lifted_at is null;
alter table public.member_restrictions enable row level security;
revoke all on public.member_restrictions from anon;
revoke all on public.member_restrictions from authenticated;
grant select on public.member_restrictions to authenticated;
drop policy if exists member_restrictions_read on public.member_restrictions;
create policy member_restrictions_read on public.member_restrictions for select to authenticated
  using (user_id = auth.uid() or public.mod_level() >= 2);

create or replace function public.member_is_muted(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.member_restrictions m
    where m.user_id = uid and m.lifted_at is null and (m.until is null or m.until > now()));
$$;
revoke all on function public.member_is_muted(uuid) from public;
grant execute on function public.member_is_muted(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Keyword filter (the founder sets the list; "hold" sends a post for review, "block" refuses it).
-- ---------------------------------------------------------------------------
create table if not exists public.moderation_keywords (
  phrase text primary key check (phrase = lower(btrim(phrase)) and char_length(phrase) between 3 and 60),
  action text not null default 'hold' check (action in ('hold', 'block')),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.moderation_keywords enable row level security;
revoke all on public.moderation_keywords from anon;
revoke all on public.moderation_keywords from authenticated;
grant select, insert, delete on public.moderation_keywords to authenticated;
drop policy if exists moderation_keywords_read on public.moderation_keywords;
create policy moderation_keywords_read on public.moderation_keywords for select to authenticated using (public.mod_level() >= 1);
drop policy if exists moderation_keywords_founder_add on public.moderation_keywords;
create policy moderation_keywords_founder_add on public.moderation_keywords for insert to authenticated with check (public.mod_level() = 3);
drop policy if exists moderation_keywords_founder_remove on public.moderation_keywords;
create policy moderation_keywords_founder_remove on public.moderation_keywords for delete to authenticated using (public.mod_level() = 3);

insert into public.moderation_keywords (phrase, action, created_by) values
  ('online sabong', 'hold', null), ('e-sabong', 'hold', null), ('casino', 'hold', null),
  ('buy followers', 'hold', null), ('free load', 'hold', null), ('earn from home', 'hold', null),
  ('click the link to earn', 'hold', null), ('crypto doubling', 'hold', null), ('send gcash first', 'hold', null),
  ('loan app', 'hold', null)
on conflict (phrase) do nothing;

-- Spam patterns and keyword matches for one text. Returns 'block', 'hold:<reason>' or null.
create or replace function public.moderation_text_check(t text) returns text
language plpgsql stable security definer set search_path = public as $$
declare k record; low text := lower(coalesce(t, ''));
begin
  for k in select phrase, action from public.moderation_keywords order by action desc loop  -- 'hold' < 'block': block first
    if position(k.phrase in low) > 0 then
      return case when k.action = 'block' then 'block' else 'hold:keywords' end;
    end if;
  end loop;
  if low ~ '(.)\1{11,}' then return 'hold:spam_pattern'; end if;                                   -- the same character 12 times
  if char_length(t) >= 40 and char_length(regexp_replace(t, '[^A-Z]', '', 'g')) > 0.7 * char_length(regexp_replace(t, '[^A-Za-z]', '', 'g')) then
    return 'hold:spam_pattern';                                                                     -- mostly capitals
  end if;
  if (select count(*) from regexp_matches(low, '(\+?63|0)9\d{2}[ -]?\d{3}[ -]?\d{4}', 'g')) >= 3 then return 'hold:spam_pattern'; end if;  -- many phone numbers
  return null;
end $$;
revoke all on function public.moderation_text_check(text) from public;

-- ---------------------------------------------------------------------------
-- Reports and the queue.
-- ---------------------------------------------------------------------------
alter table public.feed_posts add column if not exists group_hidden boolean not null default false;

create table if not exists public.moderation_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users(id) on delete set null,          -- null: the automatic filter
  target_type text not null check (target_type in ('post', 'comment', 'member', 'listing', 'message', 'record')),
  target_id uuid not null,
  target_owner_id uuid references auth.users(id) on delete set null,
  chapter_id uuid references public.chapters(id) on delete set null,
  group_id uuid references public.community_groups(id) on delete set null,
  reason text not null check (reason in ('spam', 'scam', 'harassment', 'false_info', 'inappropriate', 'other', 'automatic')),
  details text check (details is null or char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at timestamptz not null default now(),
  due_at timestamptz not null default now() + interval '24 hours',
  escalated_at timestamptz,
  escalation_reason text check (escalation_reason is null or escalation_reason in ('24_hours', 'no_chapter')),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  resolution text
);
create unique index if not exists moderation_reports_once on public.moderation_reports (reporter_id, target_type, target_id) where status = 'open' and reporter_id is not null;
create index if not exists moderation_reports_queue on public.moderation_reports (status, due_at);
create index if not exists moderation_reports_target on public.moderation_reports (target_type, target_id);

create or replace function public.moderation_reports_prepare() returns trigger
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); system boolean := new.reason = 'automatic' and pg_trigger_depth() > 1;
begin
  if system or (me is null and current_user in ('postgres', 'service_role', 'supabase_admin')) then
    new.reporter_id := null;
  else
    if me is null then raise exception 'not_signed_in'; end if;
    if not public.member_is_active(me) then raise exception 'not_active_member'; end if;
    if new.reason = 'automatic' then raise exception 'invalid_reason'; end if;
    new.reporter_id := me;
    if (select count(*) from public.moderation_reports r where r.reporter_id = me and r.created_at > now() - interval '1 day') >= 20 then
      raise exception 'report_rate_limit';
    end if;
  end if;
  -- Who owns what is reported, and where it lives (for the chapter queue). Never taken from the reporter.
  if new.target_type = 'post' then
    select p.author_id, p.chapter_id, p.group_id into new.target_owner_id, new.chapter_id, new.group_id from public.feed_posts p where p.id = new.target_id;
  elsif new.target_type = 'comment' then
    select c.author_id, p.chapter_id, p.group_id into new.target_owner_id, new.chapter_id, new.group_id
      from public.feed_comments c join public.feed_posts p on p.id = c.post_id where c.id = new.target_id;
  elsif new.target_type = 'member' then
    select p.id, p.chapter_id, null into new.target_owner_id, new.chapter_id, new.group_id from public.profiles p where p.id = new.target_id;
  elsif new.target_type = 'listing' then
    select b.owner_id, b.chapter_id, null into new.target_owner_id, new.chapter_id, new.group_id from public.businesses b where b.id = new.target_id;
  else
    raise exception 'not_available_yet';   -- messages and deal records arrive in later phases
  end if;
  if new.target_owner_id is null then raise exception 'not_found'; end if;
  if new.reporter_id is not null and new.target_owner_id = new.reporter_id then raise exception 'own_content'; end if;
  new.details := nullif(btrim(coalesce(new.details, '')), '');
  new.status := 'open';
  new.created_at := now();
  new.due_at := now() + interval '24 hours';
  new.resolved_at := null; new.resolved_by := null; new.resolution := null;
  -- Nothing in a chapter or group: no chapter head can take it, so it goes straight to the admin queue.
  if new.chapter_id is null and new.group_id is null then
    new.escalated_at := now(); new.escalation_reason := 'no_chapter';
  else
    new.escalated_at := null; new.escalation_reason := null;
  end if;
  return new;
end $$;
drop trigger if exists moderation_reports_prepare on public.moderation_reports;
create trigger moderation_reports_prepare before insert on public.moderation_reports for each row execute function public.moderation_reports_prepare();

alter table public.moderation_reports enable row level security;
revoke all on public.moderation_reports from anon;
revoke all on public.moderation_reports from authenticated;
grant select, insert on public.moderation_reports to authenticated;
-- Reporters see their own reports. Admins and founders see all; chapter heads see their area.
-- No moderator sees reports about their own business or content (others handle those, and the reporter stays private).
drop policy if exists moderation_reports_read on public.moderation_reports;
create policy moderation_reports_read on public.moderation_reports for select to authenticated
  using (reporter_id = auth.uid()
    or (target_owner_id is distinct from auth.uid()
        and (public.mod_level() >= 2 or (public.mod_level() = 1 and public.in_chapter_scope(chapter_id, group_id)))));
drop policy if exists moderation_reports_file on public.moderation_reports;
create policy moderation_reports_file on public.moderation_reports for insert to authenticated
  with check (reporter_id = auth.uid() and public.member_is_active(auth.uid()));

-- ---------------------------------------------------------------------------
-- Audit log of every moderation step. Written only by the functions below; nobody can change or delete it.
-- ---------------------------------------------------------------------------
create table if not exists public.moderation_actions (
  id bigserial primary key,
  report_id uuid references public.moderation_reports(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,    -- null: automatic
  actor_role text not null check (actor_role in ('system', 'chapter_head', 'admin', 'founder')),
  action text not null check (action in ('auto_hold', 'escalate', 'dismiss', 'hide_in_group', 'warn', 'mute_7d', 'hide', 'mute', 'suspend',
    'verify', 'remove_listing', 'ban', 'override', 'policy', 'appeal_upheld', 'appeal_overturned')),
  target_type text,
  target_id uuid,
  target_owner_id uuid references auth.users(id) on delete set null,
  note text check (note is null or char_length(note) <= 500),
  until timestamptz,
  ref_action_id bigint references public.moderation_actions(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists moderation_actions_report on public.moderation_actions (report_id);
create index if not exists moderation_actions_owner on public.moderation_actions (target_owner_id, created_at desc);
alter table public.moderation_actions enable row level security;
revoke all on public.moderation_actions from anon;
revoke all on public.moderation_actions from authenticated;
grant select on public.moderation_actions to authenticated;
drop policy if exists moderation_actions_read on public.moderation_actions;
create policy moderation_actions_read on public.moderation_actions for select to authenticated
  using (public.mod_level() >= 2 or actor_id = auth.uid()
    or (public.mod_level() = 1 and exists (select 1 from public.moderation_reports r where r.id = report_id)));

create or replace function public.mod_role_name(lvl int) returns text language sql immutable as $$
  select case lvl when 3 then 'founder' when 2 then 'admin' when 1 then 'chapter_head' else 'system' end;
$$;

-- Move reports that waited 24 hours to the admin queue, and log each one. Safe to run any time; the queue page runs it
-- on every visit, and a scheduled job runs it every 15 minutes where the database has pg_cron.
create or replace function public.escalate_overdue_reports() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with moved as (
    update public.moderation_reports set escalated_at = now(), escalation_reason = '24_hours'
    where status = 'open' and escalated_at is null and due_at <= now()
    returning id, target_type, target_id, target_owner_id)
  insert into public.moderation_actions (report_id, actor_id, actor_role, action, target_type, target_id, target_owner_id, note)
    select id, null, 'system', 'escalate', target_type, target_id, target_owner_id, 'No action within 24 hours: moved to the admin queue.' from moved;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.escalate_overdue_reports() from public;
grant execute on function public.escalate_overdue_reports() to authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('flameph-escalate-reports', '*/15 * * * *', 'select public.escalate_overdue_reports()');
  end if;
exception when others then null;   -- no scheduler: the queue page still escalates on every visit
end $$;

-- ---------------------------------------------------------------------------
-- Acting on a report. All rules live here: who may do what, where, and never on their own business.
-- ---------------------------------------------------------------------------
create or replace function public.moderate(p_report uuid, p_action text, p_note text default null, p_days int default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  lvl int := public.mod_level();
  r public.moderation_reports;
  post_group uuid;
  until_at timestamptz;
  aid bigint;
  allowed text[];
begin
  if me is null or lvl = 0 then raise exception 'not_moderator'; end if;
  select * into r from public.moderation_reports where id = p_report for update;
  if r.id is null then raise exception 'not_found'; end if;
  if r.target_owner_id = me then raise exception 'own_business'; end if;
  if r.target_type = 'listing' and exists (select 1 from public.businesses b where b.id = r.target_id and b.owner_id = me) then raise exception 'own_business'; end if;
  if lvl = 1 and not public.in_chapter_scope(r.chapter_id, r.group_id) then raise exception 'out_of_scope'; end if;
  allowed := case lvl
    when 1 then array['dismiss', 'hide_in_group', 'warn', 'mute_7d']
    when 2 then array['dismiss', 'hide_in_group', 'warn', 'mute_7d', 'hide', 'mute', 'suspend', 'verify', 'remove_listing']
    else array['dismiss', 'hide_in_group', 'warn', 'mute_7d', 'hide', 'mute', 'suspend', 'verify', 'remove_listing', 'ban'] end;
  if not p_action = any(allowed) then raise exception 'not_allowed_for_role'; end if;
  p_note := nullif(left(btrim(coalesce(p_note, '')), 500), '');

  if p_action = 'hide_in_group' then
    if r.target_type = 'post' then
      update public.feed_posts set group_hidden = true where id = r.target_id and group_id is not null returning group_id into post_group;
    elsif r.target_type = 'comment' then
      select p.group_id into post_group from public.feed_comments c join public.feed_posts p on p.id = c.post_id where c.id = r.target_id;
      if post_group is not null then update public.feed_comments set status = 'hidden' where id = r.target_id; end if;
    end if;
    if post_group is null then raise exception 'not_in_a_group'; end if;
  elsif p_action = 'hide' then
    if r.target_type = 'post' then update public.feed_posts set status = 'hidden' where id = r.target_id;
    elsif r.target_type = 'comment' then update public.feed_comments set status = 'hidden' where id = r.target_id;
    else raise exception 'not_a_post'; end if;
  elsif p_action in ('mute_7d', 'mute') then
    until_at := now() + make_interval(days => case when p_action = 'mute_7d' then 7 else greatest(1, least(coalesce(p_days, 7), 30)) end);
  elsif p_action = 'suspend' or p_action = 'ban' then
    if exists (select 1 from public.roles x where x.user_id = r.target_owner_id and x.role in ('super_admin', 'admin')) and lvl < 3 then raise exception 'not_allowed_for_role'; end if;
    update public.profiles set status = 'suspended' where id = r.target_owner_id;
    update public.businesses set published = false, publication_status = 'unpublished' where owner_id = r.target_owner_id;
  elsif p_action = 'remove_listing' then
    if r.target_type <> 'listing' then raise exception 'not_a_listing'; end if;
    update public.businesses set published = false, publication_status = 'unpublished', lifecycle_status = 'suspended' where id = r.target_id;
  elsif p_action = 'verify' then
    if r.target_type = 'listing' then update public.businesses set verified = true, verification_status = 'approved' where id = r.target_id; end if;
  end if;

  insert into public.moderation_actions (report_id, actor_id, actor_role, action, target_type, target_id, target_owner_id, note, until)
    values (r.id, me, public.mod_role_name(lvl), p_action, r.target_type, r.target_id, r.target_owner_id, p_note, until_at)
    returning id into aid;
  if p_action in ('mute_7d', 'mute') then
    insert into public.member_restrictions (user_id, kind, until, action_id) values (r.target_owner_id, 'mute', until_at, aid);
  elsif p_action = 'ban' then
    insert into public.member_restrictions (user_id, kind, until, action_id) values (r.target_owner_id, 'ban', null, aid);
  end if;
  update public.moderation_reports
    set status = case when p_action = 'dismiss' then 'dismissed' else 'actioned' end,
        resolved_at = now(), resolved_by = me, resolution = p_action
    where id = r.id;
  return aid;
end $$;
revoke all on function public.moderate(uuid, text, text, int) from public;
grant execute on function public.moderate(uuid, text, text, int) to authenticated;

-- Founder: undo an earlier action (unhide, unmute, lift a ban or suspension, restore a listing).
create or replace function public.override_action(p_action bigint, p_note text default null, p_reason text default 'override') returns bigint
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); a public.moderation_actions; aid bigint;
begin
  if me is null or public.mod_level() < 3 then raise exception 'not_allowed_for_role'; end if;
  select * into a from public.moderation_actions where id = p_action;
  if a.id is null then raise exception 'not_found'; end if;
  if a.target_owner_id = me then raise exception 'own_business'; end if;
  if a.action = 'hide_in_group' then
    if a.target_type = 'post' then update public.feed_posts set group_hidden = false where id = a.target_id;
    else update public.feed_comments set status = 'published' where id = a.target_id; end if;
  elsif a.action in ('hide', 'auto_hold') then
    if a.target_type = 'post' then update public.feed_posts set status = 'published', held_reason = null where id = a.target_id;
    elsif a.target_type = 'comment' then update public.feed_comments set status = 'published' where id = a.target_id; end if;
  elsif a.action in ('mute', 'mute_7d', 'ban') then
    update public.member_restrictions set lifted_at = now() where action_id = a.id and lifted_at is null;
    if a.action = 'ban' then update public.profiles set status = 'active' where id = a.target_owner_id; end if;
  elsif a.action = 'suspend' then
    update public.profiles set status = 'active' where id = a.target_owner_id;
  elsif a.action = 'remove_listing' then
    update public.businesses set lifecycle_status = 'approved', publication_status = 'published', published = true where id = a.target_id;
  elsif a.action not in ('warn', 'verify', 'dismiss') then
    raise exception 'cannot_override';
  end if;
  insert into public.moderation_actions (report_id, actor_id, actor_role, action, target_type, target_id, target_owner_id, note, ref_action_id)
    values (a.report_id, me, 'founder', case when p_reason in ('appeal_overturned') then p_reason else 'override' end,
            a.target_type, a.target_id, a.target_owner_id, nullif(left(btrim(coalesce(p_note, '')), 500), ''), a.id)
    returning id into aid;
  return aid;
end $$;
revoke all on function public.override_action(bigint, text, text) from public;
grant execute on function public.override_action(bigint, text, text) to authenticated;

-- Founder: policy changes (keyword list) are logged too.
create or replace function public.moderation_keywords_log() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.moderation_actions (actor_id, actor_role, action, note)
    values (auth.uid(), 'founder', 'policy',
      case when tg_op = 'INSERT' then 'Added keyword (' || new.action || '): ' || new.phrase else 'Removed keyword: ' || old.phrase end);
  return null;
end $$;
drop trigger if exists moderation_keywords_log on public.moderation_keywords;
create trigger moderation_keywords_log after insert or delete on public.moderation_keywords
  for each row when (auth.uid() is not null) execute function public.moderation_keywords_log();

-- ---------------------------------------------------------------------------
-- Appeals: a member appeals an action taken against them; founders decide (7-day target).
-- ---------------------------------------------------------------------------
create table if not exists public.moderation_appeals (
  id uuid primary key default gen_random_uuid(),
  action_id bigint not null unique references public.moderation_actions(id) on delete cascade,
  appellant_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 10 and 1000),
  status text not null default 'open' check (status in ('open', 'upheld', 'overturned')),
  created_at timestamptz not null default now(),
  due_at timestamptz not null default now() + interval '7 days',
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  decision_note text check (decision_note is null or char_length(decision_note) <= 500)
);
alter table public.moderation_appeals enable row level security;
revoke all on public.moderation_appeals from anon;
revoke all on public.moderation_appeals from authenticated;
grant select on public.moderation_appeals to authenticated;
drop policy if exists moderation_appeals_read on public.moderation_appeals;
create policy moderation_appeals_read on public.moderation_appeals for select to authenticated
  using (appellant_id = auth.uid() or public.mod_level() = 3);

create or replace function public.file_appeal(p_action bigint, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); a public.moderation_actions; id uuid;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  select * into a from public.moderation_actions where moderation_actions.id = p_action;
  if a.id is null or a.target_owner_id is distinct from me
     or a.action not in ('hide_in_group', 'warn', 'mute_7d', 'hide', 'mute', 'suspend', 'remove_listing', 'ban', 'auto_hold') then
    raise exception 'not_found';
  end if;
  if a.created_at < now() - interval '30 days' then raise exception 'appeal_too_late'; end if;
  insert into public.moderation_appeals (action_id, appellant_id, body) values (a.id, me, btrim(p_body)) returning moderation_appeals.id into id;
  return id;
exception when unique_violation then raise exception 'appeal_exists';
end $$;
revoke all on function public.file_appeal(bigint, text) from public;
grant execute on function public.file_appeal(bigint, text) to authenticated;

create or replace function public.decide_appeal(p_appeal uuid, p_decision text, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); ap public.moderation_appeals; a public.moderation_actions;
begin
  if me is null or public.mod_level() < 3 then raise exception 'not_allowed_for_role'; end if;
  if p_decision not in ('upheld', 'overturned') then raise exception 'invalid_decision'; end if;
  select * into ap from public.moderation_appeals where id = p_appeal for update;
  if ap.id is null or ap.status <> 'open' then raise exception 'not_found'; end if;
  if ap.appellant_id = me then raise exception 'own_business'; end if;
  select * into a from public.moderation_actions where id = ap.action_id;
  if p_decision = 'overturned' then
    perform public.override_action(a.id, p_note, 'appeal_overturned');
  else
    insert into public.moderation_actions (report_id, actor_id, actor_role, action, target_type, target_id, target_owner_id, note, ref_action_id)
      values (a.report_id, me, 'founder', 'appeal_upheld', a.target_type, a.target_id, a.target_owner_id, nullif(left(btrim(coalesce(p_note, '')), 500), ''), a.id);
  end if;
  update public.moderation_appeals set status = p_decision, decided_at = now(), decided_by = me,
    decision_note = nullif(left(btrim(coalesce(p_note, '')), 500), '') where id = ap.id;
end $$;
revoke all on function public.decide_appeal(uuid, text, text) from public;
grant execute on function public.decide_appeal(uuid, text, text) to authenticated;

-- What a member sees about actions taken on their own account or content (never who took them).
create or replace function public.my_moderation_notices() returns table (
  action_id bigint, action text, target_type text, target_id uuid, note text, until timestamptz, created_at timestamptz,
  appeal_status text, can_appeal boolean)
language sql stable security definer set search_path = public as $$
  select a.id, a.action, a.target_type, a.target_id, a.note, a.until, a.created_at, ap.status,
    ap.id is null and a.created_at > now() - interval '30 days'
  from public.moderation_actions a left join public.moderation_appeals ap on ap.action_id = a.id
  where a.target_owner_id = auth.uid()
    and a.action in ('hide_in_group', 'warn', 'mute_7d', 'hide', 'mute', 'suspend', 'remove_listing', 'ban', 'auto_hold')
  order by a.created_at desc limit 50;
$$;
revoke all on function public.my_moderation_notices() from public;
grant execute on function public.my_moderation_notices() to authenticated;

-- What was reported, for the queue (moderators may not be able to read hidden or held posts directly).
create or replace function public.report_previews(ids uuid[]) returns table (report_id uuid, owner_name text, preview text, link text)
language sql stable security definer set search_path = public as $$
  select r.id,
    coalesce(
      (select b.name from public.businesses b where b.owner_id = r.target_owner_id and b.published order by b.created_at limit 1),
      (select p.full_name from public.profiles p where p.id = r.target_owner_id), 'FLAME PH member'),
    case r.target_type
      when 'post' then (select left(p.body, 400) from public.feed_posts p where p.id = r.target_id)
      when 'comment' then (select left(c.body, 400) from public.feed_comments c where c.id = r.target_id)
      when 'listing' then (select b.name || coalesce(' · ' || b.sector, '') from public.businesses b where b.id = r.target_id)
      when 'member' then (select p.full_name from public.profiles p where p.id = r.target_id)
    end,
    case r.target_type
      when 'post' then '/posts/' || r.target_id
      when 'comment' then (select '/posts/' || c.post_id || '#comment-' || c.id from public.feed_comments c where c.id = r.target_id)
      when 'listing' then (select '/members/' || b.slug from public.businesses b where b.id = r.target_id)
      when 'member' then (select '/members/' || b.slug from public.businesses b where b.owner_id = r.target_id and b.published order by b.created_at limit 1)
    end
  from public.moderation_reports r
  where r.id = any (ids[1:100])
    and r.target_owner_id is distinct from auth.uid()
    and (public.mod_level() >= 2 or (public.mod_level() = 1 and public.in_chapter_scope(r.chapter_id, r.group_id)));
$$;
revoke all on function public.report_previews(uuid[]) from public;
grant execute on function public.report_previews(uuid[]) to authenticated;

-- How many open reports concern the moderator's own business (handled by other moderators).
create or replace function public.reports_about_me() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.moderation_reports where status = 'open' and target_owner_id = auth.uid() and public.mod_level() >= 1;
$$;
revoke all on function public.reports_about_me() from public;
grant execute on function public.reports_about_me() to authenticated;

-- ---------------------------------------------------------------------------
-- Automated layer on posts and comments, after the Phase 4 limits (rate, new accounts, duplicates, links).
-- Trigger names sort after feed_posts_prepare and feed_posts_zgroup, so these run last.
-- ---------------------------------------------------------------------------
create or replace function public.feed_moderation_check() returns trigger
language plpgsql security definer set search_path = public as $$
declare verdict text;
begin
  if auth.uid() is null then return new; end if;
  if public.member_is_muted(auth.uid()) then raise exception 'moderator_mute'; end if;
  verdict := public.moderation_text_check(new.body);
  if verdict = 'block' then raise exception 'blocked_words'; end if;
  if verdict like 'hold:%' then
    if tg_table_name = 'feed_posts' then
      if new.status = 'published' then new.status := 'held'; new.held_reason := substr(verdict, 6); end if;
    else
      new.status := 'hidden';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists feed_posts_zmoderation on public.feed_posts;
create trigger feed_posts_zmoderation before insert on public.feed_posts for each row execute function public.feed_moderation_check();
drop trigger if exists feed_comments_zmoderation on public.feed_comments;
create trigger feed_comments_zmoderation before insert on public.feed_comments for each row execute function public.feed_moderation_check();

-- Anything the automatic layer held goes into the queue as a report, and the hold is logged.
create or replace function public.feed_auto_report() returns trigger
language plpgsql security definer set search_path = public as $$
declare rid uuid; why text;
begin
  if tg_table_name = 'feed_posts' then
    if new.status <> 'held' then return null; end if;
    why := coalesce(new.held_reason, 'held');
    insert into public.moderation_reports (target_type, target_id, reason, details) values ('post', new.id, 'automatic', 'Held automatically: ' || why) returning id into rid;
    insert into public.moderation_actions (report_id, actor_role, action, target_type, target_id, target_owner_id, note)
      values (rid, 'system', 'auto_hold', 'post', new.id, new.author_id, 'Held automatically: ' || why);
  else
    if new.status <> 'hidden' then return null; end if;
    insert into public.moderation_reports (target_type, target_id, reason, details) values ('comment', new.id, 'automatic', 'Held automatically') returning id into rid;
    insert into public.moderation_actions (report_id, actor_role, action, target_type, target_id, target_owner_id, note)
      values (rid, 'system', 'auto_hold', 'comment', new.id, new.author_id, 'Held automatically');
  end if;
  return null;
end $$;
drop trigger if exists feed_posts_auto_report on public.feed_posts;
create trigger feed_posts_auto_report after insert on public.feed_posts for each row execute function public.feed_auto_report();
drop trigger if exists feed_comments_auto_report on public.feed_comments;
create trigger feed_comments_auto_report after insert on public.feed_comments for each row execute function public.feed_auto_report();
