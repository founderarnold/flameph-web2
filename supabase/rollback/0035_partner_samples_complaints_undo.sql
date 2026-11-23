-- Undo for 0035_partner_samples_complaints.sql. Run only with the owner's written approval, after a backup, in one
-- transaction. It removes only what 0035 added and puts back the rules exactly as 0032 left them.
-- It stops (and changes nothing) while any sent complaint, sent sample test, penalty or sanction exists, or a sample
-- photo or complaint evidence file still has its file, so nothing is lost by accident.
do $$ begin
  if exists (select 1 from public.partner_complaints where status <> 'draft') then
    raise exception 'undo 0035: sent complaints exist; keep 0035';
  end if;
  if exists (select 1 from public.partner_sample_tests where status <> 'draft') then
    raise exception 'undo 0035: sent sample tests exist; keep 0035';
  end if;
  if exists (select 1 from public.partner_penalties) or exists (select 1 from public.partner_sanctions) then
    raise exception 'undo 0035: penalties or sanctions exist; keep 0035';
  end if;
  if exists (select 1 from public.vetting_documents where purpose in ('sample', 'complaint') and deleted_at is null) then
    raise exception 'undo 0035: sample photos or complaint evidence files still exist; delete them first';
  end if;
  if exists (select 1 from public.partner_profiles where status = 'suspended') then
    raise notice 'undo 0035: some partners are suspended; their status stays as it is';
  end if;
end $$;

-- Document clean-up, as 0032 wrote it.
create or replace function public.vetting_documents_due() returns table (id uuid, file_path text, reason text)
language sql stable security definer set search_path = public as $$
  select d.id, d.file_path,
    case when not public.has_consent(d.user_id, 'vetting') then 'consent_withdrawn' else 'retention' end
  from public.vetting_documents d
  where d.deleted_at is null and d.purpose = 'vetting'
    and (not public.has_consent(d.user_id, 'vetting')
      or exists (select 1 from public.businesses b where b.owner_id = d.user_id and b.verification_status in ('approved', 'rejected')
                 and b.verification_decided_at < now() - interval '1 year'))
  union all
  select d.id, d.file_path, 'retention'
  from public.vetting_documents d
  left join public.partner_applications a on a.id = d.application_id
  where d.deleted_at is null and d.purpose = 'partner'
    and (a.id is null or (a.status in ('rejected', 'withdrawn') and a.updated_at < now() - interval '1 year'))
  union all
  select d.id, d.file_path, 'retention'
  from public.vetting_documents d
  left join public.supplier_offers o on o.id = d.offer_id
  where d.deleted_at is null and d.purpose = 'offer'
    and (o.id is null or (o.status in ('not_selected', 'withdrawn') and o.updated_at < now() - interval '1 year'));
$$;
revoke all on function public.vetting_documents_due() from public, anon, authenticated;
grant execute on function public.vetting_documents_due() to service_role;

drop policy if exists vetting_documents_sample_read on public.vetting_documents;
drop policy if exists vetting_documents_complaint_read on public.vetting_documents;
delete from public.vetting_documents where purpose in ('sample', 'complaint');   -- rows only; their files are already deleted (checked above)
alter table public.vetting_documents drop constraint if exists vetting_documents_partner_check;
alter table public.vetting_documents drop constraint if exists vetting_documents_doc_type_check;
alter table public.vetting_documents drop constraint if exists vetting_documents_purpose_check;
alter table public.vetting_documents add constraint vetting_documents_purpose_check check (purpose in ('vetting', 'partner', 'offer'));
alter table public.vetting_documents add constraint vetting_documents_doc_type_check
  check (doc_type in ('dti_sec', 'mayors_permit', 'bir', 'gov_id', 'fda', 'prc', 'certification', 'other', 'product_photo', 'price_list', 'spec_sheet'));
alter table public.vetting_documents add constraint vetting_documents_partner_check
  check (purpose = 'vetting' and doc_type in ('dti_sec', 'mayors_permit', 'bir')
      or purpose = 'partner' and doc_type in ('dti_sec', 'mayors_permit', 'bir', 'gov_id', 'fda', 'prc', 'certification', 'other')
      or purpose = 'offer' and doc_type in ('product_photo', 'price_list', 'spec_sheet', 'certification', 'fda', 'other'));
drop index if exists public.vetting_documents_sample;
drop index if exists public.vetting_documents_complaint;
alter table public.vetting_documents drop column if exists sample_id, drop column if exists complaint_id;

drop function if exists public.complaint_side(public.partner_complaints, uuid);
drop table if exists public.partner_sanctions;
drop table if exists public.partner_penalties;
drop table if exists public.partner_penalty_terms;
drop table if exists public.partner_corrective_actions;
drop table if exists public.partner_complaint_events;
drop table if exists public.partner_complaints;
drop table if exists public.complaint_targets;
drop table if exists public.partner_sample_tests;
drop sequence if exists public.partner_complaint_no;
drop sequence if exists public.partner_sample_no;
drop function if exists public.complaint_party(uuid);
drop function if exists public.partner_coordinates(uuid);
drop function if exists public.partner_sanction_after();
drop function if exists public.partner_sanction_delete_guard();
drop function if exists public.partner_sanction_guard();
drop function if exists public.partner_penalty_after();
drop function if exists public.partner_penalty_delete_guard();
drop function if exists public.partner_penalty_guard();
drop function if exists public.partner_late_penalty(numeric, numeric, int, numeric);
drop function if exists public.partner_penalty_terms_guard();
drop function if exists public.partner_action_after();
drop function if exists public.partner_action_delete_guard();
drop function if exists public.partner_action_guard();
drop function if exists public.complaints_overdue();
drop function if exists public.partner_complaint_after();
drop function if exists public.partner_complaint_events_guard();
drop function if exists public.partner_complaint_delete_guard();
drop function if exists public.partner_complaint_guard();
drop function if exists public.complaint_default_severity(text);
drop function if exists public.complaint_target_guard();
drop function if exists public.my_sample_results();
drop function if exists public.partner_sample_targets();
drop function if exists public.partner_sample_delete_guard();
drop function if exists public.partner_sample_guard();
drop function if exists public.partner_only_nulled(jsonb, jsonb, text[]);
drop function if exists public.can_test_samples();
drop function if exists public.partner_is_tester(uuid, uuid);
