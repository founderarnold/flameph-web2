-- Three-tier moderation for new submissions. High-suspicion rows are preserved
-- for correction/admin review but are impossible to publish or discover.
alter table public.businesses
  add column if not exists risk_level text not null default 'low',
  add column if not exists moderation_reason_categories text[] not null default '{}',
  add column if not exists moderation_fields text[] not null default '{}',
  add column if not exists moderation_version text,
  add column if not exists moderated_at timestamptz,
  add column if not exists correction_count integer not null default 0,
  add column if not exists last_submitted_at timestamptz;

-- Reuse the narrow legacy assessment. It already quarantined only records with
-- all three independent random-token signals; no weak legacy signal is newly hidden.
update public.businesses b
set risk_level = 'high', moderation_reason_categories = a.reason_codes,
    moderation_fields = array['business_name','description','profile'],
    moderation_version = 'legacy-v1', moderated_at = a.assessed_at
from public.business_legacy_assessments a
where a.business_id = b.id and a.classification = 'obviously_suspicious';

alter table public.businesses alter column risk_level set default 'needs_review';

do $$ begin
  alter table public.businesses add constraint businesses_risk_level_check
    check (risk_level in ('low','needs_review','high'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.businesses add constraint businesses_high_risk_never_public_check
    check (risk_level = 'low' or (not published and publication_status <> 'published'));
exception when duplicate_object then null; end $$;

create table if not exists public.business_moderation_events (
  id bigserial primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  risk_level text not null check (risk_level in ('low','needs_review','high')),
  reason_categories text[] not null default '{}',
  suspicious_fields text[] not null default '{}',
  assessment_version text not null,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.business_moderation_events enable row level security;
create index if not exists business_moderation_events_business_idx
  on public.business_moderation_events (business_id, created_at desc);
create index if not exists business_moderation_events_owner_idx
  on public.business_moderation_events (owner_id, created_at desc);

drop policy if exists business_moderation_events_admin_select on public.business_moderation_events;
create policy business_moderation_events_admin_select on public.business_moderation_events
  for select using (public.is_admin());
grant select on public.business_moderation_events to authenticated;
grant select on public.business_moderation_events to service_role;

create or replace function public.record_business_moderation(
  p_business_id uuid,
  p_owner_id uuid,
  p_risk_level text,
  p_reason_categories text[],
  p_suspicious_fields text[],
  p_assessment_version text,
  p_snapshot jsonb
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if current_user not in ('service_role', 'postgres', 'supabase_admin') then raise exception 'TRUSTED_SERVER_REQUIRED'; end if;
  if p_risk_level not in ('low','needs_review','high') then raise exception 'INVALID_RISK_LEVEL'; end if;
  if not exists (select 1 from public.businesses where id = p_business_id and owner_id = p_owner_id) then
    raise exception 'BUSINESS_NOT_FOUND';
  end if;

  update public.businesses set
    risk_level = p_risk_level,
    moderation_reason_categories = coalesce(p_reason_categories, '{}'),
    moderation_fields = coalesce(p_suspicious_fields, '{}'),
    moderation_version = p_assessment_version,
    moderated_at = now(),
    last_submitted_at = now(),
    correction_count = correction_count + case when p_risk_level = 'high' then 1 else 0 end,
    lifecycle_status = case
      when p_risk_level = 'high' and lifecycle_status not in ('rejected','suspended') then 'needs_correction'
      else lifecycle_status end,
    publication_status = case when p_risk_level = 'high' then 'unpublished' else publication_status end,
    published = case when p_risk_level = 'high' then false else published end
  where id = p_business_id;

  insert into public.business_moderation_events
    (business_id, owner_id, risk_level, reason_categories, suspicious_fields, assessment_version, snapshot)
  values
    (p_business_id, p_owner_id, p_risk_level, coalesce(p_reason_categories, '{}'),
     coalesce(p_suspicious_fields, '{}'), p_assessment_version, coalesce(p_snapshot, '{}'::jsonb));

  insert into public.audit_log (actor_id, action, table_name, row_id, detail)
  values (p_owner_id, 'business_automatic_moderation', 'businesses', p_business_id::text,
    jsonb_build_object('risk_level', p_risk_level, 'reason_categories', p_reason_categories,
      'suspicious_fields', p_suspicious_fields, 'assessment_version', p_assessment_version));
end;
$$;

revoke all on table public.business_moderation_events from public, anon;
revoke all on function public.record_business_moderation(uuid, uuid, text, text[], text[], text, jsonb) from public, anon, authenticated;
grant execute on function public.record_business_moderation(uuid, uuid, text, text[], text[], text, jsonb) to service_role;

-- Members can edit ordinary listing content but cannot alter moderation state.
-- Independently of caller role, a non-low-risk row can never be published.
create or replace function public.protect_business_fields() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if not public.is_trusted() then
      new.verified = false; new.verification_status = 'none'; new.verification_note = null;
      new.lifecycle_status = 'draft'; new.publication_status = 'unpublished'; new.published = false;
      new.risk_level = 'needs_review'; new.moderation_reason_categories = '{}'; new.moderation_fields = '{}';
      new.moderation_version = null; new.moderated_at = null; new.correction_count = 0; new.last_submitted_at = null;
    end if;
  elsif not public.is_trusted() then
    new.verified = old.verified; new.verification_status = old.verification_status; new.verification_note = old.verification_note;
    new.lifecycle_status = old.lifecycle_status; new.publication_status = old.publication_status; new.published = old.published;
    new.risk_level = old.risk_level; new.moderation_reason_categories = old.moderation_reason_categories;
    new.moderation_fields = old.moderation_fields; new.moderation_version = old.moderation_version;
    new.moderated_at = old.moderated_at; new.correction_count = old.correction_count; new.last_submitted_at = old.last_submitted_at;
  end if;

  if new.risk_level <> 'low' then
    new.publication_status = 'unpublished'; new.published = false;
    if new.risk_level = 'high' and new.lifecycle_status not in ('rejected','suspended') then new.lifecycle_status = 'needs_correction'; end if;
  elsif new.publication_status = 'published' then
    new.lifecycle_status = 'approved'; new.published = true;
  elsif new.lifecycle_status is distinct from old.lifecycle_status then
    if new.lifecycle_status = 'approved' then new.publication_status = 'published'; new.published = true;
    else new.publication_status = 'unpublished'; new.published = false; end if;
  elsif new.publication_status is distinct from old.publication_status then
    new.published = new.publication_status = 'published';
    if new.publication_status = 'published' then new.lifecycle_status = 'approved'; end if;
  end if;
  new.status_updated_at = case
    when tg_op = 'INSERT' or new.lifecycle_status is distinct from old.lifecycle_status
      or new.publication_status is distinct from old.publication_status then now()
    else old.status_updated_at end;
  return new;
end;
$$;

-- Risk level is an additional authoritative public-eligibility boundary.
drop policy if exists businesses_public on public.businesses;
create policy businesses_public on public.businesses for select using (
  published and publication_status = 'published' and lifecycle_status = 'approved' and risk_level = 'low'
);
drop policy if exists products_public on public.business_products;
create policy products_public on public.business_products for select using (exists (
  select 1 from public.businesses b where b.id = business_products.business_id
    and b.published and b.publication_status = 'published' and b.lifecycle_status = 'approved' and b.risk_level = 'low'
));
drop policy if exists reviews_public on public.business_reviews;
create policy reviews_public on public.business_reviews for select using (
  user_id = auth.uid() or public.is_admin() or (not hidden and exists (
    select 1 from public.businesses b where b.id = business_reviews.business_id
      and b.published and b.publication_status = 'published' and b.lifecycle_status = 'approved' and b.risk_level = 'low'
  ))
);
drop policy if exists reviews_self_insert on public.business_reviews;
create policy reviews_self_insert on public.business_reviews for insert with check (
  user_id = auth.uid() and exists (
    select 1 from public.businesses b where b.id = business_reviews.business_id
      and b.published and b.publication_status = 'published' and b.lifecycle_status = 'approved' and b.risk_level = 'low'
  )
);

create index if not exists businesses_safe_public_directory_idx on public.businesses (created_at desc)
where published and publication_status = 'published' and lifecycle_status = 'approved' and risk_level = 'low';

create or replace function public.track_business(biz uuid, kind text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.businesses where id = biz and published
    and publication_status = 'published' and lifecycle_status = 'approved' and risk_level = 'low') then return; end if;
  insert into public.business_stats (business_id, day, views, clicks)
  values (biz, (now() at time zone 'Asia/Manila')::date,
    case when kind = 'view' then 1 else 0 end, case when kind = 'click' then 1 else 0 end)
  on conflict (business_id, day) do update set
    views = business_stats.views + excluded.views, clicks = business_stats.clicks + excluded.clicks;
end;
$$;

create or replace function public.public_stats() returns jsonb
language sql stable security definer set search_path = public as $$
  with m as (
    select p.* from public.profiles p join auth.users u on u.id = p.id where u.email_confirmed_at is not null
  ), rated as (
    select count(*) as n, count(*) filter (where helpful) as up from public.ai_feedback
  ), public_businesses as (
    select * from public.businesses where published and publication_status = 'published'
      and lifecycle_status = 'approved' and risk_level = 'low'
  )
  select jsonb_build_object(
    'members', (select count(*) from m),
    'members_this_month', (select count(*) from m where created_at >= date_trunc('month', now() at time zone 'Asia/Manila') at time zone 'Asia/Manila'),
    'provinces', (select count(distinct lower(trim(province))) from m where coalesce(trim(province),'') <> ''),
    'cities', (select count(distinct lower(trim(city)) || '|' || lower(trim(coalesce(province,'')))) from m where coalesce(trim(city),'') <> ''),
    'businesses', (select count(*) from public_businesses),
    'verified_businesses', (select count(*) from public_businesses where verified),
    'active_chapters', (select count(*) from public.chapters where status = 'active'),
    'events_held', (select count(*) from public.events where status = 'completed'),
    'event_attendees', (select coalesce(sum(attendance_actual),0) from public.events where status = 'completed'),
    'ai_answers', (select count(*) from public.ai_messages where answer is not null),
    'ai_ratings', (select n from rated),
    'ai_helpful_rate', (select case when n > 0 then round(up::numeric / n, 3) end from rated),
    'resource_downloads', (select count(*) from public.resource_downloads),
    'generated_at', now()
  );
$$;

-- The service-only submit RPC must also refuse a high-risk assessment even if
-- an application route is bypassed or regresses later.
create or replace function public.submit_business_for_review(p_business_id uuid, p_owner_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare business public.businesses%rowtype; email_verified boolean; mobile_verified boolean;
  mobile_required boolean := false; missing text[];
begin
  if current_user not in ('service_role','postgres','supabase_admin') then raise exception 'TRUSTED_SERVER_REQUIRED'; end if;
  select * into business from public.businesses where id = p_business_id;
  if business.id is null or business.owner_id <> p_owner_id then raise exception 'BUSINESS_NOT_FOUND'; end if;
  if business.risk_level = 'high' then raise exception 'BUSINESS_HIGH_SUSPICION'; end if;
  if business.lifecycle_status not in ('draft','needs_correction','rejected') then raise exception 'BUSINESS_NOT_SUBMITTABLE'; end if;
  missing := public.business_submission_missing_requirements(p_business_id, p_owner_id);
  if coalesce(cardinality(missing),0) > 0 then raise exception 'BUSINESS_INCOMPLETE:%', array_to_string(missing, ','); end if;
  select email_verified_at is not null, mobile_verified_at is not null into email_verified, mobile_verified
    from public.profiles where id = p_owner_id;
  select coalesce(value->'require_mobile_for_submission' = 'true'::jsonb,false) into mobile_required
    from public.settings where key = 'business_verification';
  if not coalesce(email_verified,false) then raise exception 'EMAIL_NOT_VERIFIED'; end if;
  if coalesce(mobile_required,false) and not coalesce(mobile_verified,false) then raise exception 'MOBILE_NOT_VERIFIED'; end if;
  update public.businesses set lifecycle_status = 'submitted', publication_status = 'unpublished', published = false where id = p_business_id;
  insert into public.audit_log (actor_id, action, table_name, row_id, detail)
  values (p_owner_id,'business_submitted','businesses',p_business_id::text,
    jsonb_build_object('risk_level',business.risk_level,'requirements_complete',true,'email_verified',true,
      'mobile_required',mobile_required,'mobile_verified',mobile_verified,'turnstile_verified',true));
end;
$$;
revoke all on function public.submit_business_for_review(uuid, uuid) from public, anon, authenticated;
grant execute on function public.submit_business_for_review(uuid, uuid) to service_role;
