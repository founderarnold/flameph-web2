-- Phase 10B: investor and funder features. LEGALLY SENSITIVE. Additive only. Take a backup before applying.
--
--   profiles.member_type          'business' (default, every existing member) or 'investor_funder'. The member picks it.
--   feed_posts.author_investor    set by the database from the author's profile when the post is made; never by the poster.
--   feed_comments.author_investor same, for replies. feed_comments.held_reason says why a reply was held.
--   investor_registrations        an investor's SEC/BSP/IC/CDA registration or licence, as typed by them. Private: only
--                                 the member and FLAME PH admins can read it. Admins record whether they SAW it on the
--                                 regulator's public list. That is a dated label, never an endorsement.
--   investor_labels()             the only public view of it: investor yes/no, and the regulator and date if seen (12 months).
--
-- Holds (moderation layer 1, inside the database so no route can skip them):
--   promises_returns    guaranteed/fixed/assured returns, "double your money", and for investor posts: risk-free wording
--                       or a percentage per day/week/month. Posts are held; replies are held too (new in 10B).
--   recruitment_scheme  pyramid, Ponzi, MLM, downline/upline, recruitment or referral income, "invite 5 people".
-- Every hold already goes to the moderation queue as an automatic report (feed_auto_report, 0019); 10B adds the reason
-- for replies. Patterns are mirrored in src/lib/feed-rules.ts.
--
-- No money, pledge, subscription or commitment feature is added. Nothing here stores an amount.

-- ---------------------------------------------------------------------------
-- 1. Profile type
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists member_type text not null default 'business';
do $$ begin
  alter table public.profiles add constraint profiles_member_type check (member_type in ('business', 'investor_funder'));
exception when duplicate_object then null; end $$;

alter table public.feed_posts add column if not exists author_investor boolean not null default false;
alter table public.feed_comments add column if not exists author_investor boolean not null default false;
alter table public.feed_comments add column if not exists held_reason text;
do $$ begin
  alter table public.feed_comments add constraint feed_comments_held_reason check (held_reason is null or char_length(held_reason) <= 60);
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 2. Automatic checks: investor wording, promised returns, recruitment schemes
-- ---------------------------------------------------------------------------
create or replace function public.feed_text_flags(t text) returns text[]
language plpgsql immutable set search_path = public as $$
declare
  investor boolean := t ~* '\m(invest|investing|investment|investments|investor|investors|funder|funders|funding|capital|roi|loans?|lending|pautang|paluwagan|equity|shares? of stock|interest rate|interest per month)\M';
  returns boolean;
  scheme boolean;
begin
  returns := t ~* '(guarantee[ds]?|guaranteed|assured|sure|fixed|risk[- ]?free|no[- ]risk|walang risk|siguradong|garantisadong)\W+(\w+\W+){0,3}(returns?|profits?|income|interest|kita|tubo)'
    or t ~* '(returns?|profits?|income|interest|kita|tubo)\W+(\w+\W+){0,3}(guaranteed|assured|garantisado|sigurado)'
    or t ~* '(double|triple|doblehin|doble) (your |ang |nyo ang |mo ang )?(money|pera|investment|puhunan)'
    or (investor and t ~* '(risk[- ]?free|no[- ]risk|zero[- ]risk|walang (risk|lugi)|hindi (ka )?malulugi|sure ?(ball|win)|surebol|100% safe)')
    or (investor and t ~* '[0-9]+(\.[0-9]+)? ?% ?(a |per |every |kada |bawat |/ ?)?(day|daily|week|weekly|month|monthly|araw|linggo|buwan)');
  scheme := t ~* '(pyramid|ponzi|downline|upline|multi[- ]?level marketing|networking (business|income|opportunity)|recruit(ment)? (bonus|income|commission)|referral (bonus|income|commission)|(invite|recruit|refer) [0-9]+ (people|persons|friends|members|tao)|binary (plan|system)|matrix (plan|system)|pay[- ]?in|(^|[^a-z])mlm([^a-z]|$))';
  return array_remove(array[
    case when investor then 'investor' end,
    case when returns then 'promises_returns' end,
    case when scheme then 'recruitment_scheme' end
  ], null);
end $$;

-- Posts: an investor or funder's post is always an investor/funder post (so it always carries the warning), and
-- recruitment wording is held. Named so it runs after feed_posts_prepare and feed_posts_zgroup, before zmoderation.
create or replace function public.feed_posts_investor_check() returns trigger
language plpgsql security definer set search_path = public as $$
declare flags text[];
begin
  if auth.uid() is null then return new; end if;
  new.author_investor := exists (select 1 from public.profiles p where p.id = new.author_id and p.member_type = 'investor_funder');
  if new.author_investor then new.kind := 'investor'; end if;
  flags := public.feed_text_flags(new.body);
  if 'investor' = any(flags) then new.kind := 'investor'; end if;
  if new.status = 'published' and 'promises_returns' = any(flags) then new.status := 'held'; new.held_reason := 'promises_returns'; end if;
  if new.status = 'published' and 'recruitment_scheme' = any(flags) then new.status := 'held'; new.held_reason := 'recruitment_scheme'; end if;
  return new;
end $$;
drop trigger if exists feed_posts_zinvestor on public.feed_posts;
create trigger feed_posts_zinvestor before insert on public.feed_posts for each row execute function public.feed_posts_investor_check();

-- Replies: the same holds (a reply can't promise returns under anyone's post), and the investor label from the profile.
-- Runs after feed_comments_prepare, before feed_comments_zmoderation.
create or replace function public.feed_comments_investor_check() returns trigger
language plpgsql security definer set search_path = public as $$
declare flags text[];
begin
  if auth.uid() is null then return new; end if;
  new.author_investor := exists (select 1 from public.profiles p where p.id = new.author_id and p.member_type = 'investor_funder');
  new.held_reason := null;
  flags := public.feed_text_flags(new.body);
  if 'promises_returns' = any(flags) then new.status := 'hidden'; new.held_reason := 'promises_returns';
  elsif 'recruitment_scheme' = any(flags) then new.status := 'hidden'; new.held_reason := 'recruitment_scheme';
  end if;
  return new;
end $$;
drop trigger if exists feed_comments_zinvestor on public.feed_comments;
create trigger feed_comments_zinvestor before insert on public.feed_comments for each row execute function public.feed_comments_investor_check();

-- Everything held goes to the moderation queue, now with the reason for replies too (same as 0019 otherwise).
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
    why := coalesce(new.held_reason, 'held');
    insert into public.moderation_reports (target_type, target_id, reason, details) values ('comment', new.id, 'automatic', 'Held automatically: ' || why) returning id into rid;
    insert into public.moderation_actions (report_id, actor_role, action, target_type, target_id, target_owner_id, note)
      values (rid, 'system', 'auto_hold', 'comment', new.id, new.author_id, 'Held automatically: ' || why);
  end if;
  return null;
end $$;

-- Which reports are about an investor/funder post or a reply under one (for the warning in the moderation queue).
create or replace function public.report_investor_ids(ids uuid[]) returns setof uuid
language sql stable security definer set search_path = public as $$
  select r.id from public.moderation_reports r
  where r.id = any(ids[1:100]) and public.mod_level() >= 1 and (
    (r.target_type = 'post' and exists (select 1 from public.feed_posts p where p.id = r.target_id and (p.kind = 'investor' or p.author_investor)))
    or (r.target_type = 'comment' and exists (select 1 from public.feed_comments c join public.feed_posts p on p.id = c.post_id
          where c.id = r.target_id and (p.kind = 'investor' or c.author_investor))));
$$;
revoke all on function public.report_investor_ids(uuid[]) from public;
grant execute on function public.report_investor_ids(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Registration or licence: a label, never an endorsement
-- ---------------------------------------------------------------------------
create table if not exists public.investor_registrations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  regulator text not null check (regulator in ('sec', 'bsp', 'ic', 'cda', 'other')),
  registered_name text not null check (char_length(btrim(registered_name)) between 2 and 160),
  reg_number text not null check (char_length(btrim(reg_number)) between 2 and 60),
  status text not null default 'submitted' check (status in ('submitted', 'seen', 'not_found')),
  submitted_at timestamptz not null default now(),
  checked_at timestamptz,
  checked_by uuid references auth.users(id) on delete set null,
  check_note text check (check_note is null or char_length(check_note) <= 300)
);
alter table public.investor_registrations enable row level security;
revoke all on public.investor_registrations from anon;
revoke all on public.investor_registrations from authenticated;
grant select on public.investor_registrations to authenticated;
drop policy if exists investor_registrations_read on public.investor_registrations;
create policy investor_registrations_read on public.investor_registrations for select to authenticated
  using (user_id = auth.uid() or public.mod_level() >= 2);

-- The member sends or changes their registration. Any change clears an earlier check.
create or replace function public.investor_registration_submit(p_regulator text, p_name text, p_number text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if not exists (select 1 from public.profiles p where p.id = me and p.member_type = 'investor_funder' and p.status = 'active') then raise exception 'not_investor'; end if;
  insert into public.investor_registrations (user_id, regulator, registered_name, reg_number)
    values (me, p_regulator, btrim(p_name), btrim(p_number))
  on conflict (user_id) do update set regulator = excluded.regulator, registered_name = excluded.registered_name, reg_number = excluded.reg_number,
    status = 'submitted', submitted_at = now(), checked_at = null, checked_by = null, check_note = null;
end $$;
revoke all on function public.investor_registration_submit(text, text, text) from public;
grant execute on function public.investor_registration_submit(text, text, text) to authenticated;

create or replace function public.investor_registration_remove() returns void
language sql security definer set search_path = public as $$
  delete from public.investor_registrations where user_id = auth.uid();
$$;
revoke all on function public.investor_registration_remove() from public;
grant execute on function public.investor_registration_remove() to authenticated;

-- An admin records what they saw on the regulator's public list. Logged in the moderation audit log. Not for their own.
create or replace function public.investor_registration_decide(p_user uuid, p_seen boolean, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); lvl int := public.mod_level();
begin
  if lvl < 2 then raise exception 'not_allowed'; end if;
  if p_user = me then raise exception 'own_registration'; end if;
  update public.investor_registrations
    set status = case when p_seen then 'seen' else 'not_found' end, checked_at = now(), checked_by = me,
        check_note = nullif(left(btrim(coalesce(p_note, '')), 300), '')
    where user_id = p_user;
  if not found then raise exception 'not_found'; end if;
  insert into public.moderation_actions (actor_id, actor_role, action, target_type, target_id, target_owner_id, note)
    values (me, case when lvl = 3 then 'founder' else 'admin' end, 'verify', 'investor_registration', p_user, p_user,
      case when p_seen then 'Investor registration seen on the regulator''s public list (a label, not an endorsement)' else 'Investor registration not found on the regulator''s public list' end);
end $$;
revoke all on function public.investor_registration_decide(uuid, boolean, text) from public;
grant execute on function public.investor_registration_decide(uuid, boolean, text) to authenticated;

-- The public part: is this member an investor/funder, and was a registration seen in the last 12 months (regulator, date).
-- Never the registered name or number.
create or replace function public.investor_labels(uids uuid[]) returns table (user_id uuid, regulator text, checked_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id,
    case when r.status = 'seen' and r.checked_at > now() - interval '12 months' then r.regulator end,
    case when r.status = 'seen' and r.checked_at > now() - interval '12 months' then r.checked_at end
  from public.profiles p left join public.investor_registrations r on r.user_id = p.id
  where p.id = any(uids[1:200]) and p.member_type = 'investor_funder' and auth.uid() is not null;
$$;
revoke all on function public.investor_labels(uuid[]) from public;
grant execute on function public.investor_labels(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. No money, pledge or commitment feature for investing or lending
-- ---------------------------------------------------------------------------
-- Requests, quotes and transaction records (0022) are for products and services. They can't be used to ask for, offer
-- or record an investment or a loan (that would make FLAME PH a place where money is committed).
create or replace function public.no_investment_records() returns trigger
language plpgsql security definer set search_path = public as $$
declare t text;
begin
  if auth.uid() is null then return new; end if;
  -- Separate branches: each table's row only has its own columns.
  if tg_table_name = 'service_requests' then
    t := coalesce(new.title, '') || ' ' || coalesce(new.details, '');
  else
    t := coalesce(new.terms, '');
  end if;
  if 'investor' = any(public.feed_text_flags(t)) then raise exception 'investment_not_allowed'; end if;
  return new;
end $$;
drop trigger if exists service_requests_no_investment on public.service_requests;
create trigger service_requests_no_investment before insert on public.service_requests for each row execute function public.no_investment_records();
drop trigger if exists service_quotes_no_investment on public.service_quotes;
create trigger service_quotes_no_investment before insert on public.service_quotes for each row execute function public.no_investment_records();
