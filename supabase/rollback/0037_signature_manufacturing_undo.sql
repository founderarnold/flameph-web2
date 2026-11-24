-- Undo for 0037_signature_manufacturing.sql. Run only with the owner's written approval, after a backup, in one
-- transaction. It removes only what 0037 added and puts back the rules exactly as 0035 and 0036 left them.
-- It stops (and changes nothing) while any FLAME Signature proposal, licence or batch exists, or a file of a new type
-- (FDA product registration, lab report, packaging artwork, batch files) still has its file, so nothing is lost by
-- accident: delete those first (or keep 0037).
do $$ begin
  if exists (select 1 from public.supplier_offers where kind = 'manufacturer') then
    raise exception 'undo 0037: FLAME Signature proposals exist; keep 0037 or delete them first';
  end if;
  if exists (select 1 from public.signature_licences) or exists (select 1 from public.signature_batches) then
    raise exception 'undo 0037: FLAME Signature licences or batch records exist; keep 0037';
  end if;
  if exists (select 1 from public.vetting_documents where (purpose = 'batch' or doc_type in ('cpr', 'lab_report', 'packaging_art', 'coa', 'batch_photo')) and deleted_at is null) then
    raise exception 'undo 0037: FLAME Signature files still exist; delete them first';
  end if;
end $$;

-- The chapter testers' pick list and the file retention list, as 0035 wrote them.
create or replace function public.partner_sample_targets()
returns table (partner_user_id uuid, partner_name text, categories text[], offer_id uuid, offer_title text, item_id uuid, product_name text, sell_unit text)
language sql stable security definer set search_path = public as $$
  select p.user_id, p.legal_name, p.categories, o.id, o.title, i.id, i.product_name, i.sell_unit
  from public.partner_profiles p
  left join public.supplier_offers o on o.user_id = p.user_id and o.status in ('submitted', 'selected')
  left join public.supplier_offer_items i on i.offer_id = o.id
  where public.can_test_samples() and p.status = 'accredited' and p.user_id <> auth.uid()
  order by p.legal_name, o.title, i.position
  limit 2000;
$$;
revoke all on function public.partner_sample_targets() from public, anon;
grant execute on function public.partner_sample_targets() to authenticated, service_role;

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
    and (c.id is null or (c.status = 'closed' and c.closed_at < now() - interval '3 years'));
$$;
revoke all on function public.vetting_documents_due() from public, anon, authenticated;
grant execute on function public.vetting_documents_due() to service_role;

-- Files, as 0036 left them.
drop policy if exists vetting_documents_batch_read on public.vetting_documents;
alter table public.vetting_documents drop constraint if exists vetting_documents_partner_check;
alter table public.vetting_documents add constraint vetting_documents_partner_check
  check (purpose = 'vetting' and doc_type in ('dti_sec', 'mayors_permit', 'bir')
      or purpose = 'partner' and doc_type in ('dti_sec', 'mayors_permit', 'bir', 'gov_id', 'fda', 'prc', 'certification', 'other')
      or purpose = 'offer' and doc_type in ('product_photo', 'price_list', 'spec_sheet', 'certification', 'fda', 'other', 'portfolio', 'prc')
      or purpose = 'sample' and doc_type in ('sample_photo', 'other')
      or purpose = 'complaint' and doc_type in ('evidence_photo', 'receipt', 'other'));
alter table public.vetting_documents drop constraint if exists vetting_documents_doc_type_check;
alter table public.vetting_documents add constraint vetting_documents_doc_type_check
  check (doc_type in ('dti_sec', 'mayors_permit', 'bir', 'gov_id', 'fda', 'prc', 'certification', 'other', 'product_photo', 'price_list', 'spec_sheet',
    'sample_photo', 'evidence_photo', 'receipt', 'portfolio'));
alter table public.vetting_documents drop constraint if exists vetting_documents_purpose_check;
alter table public.vetting_documents add constraint vetting_documents_purpose_check check (purpose in ('vetting', 'partner', 'offer', 'sample', 'complaint'));
drop index if exists public.vetting_documents_batch;
alter table public.vetting_documents drop column if exists batch_id;

-- The new tables and their functions.
drop trigger if exists supplier_offers_signature_left on public.supplier_offers;
drop function if exists public.signature_offer_left_selected();
drop function if exists public.signature_mark_allowed(uuid, text, date);
drop table if exists public.signature_history;
drop table if exists public.signature_batches;
drop function if exists public.signature_licence_for(uuid, uuid, date);
drop function if exists public.signature_licence_problem(public.signature_licences);
drop table if exists public.signature_licences;
drop table if exists public.signature_reviews;
drop table if exists public.signature_products;
drop table if exists public.signature_sites;
drop sequence if exists public.signature_batch_no;
drop sequence if exists public.signature_licence_no;
drop function if exists public.signature_history_guard();
drop function if exists public.signature_batch_guard();
drop function if exists public.signature_licence_guard();
drop function if exists public.signature_review_guard();
drop function if exists public.signature_product_guard();
drop function if exists public.signature_site_guard();
drop function if exists public.signature_offer_mine(uuid);
drop function if exists public.signature_reviewer_ok(uuid, uuid);
drop function if exists public.signature_cleared(uuid, int, text);
drop function if exists public.signature_review_items(text);
drop function if exists public.offer_kind_category(text);

-- The offer rules, as 0036 wrote them.
create or replace function public.supplier_offer_guard() returns trigger
language plpgsql as $$
declare r record;
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.revision <> 0 then raise exception 'supplier_offer: new offers start as draft'; end if;
    if new.kind = 'service' then
      -- Only an accredited service provider can make service offers.
      if not exists (select 1 from public.partner_profiles p where p.user_id = new.user_id and p.status = 'accredited' and 'service_provider' = any(p.categories)) then
        raise exception 'supplier_offer: only accredited service providers can make service offers';
      end if;
    elsif not exists (select 1 from public.partner_profiles p where p.user_id = new.user_id and p.status = 'accredited' and 'supplier' = any(p.categories)) then
      -- Only an accredited supplier can make offers.
      raise exception 'supplier_offer: only accredited suppliers can make offers';
    end if;
    if (select count(*) from public.supplier_offers o where o.user_id = new.user_id and o.kind = new.kind) >= 20 then
      raise exception 'supplier_offer: limit of 20 offers per supplier';
    end if;
    return new;
  end if;
  if new.user_id <> old.user_id then raise exception 'supplier_offer: the supplier is fixed'; end if;
  if new.kind <> old.kind then raise exception 'supplier_offer: the kind of offer is fixed'; end if;
  if new.revision <> old.revision and not (new.status = 'submitted' and old.status <> 'submitted') then
    raise exception 'supplier_offer: the version number changes only when the offer is sent';
  end if;
  if new.status = old.status then
    if old.status not in ('draft', 'needs_changes')
       and (to_jsonb(new) - array['updated_at', 'decided_at', 'decided_by', 'decision_reasons', 'decision_note', 'selection_reason'])
           is distinct from (to_jsonb(old) - array['updated_at', 'decided_at', 'decided_by', 'decision_reasons', 'decision_note', 'selection_reason']) then
      raise exception 'supplier_offer: % offers cannot be edited', old.status;
    end if;
    return new;
  end if;
  if not ((old.status, new.status) in (
      ('draft', 'submitted'), ('needs_changes', 'submitted'),
      ('draft', 'withdrawn'), ('submitted', 'withdrawn'), ('needs_changes', 'withdrawn'), ('selected', 'withdrawn'),
      ('submitted', 'needs_changes'), ('submitted', 'selected'), ('submitted', 'not_selected'),
      ('not_selected', 'draft'), ('withdrawn', 'draft'), ('selected', 'draft'))) then
    raise exception 'supplier_offer: cannot move from % to %', old.status, new.status;
  end if;
  if new.status = 'submitted' then
    new.revision := old.revision + 1;   -- every send is a new version; scores belong to one version
    if new.kind = 'service' then
      if not exists (select 1 from public.service_offer_packages k where k.offer_id = new.id) then
        raise exception 'supplier_offer: add at least one service package before sending';
      end if;
      if new.license_required and new.license_valid_until is not null and new.license_valid_until < current_date then
        raise exception 'supplier_offer: the licence has expired';
      end if;
      if public.service_blanket_guarantee(concat_ws(' ', new.title, new.qualifications, new.portfolio, new.trial_terms, new.availability,
           new.service_levels, new.correction_policy, new.refund_policy, new.confidentiality, new.commission_note))
         or exists (select 1 from public.service_offer_packages k where k.offer_id = new.id
                    and public.service_blanket_guarantee(concat_ws(' ', k.name, k.description, k.scope, k.exclusions, k.acceptance_criteria, k.milestones::text))) then
        raise exception 'supplier_offer: no blanket satisfaction guarantee; describe measurable acceptance criteria instead';
      end if;
    elsif not exists (select 1 from public.supplier_offer_items i where i.offer_id = new.id) then
      raise exception 'supplier_offer: add at least one product before sending';
    end if;
    if new.valid_until < current_date then raise exception 'supplier_offer: the offer has already expired'; end if;
  end if;
  if new.status = 'selected' then
    -- Only the national team, never the supplier, with a no-conflict declaration, a passed compliance gate and a score
    -- at or above the pass mark for this version.
    if new.decided_by is null or new.decided_by = new.user_id
       or not exists (select 1 from public.roles x where x.user_id = new.decided_by and x.role in ('super_admin', 'admin', 'national_reviewer')) then
      raise exception 'supplier_offer: only the national team can select an offer';
    end if;
    if not exists (select 1 from public.supplier_offer_conflicts c where c.offer_id = new.id and c.reviewer_id = new.decided_by and not c.has_conflict) then
      raise exception 'supplier_offer: declare no conflict of interest before deciding';
    end if;
    select count(s.id) n, avg(s.total) a, coalesce(bool_and(s.compliance_pass), false) ok into r
      from public.supplier_offer_scores s where s.offer_id = new.id and s.revision = new.revision;
    if r.n = 0 or not r.ok or r.a < public.supplier_offer_pass_mark() then
      raise exception 'supplier_offer: a Best Offer needs the compliance gate passed and an average score of at least %', public.supplier_offer_pass_mark();
    end if;
  end if;
  return new;
end $$;

alter table public.supplier_offers drop constraint if exists supplier_offers_kind_fields;
alter table public.supplier_offers add constraint supplier_offers_kind_fields check (
  (kind = 'supplier' and service_category is null) or (kind = 'service' and product_group is null)
);
-- Nothing is sent or selected without the basics and the declaration. Supplier offers: exactly as 0032.
alter table public.supplier_offers drop constraint if exists supplier_offers_complete;
alter table public.supplier_offers add constraint supplier_offers_complete check (
  status not in ('submitted', 'selected')
  or (kind = 'supplier' and title is not null and product_group is not null and valid_until is not null and vat_basis is not null
      and serviceable_areas is not null and shipping_terms is not null and lead_time_days is not null
      and sample_availability is not null and commission_pct is not null and declaration_at is not null and submitted_at is not null)
  or (kind = 'service' and title is not null and service_category is not null and profession is not null and qualifications is not null
      and license_required is not null and (not license_required or (license_body is not null and license_no is not null))
      and valid_until is not null and vat_basis is not null and service_mode is not null and serviceable_areas is not null
      and free_trial is not null and availability is not null and lead_time_days is not null and response_hours is not null
      and correction_policy is not null and refund_policy is not null and confidentiality is not null and handles_personal_data is not null
      and commission_pct is not null and declaration_at is not null and submitted_at is not null)
);

alter table public.supplier_offers drop constraint if exists supplier_offers_kind_check;
alter table public.supplier_offers add constraint supplier_offers_kind_check check (kind in ('supplier', 'service'));
alter table public.supplier_offers drop constraint if exists supplier_offers_signature_category_check;
alter table public.supplier_offers drop constraint if exists supplier_offers_formulation_ownership_check;
alter table public.supplier_offers drop constraint if exists supplier_offers_packaging_supply_check;
alter table public.supplier_offers
  drop column if exists signature_category, drop column if exists formulation_ownership, drop column if exists formulation_note,
  drop column if exists rnd_support, drop column if exists qc_testing, drop column if exists lab_partner, drop column if exists traceability,
  drop column if exists batch_record_years, drop column if exists recall_plan, drop column if exists recall_contact, drop column if exists mock_recall_on,
  drop column if exists packaging_supply, drop column if exists ip_terms_version, drop column if exists ip_terms_accepted_at;
