-- Phase 8A: requests, quotes and transaction records; disputes; padding controls; business vetting documents.
-- Additive only: new tables and functions, two new columns, wider check lists, and "record" branches in the existing
-- moderation functions. Nothing is deleted or renamed. There is NO payment, checkout, escrow or wallet: amounts are
-- typed by the members and FLAME PH never verifies them.
--
-- Flow: a member sends a request (to one member, or open to all members) -> providers send quotes with terms ->
-- the requester accepts one quote -> a transaction record is opened -> after the work BOTH members confirm.
-- Confirmed by one side = pending, never counted. Either member can dispute (the record is held for moderators).
-- Padding control: only the first 3 confirmed records between the same two members count toward badges and
-- reputation until BOTH businesses are vetted; after vetting, repeat records count. Moderators can void a record;
-- everything it earned (count, badge level, points) is computed from counted records, so voiding claws it back.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- The member's current choice for one consent switch (Phase 2 log). False when never given.
create or replace function public.has_consent(uid uuid, k text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select c.granted from public.member_consents c where c.user_id = uid and c.consent_key = k
                   order by c.created_at desc, c.id desc limit 1), false);
$$;
revoke all on function public.has_consent(uuid, text) from public;
grant execute on function public.has_consent(uuid, text) to authenticated;

-- Vetted: the member's business passed document review (Admin -> Directory verification, or a moderator's Verify).
create or replace function public.is_vetted(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select uid is not null and exists (select 1 from public.businesses b where b.owner_id = uid and b.verified and b.verification_status = 'approved');
$$;
revoke all on function public.is_vetted(uuid) from public;
grant execute on function public.is_vetted(uuid) to anon, authenticated;

-- When a vetting decision was made (starts the 1-year document retention clock).
alter table public.businesses add column if not exists verification_decided_at timestamptz;
create or replace function public.businesses_verification_stamp() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.verification_status in ('approved', 'rejected') and new.verification_status is distinct from old.verification_status then
    new.verification_decided_at := now();
  end if;
  return new;
end $$;
drop trigger if exists businesses_verification_stamp on public.businesses;
create trigger businesses_verification_stamp before update on public.businesses for each row execute function public.businesses_verification_stamp();

-- ---------------------------------------------------------------------------
-- 1. Requests and quotes
-- ---------------------------------------------------------------------------
create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  provider_id uuid references auth.users(id) on delete cascade,        -- null: open to all members
  title text not null check (char_length(btrim(title)) between 3 and 120),
  category text not null check (char_length(category) between 2 and 60),
  details text check (details is null or char_length(details) <= 1000),
  needed_by date,
  status text not null default 'open' check (status in ('open', 'accepted', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (provider_id is null or provider_id <> requester_id)
);
create index if not exists service_requests_requester on public.service_requests (requester_id, created_at desc);
create index if not exists service_requests_provider on public.service_requests (provider_id, created_at desc);
create index if not exists service_requests_open on public.service_requests (status, created_at desc) where provider_id is null;

create table if not exists public.service_quotes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  provider_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  terms text not null check (char_length(btrim(terms)) between 3 and 1000),
  amount numeric(14, 2) check (amount is null or amount >= 0),          -- typed by the provider; never verified
  valid_until date,
  status text not null default 'sent' check (status in ('sent', 'accepted', 'declined', 'withdrawn')),
  created_at timestamptz not null default now(),
  constraint service_quotes_once unique (request_id, provider_id)
);
create index if not exists service_quotes_provider on public.service_quotes (provider_id, created_at desc);

alter table public.service_requests enable row level security;
revoke all on public.service_requests from anon;
revoke all on public.service_requests from authenticated;
grant select on public.service_requests to authenticated;
grant insert (provider_id, title, category, details, needed_by) on public.service_requests to authenticated;
drop policy if exists service_requests_read on public.service_requests;
-- The requester, the member it was sent to, and (for open requests still open) any active member not blocked either way.
create policy service_requests_read on public.service_requests for select to authenticated
  using (requester_id = auth.uid() or provider_id = auth.uid()
    or (provider_id is null and status = 'open' and public.member_is_active(auth.uid()) and not public.is_blocked_between(requester_id, auth.uid()))
    or public.mod_level() >= 2);
drop policy if exists service_requests_send on public.service_requests;
create policy service_requests_send on public.service_requests for insert to authenticated with check (requester_id = auth.uid());

alter table public.service_quotes enable row level security;
revoke all on public.service_quotes from anon;
revoke all on public.service_quotes from authenticated;
grant select on public.service_quotes to authenticated;
grant insert (request_id, terms, amount, valid_until) on public.service_quotes to authenticated;
drop policy if exists service_quotes_read on public.service_quotes;
-- The provider who sent it and the requester. Other providers never see each other's quotes.
create policy service_quotes_read on public.service_quotes for select to authenticated
  using (provider_id = auth.uid()
    or exists (select 1 from public.service_requests r where r.id = request_id and r.requester_id = auth.uid())
    or public.mod_level() >= 2);
drop policy if exists service_quotes_send on public.service_quotes;
create policy service_quotes_send on public.service_quotes for insert to authenticated with check (provider_id = auth.uid());

-- Shared checks for anyone taking part in a record: signed in, active, not muted, records consent (switch 2).
create or replace function public.records_actor_check(me uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if not public.member_is_active(me) then raise exception 'not_active_member'; end if;
  if public.member_is_muted(me) then raise exception 'moderator_mute'; end if;
  if not public.has_consent(me, 'records') then raise exception 'records_consent'; end if;
end $$;
revoke all on function public.records_actor_check(uuid) from public;

create or replace function public.service_requests_prepare() returns trigger
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  perform public.records_actor_check(me);
  if new.provider_id is not null then
    if new.provider_id = me then raise exception 'own_request'; end if;
    if not public.member_is_active(new.provider_id) then raise exception 'not_available'; end if;
    if public.is_blocked_between(me, new.provider_id) then raise exception 'blocked'; end if;
  end if;
  if (select count(*) from public.service_requests r where r.requester_id = me and r.created_at > now() - interval '1 day') >= 20 then
    raise exception 'request_rate_limit';
  end if;
  if public.moderation_text_check(new.title || ' ' || coalesce(new.details, '')) = 'block' then raise exception 'blocked_words'; end if;
  new.requester_id := me; new.status := 'open'; new.created_at := now(); new.updated_at := now();
  new.title := btrim(new.title); new.details := nullif(btrim(coalesce(new.details, '')), '');
  return new;
end $$;
drop trigger if exists service_requests_prepare on public.service_requests;
create trigger service_requests_prepare before insert on public.service_requests for each row execute function public.service_requests_prepare();

create or replace function public.service_quotes_prepare() returns trigger
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.service_requests;
begin
  perform public.records_actor_check(me);
  select * into r from public.service_requests where id = new.request_id;
  if r.id is null or r.status <> 'open' then raise exception 'request_closed'; end if;
  if r.requester_id = me then raise exception 'own_request'; end if;
  if r.provider_id is not null and r.provider_id <> me then raise exception 'not_found'; end if;
  if public.is_blocked_between(me, r.requester_id) then raise exception 'blocked'; end if;
  if (select count(*) from public.service_quotes q where q.provider_id = me and q.created_at > now() - interval '1 day') >= 50 then
    raise exception 'quote_rate_limit';
  end if;
  if public.moderation_text_check(new.terms) = 'block' then raise exception 'blocked_words'; end if;
  new.provider_id := me; new.status := 'sent'; new.created_at := now(); new.terms := btrim(new.terms);
  return new;
end $$;
drop trigger if exists service_quotes_prepare on public.service_quotes;
create trigger service_quotes_prepare before insert on public.service_quotes for each row execute function public.service_quotes_prepare();

create or replace function public.cancel_request(p_request uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.service_requests set status = 'cancelled', updated_at = now() where id = p_request and requester_id = auth.uid() and status = 'open';
  if not found then raise exception 'not_found'; end if;
  update public.service_quotes set status = 'declined' where request_id = p_request and status = 'sent';
end $$;
revoke all on function public.cancel_request(uuid) from public;
grant execute on function public.cancel_request(uuid) to authenticated;

create or replace function public.withdraw_quote(p_quote uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.service_quotes set status = 'withdrawn' where id = p_quote and provider_id = auth.uid() and status = 'sent';
  if not found then raise exception 'not_found'; end if;
end $$;
revoke all on function public.withdraw_quote(uuid) from public;
grant execute on function public.withdraw_quote(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Transaction records
-- ---------------------------------------------------------------------------
create table if not exists public.transaction_records (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.service_requests(id) on delete set null,
  quote_id uuid references public.service_quotes(id) on delete set null,
  requester_id uuid not null references auth.users(id) on delete cascade,
  provider_id uuid not null references auth.users(id) on delete cascade,
  deal_date date not null default current_date,
  category text not null check (char_length(category) between 2 and 60),
  description text not null check (char_length(description) between 3 and 300),
  status text not null default 'in_progress' check (status in ('in_progress', 'pending', 'confirmed', 'disputed', 'voided', 'cancelled')),
  amount numeric(14, 2) check (amount is null or amount >= 0),      -- typed by the members; FLAME PH never verifies it
  requester_confirmed_at timestamptz,
  provider_confirmed_at timestamptz,
  confirmed_at timestamptz,                                         -- when the second member confirmed
  requester_rating smallint check (requester_rating between 1 and 5),   -- the requester's rating of the provider
  provider_rating smallint check (provider_rating between 1 and 5),     -- the provider's rating of the requester
  requester_tags text[] not null default '{}',                          -- endorsements the requester gives the provider
  provider_tags text[] not null default '{}',
  held_status text,                                                 -- the status before a dispute or void, to restore
  disputed_by uuid references auth.users(id) on delete set null,
  disputed_at timestamptz,
  voided_at timestamptz,
  voided_by uuid references auth.users(id) on delete set null,
  void_note text check (void_note is null or char_length(void_note) <= 500),
  created_at timestamptz not null default now(),
  check (requester_id <> provider_id)
);
create index if not exists transaction_records_requester on public.transaction_records (requester_id, created_at desc);
create index if not exists transaction_records_provider on public.transaction_records (provider_id, created_at desc);
create index if not exists transaction_records_pair on public.transaction_records (least(requester_id, provider_id), greatest(requester_id, provider_id), confirmed_at);

alter table public.transaction_records enable row level security;
revoke all on public.transaction_records from anon;
revoke all on public.transaction_records from authenticated;
grant select on public.transaction_records to authenticated;           -- every change goes through the functions below
drop policy if exists transaction_records_read on public.transaction_records;
create policy transaction_records_read on public.transaction_records for select to authenticated
  using (requester_id = auth.uid() or provider_id = auth.uid() or public.mod_level() >= 2);

-- The endorsement tags members may give (same list as src/lib/records.ts).
create or replace function public.valid_record_tags(t text[]) returns boolean
language sql immutable as $$
  select coalesce(array_length(t, 1), 0) <= 5 and t <@ array['on_time', 'good_quality', 'fair_price', 'clear_communication', 'paid_on_time', 'would_work_again']::text[];
$$;

-- Accept one quote: closes the request, declines the other quotes and opens the record.
create or replace function public.accept_quote(p_quote uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); q public.service_quotes; r public.service_requests; rid uuid;
begin
  perform public.records_actor_check(me);
  select * into q from public.service_quotes where id = p_quote for update;
  if q.id is null or q.status <> 'sent' then raise exception 'not_found'; end if;
  select * into r from public.service_requests where id = q.request_id for update;
  if r.requester_id <> me then raise exception 'not_found'; end if;
  if r.status <> 'open' then raise exception 'request_closed'; end if;
  if q.valid_until is not null and q.valid_until < current_date then raise exception 'quote_expired'; end if;
  if public.is_blocked_between(me, q.provider_id) then raise exception 'blocked'; end if;
  if not public.member_is_active(q.provider_id) then raise exception 'not_available'; end if;
  update public.service_quotes set status = 'accepted' where id = q.id;
  update public.service_quotes set status = 'declined' where request_id = r.id and id <> q.id and status = 'sent';
  update public.service_requests set status = 'accepted', updated_at = now() where id = r.id;
  insert into public.transaction_records (request_id, quote_id, requester_id, provider_id, category, description, amount)
    values (r.id, q.id, me, q.provider_id, r.category, left(r.title, 300), q.amount)
    returning id into rid;
  return rid;
end $$;
revoke all on function public.accept_quote(uuid) from public;
grant execute on function public.accept_quote(uuid) to authenticated;

-- One member confirms the work was done, with optional amount, rating and endorsements of the other member.
-- Both confirmed -> confirmed. One confirmed -> pending (never counted). Changing the amount after the other member
-- confirmed asks them to confirm again, so a confirmed record is always one both agreed to.
create or replace function public.confirm_record(p_record uuid, p_amount numeric default null, p_rating int default null,
  p_tags text[] default '{}', p_deal_date date default null) returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t public.transaction_records; mine_req boolean; other_ok boolean; amt numeric;
begin
  perform public.records_actor_check(me);
  select * into t from public.transaction_records where id = p_record for update;
  if t.id is null or me not in (t.requester_id, t.provider_id) then raise exception 'not_found'; end if;
  if t.status not in ('in_progress', 'pending') then raise exception 'record_locked'; end if;
  if p_rating is not null and (p_rating < 1 or p_rating > 5) then raise exception 'bad_rating'; end if;
  p_tags := coalesce(p_tags, '{}');
  if not public.valid_record_tags(p_tags) then raise exception 'bad_tags'; end if;
  if p_amount is not null and p_amount < 0 then raise exception 'bad_amount'; end if;
  if p_deal_date is not null and (p_deal_date > current_date or p_deal_date < current_date - 366) then raise exception 'bad_date'; end if;
  mine_req := me = t.requester_id;
  amt := coalesce(p_amount, t.amount);
  other_ok := case when mine_req then t.provider_confirmed_at is not null else t.requester_confirmed_at is not null end;
  -- A changed amount or date means the other member has not agreed to this version yet.
  if other_ok and (amt is distinct from t.amount or (p_deal_date is not null and p_deal_date <> t.deal_date)) then other_ok := false; end if;
  update public.transaction_records set
    amount = amt,
    deal_date = coalesce(p_deal_date, deal_date),
    requester_confirmed_at = case when mine_req then now() when other_ok then requester_confirmed_at else null end,
    provider_confirmed_at = case when not mine_req then now() when other_ok then provider_confirmed_at else null end,
    requester_rating = case when mine_req then p_rating else requester_rating end,
    provider_rating = case when not mine_req then p_rating else provider_rating end,
    requester_tags = case when mine_req then p_tags else requester_tags end,
    provider_tags = case when not mine_req then p_tags else provider_tags end,
    status = case when other_ok then 'confirmed' else 'pending' end,
    confirmed_at = case when other_ok then now() else null end
  where id = t.id;
  return case when other_ok then 'confirmed' else 'pending' end;
end $$;
revoke all on function public.confirm_record(uuid, numeric, int, text[], date) from public;
grant execute on function public.confirm_record(uuid, numeric, int, text[], date) to authenticated;

-- Before anyone confirms, either member can cancel (the deal didn't happen).
create or replace function public.cancel_record(p_record uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.transaction_records set status = 'cancelled'
    where id = p_record and auth.uid() in (requester_id, provider_id) and status = 'in_progress';
  if not found then raise exception 'record_locked'; end if;
end $$;
revoke all on function public.cancel_record(uuid) from public;
grant execute on function public.cancel_record(uuid) to authenticated;

-- Which confirmed records count. A record counts when it is confirmed (not disputed or voided) AND it is one of the
-- first 3 confirmed records between that pair OR both members are vetted now.
create or replace function public.counted_records() returns table (record_id uuid, requester_id uuid, provider_id uuid, pair_rank bigint, counts boolean)
language sql stable security definer set search_path = public as $$
  select x.id, x.requester_id, x.provider_id, x.rk,
    x.rk <= 3 or (public.is_vetted(x.requester_id) and public.is_vetted(x.provider_id))
  from (
    select t.id, t.requester_id, t.provider_id,
      row_number() over (partition by least(t.requester_id, t.provider_id), greatest(t.requester_id, t.provider_id) order by t.confirmed_at, t.id) as rk
    from public.transaction_records t where t.status = 'confirmed'
  ) x;
$$;
revoke all on function public.counted_records() from public;

-- A member's public reputation: only counted records, only when the member keeps consent 2 (records) on.
-- Never amounts. Ratings and endorsements are the ones the other members gave this member.
create or replace function public.member_reputation(uid uuid)
returns table (counted int, confirmed int, rating_avg numeric, rating_count int, tags jsonb, categories jsonb, vetted boolean)
language sql stable security definer set search_path = public as $$
  with mine as (
    select t.*, c.counts from public.transaction_records t join public.counted_records() c on c.record_id = t.id
    where uid in (t.requester_id, t.provider_id)
  ), given as (
    select case when m.requester_id = uid then m.provider_rating else m.requester_rating end as rating,
           case when m.requester_id = uid then m.provider_tags else m.requester_tags end as tags, m.category
    from mine m where m.counts
  )
  select
    (select count(*)::int from mine where counts),
    (select count(*)::int from mine),
    (select round(avg(rating)::numeric, 1) from given where rating is not null),
    (select count(rating)::int from given),
    coalesce((select jsonb_object_agg(tag, n) from (select tag, count(*) n from given, unnest(given.tags) tag group by tag) z), '{}'::jsonb),
    coalesce((select jsonb_object_agg(category, n) from (select category, count(*) n from given group by category) z), '{}'::jsonb),
    public.is_vetted(uid)
  where public.has_consent(uid, 'records') and exists (select 1 from public.profiles p where p.id = uid and p.status = 'active');
$$;
revoke all on function public.member_reputation(uuid) from public;
grant execute on function public.member_reputation(uuid) to anon, authenticated;

-- Points (Rewards): counted records earn 20 points each, alongside the existing weights. Same as POINTS in growth.ts.
-- Because this is computed, a voided record's points disappear automatically (claw-back).
create or replace function public.member_points(uid uuid default auth.uid()) returns table (earned bigint, spent bigint, balance bigint)
language sql stable security definer set search_path = public as $$
  with e as (
    select
      (select count(*) from public.profiles p join auth.users u on u.id = p.id where p.referred_by = uid and u.email_confirmed_at is not null) * 50
    + (select count(*) from public.business_reviews where user_id = uid) * 10
    + (select count(*) from public.event_registrations where user_id = uid) * 20
    + (select count(*) from public.member_milestones where user_id = uid) * 15
    + (select count(*) from public.deal_participants where user_id = uid) * 10
    + coalesce((select r.counted from public.member_reputation(uid) r), 0) * 20 as earned   -- counted records, as shown on Rewards
  ), s as (
    select coalesce(sum(points),0) as spent from public.reward_redemptions where user_id = uid and status <> 'cancelled'
  )
  select e.earned, s.spent, e.earned - s.spent from e, s
  where uid = auth.uid() or public.is_admin();
$$;
grant execute on function public.member_points(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Disputes and voiding (through the Phase 4B moderation queue and audit log)
-- ---------------------------------------------------------------------------
alter table public.moderation_actions drop constraint if exists moderation_actions_action_check;
alter table public.moderation_actions add constraint moderation_actions_action_check check (action in ('auto_hold', 'escalate', 'dismiss',
  'hide_in_group', 'warn', 'mute_7d', 'hide', 'mute', 'suspend', 'verify', 'remove_listing', 'ban', 'override', 'policy',
  'appeal_upheld', 'appeal_overturned', 'void_record', 'keep_record'));

-- Dispute: either member files it from the record ("Dispute" opens the existing Report form with type 'record').
-- The record is held: not counted until a moderator decides.
create or replace function public.moderation_reports_prepare() returns trigger
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); system boolean := new.reason = 'automatic' and pg_trigger_depth() > 1; rec public.transaction_records;
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
  elsif new.target_type = 'record' then
    -- A dispute: only one of the two members can file it. The record is held (not counted) until a moderator decides.
    select * into rec from public.transaction_records t where t.id = new.target_id for update;
    if rec.id is null or new.reporter_id is null or new.reporter_id not in (rec.requester_id, rec.provider_id) then raise exception 'not_found'; end if;
    if rec.status not in ('in_progress', 'pending', 'confirmed') then raise exception 'record_locked'; end if;
    new.target_owner_id := case when new.reporter_id = rec.requester_id then rec.provider_id else rec.requester_id end;
    new.chapter_id := null; new.group_id := null;
    update public.transaction_records set held_status = status, status = 'disputed', disputed_by = new.reporter_id, disputed_at = now()
      where id = rec.id;
  else
    raise exception 'not_available_yet';
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

-- Restore a held record to what it was before the dispute (or, if it was voided, before the void).
-- A dispute decision (Keep / No action needed) releases only a held record; only the founder's undo reverses a void.
drop function if exists public.release_record(uuid);
create or replace function public.release_record(p_record uuid, p_undo_void boolean default false) returns void
language sql security definer set search_path = public as $$
  update public.transaction_records set status = coalesce(held_status, 'pending'), held_status = null,
    voided_at = null, voided_by = null, void_note = null
  where id = p_record and (status = 'disputed' or (p_undo_void and status = 'voided'));
$$;
revoke all on function public.release_record(uuid, boolean) from public;

-- moderate(): as before, plus Void record / Keep record for disputes (admins and founders), and "No action needed"
-- on a dispute releases the record.
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
  if r.target_type = 'record' and exists (select 1 from public.transaction_records t where t.id = r.target_id and me in (t.requester_id, t.provider_id)) then raise exception 'own_business'; end if;
  if lvl = 1 and not public.in_chapter_scope(r.chapter_id, r.group_id) then raise exception 'out_of_scope'; end if;
  allowed := case lvl
    when 1 then array['dismiss', 'hide_in_group', 'warn', 'mute_7d']
    when 2 then array['dismiss', 'hide_in_group', 'warn', 'mute_7d', 'hide', 'mute', 'suspend', 'verify', 'remove_listing', 'void_record', 'keep_record']
    else array['dismiss', 'hide_in_group', 'warn', 'mute_7d', 'hide', 'mute', 'suspend', 'verify', 'remove_listing', 'ban', 'void_record', 'keep_record'] end;
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
  elsif p_action = 'void_record' then
    if r.target_type <> 'record' then raise exception 'not_a_record'; end if;
    update public.transaction_records set status = 'voided', voided_at = now(), voided_by = me, void_note = p_note where id = r.target_id;
  elsif p_action = 'keep_record' or (p_action = 'dismiss' and r.target_type = 'record') then
    if r.target_type <> 'record' then raise exception 'not_a_record'; end if;
    perform public.release_record(r.target_id);
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

-- Admins and founders can also void any record directly (Admin -> Records), with a note. Logged like every action.
create or replace function public.void_record(p_record uuid, p_note text) returns bigint
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); lvl int := public.mod_level(); t public.transaction_records; aid bigint;
begin
  if me is null or lvl < 2 then raise exception 'not_allowed_for_role'; end if;
  select * into t from public.transaction_records where id = p_record for update;
  if t.id is null then raise exception 'not_found'; end if;
  if me in (t.requester_id, t.provider_id) then raise exception 'own_business'; end if;
  if t.status in ('voided', 'cancelled') then raise exception 'record_locked'; end if;
  update public.transaction_records set held_status = case when status = 'disputed' then held_status else status end,
    status = 'voided', voided_at = now(), voided_by = me, void_note = nullif(left(btrim(coalesce(p_note, '')), 500), '')
  where id = t.id;
  insert into public.moderation_actions (actor_id, actor_role, action, target_type, target_id, target_owner_id, note)
    values (me, public.mod_role_name(lvl), 'void_record', 'record', t.id, t.provider_id, nullif(left(btrim(coalesce(p_note, '')), 500), ''))
    returning id into aid;
  -- Any open dispute on this record is settled by the void.
  update public.moderation_reports set status = 'actioned', resolved_at = now(), resolved_by = me, resolution = 'void_record'
    where target_type = 'record' and target_id = t.id and status = 'open';
  return aid;
end $$;
revoke all on function public.void_record(uuid, text) from public;
grant execute on function public.void_record(uuid, text) to authenticated;

-- override_action(): as before, plus the founder can undo a void (the record is restored).
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
  elsif a.action = 'void_record' then
    perform public.release_record(a.target_id, true);
  elsif a.action in ('mute', 'mute_7d', 'ban') then
    update public.member_restrictions set lifted_at = now() where action_id = a.id and lifted_at is null;
    if a.action = 'ban' then update public.profiles set status = 'active' where id = a.target_owner_id; end if;
  elsif a.action = 'suspend' then
    update public.profiles set status = 'active' where id = a.target_owner_id;
  elsif a.action = 'remove_listing' then
    update public.businesses set lifecycle_status = 'approved', publication_status = 'published', published = true where id = a.target_id;
  elsif a.action not in ('warn', 'verify', 'dismiss', 'keep_record') then
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

-- report_previews(): a disputed record shows its date, category, description, status and amount (admins only).
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
      when 'record' then (select 'Record, ' || to_char(t.deal_date, 'Mon DD, YYYY') || ' · ' || t.category || ': ' || t.description
          || coalesce(' · amount typed: ' || t.amount::text, '') || ' · ' || coalesce(t.held_status, t.status)
          || case when t.requester_confirmed_at is not null and t.provider_confirmed_at is not null then ' (both confirmed)'
                  when t.requester_confirmed_at is not null or t.provider_confirmed_at is not null then ' (one side confirmed)' else '' end
        from public.transaction_records t where t.id = r.target_id)
    end,
    case r.target_type
      when 'post' then '/posts/' || r.target_id
      when 'comment' then (select '/posts/' || c.post_id || '#comment-' || c.id from public.feed_comments c where c.id = r.target_id)
      when 'listing' then (select '/members/' || b.slug from public.businesses b where b.id = r.target_id)
      when 'member' then (select '/members/' || b.slug from public.businesses b where b.owner_id = r.target_id and b.published order by b.created_at limit 1)
      when 'message' then (select '/members/' || b.slug from public.businesses b where b.owner_id = r.target_owner_id and b.published order by b.created_at limit 1)
      when 'record' then '/records/' || r.target_id
    end
  from public.moderation_reports r
  where r.id = any (ids[1:100])
    and r.target_owner_id is distinct from auth.uid()
    and (public.mod_level() >= 2 or (public.mod_level() = 1 and public.in_chapter_scope(r.chapter_id, r.group_id)));
$$;
revoke all on function public.report_previews(uuid[]) from public;
grant execute on function public.report_previews(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Vetting documents. Files are encrypted by the server before upload (AES-256-GCM) into the private bucket and
--    can only be opened by reviewers (admins and founders) through the server, which logs every view.
--    Members see only the list of what they sent, never the files of anyone else. Retention: deleted 1 year after the
--    vetting decision, or right away when the member withdraws consent 4.
-- ---------------------------------------------------------------------------
create table if not exists public.vetting_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete set null,
  doc_type text not null check (doc_type in ('dti_sec', 'mayors_permit', 'bir')),
  file_path text not null,
  file_name text not null check (char_length(file_name) <= 120),
  mime text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes int not null check (size_bytes > 0 and size_bytes <= 5242880),
  key_id text not null,
  uploaded_at timestamptz not null default now(),
  deleted_at timestamptz,
  delete_reason text check (delete_reason is null or delete_reason in ('retention', 'consent_withdrawn', 'member_removed'))
);
create index if not exists vetting_documents_user on public.vetting_documents (user_id, uploaded_at desc);
alter table public.vetting_documents enable row level security;
revoke all on public.vetting_documents from anon;
revoke all on public.vetting_documents from authenticated;
grant select (id, user_id, business_id, doc_type, file_name, mime, size_bytes, uploaded_at, deleted_at, delete_reason) on public.vetting_documents to authenticated;
drop policy if exists vetting_documents_read on public.vetting_documents;
create policy vetting_documents_read on public.vetting_documents for select to authenticated
  using (user_id = auth.uid() or public.mod_level() >= 2);

create table if not exists public.vetting_access_log (
  id bigserial primary key,
  document_id uuid not null references public.vetting_documents(id) on delete cascade,
  viewer_id uuid references auth.users(id) on delete set null,
  viewed_at timestamptz not null default now()
);
alter table public.vetting_access_log enable row level security;
revoke all on public.vetting_access_log from anon;
revoke all on public.vetting_access_log from authenticated;
grant select on public.vetting_access_log to authenticated;
drop policy if exists vetting_access_log_read on public.vetting_access_log;
create policy vetting_access_log_read on public.vetting_access_log for select to authenticated using (public.mod_level() >= 2);

-- Documents due for deletion (the server deletes the files, then marks the rows). Service role only.
create or replace function public.vetting_documents_due() returns table (id uuid, file_path text, reason text)
language sql stable security definer set search_path = public as $$
  select d.id, d.file_path,
    case when not public.has_consent(d.user_id, 'vetting') then 'consent_withdrawn' else 'retention' end
  from public.vetting_documents d
  where d.deleted_at is null
    and (not public.has_consent(d.user_id, 'vetting')
      or exists (select 1 from public.businesses b where b.owner_id = d.user_id and b.verification_status in ('approved', 'rejected')
                 and b.verification_decided_at < now() - interval '1 year'));
$$;
revoke all on function public.vetting_documents_due() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Notifications for records (requests, quotes, confirmations and disputes)
-- ---------------------------------------------------------------------------
alter table public.notification_prefs add column if not exists records_push boolean not null default true;
alter table public.notification_prefs add column if not exists records_email boolean not null default true;
alter table public.member_notifications drop constraint if exists member_notifications_kind_check;
alter table public.member_notifications add constraint member_notifications_kind_check
  check (kind in ('message', 'lead', 'quote', 'request', 'notice', 'record'));
