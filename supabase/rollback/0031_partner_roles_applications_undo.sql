-- Undo for 0031_partner_roles_applications.sql. Run only with the owner's written approval, after a backup, in one
-- transaction. It removes only what 0031 added and puts back the earlier rules exactly as 0001 and 0022 wrote them.
-- It stops (and changes nothing) while any member still holds one of the four partner roles, or while a partner
-- document still has its file, so nothing is lost by accident: remove those roles and delete those files first.
do $$ begin
  if exists (select 1 from public.roles where role in ('chapter_coordinator', 'chapter_tester', 'national_reviewer', 'finance')) then
    raise exception 'undo 0031: remove the partner roles from Admin > Members first';
  end if;
  if exists (select 1 from public.vetting_documents where purpose = 'partner' and deleted_at is null) then
    raise exception 'undo 0031: partner documents still have files; delete them first';
  end if;
end $$;

update storage.buckets set file_size_limit = null, allowed_mime_types = null where id = 'private-docs';

create or replace function public.vetting_documents_due() returns table (id uuid, file_path text, reason text)
language sql stable security definer set search_path = public as $$
  select d.id, d.file_path,
    case when not public.has_consent(d.user_id, 'vetting') then 'consent_withdrawn' else 'retention' end
  from public.vetting_documents d
  where d.deleted_at is null
    and (not public.has_consent(d.user_id, 'vetting')
      or exists (select 1 from public.businesses b where b.owner_id = d.user_id and b.verification_status in ('approved', 'rejected')
                 and b.verification_decided_at < now() - interval '1 year'));
$$;
revoke all on function public.vetting_documents_due() from public, anon, authenticated;

drop policy if exists vetting_documents_partner_read on public.vetting_documents;
delete from public.vetting_documents where purpose = 'partner';   -- rows only; their files are already deleted (checked above)
alter table public.vetting_documents drop constraint if exists vetting_documents_partner_check;
alter table public.vetting_documents drop constraint if exists vetting_documents_doc_type_check;
alter table public.vetting_documents add constraint vetting_documents_doc_type_check check (doc_type in ('dti_sec', 'mayors_permit', 'bir'));
drop index if exists public.vetting_documents_application;
alter table public.vetting_documents drop column if exists reviewed_by, drop column if exists reviewed_at,
  drop column if exists review_status, drop column if exists application_id, drop column if exists purpose;

drop function if exists public.partner_chapter_applications();
drop table if exists public.partner_profiles;
drop table if exists public.partner_reviews;
drop table if exists public.partner_applications;
drop function if exists public.partner_reviews_guard();
drop function if exists public.partner_application_guard();
drop function if exists public.is_partner_reviewer();

alter table public.roles drop constraint if exists roles_partner_chapter_check;
alter table public.roles drop constraint if exists roles_role_check;
alter table public.roles add constraint roles_role_check check (role in ('super_admin', 'admin', 'chapter_leader', 'editor'));
