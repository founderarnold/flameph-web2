-- Every newly inserted business starts as a private draft, regardless of
-- whether it was created by the browser, an admin tool or a service process.
-- Trusted callers may review and publish only in a later UPDATE.

create or replace function public.protect_business_fields() returns trigger
language plpgsql set search_path = public as $$
begin
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
    return new;
  end if;

  if not public.is_trusted() then
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
    return new;
  end if;

  if new.lifecycle_status is distinct from old.lifecycle_status then
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

  return new;
end;
$$;

-- Rollback guidance: restore protect_business_fields() from 0004 only if the
-- deployment is also rolled back. No rows are modified by this migration.
