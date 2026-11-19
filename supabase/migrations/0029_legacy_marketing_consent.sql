-- Phase 12, consent check (owner report, section 6): 40 members ticked "send me news and offers" on the old Join form,
-- before the consent log existed (0015). Their profile flag is on, so they get the weekly email, but the log has no row
-- that proves it. This records that old tick, once, with the date they gave it. Additive: new rows only; nothing is
-- changed or removed. Safe to run twice (members who already have a marketing row are skipped).
-- Apply ONLY if the owner chose "Keep it and record their old tick".

-- The old Join form, before Policy v1.0. Marked as its own version and source so it is never mistaken for v1.0.
insert into public.policy_versions (version, effective_on) values ('0.9', date '2026-10-01') on conflict (version) do nothing;

do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'public.member_consents'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ~ 'source' loop
    execute format('alter table public.member_consents drop constraint %I', c);
  end loop;
end $$;
alter table public.member_consents add constraint member_consents_source_check
  check (source in ('signup', 'prompt', 'settings', 'legacy_signup'));

-- The log's time is always the server's, except for these back-dated legacy rows, which only the server can write.
create or replace function public.stamp_member_consent() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.source = 'legacy_signup' then
    if public.caller_is_client() then raise exception 'legacy_signup is server only'; end if;
  else
    new.created_at = now();
  end if;
  return new;
end; $$;

insert into public.member_consents (user_id, consent_key, granted, policy_version, source, created_at)
select p.id, 'marketing', true, '0.9', 'legacy_signup', coalesce(p.consent_at, p.created_at)
from public.profiles p
where p.consent_marketing
  and exists (select 1 from auth.users u where u.id = p.id)
  and not exists (select 1 from public.member_consents c where c.user_id = p.id and c.consent_key = 'marketing');
