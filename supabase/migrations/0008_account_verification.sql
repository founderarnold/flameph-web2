-- Account verification gates for business submission.
-- Supabase Auth remains the only identity system. Legacy password-created
-- accounts marked email_unverified must prove possession through OTP/OAuth.

alter table public.profiles
  add column if not exists email_verified_at timestamptz,
  add column if not exists email_verification_required boolean not null default true,
  add column if not exists mobile_verified_at timestamptz,
  add column if not exists mobile_verification_method text;

do $$ begin
  alter table public.profiles
    add constraint profiles_mobile_verification_consistency_check
    check (
      (mobile_verified_at is null and mobile_verification_method is null)
      or (mobile_verified_at is not null and mobile_verification_method is not null)
    );
exception when duplicate_object then null;
end $$;

-- Existing accounts are trusted only when Supabase has a confirmation time and
-- neither the old app marker nor the new signup marker says proof is pending.
update public.profiles p
set
  email_verified_at = case
    when p.email_verified_at is not null then p.email_verified_at
    when u.email_confirmed_at is not null
      and not coalesce((u.raw_app_meta_data->>'email_unverified')::boolean, false)
      and not coalesce((u.raw_user_meta_data->>'email_verification_required')::boolean, false)
    then u.email_confirmed_at
    else null
  end,
  email_verification_required = case
    when p.email_verified_at is not null then false
    else
      u.email_confirmed_at is null
      or coalesce((u.raw_app_meta_data->>'email_unverified')::boolean, false)
      or coalesce((u.raw_user_meta_data->>'email_verification_required')::boolean, false)
  end
from auth.users u
where u.id = p.id;

-- Verification state is server-owned. Members may still edit their ordinary
-- profile fields, but cannot grant themselves an email/mobile proof timestamp.
create or replace function public.protect_profile_fields() returns trigger language plpgsql as $$
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
  end if;
  return new;
end; $$;

insert into public.settings (key, value, is_public)
values (
  'business_verification',
  jsonb_build_object(
    'require_mobile_for_submission', false,
    'sms_provider_configured', false
  ),
  true
)
on conflict (key) do nothing;

create or replace function public.sync_my_account_verification() returns boolean
language plpgsql security definer set search_path = public, auth as $$
declare
  uid uuid := auth.uid();
  account auth.users%rowtype;
  proved_in_session boolean := false;
begin
  if uid is null then return false; end if;

  select * into account from auth.users where id = uid;
  select exists (
    select 1
    from jsonb_array_elements(coalesce(auth.jwt()->'amr', '[]'::jsonb)) item
    where coalesce(item->>'method', 'password') <> 'password'
  ) into proved_in_session;

  if account.email_confirmed_at is not null and (
    proved_in_session
    or exists (
      select 1 from public.profiles
      where id = uid and not email_verification_required
    )
  ) then
    update public.profiles
    set
      email_verified_at = coalesce(email_verified_at, account.email_confirmed_at, now()),
      email_verification_required = false
    where id = uid;
  end if;

  return exists (
    select 1 from public.profiles
    where id = uid and email_verified_at is not null
  );
end;
$$;

revoke all on function public.sync_my_account_verification() from public, anon;
grant execute on function public.sync_my_account_verification() to authenticated;

create or replace function public.account_verification_status() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  profile public.profiles%rowtype;
  config jsonb := '{}'::jsonb;
begin
  if uid is null then raise exception 'Authentication required.'; end if;
  perform public.sync_my_account_verification();

  select * into profile from public.profiles where id = uid;
  select value into config from public.settings where key = 'business_verification';

  return jsonb_build_object(
    'email_verified', profile.email_verified_at is not null,
    'email_verified_at', profile.email_verified_at,
    'mobile_present', coalesce(trim(profile.mobile), '') <> '',
    'mobile_verified', profile.mobile_verified_at is not null,
    'mobile_verified_at', profile.mobile_verified_at,
    'mobile_required', coalesce(config->'require_mobile_for_submission' = 'true'::jsonb, false),
    'sms_provider_configured', coalesce(config->'sms_provider_configured' = 'true'::jsonb, false)
  );
end;
$$;

revoke all on function public.account_verification_status() from public, anon;
grant execute on function public.account_verification_status() to authenticated;

create or replace function public.submit_business_for_review(p_business_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  business public.businesses%rowtype;
  email_verified boolean;
  mobile_verified boolean;
  mobile_required boolean := false;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  perform public.sync_my_account_verification();

  select * into business from public.businesses where id = p_business_id;
  if business.id is null or business.owner_id <> uid then
    raise exception 'BUSINESS_NOT_FOUND';
  end if;
  if business.lifecycle_status not in ('draft', 'needs_correction', 'rejected') then
    raise exception 'BUSINESS_NOT_SUBMITTABLE';
  end if;

  select email_verified_at is not null, mobile_verified_at is not null
  into email_verified, mobile_verified
  from public.profiles where id = uid;

  select coalesce(value->'require_mobile_for_submission' = 'true'::jsonb, false)
  into mobile_required
  from public.settings where key = 'business_verification';

  if not coalesce(email_verified, false) then
    raise exception 'EMAIL_NOT_VERIFIED';
  end if;
  if coalesce(mobile_required, false) and not coalesce(mobile_verified, false) then
    raise exception 'MOBILE_NOT_VERIFIED';
  end if;

  update public.businesses
  set lifecycle_status = 'submitted', publication_status = 'unpublished'
  where id = p_business_id;

  insert into public.audit_log (actor_id, action, table_name, row_id, detail)
  values (
    uid,
    'business_submitted',
    'businesses',
    p_business_id::text,
    jsonb_build_object('email_verified', true, 'mobile_required', mobile_required, 'mobile_verified', mobile_verified)
  );
end;
$$;

revoke all on function public.submit_business_for_review(uuid) from public, anon;
grant execute on function public.submit_business_for_review(uuid) to authenticated;

-- Rollback guidance: drop the three functions and the consistency constraint.
-- Keep verification timestamps by default so proof history is not destroyed.
