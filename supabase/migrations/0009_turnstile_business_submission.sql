-- Turnstile is validated by the Next.js server before this privileged RPC.
-- Remove the authenticated-callable Phase 8 RPC so it cannot be invoked
-- directly with a browser Supabase client to bypass the bot check.
drop function if exists public.submit_business_for_review(uuid);

create or replace function public.submit_business_for_review(p_business_id uuid, p_owner_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  business public.businesses%rowtype;
  email_verified boolean;
  mobile_verified boolean;
  mobile_required boolean := false;
begin
  if current_user not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'TRUSTED_SERVER_REQUIRED';
  end if;

  select * into business from public.businesses where id = p_business_id;
  if business.id is null or business.owner_id <> p_owner_id then
    raise exception 'BUSINESS_NOT_FOUND';
  end if;
  if business.lifecycle_status not in ('draft', 'needs_correction', 'rejected') then
    raise exception 'BUSINESS_NOT_SUBMITTABLE';
  end if;

  select email_verified_at is not null, mobile_verified_at is not null
  into email_verified, mobile_verified
  from public.profiles where id = p_owner_id;

  select coalesce(value->'require_mobile_for_submission' = 'true'::jsonb, false)
  into mobile_required
  from public.settings where key = 'business_verification';

  if not coalesce(email_verified, false) then raise exception 'EMAIL_NOT_VERIFIED'; end if;
  if coalesce(mobile_required, false) and not coalesce(mobile_verified, false) then
    raise exception 'MOBILE_NOT_VERIFIED';
  end if;

  update public.businesses
  set lifecycle_status = 'submitted', publication_status = 'unpublished'
  where id = p_business_id;

  insert into public.audit_log (actor_id, action, table_name, row_id, detail)
  values (
    p_owner_id,
    'business_submitted',
    'businesses',
    p_business_id::text,
    jsonb_build_object('email_verified', true, 'mobile_required', mobile_required, 'mobile_verified', mobile_verified, 'turnstile_verified', true)
  );
end;
$$;

revoke all on function public.submit_business_for_review(uuid, uuid) from public, anon, authenticated;
grant execute on function public.submit_business_for_review(uuid, uuid) to service_role;
