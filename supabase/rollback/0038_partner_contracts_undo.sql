-- Undo for 0038_partner_contracts.sql. Run only with the owner's written approval, after a backup, in one transaction.
-- It removes only what 0038 added and puts back the rules exactly as 0037 left them. It stops (and changes nothing)
-- while any contract template, contract or contract file exists, so no agreement or signature is lost by accident:
-- keep 0038 in that case (signed contracts must be kept for years).
do $$ begin
  if exists (select 1 from public.partner_contracts) then raise exception 'undo 0038: contracts exist; keep 0038'; end if;
  if exists (select 1 from public.contract_templates) then raise exception 'undo 0038: contract templates exist; delete the drafts first or keep 0038'; end if;
  if exists (select 1 from public.vetting_documents where purpose = 'contract' or doc_type in ('signed_contract', 'authority_proof')) then
    raise exception 'undo 0038: contract files exist; keep 0038';
  end if;
  if exists (select 1 from public.commission_rules where contract_id is not null) or exists (select 1 from public.partner_penalty_terms where contract_id is not null) then
    raise exception 'undo 0038: rates or penalty terms point at contracts; keep 0038';
  end if;
end $$;

drop trigger if exists commission_rules_a_contract on public.commission_rules;
drop trigger if exists partner_penalty_terms_a_contract on public.partner_penalty_terms;
drop trigger if exists settings_contract_esign_guard on public.settings;
drop policy if exists vetting_documents_contract_read on public.vetting_documents;

-- File rules and the retention list, as 0037 wrote them.
alter table public.vetting_documents drop constraint if exists vetting_documents_purpose_check;
alter table public.vetting_documents add constraint vetting_documents_purpose_check check (purpose in ('vetting', 'partner', 'offer', 'sample', 'complaint', 'batch'));
alter table public.vetting_documents drop constraint if exists vetting_documents_doc_type_check;
alter table public.vetting_documents add constraint vetting_documents_doc_type_check
  check (doc_type in ('dti_sec', 'mayors_permit', 'bir', 'gov_id', 'fda', 'prc', 'certification', 'other', 'product_photo', 'price_list', 'spec_sheet',
    'sample_photo', 'evidence_photo', 'receipt', 'portfolio', 'cpr', 'lab_report', 'packaging_art', 'coa', 'batch_photo'));
alter table public.vetting_documents drop constraint if exists vetting_documents_partner_check;
alter table public.vetting_documents add constraint vetting_documents_partner_check
  check (purpose = 'vetting' and doc_type in ('dti_sec', 'mayors_permit', 'bir')
      or purpose = 'partner' and doc_type in ('dti_sec', 'mayors_permit', 'bir', 'gov_id', 'fda', 'prc', 'certification', 'other')
      or purpose = 'offer' and doc_type in ('product_photo', 'price_list', 'spec_sheet', 'certification', 'fda', 'other', 'portfolio', 'prc', 'cpr', 'lab_report', 'packaging_art')
      or purpose = 'sample' and doc_type in ('sample_photo', 'other')
      or purpose = 'complaint' and doc_type in ('evidence_photo', 'receipt', 'other')
      or purpose = 'batch' and doc_type in ('coa', 'lab_report', 'batch_photo', 'other'));
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
    and (o.id is null or (o.status in ('not_selected', 'withdrawn') and o.updated_at < now() - interval '1 year'))
  union all
  select d.id, d.file_path, 'retention'
  from public.vetting_documents d
  left join public.partner_sample_tests t on t.id = d.sample_id
  where d.deleted_at is null and d.purpose = 'sample'
    and (t.id is null or t.submitted_at < now() - interval '3 years')
  union all
  select d.id, d.file_path, 'retention'
  from public.vetting_documents d
  left join public.partner_complaints c on c.id = d.complaint_id
  where d.deleted_at is null and d.purpose = 'complaint'
    and (c.id is null or (c.status = 'closed' and c.closed_at < now() - interval '3 years'))
  union all
  select d.id, d.file_path, 'retention'
  from public.vetting_documents d
  left join public.signature_batches b on b.id = d.batch_id
  where d.deleted_at is null and d.purpose = 'batch'
    and (b.id is null or b.expiry_on < current_date - interval '3 years');
$$;
revoke all on function public.vetting_documents_due() from public, anon, authenticated;
grant execute on function public.vetting_documents_due() to service_role;

alter table public.commission_rules drop column if exists contract_id;
alter table public.partner_penalty_terms drop column if exists contract_id;
alter table public.vetting_documents drop column if exists contract_id;
delete from public.settings where key = 'contract_esign';

-- Triggers on the new tables go with them; functions that use the contract row type go first.
drop function if exists public.partner_contract_problem(public.partner_contracts);
drop table if exists public.partner_contract_history;
drop table if exists public.partner_contract_signatures;
drop table if exists public.partner_contract_checks;
drop table if exists public.partner_contracts;
drop table if exists public.contract_templates;
drop sequence if exists public.partner_contract_no;

drop function if exists public.partner_contract_link_guard();
drop function if exists public.partner_contracts_renewal_due();
drop function if exists public.partner_contract_history_guard();
drop function if exists public.partner_contract_signature_after();
drop function if exists public.partner_contract_signature_guard();
drop function if exists public.partner_contract_check_guard();
drop function if exists public.partner_contract_guard();
drop function if exists public.partner_contract_cleared(uuid, int);
drop function if exists public.partner_contract_mine(uuid);
drop function if exists public.contract_template_guard();
drop function if exists public.settings_contract_esign_guard();
drop function if exists public.contract_esign_on();
drop function if exists public.contract_flame_signer(uuid);
drop function if exists public.contract_check_items();
drop function if exists public.contract_required_parts(text);
drop function if exists public.ph_today();
