-- Phase 8: Messenger, notifications and business inbox. Additive only: new tables, new functions, one new column on
-- business_inquiries (kind) and a "message" branch in the existing moderation functions. Nothing is deleted or renamed.
--
-- 1. conversations + direct_messages: member-to-member messages. Row level security lets only the two members in a
--    conversation read it. Sending is checked again in the database: active member, not muted by a moderator,
--    not blocked either way, the keyword filter, and a rate limit.
-- 2. notification_prefs: per-type choices (messages, leads, quotes, friend requests) for push and email.
-- 3. member_notifications: the in-app list shown in Workspace → Inbox. Written by the server only.
-- 4. business_inquiries.kind: 'inquiry' (default, every existing row) or 'quote' (a quote request).
-- 5. Reports on messages: the reporter must be in the conversation; moderators can read only the reported message.

-- ---------------------------------------------------------------------------
-- 1. Conversations and messages
-- ---------------------------------------------------------------------------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  member_a uuid not null references auth.users(id) on delete cascade,   -- the smaller of the two ids
  member_b uuid not null references auth.users(id) on delete cascade,
  started_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  last_sender_id uuid references auth.users(id) on delete set null,
  last_preview text check (last_preview is null or char_length(last_preview) <= 140),
  a_read_at timestamptz,
  b_read_at timestamptz,
  constraint conversations_pair_order check (member_a < member_b),
  constraint conversations_pair unique (member_a, member_b)
);
create index if not exists conversations_a on public.conversations (member_a, last_message_at desc);
create index if not exists conversations_b on public.conversations (member_b, last_message_at desc);

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  hidden_at timestamptz                               -- set by a moderator (Hide); the text is then not shown
);
create index if not exists direct_messages_conv on public.direct_messages (conversation_id, created_at desc);
create index if not exists direct_messages_sender on public.direct_messages (sender_id, created_at desc);

create or replace function public.is_conversation_member(conv uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from public.conversations c where c.id = conv and auth.uid() in (c.member_a, c.member_b));
$$;
revoke all on function public.is_conversation_member(uuid) from public;
grant execute on function public.is_conversation_member(uuid) to authenticated;

alter table public.conversations enable row level security;
revoke all on public.conversations from anon;
revoke all on public.conversations from authenticated;
grant select on public.conversations to authenticated;          -- created and updated only by the functions below
drop policy if exists conversations_members on public.conversations;
create policy conversations_members on public.conversations for select to authenticated
  using (auth.uid() = member_a or auth.uid() = member_b);

alter table public.direct_messages enable row level security;
revoke all on public.direct_messages from anon;
revoke all on public.direct_messages from authenticated;
grant select on public.direct_messages to authenticated;
grant insert (conversation_id, body) on public.direct_messages to authenticated;
drop policy if exists direct_messages_read on public.direct_messages;
create policy direct_messages_read on public.direct_messages for select to authenticated
  using (public.is_conversation_member(conversation_id));
drop policy if exists direct_messages_send on public.direct_messages;
create policy direct_messages_send on public.direct_messages for insert to authenticated
  with check (sender_id = auth.uid() and public.is_conversation_member(conversation_id));

-- Every rule for sending, in one place. Runs for every insert, whoever sends it.
create or replace function public.direct_messages_prepare() returns trigger
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c public.conversations; other uuid; verdict text;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  select * into c from public.conversations where id = new.conversation_id;
  if c.id is null or me not in (c.member_a, c.member_b) then raise exception 'not_found'; end if;
  other := case when me = c.member_a then c.member_b else c.member_a end;
  if not public.member_is_active(me) then raise exception 'not_active_member'; end if;
  if public.member_is_muted(me) then raise exception 'moderator_mute'; end if;
  if public.is_blocked_between(me, other) then raise exception 'blocked'; end if;
  if not public.member_is_active(other) then raise exception 'not_available'; end if;
  -- Rate limit: 30 messages in 10 minutes and 300 a day, across all conversations.
  if (select count(*) from public.direct_messages m where m.sender_id = me and m.created_at > now() - interval '10 minutes') >= 30
     or (select count(*) from public.direct_messages m where m.sender_id = me and m.created_at > now() - interval '1 day') >= 300 then
    raise exception 'message_rate_limit';
  end if;
  new.body := btrim(new.body);
  verdict := public.moderation_text_check(new.body);
  if verdict = 'block' then raise exception 'blocked_words'; end if;
  new.sender_id := me;
  new.created_at := now();
  new.hidden_at := null;
  return new;
end $$;
drop trigger if exists direct_messages_prepare on public.direct_messages;
create trigger direct_messages_prepare before insert on public.direct_messages for each row execute function public.direct_messages_prepare();

-- Keep the conversation list fresh: newest message, a short preview, and the sender has read up to now.
create or replace function public.direct_messages_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.conversations set
    last_message_at = new.created_at, last_sender_id = new.sender_id, last_preview = left(new.body, 140),
    a_read_at = case when member_a = new.sender_id then new.created_at else a_read_at end,
    b_read_at = case when member_b = new.sender_id then new.created_at else b_read_at end
  where id = new.conversation_id;
  return null;
end $$;
drop trigger if exists direct_messages_after on public.direct_messages;
create trigger direct_messages_after after insert on public.direct_messages for each row execute function public.direct_messages_after();

-- Start (or reopen) the conversation with one other member. Returns its id.
create or replace function public.start_conversation(p_other uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); a uuid; b uuid; cid uuid;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if p_other is null or p_other = me then raise exception 'not_found'; end if;
  a := least(me, p_other); b := greatest(me, p_other);
  select id into cid from public.conversations where member_a = a and member_b = b;
  if cid is not null then return cid; end if;
  if not public.member_is_active(me) then raise exception 'not_active_member'; end if;
  if public.member_is_muted(me) then raise exception 'moderator_mute'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_other and p.status = 'active') then raise exception 'not_found'; end if;
  if public.is_blocked_between(me, p_other) then raise exception 'blocked'; end if;
  -- New conversations: at most 20 a day per member (stops cold-message spam; replies are not limited by this).
  if (select count(*) from public.conversations c where c.started_by = me and c.created_at > now() - interval '1 day') >= 20 then
    raise exception 'new_conversation_limit';
  end if;
  insert into public.conversations (member_a, member_b, started_by) values (a, b, me)
    on conflict (member_a, member_b) do nothing returning id into cid;
  if cid is null then select id into cid from public.conversations where member_a = a and member_b = b; end if;
  return cid;
end $$;
revoke all on function public.start_conversation(uuid) from public;
grant execute on function public.start_conversation(uuid) to authenticated;

create or replace function public.mark_conversation_read(p_conversation uuid) returns void
language sql security definer set search_path = public as $$
  update public.conversations set
    a_read_at = case when member_a = auth.uid() then now() else a_read_at end,
    b_read_at = case when member_b = auth.uid() then now() else b_read_at end
  where id = p_conversation and auth.uid() in (member_a, member_b);
$$;
revoke all on function public.mark_conversation_read(uuid) from public;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- Unread messages for the signed-in member (shown on the top-bar Messages icon). Blocked members are not counted.
create or replace function public.unread_direct_messages() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int
  from public.conversations c
  join public.direct_messages m on m.conversation_id = c.id
  where auth.uid() in (c.member_a, c.member_b)
    and m.sender_id <> auth.uid()
    and m.hidden_at is null
    and m.created_at > coalesce(case when c.member_a = auth.uid() then c.a_read_at else c.b_read_at end, '-infinity'::timestamptz)
    and not public.is_blocked_between(c.member_a, c.member_b);
$$;
revoke all on function public.unread_direct_messages() from public;
grant execute on function public.unread_direct_messages() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Notification choices, per type and per channel. No row = the defaults below.
--    The weekly email ("digest") keeps using profiles.consent_marketing, as before.
-- ---------------------------------------------------------------------------
create table if not exists public.notification_prefs (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  messages_push boolean not null default true,
  messages_email boolean not null default true,
  leads_push boolean not null default true,
  leads_email boolean not null default true,
  quotes_push boolean not null default true,
  quotes_email boolean not null default true,
  requests_push boolean not null default true,
  requests_email boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.notification_prefs enable row level security;
revoke all on public.notification_prefs from anon;
revoke all on public.notification_prefs from authenticated;
grant select, insert, update on public.notification_prefs to authenticated;
drop policy if exists notification_prefs_own on public.notification_prefs;
create policy notification_prefs_own on public.notification_prefs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. In-app notifications (Workspace → Inbox → Notifications). The server writes them; members read their own
--    and mark them read. Nobody else can see them.
-- ---------------------------------------------------------------------------
create table if not exists public.member_notifications (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('message', 'lead', 'quote', 'request', 'notice')),
  title text not null check (char_length(title) <= 140),
  body text check (body is null or char_length(body) <= 300),
  url text check (url is null or (url like '/%' and char_length(url) <= 300)),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists member_notifications_user on public.member_notifications (user_id, created_at desc);
alter table public.member_notifications enable row level security;
revoke all on public.member_notifications from anon;
revoke all on public.member_notifications from authenticated;
grant select on public.member_notifications to authenticated;
grant update (read_at) on public.member_notifications to authenticated;
drop policy if exists member_notifications_read on public.member_notifications;
create policy member_notifications_read on public.member_notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists member_notifications_mark on public.member_notifications;
create policy member_notifications_mark on public.member_notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. Quote requests are inquiries with kind = 'quote'. Every existing row stays an inquiry.
-- ---------------------------------------------------------------------------
alter table public.business_inquiries add column if not exists kind text not null default 'inquiry';
do $$ begin
  alter table public.business_inquiries add constraint business_inquiries_kind check (kind in ('inquiry', 'quote'));
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 5. Reports, hide and undo for messages (extends 0019; the other branches are unchanged).
-- ---------------------------------------------------------------------------
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
  elsif new.target_type = 'message' then
    -- Only someone in the conversation can report a message. Messages are private: no chapter, so admins handle them.
    select m.sender_id, null, null into new.target_owner_id, new.chapter_id, new.group_id
      from public.direct_messages m join public.conversations c on c.id = m.conversation_id
      where m.id = new.target_id and (new.reporter_id is null or new.reporter_id in (c.member_a, c.member_b));
  else
    raise exception 'not_available_yet';   -- deal records arrive in a later phase
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

-- moderate(): unchanged except that Hide also works on a reported message.
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
    elsif r.target_type = 'message' then update public.direct_messages set hidden_at = now() where id = r.target_id;
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

-- override_action(): unchanged except that undoing Hide also restores a message.
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
    elsif a.target_type = 'comment' then update public.feed_comments set status = 'published' where id = a.target_id;
    elsif a.target_type = 'message' then update public.direct_messages set hidden_at = null where id = a.target_id; end if;
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

-- report_previews(): moderators see only the one reported message, never the rest of the conversation.
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
      when 'message' then (select 'Private message: ' || left(m.body, 400) from public.direct_messages m where m.id = r.target_id)
    end,
    case r.target_type
      when 'post' then '/posts/' || r.target_id
      when 'comment' then (select '/posts/' || c.post_id || '#comment-' || c.id from public.feed_comments c where c.id = r.target_id)
      when 'listing' then (select '/members/' || b.slug from public.businesses b where b.id = r.target_id)
      when 'member' then (select '/members/' || b.slug from public.businesses b where b.owner_id = r.target_id and b.published order by b.created_at limit 1)
      when 'message' then (select '/members/' || b.slug from public.businesses b where b.owner_id = r.target_owner_id and b.published order by b.created_at limit 1)
    end
  from public.moderation_reports r
  where r.id = any (ids[1:100])
    and r.target_owner_id is distinct from auth.uid()
    and (public.mod_level() >= 2 or (public.mod_level() = 1 and public.in_chapter_scope(r.chapter_id, r.group_id)));
$$;
revoke all on function public.report_previews(uuid[]) from public;
grant execute on function public.report_previews(uuid[]) to authenticated;
