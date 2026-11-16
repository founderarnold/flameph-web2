-- Phase 2: live policies and separate, versioned consents (Legal Pack v1.0, Part D).
-- Additive only. Take a backup before applying to production.
--
-- member_consents is an append-only log: one row per choice, with the switch, on/off, policy version, time and source.
-- A member's current choice is their newest row for that switch (view member_consent_current).

create table if not exists public.policy_versions (
  version text primary key check (version ~ '^[0-9]+\.[0-9]+$'),
  effective_on date not null,
  published_at timestamptz not null default now()
);
alter table public.policy_versions enable row level security;
drop policy if exists policy_versions_read on public.policy_versions;
create policy policy_versions_read on public.policy_versions for select using (true);
drop policy if exists policy_versions_admin on public.policy_versions;
create policy policy_versions_admin on public.policy_versions for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.policy_versions (version, effective_on) values ('1.0', date '2026-11-17') on conflict (version) do nothing;

create table if not exists public.member_consents (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  consent_key text not null check (consent_key in ('terms', 'records', 'ecosystem_badge', 'vetting', 'marketing')),
  granted boolean not null,
  policy_version text not null references public.policy_versions(version),
  source text not null check (source in ('signup', 'prompt', 'settings')),
  created_at timestamptz not null default now()
);
create index if not exists member_consents_user_key on public.member_consents (user_id, consent_key, created_at desc, id desc);

alter table public.member_consents enable row level security;
-- Members see and add only their own rows. Admins (not chapter leaders) can read all, for withdrawal requests and audits.
drop policy if exists member_consents_select on public.member_consents;
create policy member_consents_select on public.member_consents for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists member_consents_insert on public.member_consents;
create policy member_consents_insert on public.member_consents for insert to authenticated with check (user_id = auth.uid());
-- No update or delete policy: nobody can rewrite the history through the API.
revoke update, delete, truncate on public.member_consents from anon, authenticated;
revoke all on public.member_consents from anon;

-- The time is always the server's, never a time sent by the browser.
create or replace function public.stamp_member_consent() returns trigger
language plpgsql set search_path = public as $$
begin
  new.created_at = now();
  return new;
end; $$;
drop trigger if exists member_consents_stamp on public.member_consents;
create trigger member_consents_stamp before insert on public.member_consents for each row execute function public.stamp_member_consent();

-- Keep the older profile flags in step, so the existing newsletter digest and dashboard keep working.
create or replace function public.sync_profile_consent() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.consent_key = 'marketing' then
    update public.profiles set consent_marketing = new.granted where id = new.user_id;
  elsif new.consent_key = 'terms' then
    update public.profiles
      set consent_privacy = new.granted,
          consent_at = case when new.granted then new.created_at else consent_at end
      where id = new.user_id;
  end if;
  return new;
end; $$;
drop trigger if exists member_consents_sync on public.member_consents;
create trigger member_consents_sync after insert on public.member_consents for each row execute function public.sync_profile_consent();

create or replace view public.member_consent_current with (security_invoker = true) as
  select distinct on (c.user_id, c.consent_key) c.user_id, c.consent_key, c.granted, c.policy_version, c.source, c.created_at
  from public.member_consents c
  order by c.user_id, c.consent_key, c.created_at desc, c.id desc;
grant select on public.member_consent_current to authenticated;
revoke all on public.member_consent_current from anon;

-- Sign-up by email: the browser has no session yet, so the choices travel in the sign-up data and are recorded here.
-- Same body as 0003, plus the consent rows. A problem with the consent rows never blocks the sign-up itself.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare ref uuid; k text; ver text;
begin
  select p.id into ref from public.profiles p where p.member_code = upper(nullif(trim(new.raw_user_meta_data->>'ref'), ''));
  insert into public.profiles (id, full_name, consent_privacy, consent_marketing, consent_at, business_stage, referred_by)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    coalesce((new.raw_user_meta_data->>'consent_privacy')::boolean, false),
    coalesce((new.raw_user_meta_data->>'consent_marketing')::boolean, false),
    case when (new.raw_user_meta_data->>'consent_privacy')::boolean then now() end,
    case when new.raw_user_meta_data->>'business_stage' in ('discover','start','build','grow','scale') then new.raw_user_meta_data->>'business_stage' end,
    ref
  ) on conflict (id) do nothing;

  begin
    ver := new.raw_user_meta_data->>'policy_version';
    if ver is not null and jsonb_typeof(new.raw_user_meta_data->'consents') = 'object'
       and exists (select 1 from public.policy_versions v where v.version = ver) then
      foreach k in array array['terms', 'records', 'ecosystem_badge', 'vetting', 'marketing'] loop
        insert into public.member_consents (user_id, consent_key, granted, policy_version, source)
        values (new.id, k, coalesce((new.raw_user_meta_data->'consents'->>k)::boolean, false), ver, 'signup');
      end loop;
    end if;
  exception when others then
    raise warning 'member_consents not recorded for %: %', new.id, sqlerrm;
  end;
  return new;
end; $$;
