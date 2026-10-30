-- Protect legitimate legacy businesses while quarantining only records that
-- match a deliberately narrow, multi-signal random-content pattern.
--
-- This migration never deletes or merges a business. It records the original
-- publication state, keeps presumed-legitimate records public, queues weak or
-- ambiguous signals for review without changing visibility, and unpublishes
-- only records that match all three independent random-token signals.

create table if not exists public.business_legacy_assessments (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  classification text not null check (classification in ('clearly_legitimate','incomplete','obviously_suspicious','uncertain')),
  reason_codes text[] not null default '{}',
  possible_duplicate boolean not null default false,
  was_published boolean not null,
  action_taken text not null check (action_taken in ('kept_public','queued_for_review','quarantined','restored_public','confirmed_quarantine')),
  review_state text not null default 'pending' check (review_state in ('pending','cleared','confirmed')),
  assessment_version text not null default 'legacy-v1',
  assessed_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_note text
);

alter table public.business_legacy_assessments enable row level security;

create policy business_legacy_assessments_admin_select
  on public.business_legacy_assessments for select
  using (public.is_admin());

create policy business_legacy_assessments_admin_update
  on public.business_legacy_assessments for update
  using (public.is_admin()) with check (public.is_admin());

grant select, update on public.business_legacy_assessments to authenticated;

create index if not exists business_legacy_assessments_review_idx
  on public.business_legacy_assessments (review_state, classification, assessed_at desc);

with signals as (
  select
    b.id,
    b.published,
    length(trim(coalesce(b.description, ''))) = 0
      or coalesce(trim(b.city), '') = ''
      or coalesce(trim(b.province), '') = ''
      or coalesce(trim(b.sector), '') = '' as missing_core,
    length(trim(b.name)) >= 14
      and b.name ~ '^[A-Za-z]+$'
      and b.name ~ '[a-z]'
      and b.name ~ '[A-Z]' as random_name,
    length(trim(coalesce(b.description, ''))) >= 12
      and trim(coalesce(b.description, '')) ~ '^[A-Za-z]+$'
      and b.description ~ '[a-z]'
      and b.description ~ '[A-Z]' as random_description,
    length(trim(coalesce(b.products, ''))) >= 12
      and trim(coalesce(b.products, '')) ~ '^[A-Za-z]+$'
      and b.products ~ '[a-z]'
      and b.products ~ '[A-Z]' as random_products,
    (coalesce(trim(b.contact_messenger), '') <> ''
      or coalesce(trim(b.contact_viber), '') <> ''
      or coalesce(trim(b.contact_phone), '') <> ''
      or coalesce(trim(b.contact_email), '') <> ''
      or coalesce(trim(b.marketplaceph_url), '') <> '') as has_contact,
    cardinality(coalesce(b.photos, '{}')) > 0 as has_media,
    count(*) over (
      partition by lower(regexp_replace(b.name, '[^a-zA-Z0-9]', '', 'g'))
    ) > 1 as possible_duplicate
  from public.businesses b
), classified as (
  select
    s.*,
    case
      when random_name and random_description and random_products then 'obviously_suspicious'
      when missing_core then 'incomplete'
      when possible_duplicate then 'uncertain'
      when not random_name and (has_contact or has_media) then 'clearly_legitimate'
      else 'uncertain'
    end as classification
  from signals s
)
insert into public.business_legacy_assessments (
  business_id,
  classification,
  reason_codes,
  possible_duplicate,
  was_published,
  action_taken
)
select
  id,
  classification,
  array_remove(array[
    case when random_name then 'random_name_token' end,
    case when random_description then 'random_description_token' end,
    case when random_products then 'random_products_token' end,
    case when missing_core then 'missing_core_fields' end,
    case when possible_duplicate then 'possible_duplicate_name' end,
    case when not has_contact then 'no_contact_channel' end,
    case when not has_media then 'no_media' end
  ], null),
  possible_duplicate,
  published,
  case
    when classification = 'obviously_suspicious' then 'quarantined'
    when classification in ('incomplete', 'uncertain') then 'queued_for_review'
    else 'kept_public'
  end
from classified
on conflict (business_id) do nothing;

-- Only the high-confidence, three-signal class is automatically quarantined.
-- Incomplete, duplicate and uncertain records remain in their existing state
-- until an administrator makes a record-by-record decision.
update public.businesses b
set
  lifecycle_status = 'needs_correction',
  publication_status = 'unpublished'
where exists (
  select 1
  from public.business_legacy_assessments a
  where a.business_id = b.id
    and a.classification = 'obviously_suspicious'
    and a.action_taken = 'quarantined'
);

insert into public.audit_log (action, table_name, row_id, detail)
select
  'business_legacy_quarantine',
  'businesses',
  a.business_id::text,
  jsonb_build_object(
    'assessment_version', a.assessment_version,
    'classification', a.classification,
    'reason_codes', a.reason_codes,
    'was_published', a.was_published
  )
from public.business_legacy_assessments a
where a.classification = 'obviously_suspicious'
  and a.action_taken = 'quarantined'
  and not exists (
    select 1 from public.audit_log l
    where l.action = 'business_legacy_quarantine'
      and l.table_name = 'businesses'
      and l.row_id = a.business_id::text
  );

create or replace function public.review_business_legacy_assessment(
  p_business_id uuid,
  p_decision text,
  p_actor_id uuid,
  p_note text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
    raise exception 'Administrator access required.';
  end if;

  -- Service-role calls come only from the already-authorized server action.
  -- Direct authenticated admin calls always use the JWT subject as actor.
  v_actor_id := case
    when coalesce(auth.role(), '') = 'service_role' then p_actor_id
    else auth.uid()
  end;

  if v_actor_id is null then
    raise exception 'Review actor is required.';
  end if;

  if p_decision not in ('confirm_quarantine', 'restore_public', 'clear_review') then
    raise exception 'Unknown legacy review decision.';
  end if;

  if not exists (
    select 1 from public.business_legacy_assessments
    where business_id = p_business_id
  ) then
    raise exception 'Legacy assessment not found.';
  end if;

  if p_decision = 'confirm_quarantine' then
    update public.businesses
    set lifecycle_status = 'needs_correction', publication_status = 'unpublished'
    where id = p_business_id;

    update public.business_legacy_assessments
    set review_state = 'confirmed', action_taken = 'confirmed_quarantine',
        reviewed_at = now(), reviewed_by = v_actor_id, review_note = nullif(trim(p_note), '')
    where business_id = p_business_id;
  elsif p_decision = 'restore_public' then
    update public.businesses
    set lifecycle_status = 'approved', publication_status = 'published'
    where id = p_business_id;

    update public.business_legacy_assessments
    set review_state = 'cleared', action_taken = 'restored_public',
        reviewed_at = now(), reviewed_by = v_actor_id, review_note = nullif(trim(p_note), '')
    where business_id = p_business_id;
  else
    update public.business_legacy_assessments
    set review_state = 'cleared', action_taken = 'kept_public',
        reviewed_at = now(), reviewed_by = v_actor_id, review_note = nullif(trim(p_note), '')
    where business_id = p_business_id;
  end if;

  insert into public.audit_log (actor_id, action, table_name, row_id, detail)
  values (
    v_actor_id,
    'business_legacy_' || p_decision,
    'businesses',
    p_business_id::text,
    jsonb_build_object('note', nullif(trim(p_note), ''))
  );
end;
$$;

revoke all on function public.review_business_legacy_assessment(uuid, text, uuid, text) from public, anon;
grant execute on function public.review_business_legacy_assessment(uuid, text, uuid, text) to authenticated, service_role;

-- Rollback guidance (review before running):
-- 1. Restore only rows whose assessment action is still 'quarantined' and
--    was_published=true to approved/published.
-- 2. Drop review_business_legacy_assessment(uuid,text,uuid,text).
-- 3. Drop business_legacy_assessments only after exporting its audit history.
-- No rollback step should delete or recreate a business row.
