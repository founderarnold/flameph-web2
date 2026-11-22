-- Undo for 0032_supplier_offers.sql. Run only with the owner's written approval, after a backup, in one transaction.
-- It removes only what 0032 added and puts back the rules exactly as 0031 left them.
-- It stops (and changes nothing) while any supplier offer exists or an offer file still has its file, so nothing is lost
-- by accident: delete those offers and files first (or keep 0032).
do $$ begin
  if exists (select 1 from public.supplier_offers) then
    raise exception 'undo 0032: supplier offers exist; keep 0032 or delete the offers first';
  end if;
  if exists (select 1 from public.vetting_documents where purpose = 'offer' and deleted_at is null) then
    raise exception 'undo 0032: offer files still exist; delete them first';
  end if;
end $$;

-- Document clean-up, as 0031 wrote it.
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
    and (a.id is null or (a.status in ('rejected', 'withdrawn') and a.updated_at < now() - interval '1 year'));
$$;
revoke all on function public.vetting_documents_due() from public, anon, authenticated;

drop policy if exists vetting_documents_offer_read on public.vetting_documents;
delete from public.vetting_documents where purpose = 'offer';   -- rows only; their files are already deleted (checked above)
alter table public.vetting_documents drop constraint if exists vetting_documents_partner_check;
alter table public.vetting_documents drop constraint if exists vetting_documents_doc_type_check;
alter table public.vetting_documents drop constraint if exists vetting_documents_purpose_check;
alter table public.vetting_documents add constraint vetting_documents_doc_type_check
  check (doc_type in ('dti_sec', 'mayors_permit', 'bir', 'gov_id', 'fda', 'prc', 'certification', 'other'));
alter table public.vetting_documents add constraint vetting_documents_purpose_check check (purpose in ('vetting', 'partner'));
alter table public.vetting_documents add constraint vetting_documents_partner_check
  check (purpose = 'vetting' and doc_type in ('dti_sec', 'mayors_permit', 'bir') or purpose = 'partner');
drop index if exists public.vetting_documents_offer;
alter table public.vetting_documents drop column if exists item_id, drop column if exists offer_id;

drop table if exists public.supplier_offer_scores;
drop table if exists public.supplier_offer_conflicts;
drop table if exists public.supplier_offer_history;
drop table if exists public.supplier_offer_items;
drop table if exists public.supplier_offers;
drop function if exists public.supplier_offer_score_guard();
drop function if exists public.supplier_offer_conflict_guard();
drop function if exists public.supplier_offer_history_guard();
drop function if exists public.supplier_offer_item_guard();
drop function if exists public.supplier_offer_guard();
drop function if exists public.supplier_offer_pass_mark();
