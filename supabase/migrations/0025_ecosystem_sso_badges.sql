-- Phase 10A: safer shared sign-in and the cross-site badge (consent 3). Additive only. Take a backup before applying.
--
-- Everything here is reachable only by the flameph.org server (service role), never by a browser:
--   sso_codes                one-time sign-in tickets (60 seconds, single use, bound to one browser by a nonce)
--   ecosystem_links          a random member code per site, so a site can only ask about members who signed in there
--   member_signouts          "signed out at" per member, for logout everywhere
--   ecosystem_request_nonces replay guard for signed server-to-server calls
--   ecosystem_access_log     one row for every time another site gets anything about a member (members read their own)
--   ecosystem_badges()       the ONLY way badge data leaves: fixed fields, every rule checked, logged in the same step
-- The off switches live in settings key 'ecosystem' ({"badges": false, "sso": true}), not public, read inside SQL too.

-- ---------------------------------------------------------------------------
-- Off switches (no deploy needed). Badges start OFF; shared sign-in stays ON so today's sign-in keeps working.
-- ---------------------------------------------------------------------------
insert into public.settings (key, value, is_public)
values ('ecosystem', jsonb_build_object('badges', false, 'sso', true), false)
on conflict (key) do nothing;

create or replace function public.ecosystem_switch(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (s.value ->> p_name)::boolean from public.settings s where s.key = 'ecosystem'),
                  case when p_name = 'sso' then true else false end);
$$;
revoke all on function public.ecosystem_switch(text) from public, anon, authenticated;
grant execute on function public.ecosystem_switch(text) to service_role;

-- ---------------------------------------------------------------------------
-- One-time sign-in tickets. Only a hash of the ticket is stored.
-- ---------------------------------------------------------------------------
create table if not exists public.sso_codes (
  code_hash text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  client text not null check (client ~ '^[a-z]{3,20}$'),
  direction text not null check (direction in ('to_site', 'to_hub')),
  user_id uuid references auth.users(id) on delete cascade,
  email text,
  name text,
  nonce text not null check (length(nonce) between 16 and 128),
  browser_hash text check (browser_hash is null or browser_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '60 seconds',
  used_at timestamptz
);
create index if not exists sso_codes_expires on public.sso_codes (expires_at);
alter table public.sso_codes enable row level security;
revoke all on public.sso_codes from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Per-site member codes (pairwise: different on each site, so sites cannot match their lists).
-- ---------------------------------------------------------------------------
create table if not exists public.ecosystem_links (
  client text not null check (client ~ '^[a-z]{3,20}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  sub uuid not null default gen_random_uuid(),
  linked_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (client, user_id),
  unique (client, sub)
);
alter table public.ecosystem_links enable row level security;
revoke all on public.ecosystem_links from anon, authenticated;
grant select on public.ecosystem_links to authenticated;
drop policy if exists ecosystem_links_own on public.ecosystem_links;
create policy ecosystem_links_own on public.ecosystem_links for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- Logout everywhere.
-- ---------------------------------------------------------------------------
create table if not exists public.member_signouts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  signed_out_at timestamptz not null default now()
);
alter table public.member_signouts enable row level security;
revoke all on public.member_signouts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Replay guard for signed server-to-server calls (kept 1 hour).
-- ---------------------------------------------------------------------------
create table if not exists public.ecosystem_request_nonces (
  client text not null,
  jti text not null check (length(jti) between 16 and 64),
  seen_at timestamptz not null default now(),
  primary key (client, jti)
);
alter table public.ecosystem_request_nonces enable row level security;
revoke all on public.ecosystem_request_nonces from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Audit log of every cross-site access. No insert/update/delete for anyone through the API: only the
-- functions below write it. Members read their own rows; admins read all. Kept 1 year.
-- ---------------------------------------------------------------------------
create table if not exists public.ecosystem_access_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  client text not null,
  user_id uuid references auth.users(id) on delete set null,
  purpose text not null check (purpose in ('sign_in', 'sign_in_to_hub', 'badge_check', 'session_check', 'logout_notice', 'consent_off_notice', 'switch_change')),
  fields text[] not null default '{}',
  result text not null check (result in ('shown', 'hidden', 'ok', 'refused', 'signed_out')),
  reason text
);
create index if not exists ecosystem_access_log_user on public.ecosystem_access_log (user_id, at desc);
create index if not exists ecosystem_access_log_at on public.ecosystem_access_log (at);
alter table public.ecosystem_access_log enable row level security;
revoke all on public.ecosystem_access_log from anon, authenticated;
grant select on public.ecosystem_access_log to authenticated;
drop policy if exists ecosystem_access_log_read on public.ecosystem_access_log;
create policy ecosystem_access_log_read on public.ecosystem_access_log for select to authenticated using (user_id = auth.uid() or public.is_admin());

create or replace function public.ecosystem_log(p_client text, p_user uuid, p_purpose text, p_fields text[], p_result text, p_reason text default null)
returns void language sql security definer set search_path = public as $$
  insert into public.ecosystem_access_log (client, user_id, purpose, fields, result, reason)
  values (p_client, p_user, p_purpose, coalesce(p_fields, '{}'), p_result, left(p_reason, 200));
$$;
revoke all on function public.ecosystem_log(text, uuid, text, text[], text, text) from public, anon, authenticated;
grant execute on function public.ecosystem_log(text, uuid, text, text[], text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Badge age rule: flameph.org shows the badge after 1 month, other sites after 3 months (Terms section 11).
-- Returns only yes/no, so it reveals nothing else about the account.
-- ---------------------------------------------------------------------------
create or replace function public.badge_age_ok(uid uuid, p_months int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = uid and p.created_at <= now() - make_interval(months => greatest(p_months, 1)));
$$;
revoke all on function public.badge_age_ok(uuid, int) from public;
grant execute on function public.badge_age_ok(uuid, int) to anon, authenticated, service_role;

-- Same thresholds as BADGE_LEVELS in src/lib/records.ts.
create or replace function public.badge_level_for(n int) returns text
language sql immutable as $$
  select case when n >= 40 then 'Platinum' when n >= 15 then 'Gold' when n >= 5 then 'Silver' when n >= 1 then 'Bronze' else null end;
$$;

-- ---------------------------------------------------------------------------
-- The badge answer for another site. At most 50 member codes per call, only codes linked to THAT site.
-- Hidden unless: switch on, consent 3 on, consent 2 on, active account, 3+ months old, 1+ counted record.
-- Fields are fixed here: verified, badge level, counted records, category mix, account creation month.
-- ---------------------------------------------------------------------------
create or replace function public.ecosystem_badges(p_client text, p_subs uuid[])
returns table (sub uuid, shown boolean, verified boolean, badge_level text, counted int, categories jsonb, member_since text)
language plpgsql security definer set search_path = public as $$
declare
  l record;
  rep record;
  why text;
  on_switch boolean := public.ecosystem_switch('badges');
begin
  if p_client is null or p_client !~ '^[a-z]{3,20}$' or p_client = 'flameph' then raise exception 'bad_client'; end if;
  if coalesce(cardinality(p_subs), 0) > 50 then raise exception 'too_many'; end if;
  for l in
    select e.sub, e.user_id, p.status, p.created_at
    from public.ecosystem_links e join public.profiles p on p.id = e.user_id
    where e.client = p_client and e.sub = any(coalesce(p_subs, '{}'))
  loop
    why := case
      when not on_switch then 'switch_off'
      when l.status <> 'active' then 'not_active'
      when not public.has_consent(l.user_id, 'ecosystem_badge') then 'consent_off'
      when not public.has_consent(l.user_id, 'records') then 'records_consent_off'
      when l.created_at > now() - interval '3 months' then 'under_3_months'
      else null end;
    rep := null;
    if why is null then
      select r.* into rep from public.member_reputation(l.user_id) r;
      if rep is null or coalesce(rep.counted, 0) < 1 then why := 'no_counted_records'; end if;
    end if;
    if why is null then
      perform public.ecosystem_log(p_client, l.user_id, 'badge_check', array['verified', 'badge_level', 'counted', 'categories', 'member_since'], 'shown');
      sub := l.sub; shown := true; verified := coalesce(rep.vetted, false); badge_level := public.badge_level_for(rep.counted);
      counted := rep.counted; categories := coalesce(rep.categories, '{}'::jsonb); member_since := to_char(l.created_at, 'YYYY-MM');
    else
      perform public.ecosystem_log(p_client, l.user_id, 'badge_check', '{}', 'hidden', why);
      sub := l.sub; shown := false; verified := null; badge_level := null; counted := null; categories := null; member_since := null;
    end if;
    return next;
  end loop;
end $$;
revoke all on function public.ecosystem_badges(text, uuid[]) from public, anon, authenticated;
grant execute on function public.ecosystem_badges(text, uuid[]) to service_role;

-- ---------------------------------------------------------------------------
-- Cleanup: tickets after 1 day, nonces after 1 hour, audit rows after 1 year (legal pack retention).
-- ---------------------------------------------------------------------------
create or replace function public.ecosystem_cleanup() returns void
language sql security definer set search_path = public as $$
  delete from public.sso_codes where expires_at < now() - interval '1 day';
  delete from public.ecosystem_request_nonces where seen_at < now() - interval '1 hour';
  delete from public.ecosystem_access_log where at < now() - interval '1 year';
$$;
revoke all on function public.ecosystem_cleanup() from public, anon, authenticated;
grant execute on function public.ecosystem_cleanup() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('flameph-ecosystem-cleanup', '17 3 * * *', 'select public.ecosystem_cleanup()');
  end if;
exception when others then null;   -- no scheduler: the hub routes also prune old tickets and nonces
end $$;
