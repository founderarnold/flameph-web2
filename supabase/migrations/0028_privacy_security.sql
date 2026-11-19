-- Phase 12: security, privacy and abuse hardening. Additive: new tables, columns and functions, tighter function
-- rights, and guards on existing helpers. No row is changed except the two settings named below. Take a backup before
-- applying.
--
-- Parts:
--   A. Gaps found by the Phase 12 RLS review (owner report, section 1)
--   B. Closed accounts and the data-rights requests (access, correction, erasure, objection, portability)
--   C. Retention: one schedule, enforced daily by privacy_retention_run()
--   D. Breach detection signals and the 72-hour incident log
--   E. Abuse: account-age limits and the abuse signals list
--   F. Audit logs that cannot be edited or deleted

-- ===========================================================================================================
-- A. RLS review fixes
-- ===========================================================================================================

-- A1. Members could change their own created_at (which would get round the new-account limits and the 3-month badge
--     rule) and their consent flags directly, without a row in the consent log. Only the server can change them now.
--     The consent log trigger (sync_profile_consent) still keeps consent_marketing in step, as before.
alter table public.profiles add column if not exists closed_at timestamptz;
alter table public.profiles add column if not exists hide_from_suggestions boolean not null default false;

create or replace function public.protect_profile_fields() returns trigger
language plpgsql as $$
begin
  if not public.is_trusted() then
    new.tier = old.tier;
    new.status = old.status;
    new.member_code = old.member_code;
    new.referred_by = old.referred_by;
    new.email_verified_at = old.email_verified_at;
    new.email_verification_required = old.email_verification_required;
    new.mobile_verified_at = old.mobile_verified_at;
    new.mobile_verification_method = old.mobile_verification_method;
    -- Phase 12
    new.created_at = old.created_at;
    new.consent_privacy = old.consent_privacy;
    new.consent_marketing = old.consent_marketing;
    new.consent_at = old.consent_at;
    new.closed_at = old.closed_at;
  end if;
  return new;
end; $$;

-- A2. Helpers that answered questions about ANY member to any caller. They now answer only about the caller (or a pair
--     that includes the caller). Inside the database's own functions and for the server they work as before.
-- "Is the caller a member or visitor talking to the database directly?" (as opposed to the server, a scheduled job, or
-- the database's own functions acting for the server). Inside a SECURITY DEFINER function current_user is always the
-- owner, so the role in the caller's sign-in token is what tells them apart.
create or replace function public.caller_is_client() returns boolean
language sql stable as $$
  select coalesce(auth.role(), '') in ('anon', 'authenticated');
$$;

-- has_consent: a member may ask about their own switches. Anyone may ask about switch 2 ("records"), because a member's
-- record count is already public on their profile when it is on. The server may ask anything.
create or replace function public.has_consent(uid uuid, k text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when uid is not distinct from auth.uid() or k = 'records' or not public.caller_is_client() then
      coalesce((select c.granted from public.member_consents c where c.user_id = uid and c.consent_key = k
                order by c.created_at desc, c.id desc limit 1), false)
    else false end;
$$;

-- is_blocked_between: only for a pair that includes the caller (every page and rule asks it that way).
create or replace function public.is_blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select a is not null and b is not null
    and (not public.caller_is_client() or auth.uid() in (a, b))
    and exists (select 1 from public.member_blocks k where (k.blocker_id = a and k.blocked_id = b) or (k.blocker_id = b and k.blocked_id = a));
$$;

-- member_is_muted: only about the caller.
create or replace function public.member_is_muted(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (not public.caller_is_client() or uid is not distinct from auth.uid())
    and exists (select 1 from public.member_restrictions m
      where m.user_id = uid and m.lifted_at is null and (m.until is null or m.until > now()));
$$;

-- A3. The 24-hour escalation: only moderators (or the scheduled job) may run it.
create or replace function public.escalate_overdue_reports() returns integer
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if public.caller_is_client() and public.mod_level() < 1 then return 0; end if;
  with moved as (
    update public.moderation_reports set escalated_at = now(), escalation_reason = '24_hours'
    where status = 'open' and escalated_at is null and due_at <= now()
    returning id, target_type, target_id, target_owner_id)
  insert into public.moderation_actions (report_id, actor_id, actor_role, action, target_type, target_id, target_owner_id, note)
    select id, null, 'system', 'escalate', target_type, target_id, target_owner_id, 'No action within 24 hours: moved to the admin queue.' from moved;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.escalate_overdue_reports() from public, anon;
grant execute on function public.escalate_overdue_reports() to authenticated, service_role;

-- A4. Server-only functions. "revoke from public" alone left them callable by visitors and members, because Supabase
--     also grants anon and authenticated directly. Most important: release_record() changed a disputed record with no
--     check on who asked. Each one below is only ever called by the database itself or by the server.
do $$
declare f text;
begin
  foreach f in array array[
    'public.release_record(uuid, boolean)', 'public.records_actor_check(uuid)', 'public.counted_records()',
    'public.moderation_text_check(text)', 'public.member_id_for_verified_email(text)', 'public.vetting_documents_due()',
    'public.orphan_post_media(integer)', 'public.ecosystem_switch(text)', 'public.ecosystem_log(text, uuid, text, text[], text, text)',
    'public.ecosystem_badges(text, uuid[])', 'public.ecosystem_cleanup()', 'public.consume_rate_limit(text, text, integer, integer, integer, boolean)',
    'public.clear_rate_limit(text, text)', 'public.business_submission_missing_requirements(uuid, uuid)',
    'public.record_business_moderation(uuid, uuid, text, text[], text[], text, jsonb)', 'public.submit_business_for_review(uuid, uuid)'
  ] loop
    if to_regprocedure(f) is not null then
      execute format('revoke all on function %s from public, anon, authenticated', f);
      execute format('grant execute on function %s to service_role', f);
    end if;
  end loop;
end $$;

-- A5. Public photo bucket: a size cap (50 MB; post videos are 20 MB, photos 5 MB). Only set when no cap exists yet.
update storage.buckets set file_size_limit = 52428800 where id = 'media' and file_size_limit is null;

-- ===========================================================================================================
-- B. Closed accounts and data-rights requests
-- ===========================================================================================================

-- A closed account is hidden everywhere that already checks status = 'active' (posts, messages, suggestions, badges,
-- sign-in to the other sites). Its data is erased 1 year after closing (Privacy Notice, section 5), or sooner when the
-- member asks for erasure.
do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'public.profiles'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ~ 'status' and pg_get_constraintdef(oid) ~ 'suspended' loop
    execute format('alter table public.profiles drop constraint %I', c);
  end loop;
end $$;
alter table public.profiles add constraint profiles_status_check check (status = any (array['active', 'suspended', 'closed']));

-- 15 working days (Monday to Friday) from a time: the answer deadline in the Privacy Notice, section 6.
create or replace function public.add_working_days(t timestamptz, n int) returns timestamptz
language plpgsql immutable as $$
declare d timestamptz := t; left_ int := n;
begin
  while left_ > 0 loop
    d := d + interval '1 day';
    if extract(isodow from d at time zone 'Asia/Manila') < 6 then left_ := left_ - 1; end if;
  end loop;
  return d;
end $$;

create table if not exists public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,                                   -- no foreign key: the row stays as proof after the account is erased
  member_code text,
  kind text not null check (kind in ('access', 'correction', 'erasure', 'objection', 'portability', 'closure')),
  details text check (details is null or char_length(details) <= 2000),
  status text not null default 'open' check (status in ('open', 'in_progress', 'done', 'refused', 'withdrawn')),
  source text not null default 'member' check (source in ('member', 'email', 'consent_switch', 'retention')),
  due_at timestamptz not null,
  erase_after timestamptz,                        -- erasure only: when it runs if the DPO has not acted or put it on hold
  hold_reason text check (hold_reason is null or char_length(hold_reason) <= 500),
  meta jsonb not null default '{}'::jsonb,
  response text check (response is null or char_length(response) <= 2000),
  handled_by uuid,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists privacy_requests_user on public.privacy_requests (user_id, created_at desc);
create index if not exists privacy_requests_open on public.privacy_requests (due_at) where status in ('open', 'in_progress');
alter table public.privacy_requests enable row level security;
revoke all on public.privacy_requests from anon, authenticated;
grant select on public.privacy_requests to authenticated;
drop policy if exists privacy_requests_read on public.privacy_requests;
create policy privacy_requests_read on public.privacy_requests for select to authenticated
  using (user_id = auth.uid() or public.mod_level() >= 2);

-- Close an account now (server and the functions below only).
create or replace function public.privacy_close_account(p_user uuid, p_request uuid) returns void
language plpgsql security definer set search_path = public as $$
declare prev text; hidden uuid[];
begin
  select status into prev from public.profiles where id = p_user for update;
  if prev is null or prev = 'closed' then return; end if;
  with h as (update public.businesses set publication_status = 'unpublished' where owner_id = p_user and published returning id)
    select coalesce(array_agg(id), '{}') into hidden from h;
  update public.profiles set status = 'closed', closed_at = now() where id = p_user;
  if p_request is not null then
    update public.privacy_requests set meta = meta || jsonb_build_object('prev_status', prev, 'unpublished', hidden) where id = p_request;
  end if;
  insert into public.audit_log (actor_id, action, table_name, row_id, detail)
    values (auth.uid(), 'privacy_close_account', 'profiles', p_user::text, jsonb_build_object('request', p_request, 'listings_hidden', cardinality(hidden)));
end $$;
revoke all on function public.privacy_close_account(uuid, uuid) from public, anon, authenticated;
grant execute on function public.privacy_close_account(uuid, uuid) to service_role;

-- A member asks for something. Access and portability are also self-service (Download my data); erasure and closure
-- close the account at once.
create or replace function public.privacy_request_submit(p_kind text, p_details text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); rid uuid; code text; st text; d text := nullif(btrim(coalesce(p_details, '')), '');
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if p_kind not in ('access', 'correction', 'erasure', 'objection', 'portability', 'closure') then raise exception 'bad_kind'; end if;
  if p_kind in ('correction', 'objection') and coalesce(char_length(d), 0) < 10 then raise exception 'details_needed'; end if;
  if char_length(d) > 2000 then raise exception 'details_too_long'; end if;
  if (select count(*) from public.privacy_requests r where r.user_id = me and r.created_at > now() - interval '1 day') >= 5 then
    raise exception 'privacy_rate_limit';
  end if;
  if exists (select 1 from public.privacy_requests r where r.user_id = me and r.kind = p_kind and r.status in ('open', 'in_progress')) then
    raise exception 'already_open';
  end if;
  select member_code, status into code, st from public.profiles where id = me;
  if p_kind = 'closure' and st = 'closed' then raise exception 'already_closed'; end if;
  insert into public.privacy_requests (user_id, member_code, kind, details, due_at, erase_after, status, closed_at, response)
  values (me, code, p_kind, d, public.add_working_days(now(), 15),
          case when p_kind = 'erasure' then now() + interval '7 days' end,
          case when p_kind = 'closure' then 'done' else 'open' end,
          case when p_kind = 'closure' then now() end,
          case when p_kind = 'closure' then 'Account closed at the member''s request. Data is erased 1 year after closing unless the member reopens it.' end)
  returning id into rid;
  if p_kind in ('erasure', 'closure') then perform public.privacy_close_account(me, rid); end if;
  insert into public.audit_log (actor_id, action, table_name, row_id, detail) values (me, 'privacy_request', 'privacy_requests', rid::text, jsonb_build_object('kind', p_kind));
  return rid;
end $$;
revoke all on function public.privacy_request_submit(text, text) from public, anon;
grant execute on function public.privacy_request_submit(text, text) to authenticated;

-- A member reopens a closed account (any time before it is erased). Their listings come back as they were, and an open
-- erasure request is withdrawn.
create or replace function public.privacy_reopen_account() returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r record; prev text := 'active'; ids uuid[] := '{}';
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if not exists (select 1 from public.profiles where id = me and status = 'closed') then raise exception 'not_closed'; end if;
  for r in select * from public.privacy_requests where user_id = me and kind in ('erasure', 'closure') order by created_at desc loop
    if r.meta ? 'prev_status' then
      prev := coalesce(r.meta->>'prev_status', 'active');
      ids := coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(r.meta->'unpublished') x), '{}');
      exit;
    end if;
  end loop;
  if prev not in ('active', 'suspended') then prev := 'active'; end if;
  update public.profiles set status = prev, closed_at = null where id = me;
  update public.businesses set publication_status = 'published' where owner_id = me and id = any(ids);  -- the listing rules still apply
  update public.privacy_requests set status = 'withdrawn', closed_at = now(), response = 'Withdrawn: the member reopened the account.'
    where user_id = me and kind = 'erasure' and status in ('open', 'in_progress');
  insert into public.audit_log (actor_id, action, table_name, row_id, detail) values (me, 'privacy_reopen_account', 'profiles', me::text, jsonb_build_object('status', prev));
end $$;
revoke all on function public.privacy_reopen_account() from public, anon;
grant execute on function public.privacy_reopen_account() to authenticated;

-- A member withdraws an open request (an erasure request is withdrawn by reopening the account).
create or replace function public.privacy_request_withdraw(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not_signed_in'; end if;
  update public.privacy_requests set status = 'withdrawn', closed_at = now(), response = 'Withdrawn by the member.'
    where id = p_id and user_id = me and status in ('open', 'in_progress') and kind not in ('erasure', 'closure');
  if not found then raise exception 'not_found'; end if;
end $$;
revoke all on function public.privacy_request_withdraw(uuid) from public, anon;
grant execute on function public.privacy_request_withdraw(uuid) to authenticated;

-- Objection: "Don't suggest me to other members". Both suggestion lists now leave out members who chose it.
create or replace function public.mutual_suggestions(max_rows integer default 12)
returns table (user_id uuid, mutual integer)
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as id),
  my_friends as (
    select case when f.requester_id = me.id then f.addressee_id else f.requester_id end as id
    from public.friendships f, me where f.status = 'accepted' and (f.requester_id = me.id or f.addressee_id = me.id)
  ),
  my_follows as (select m.followee_id as id from public.member_follows m, me where m.follower_id = me.id),
  hop as (
    select case when f.requester_id = mf.id then f.addressee_id else f.requester_id end as id, mf.id as via
    from public.friendships f join my_friends mf on f.status = 'accepted' and (f.requester_id = mf.id or f.addressee_id = mf.id)
    union
    select m.followee_id, fo.id from public.member_follows m join my_follows fo on m.follower_id = fo.id
  )
  select h.id, count(distinct h.via)::int
  from hop h, me
  where h.id <> me.id
    and h.id not in (select id from my_friends) and h.id not in (select id from my_follows)
    and not public.is_blocked_between(h.id, me.id) and public.member_is_active(h.id)
    and not exists (select 1 from public.profiles hp where hp.id = h.id and hp.hide_from_suggestions)
  group by h.id
  order by 2 desc
  limit least(greatest(max_rows, 1), 50);
$$;
revoke all on function public.mutual_suggestions(int) from public, anon;
grant execute on function public.mutual_suggestions(int) to authenticated;

create or replace function public.suggest_members(max_rows integer default 24)
returns table (user_id uuid, reason text, detail text, score integer)
language sql stable security definer set search_path = public as $$
  with me as (
    select p.id, nullif(btrim(p.province), '') as province, nullif(btrim(p.city), '') as city, p.chapter_id,
      array(select distinct x from unnest(coalesce(p.industries, '{}')
        || coalesce((select array_agg(b.sector) from public.businesses b where b.owner_id = p.id and b.sector is not null), '{}')) x) as wants
    from public.profiles p where p.id = auth.uid() and p.status = 'active'
  ),
  my_groups as (select g.group_id from public.group_members g join me on g.user_id = me.id),
  mutual as (select m.user_id, m.mutual from public.mutual_suggestions(50) m),
  cand as (
    select p.id, p.created_at,
      (me.city is not null and lower(btrim(coalesce(p.city, ''))) = lower(me.city)
        and lower(btrim(coalesce(p.province, ''))) = lower(coalesce(me.province, ''))) as same_city,
      (me.province is not null and lower(btrim(coalesce(p.province, ''))) = lower(me.province)) as same_province,
      (me.chapter_id is not null and p.chapter_id = me.chapter_id) as same_chapter,
      (select x from unnest(coalesce(p.industries, '{}')
         || coalesce((select array_agg(b.sector) from public.businesses b where b.owner_id = p.id and b.sector is not null), '{}')) x
       where x = any (me.wants) limit 1) as shared,
      (select count(*) from unnest(coalesce(p.industries, '{}')) x where x = any (me.wants))::int as shared_n,
      (select count(*) from public.group_members g where g.user_id = p.id and g.group_id in (select group_id from my_groups))::int as groups_n,
      coalesce(mu.mutual, 0) as mutual,
      p.city, p.province
    from public.profiles p
    cross join me
    left join mutual mu on mu.user_id = p.id
    where p.id <> me.id and p.status = 'active' and not p.hide_from_suggestions
      and (nullif(btrim(p.full_name), '') is not null or exists (select 1 from public.businesses b where b.owner_id = p.id and nullif(btrim(b.name), '') is not null))
      and not public.is_blocked_between(p.id, me.id)
      and not exists (select 1 from public.member_follows f where f.follower_id = me.id and f.followee_id = p.id)
      and not exists (select 1 from public.member_mutes m where m.muter_id = me.id and m.muted_id = p.id)
      and not exists (select 1 from public.friendships f where (f.requester_id = me.id and f.addressee_id = p.id) or (f.requester_id = p.id and f.addressee_id = me.id))
  )
  select c.id,
    case when c.same_city then 'city' when c.same_chapter then 'chapter' when c.mutual > 0 then 'mutual'
         when c.shared is not null then 'industry' when c.same_province then 'province' when c.groups_n > 0 then 'group' else 'new' end,
    case when c.same_city then c.city when c.same_chapter then null when c.mutual > 0 then c.mutual::text
         when c.shared is not null then c.shared when c.same_province then c.province else null end,
    (c.same_city::int * 5 + c.same_chapter::int * 4 + least(c.mutual, 3) * 3 + c.same_province::int * 3
      + least(greatest(c.shared_n, (c.shared is not null)::int), 3) * 2 + least(c.groups_n, 3))
  from cand c
  order by 4 desc, c.created_at desc
  limit least(greatest(max_rows, 1), 50);
$$;
revoke all on function public.suggest_members(int) from public, anon;
grant execute on function public.suggest_members(int) to authenticated;

-- Erasure, step 1 of 2 (server only). Deletes the member's rows that would otherwise survive the account deletion
-- (they point at the account with "set null" and still hold the member's details). Step 2, done by the server, deletes
-- the files and then the sign-in account, which removes everything else that belongs to it.
create or replace function public.privacy_erase_prepare(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare mail text; out_ jsonb := '{}'::jsonb; n int;
begin
  if exists (select 1 from public.roles where user_id = p_user) then raise exception 'has_staff_role'; end if;
  select email into mail from auth.users where id = p_user;
  delete from public.submissions where user_id = p_user or (mail is not null and lower(email) = lower(mail)); get diagnostics n = row_count; out_ := out_ || jsonb_build_object('form_messages', n);
  delete from public.business_inquiries where from_user_id = p_user; get diagnostics n = row_count; out_ := out_ || jsonb_build_object('inquiries_sent', n);
  delete from public.ai_feedback where user_id = p_user; get diagnostics n = row_count; out_ := out_ || jsonb_build_object('ai_feedback', n);
  delete from public.event_registrations where user_id = p_user; get diagnostics n = row_count; out_ := out_ || jsonb_build_object('event_registrations', n);
  delete from public.resource_downloads where user_id = p_user;
  delete from public.property_inquiries where user_id = p_user;
  delete from public.corporate_h_referral_partners where user_id = p_user;
  delete from public.corporate_h_applications where user_id = p_user;
  if mail is not null then delete from public.newsletter_subscribers where lower(email) = lower(mail); end if;
  -- Reports this member filed stay for the moderation record (3 years) without their name: reporter_id is set to null
  -- when the account goes. Their consent history goes with the account; the request row below is the proof.
  return out_;
end $$;
revoke all on function public.privacy_erase_prepare(uuid) from public, anon, authenticated;
grant execute on function public.privacy_erase_prepare(uuid) to service_role;

-- Who is due for erasure now: erasure requests past their date and not on hold, and accounts closed more than 1 year ago.
create or replace function public.privacy_due_erasures() returns table (user_id uuid, request_id uuid, why text)
language sql stable security definer set search_path = public as $$
  select r.user_id, r.id, 'erasure_request' from public.privacy_requests r
  where r.kind = 'erasure' and r.status in ('open', 'in_progress') and r.hold_reason is null and r.erase_after <= now()
    and exists (select 1 from auth.users u where u.id = r.user_id)
  union all
  select p.id, null, 'closed_1_year' from public.profiles p
  where p.status = 'closed' and p.closed_at < now() - interval '1 year'
    and not exists (select 1 from public.privacy_requests r where r.user_id = p.id and r.kind = 'erasure' and r.hold_reason is not null and r.status in ('open', 'in_progress'))
  limit 50;
$$;
revoke all on function public.privacy_due_erasures() from public, anon, authenticated;
grant execute on function public.privacy_due_erasures() to service_role;

-- Switch 1 turned off in Settings = a closure request. If the member hasn't turned it back on within 15 working days,
-- the account is closed (the old flow only emailed the team).
create or replace function public.privacy_due_closures() returns table (user_id uuid, request_id uuid)
language sql stable security definer set search_path = public as $$
  select r.user_id, r.id from public.privacy_requests r
  where r.kind = 'closure' and r.source = 'consent_switch' and r.status = 'open' and r.due_at <= now()
  limit 50;
$$;
revoke all on function public.privacy_due_closures() from public, anon, authenticated;
grant execute on function public.privacy_due_closures() to service_role;

-- ===========================================================================================================
-- C. Retention schedule (Privacy Notice, section 5). One list, enforced daily. The app shows the same list.
-- ===========================================================================================================
create table if not exists public.retention_runs (
  id bigserial primary key,
  ran_at timestamptz not null default now(),
  dry_run boolean not null default false,
  counts jsonb not null default '{}'::jsonb
);
alter table public.retention_runs enable row level security;
revoke all on public.retention_runs from anon, authenticated;
grant select on public.retention_runs to authenticated;
drop policy if exists retention_runs_read on public.retention_runs;
create policy retention_runs_read on public.retention_runs for select to authenticated using (public.mod_level() >= 2);

create or replace function public.retention_rules() returns table (key text, label text, keep interval)
language sql immutable as $$
  values
    ('ai_chats',            'Ka-FLAME AI chats and feedback',                       interval '1 year'),
    ('moderation_cases',    'Moderation cases (reports, actions, appeals)',         interval '3 years'),
    ('records_unconfirmed', 'Transaction records never confirmed',                  interval '180 days'),
    ('records_closed',      'Cancelled or voided transaction records',              interval '1 year'),
    ('messages',            'Conversations with no new message',                     interval '2 years'),
    ('notifications',       'In-app notices',                                       interval '1 year'),
    ('audit_log',           'Audit log of admin and privacy actions',               interval '3 years'),
    ('vetting_access_log',  'Log of who opened vetting documents',                  interval '3 years'),
    ('ecosystem_access_log','Log of data sent to MarketplacePH and NegosyoDepot',   interval '1 year'),
    ('security_signals',    'Automatic security alerts',                            interval '1 year'),
    ('rate_limits',         'Rate-limit counters (hashed)',                         interval '7 days'),
    ('form_messages',       'Form messages (contact, join interest and similar)',   interval '2 years'),
    ('newsletter_pending',  'Newsletter sign-ups never confirmed',                  interval '30 days'),
    ('privacy_requests',    'Closed privacy requests (proof of what we did)',       interval '3 years'),
    ('retention_runs',      'Reports of these clean-ups',                           interval '1 year');
$$;

create or replace function public.retention_keep(k text) returns interval
language sql immutable as $$ select keep from public.retention_rules() where key = k $$;

create or replace function public.privacy_retention_run(p_dry boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare out_ jsonb := '{}'::jsonb; n int;
  -- One step: count (dry run) or delete, then record the number.
begin
  perform set_config('flameph.retention', 'on', true);

  -- AI chats: messages older than 1 year, then conversations left empty and older than 1 year.
  if p_dry then select count(*) into n from public.ai_messages where created_at < now() - retention_keep('ai_chats');
  else delete from public.ai_messages where created_at < now() - retention_keep('ai_chats'); get diagnostics n = row_count; end if;
  out_ := out_ || jsonb_build_object('ai_messages', n);
  if not p_dry then
    delete from public.ai_conversations c where c.created_at < now() - retention_keep('ai_chats')
      and not exists (select 1 from public.ai_messages m where m.conversation_id = c.id);
    delete from public.ai_feedback where created_at < now() - retention_keep('ai_chats');
  end if;

  -- Moderation cases: closed reports 3 years after they were resolved, then actions older than 3 years (appeals go with
  -- their action). Open cases are never removed.
  if p_dry then select count(*) into n from public.moderation_reports where status <> 'open' and coalesce(resolved_at, created_at) < now() - retention_keep('moderation_cases');
  else delete from public.moderation_reports where status <> 'open' and coalesce(resolved_at, created_at) < now() - retention_keep('moderation_cases'); get diagnostics n = row_count; end if;
  out_ := out_ || jsonb_build_object('moderation_reports', n);
  if not p_dry then
    delete from public.moderation_actions a where a.created_at < now() - retention_keep('moderation_cases')
      and not exists (select 1 from public.moderation_reports r where r.id = a.report_id and r.status = 'open')
      and not exists (select 1 from public.moderation_appeals p where p.action_id = a.id and p.status = 'open');
  end if;

  -- Transaction records: never confirmed after 180 days; cancelled or voided after 1 year. Confirmed and disputed
  -- records stay while both accounts exist (they make up each member's badge).
  if p_dry then select count(*) into n from public.transaction_records where status in ('in_progress', 'pending') and created_at < now() - retention_keep('records_unconfirmed');
  else delete from public.transaction_records where status in ('in_progress', 'pending') and created_at < now() - retention_keep('records_unconfirmed'); get diagnostics n = row_count; end if;
  out_ := out_ || jsonb_build_object('records_unconfirmed', n);
  if p_dry then select count(*) into n from public.transaction_records where status in ('cancelled', 'voided') and coalesce(voided_at, created_at) < now() - retention_keep('records_closed');
  else delete from public.transaction_records where status in ('cancelled', 'voided') and coalesce(voided_at, created_at) < now() - retention_keep('records_closed'); get diagnostics n = row_count; end if;
  out_ := out_ || jsonb_build_object('records_closed', n);

  -- Messages: a conversation with no new message for 2 years is deleted with its messages. A message under an open
  -- moderation report is kept until the case closes.
  if p_dry then select count(*) into n from public.conversations c where coalesce(c.last_message_at, c.created_at) < now() - retention_keep('messages');
  else
    delete from public.conversations c where coalesce(c.last_message_at, c.created_at) < now() - retention_keep('messages')
      and not exists (select 1 from public.direct_messages m join public.moderation_reports r on r.target_type = 'message' and r.target_id = m.id and r.status = 'open'
                      where m.conversation_id = c.id);
    get diagnostics n = row_count;
  end if;
  out_ := out_ || jsonb_build_object('conversations', n);

  if p_dry then select count(*) into n from public.member_notifications where created_at < now() - retention_keep('notifications');
  else delete from public.member_notifications where created_at < now() - retention_keep('notifications'); get diagnostics n = row_count; end if;
  out_ := out_ || jsonb_build_object('notifications', n);

  -- Logs.
  if p_dry then select count(*) into n from public.audit_log where created_at < now() - retention_keep('audit_log');
  else delete from public.audit_log where created_at < now() - retention_keep('audit_log'); get diagnostics n = row_count; end if;
  out_ := out_ || jsonb_build_object('audit_log', n);
  if p_dry then select count(*) into n from public.vetting_access_log where viewed_at < now() - retention_keep('vetting_access_log');
  else delete from public.vetting_access_log where viewed_at < now() - retention_keep('vetting_access_log'); get diagnostics n = row_count; end if;
  out_ := out_ || jsonb_build_object('vetting_access_log', n);
  if p_dry then select count(*) into n from public.ecosystem_access_log where at < now() - retention_keep('ecosystem_access_log');
  else delete from public.ecosystem_access_log where at < now() - retention_keep('ecosystem_access_log'); get diagnostics n = row_count; end if;
  out_ := out_ || jsonb_build_object('ecosystem_access_log', n);
  if p_dry then select count(*) into n from public.security_signals where last_seen < now() - retention_keep('security_signals') and incident_id is null;
  else delete from public.security_signals where last_seen < now() - retention_keep('security_signals') and incident_id is null; get diagnostics n = row_count; end if;
  out_ := out_ || jsonb_build_object('security_signals', n);
  if p_dry then select count(*) into n from public.rate_limit_buckets where updated_at < now() - retention_keep('rate_limits') and (blocked_until is null or blocked_until < now());
  else delete from public.rate_limit_buckets where updated_at < now() - retention_keep('rate_limits') and (blocked_until is null or blocked_until < now()); get diagnostics n = row_count; end if;
  out_ := out_ || jsonb_build_object('rate_limits', n);

  -- Form messages and unconfirmed newsletter sign-ups.
  if p_dry then select count(*) into n from public.submissions where created_at < now() - retention_keep('form_messages');
  else delete from public.submissions where created_at < now() - retention_keep('form_messages'); get diagnostics n = row_count; end if;
  out_ := out_ || jsonb_build_object('form_messages', n);
  if p_dry then select count(*) into n from public.newsletter_subscribers where confirmed_at is null and created_at < now() - retention_keep('newsletter_pending');
  else delete from public.newsletter_subscribers where confirmed_at is null and created_at < now() - retention_keep('newsletter_pending'); get diagnostics n = row_count; end if;
  out_ := out_ || jsonb_build_object('newsletter_pending', n);

  -- Our own records of requests and clean-ups.
  if not p_dry then
    delete from public.privacy_requests where status in ('done', 'refused', 'withdrawn') and closed_at < now() - retention_keep('privacy_requests');
    delete from public.retention_runs where ran_at < now() - retention_keep('retention_runs');
  end if;

  insert into public.retention_runs (dry_run, counts) values (p_dry, out_);
  return out_;
end $$;
revoke all on function public.privacy_retention_run(boolean) from public, anon, authenticated;
grant execute on function public.privacy_retention_run(boolean) to service_role;

-- ===========================================================================================================
-- D. Breach detection and the 72-hour incident log (Privacy Notice, section 7; Legal Pack, Part F)
-- ===========================================================================================================
create table if not exists public.security_incidents (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 200),
  summary text check (summary is null or char_length(summary) <= 4000),
  aware_at timestamptz not null default now(),                 -- the 72 hours run from here
  deadline_at timestamptz,                                     -- aware_at + 72 hours, kept in step by a trigger
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high')),
  data_involved text check (data_involved is null or char_length(data_involved) <= 1000),
  affected_count int check (affected_count is null or affected_count >= 0),
  real_risk boolean,                                           -- real risk of serious harm: then the NPC and members must be told
  measures text check (measures is null or char_length(measures) <= 4000),
  member_advice text check (member_advice is null or char_length(member_advice) <= 2000),
  contained_at timestamptz,
  npc_notified_at timestamptz,
  npc_reference text check (npc_reference is null or char_length(npc_reference) <= 200),
  members_notified_at timestamptz,
  members_notified_count int,
  status text not null default 'open' check (status in ('open', 'contained', 'closed')),
  created_by uuid,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create or replace function public.security_incidents_deadline() returns trigger
language plpgsql as $$
begin
  new.deadline_at := new.aware_at + interval '72 hours';
  return new;
end $$;
drop trigger if exists security_incidents_deadline on public.security_incidents;
create trigger security_incidents_deadline before insert or update on public.security_incidents for each row execute function public.security_incidents_deadline();
create index if not exists security_incidents_open on public.security_incidents (aware_at desc) where status <> 'closed';
alter table public.security_incidents enable row level security;
revoke all on public.security_incidents from anon, authenticated;
grant select on public.security_incidents to authenticated;
drop policy if exists security_incidents_read on public.security_incidents;
create policy security_incidents_read on public.security_incidents for select to authenticated using (public.mod_level() >= 2);

create table if not exists public.security_signals (
  id bigserial primary key,
  key text not null unique,                                     -- one row per kind of finding; repeats bump last_seen
  severity text not null check (severity in ('info', 'warning', 'critical')),
  title text not null,
  detail jsonb not null default '{}'::jsonb,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  seen_count int not null default 1,
  emailed_at timestamptz,
  incident_id uuid references public.security_incidents(id) on delete set null,
  dismissed_at timestamptz,
  dismissed_by uuid
);
alter table public.security_signals enable row level security;
revoke all on public.security_signals from anon, authenticated;
grant select on public.security_signals to authenticated;
drop policy if exists security_signals_read on public.security_signals;
create policy security_signals_read on public.security_signals for select to authenticated using (public.mod_level() >= 2);

-- The checks. Each finding is upserted by key; a finding that clears is left as it was (an admin dismisses it).
-- Returns the findings seen in this run.
create or replace function public.security_scan() returns setof public.security_signals
language plpgsql security definer set search_path = public, pg_catalog as $$
declare n int; names text;
  allow text[] := array['verify_member', 'public_stats', 'member_provinces', 'weekly_member_growth', 'deal_counts',
    'track_business', 'track_business_event', 'member_reputation', 'is_vetted', 'badge_age_ok', 'member_is_active',
    'are_friends', 'group_counts', 'add_working_days', 'retention_rules', 'retention_keep'];
begin
  -- 1. A table in public without row level security.
  select count(*), string_agg(c.relname, ', ') into n, names from pg_class c join pg_namespace s on s.oid = c.relnamespace
    where s.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if n > 0 then perform public.security_signal('rls_off', 'critical', 'A table has row level security switched off', jsonb_build_object('tables', names)); end if;

  -- 2. The private documents bucket made public.
  if exists (select 1 from storage.buckets where id = 'private-docs' and public) then
    perform public.security_signal('private_bucket_public', 'critical', 'The private documents bucket is public', '{}'::jsonb);
  end if;

  -- 3. A database function that visitors can run, which skips the "who is asking" checks and isn't on the known list.
  select count(*), string_agg(p.proname, ', ') into n, names from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'public' and p.prosecdef and p.prorettype <> 'trigger'::regtype
      and has_function_privilege('anon', p.oid, 'execute') and not (p.proname = any(allow))
      and p.prosrc !~* '(auth\.uid\(\)|is_admin|mod_level|is_trusted|has_role|is_staff|current_user|service_role)';
  if n > 0 then perform public.security_signal('anon_function', 'warning', 'Visitors can run a database function that has no caller check', jsonb_build_object('functions', names)); end if;

  -- 4. Someone was given an admin or staff role in the last 24 hours.
  select count(*) into n from public.roles where created_at > now() - interval '24 hours';
  if n > 0 then perform public.security_signal('role_granted:' || to_char(now(), 'YYYY-MM-DD'), 'warning', 'A staff or admin role was given in the last 24 hours', jsonb_build_object('count', n)); end if;

  -- 5. Bulk reads by one admin: 5+ exports, or 20+ vetting documents opened, in 24 hours.
  select count(*) into n from (select actor_id from public.audit_log where created_at > now() - interval '24 hours' and action like '%export%' group by actor_id having count(*) >= 5) z;
  if n > 0 then perform public.security_signal('bulk_export:' || to_char(now(), 'YYYY-MM-DD'), 'warning', 'Many data exports by one person in 24 hours', jsonb_build_object('people', n)); end if;
  select count(*) into n from (select viewer_id from public.vetting_access_log where viewed_at > now() - interval '24 hours' group by viewer_id having count(*) >= 20) z;
  if n > 0 then perform public.security_signal('vetting_reads:' || to_char(now(), 'YYYY-MM-DD'), 'warning', 'Many vetting documents opened by one person in 24 hours', jsonb_build_object('people', n)); end if;

  -- 6. Sign-in attacks: 5+ sign-in codes locked out at the same time.
  select count(*) into n from public.rate_limit_buckets where action = 'otp_verify_failure' and blocked_until > now();
  if n >= 5 then perform public.security_signal('signin_lockouts:' || to_char(now(), 'YYYY-MM-DD'), 'warning', 'Many sign-in lockouts at once (possible password guessing)', jsonb_build_object('locked', n)); end if;

  -- 7. A partner site asking for unusually much member data: 1,000+ look-ups in an hour.
  select count(*) into n from (select client from public.ecosystem_access_log where at > now() - interval '1 hour' group by client having count(*) >= 1000) z;
  if n > 0 then perform public.security_signal('ecosystem_spike:' || to_char(now(), 'YYYY-MM-DD'), 'warning', 'A partner site asked for member data unusually often', jsonb_build_object('sites', n)); end if;

  -- 8. Deadlines: privacy requests past 15 working days; an incident within 24 hours of its 72-hour deadline with the
  --    NPC not yet told.
  select count(*) into n from public.privacy_requests where status in ('open', 'in_progress') and due_at < now();
  if n > 0 then perform public.security_signal('privacy_overdue:' || to_char(now(), 'YYYY-MM-DD'), 'warning', 'Privacy requests are past their 15-working-day deadline', jsonb_build_object('count', n)); end if;
  select count(*) into n from public.security_incidents where status <> 'closed' and npc_notified_at is null and coalesce(real_risk, true) and deadline_at < now() + interval '24 hours';
  if n > 0 then perform public.security_signal('incident_deadline:' || to_char(now(), 'YYYY-MM-DD'), 'critical', 'An incident is near or past its 72-hour notice deadline', jsonb_build_object('count', n)); end if;

  -- 9. Abuse patterns (section E).
  select count(*) into n from public.abuse_signals(7);
  if n > 0 then perform public.security_signal('abuse:' || to_char(now(), 'YYYY-MM-DD'), 'info', 'Members showing abuse patterns', jsonb_build_object('members', n)); end if;

  return query select * from public.security_signals where last_seen > now() - interval '5 minutes' and dismissed_at is null;
end $$;

create or replace function public.security_signal(p_key text, p_sev text, p_title text, p_detail jsonb) returns void
language sql security definer set search_path = public as $$
  insert into public.security_signals (key, severity, title, detail) values (p_key, p_sev, p_title, p_detail)
  on conflict (key) do update set last_seen = now(), seen_count = public.security_signals.seen_count + 1, detail = excluded.detail,
    severity = excluded.severity, title = excluded.title,
    -- A finding an admin dismissed comes back (and is emailed again) if it is still there a day later.
    dismissed_at = case when public.security_signals.dismissed_at < now() - interval '24 hours' then null else public.security_signals.dismissed_at end,
    emailed_at = case when public.security_signals.dismissed_at < now() - interval '24 hours' then null else public.security_signals.emailed_at end;
$$;
revoke all on function public.security_signal(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.security_signal(text, text, text, jsonb) to service_role;

-- ===========================================================================================================
-- E. Abuse: account-age limits and the abuse signals list
-- ===========================================================================================================
create or replace function public.account_age(uid uuid) returns interval
language sql stable security definer set search_path = public as $$
  select coalesce(now() - (select p.created_at from public.profiles p where p.id = uid), interval '0');
$$;
revoke all on function public.account_age(uuid) from public, anon, authenticated;
grant execute on function public.account_age(uuid) to service_role;

-- New accounts (under 1 day, or under 7 days) get lower limits on the actions spammers and scammers use. Each check is
-- its own trigger, so nothing existing is replaced. Errors become plain messages in the app.
create or replace function public.age_limits() returns trigger
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); age interval; cap int;
begin
  if me is null then return new; end if;                  -- the server and the database's own jobs are not limited
  age := public.account_age(me);
  if age >= interval '7 days' then return new; end if;
  if tg_table_name = 'conversations' then
    cap := 10;
    if age < interval '1 day' then cap := 3; end if;
    if (select count(*) from public.conversations c where c.started_by = me and c.created_at > now() - interval '1 day') >= cap then
      raise exception 'new_account_conversation_limit';
    end if;
  elsif tg_table_name = 'direct_messages' and age < interval '1 day' then
    if public.feed_link_count(new.body) > 0 then raise exception 'new_account_links'; end if;
    if (select count(*) from public.direct_messages m where m.sender_id = me and m.created_at > now() - interval '1 day') >= 50 then raise exception 'new_account_message_limit'; end if;
  elsif tg_table_name = 'friendships' and age < interval '1 day' then
    if (select count(*) from public.friendships f where f.requester_id = me and f.created_at > now() - interval '1 day') >= 10 then raise exception 'new_account_friend_limit'; end if;
  elsif tg_table_name = 'service_requests' and age < interval '1 day' then
    if (select count(*) from public.service_requests r where r.requester_id = me and r.created_at > now() - interval '1 day') >= 3 then raise exception 'new_account_request_limit'; end if;
  elsif tg_table_name = 'transaction_records' and age < interval '1 day' then
    raise exception 'new_account_records';
  elsif tg_table_name = 'deals' then
    raise exception 'new_account_group_order';
  elsif tg_table_name = 'moderation_reports' and age < interval '1 day' then
    if (select count(*) from public.moderation_reports r where r.reporter_id = me and r.created_at > now() - interval '1 day') >= 5 then raise exception 'new_account_report_limit'; end if;
  end if;
  return new;
end $$;
revoke all on function public.age_limits() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['conversations', 'direct_messages', 'friendships', 'service_requests', 'transaction_records', 'deals', 'moderation_reports'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_age_limits', t);
    execute format('create trigger %I before insert on public.%I for each row execute function public.age_limits()', t || '_age_limits', t);
  end loop;
end $$;

-- Members who look like abuse in the last N days, for the admins' Security page and the daily scan.
create or replace function public.abuse_signals(p_days int default 7)
returns table (user_id uuid, member_code text, joined timestamptz, reports_against int, blocked_by int, held_posts int,
               messages_24h int, new_conversations_24h int, restricted boolean)
language sql stable security definer set search_path = public as $$
  with since as (select now() - make_interval(days => least(greatest(p_days, 1), 90)) as t),
  x as (
    select p.id, p.member_code, p.created_at,
      (select count(*) from public.moderation_reports r, since where r.target_owner_id = p.id and r.created_at > since.t)::int as reports_against,
      (select count(*) from public.member_blocks b, since where b.blocked_id = p.id and b.created_at > since.t)::int as blocked_by,
      (select count(*) from public.feed_posts f, since where f.author_id = p.id and f.status = 'held' and f.created_at > since.t)::int as held_posts,
      (select count(*) from public.direct_messages m where m.sender_id = p.id and m.created_at > now() - interval '1 day')::int as messages_24h,
      (select count(*) from public.conversations c where c.started_by = p.id and c.created_at > now() - interval '1 day')::int as new_conversations_24h,
      public.member_is_muted(p.id) as restricted
    from public.profiles p where p.status = 'active'
  )
  select * from x
  where reports_against >= 3 or blocked_by >= 3 or held_posts >= 3
     or (created_at > now() - interval '7 days' and (messages_24h >= 30 or new_conversations_24h >= 8))
  order by reports_against + blocked_by + held_posts desc
  limit 100;
$$;
revoke all on function public.abuse_signals(int) from public, anon, authenticated;
grant execute on function public.abuse_signals(int) to service_role;
revoke all on function public.security_scan() from public, anon, authenticated;
grant execute on function public.security_scan() to service_role;

-- ===========================================================================================================
-- F. Logs nobody can edit or quietly delete (only the retention job removes old rows)
-- ===========================================================================================================
-- Allowed: the retention job's deletes; and what happens when an account is erased (its consent rows go with it, and
-- the log rows that named it keep everything except the name, which becomes empty).
create or replace function public.append_only() returns trigger
language plpgsql as $$
declare o jsonb; n jsonb; k text;
begin
  if tg_op = 'DELETE' then
    if current_setting('flameph.retention', true) = 'on' then return old; end if;
    if tg_table_name = 'member_consents' then
      if not exists (select 1 from auth.users u where u.id = (to_jsonb(old) ->> 'user_id')::uuid) then return old; end if;
    end if;
    raise exception 'append_only: % rows cannot be deleted', tg_table_name;
  end if;
  o := to_jsonb(old); n := to_jsonb(new);
  for k in select key from jsonb_each(n) loop
    if (n -> k) is distinct from (o -> k) and (n -> k) <> 'null'::jsonb then
      raise exception 'append_only: % rows cannot be changed', tg_table_name;
    end if;
  end loop;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['audit_log', 'moderation_actions', 'vetting_access_log', 'member_consents', 'retention_runs'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_append_only', t);
    execute format('create trigger %I before update or delete on public.%I for each row execute function public.append_only()', t || '_append_only', t);
  end loop;
end $$;

-- Incidents are kept for the NPC's annual report: they can be updated (to record each step) but never deleted.
create or replace function public.no_delete() returns trigger
language plpgsql as $$
begin
  raise exception 'no_delete: % rows are kept', tg_table_name;
end $$;
drop trigger if exists security_incidents_no_delete on public.security_incidents;
create trigger security_incidents_no_delete before delete on public.security_incidents for each row execute function public.no_delete();
