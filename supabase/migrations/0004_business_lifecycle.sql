-- Safe business lifecycle and publication controls.
--
-- This migration is intentionally additive. It preserves every business ID,
-- owner, slug, URL and relationship. Existing published rows stay published;
-- suspicious legacy data is classified in a later, separately reviewed phase.

alter table public.businesses
  add column if not exists lifecycle_status text,
  add column if not exists publication_status text,
  add column if not exists submitted_at timestamptz,
  add column if not exists approved_at timestamptz,
  add column if not exists published_at timestamptz,
  add column if not exists status_updated_at timestamptz;

-- Preserve current visibility while introducing the new state model.
update public.businesses
set
  lifecycle_status = case
    when published then 'approved'
    when verification_status = 'pending' then 'pending_review'
    else 'draft'
  end,
  publication_status = case when published then 'published' else 'unpublished' end,
  approved_at = case when published then coalesce(approved_at, updated_at, created_at) else approved_at end,
  published_at = case when published then coalesce(published_at, updated_at, created_at) else published_at end,
  status_updated_at = coalesce(status_updated_at, updated_at, created_at)
where lifecycle_status is null or publication_status is null or status_updated_at is null;

alter table public.businesses
  alter column lifecycle_status set default 'draft',
  alter column lifecycle_status set not null,
  alter column publication_status set default 'unpublished',
  alter column publication_status set not null,
  alter column status_updated_at set default now(),
  alter column status_updated_at set not null;

alter table public.businesses
  add constraint businesses_lifecycle_status_check
    check (lifecycle_status in ('draft','submitted','pending_review','needs_correction','approved','rejected','suspended')),
  add constraint businesses_publication_status_check
    check (publication_status in ('unpublished','published')),
  add constraint businesses_publication_compatibility_check
    check (published = (publication_status = 'published')),
  add constraint businesses_publication_requires_approval_check
    check (publication_status <> 'published' or lifecycle_status = 'approved');

create index if not exists businesses_lifecycle_status_idx
  on public.businesses (lifecycle_status, updated_at desc);

create index if not exists businesses_publication_status_idx
  on public.businesses (publication_status, updated_at desc);

-- Members may edit their business information, but lifecycle and publication
-- decisions are server/admin controlled. This also blocks direct REST calls,
-- modified browser JavaScript and hidden-field manipulation.
create or replace function public.protect_business_fields() returns trigger
language plpgsql set search_path = public as $$
begin
  if not public.is_trusted() then
    if tg_op = 'INSERT' then
      new.verified = false;
      if new.verification_status not in ('none', 'pending') then
        new.verification_status = 'none';
      end if;
      new.verification_note = null;
      new.lifecycle_status = 'draft';
      new.publication_status = 'unpublished';
      new.published = false;
      new.submitted_at = null;
      new.approved_at = null;
      new.published_at = null;
      new.status_updated_at = now();
    else
      new.verified = old.verified;
      if new.verification_status not in ('none', 'pending') then
        new.verification_status = old.verification_status;
      end if;
      new.verification_note = old.verification_note;
      new.lifecycle_status = old.lifecycle_status;
      new.publication_status = old.publication_status;
      new.published = old.published;
      new.submitted_at = old.submitted_at;
      new.approved_at = old.approved_at;
      new.published_at = old.published_at;
      new.status_updated_at = old.status_updated_at;
    end if;
  else
    if tg_op = 'INSERT' then
      new.status_updated_at = coalesce(new.status_updated_at, now());
      if new.lifecycle_status = 'submitted' then
        new.submitted_at = coalesce(new.submitted_at, now());
      end if;
      if new.lifecycle_status = 'approved' then
        new.approved_at = coalesce(new.approved_at, now());
      end if;
    elsif new.lifecycle_status is distinct from old.lifecycle_status then
      new.status_updated_at = now();
      if new.lifecycle_status = 'submitted' then
        new.submitted_at = coalesce(new.submitted_at, now());
      end if;
      if new.lifecycle_status = 'approved' then
        new.approved_at = coalesce(new.approved_at, now());
      end if;
    end if;

    if new.publication_status = 'published' then
      if new.lifecycle_status <> 'approved' then
        raise exception 'A business must be approved before publication.';
      end if;
      new.published = true;
      new.published_at = coalesce(new.published_at, now());
    else
      new.published = false;
    end if;
  end if;

  return new;
end; $$;

-- Rollback guidance (run only as a reviewed migration):
-- 1. Restore protect_business_fields() from 0001_init.sql.
-- 2. Drop the four businesses_* lifecycle/publication constraints and two
--    lifecycle/publication indexes.
-- 3. Keep the added columns by default so moderation history is not destroyed.
--    Drop them only after confirming no newer application code or data uses them.

