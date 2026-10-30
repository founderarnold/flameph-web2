-- Required listing completeness before review. Formal registration evidence is
-- deliberately not required: informal and newly established MSMEs remain eligible.
alter table public.businesses add column if not exists google_business_url text;

create or replace function public.business_submission_missing_requirements(p_business_id uuid, p_owner_id uuid)
returns text[]
language plpgsql security definer set search_path = public as $$
declare
  business public.businesses%rowtype;
  profile public.profiles%rowtype;
  missing text[] := array[]::text[];
  has_reply_channel boolean := false;
begin
  if current_user not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'TRUSTED_SERVER_REQUIRED';
  end if;
  select * into business from public.businesses where id = p_business_id and owner_id = p_owner_id;
  if business.id is null then return array['business_not_found']; end if;
  select * into profile from public.profiles where id = p_owner_id;

  has_reply_channel := coalesce(trim(business.contact_email), '') <> ''
    or coalesce(trim(business.contact_phone), '') <> ''
    or coalesce(trim(business.contact_messenger), '') <> ''
    or coalesce(trim(business.contact_viber), '') <> '';

  if char_length(coalesce(trim(business.name), '')) < 2 then missing := array_append(missing, 'business_name'); end if;
  if coalesce(trim(business.sector), '') = '' then missing := array_append(missing, 'category'); end if;
  if char_length(coalesce(trim(business.description), '')) < 80 then missing := array_append(missing, 'description'); end if;
  if char_length(coalesce(trim(profile.full_name), '')) < 2 then missing := array_append(missing, 'representative'); end if;
  if coalesce(trim(business.city), '') = '' then missing := array_append(missing, 'city'); end if;
  if coalesce(trim(business.province), '') = '' then missing := array_append(missing, 'province'); end if;
  if profile.email_verified_at is null or not has_reply_channel then missing := array_append(missing, 'verified_contact'); end if;
  if coalesce(trim(business.logo_url), '') = '' and coalesce(cardinality(business.photos), 0) = 0 then
    missing := array_append(missing, 'photo');
  end if;
  return missing;
end;
$$;

create or replace function public.submit_business_for_review(p_business_id uuid, p_owner_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  business public.businesses%rowtype;
  email_verified boolean;
  mobile_verified boolean;
  mobile_required boolean := false;
  missing text[];
begin
  if current_user not in ('service_role', 'postgres', 'supabase_admin') then raise exception 'TRUSTED_SERVER_REQUIRED'; end if;
  select * into business from public.businesses where id = p_business_id;
  if business.id is null or business.owner_id <> p_owner_id then raise exception 'BUSINESS_NOT_FOUND'; end if;
  if business.lifecycle_status not in ('draft', 'needs_correction', 'rejected') then raise exception 'BUSINESS_NOT_SUBMITTABLE'; end if;

  missing := public.business_submission_missing_requirements(p_business_id, p_owner_id);
  if coalesce(cardinality(missing), 0) > 0 then
    raise exception 'BUSINESS_INCOMPLETE:%', array_to_string(missing, ',');
  end if;

  select email_verified_at is not null, mobile_verified_at is not null
  into email_verified, mobile_verified from public.profiles where id = p_owner_id;
  select coalesce(value->'require_mobile_for_submission' = 'true'::jsonb, false)
  into mobile_required from public.settings where key = 'business_verification';
  if not coalesce(email_verified, false) then raise exception 'EMAIL_NOT_VERIFIED'; end if;
  if coalesce(mobile_required, false) and not coalesce(mobile_verified, false) then raise exception 'MOBILE_NOT_VERIFIED'; end if;

  update public.businesses set lifecycle_status = 'submitted', publication_status = 'unpublished' where id = p_business_id;
  insert into public.audit_log (actor_id, action, table_name, row_id, detail)
  values (p_owner_id, 'business_submitted', 'businesses', p_business_id::text,
    jsonb_build_object('requirements_complete', true, 'email_verified', true, 'mobile_required', mobile_required, 'mobile_verified', mobile_verified, 'turnstile_verified', true));
end;
$$;

revoke all on function public.business_submission_missing_requirements(uuid, uuid) from public, anon, authenticated;
grant execute on function public.business_submission_missing_requirements(uuid, uuid) to service_role;
revoke all on function public.submit_business_for_review(uuid, uuid) from public, anon, authenticated;
grant execute on function public.submit_business_for_review(uuid, uuid) to service_role;
