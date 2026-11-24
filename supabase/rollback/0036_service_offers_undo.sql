-- Undo for 0036_service_offers.sql. Run only with the owner's written approval, after a backup, in one transaction.
-- It removes only what 0036 added and puts back the rules exactly as 0032 and 0035 left them.
-- It stops (and changes nothing) while any service offer exists or an offer file of a new type (portfolio, licence)
-- still has its file, so nothing is lost by accident: delete those first (or keep 0036).
do $$ begin
  if exists (select 1 from public.supplier_offers where kind = 'service') then
    raise exception 'undo 0036: service offers exist; keep 0036 or delete the service offers first';
  end if;
  if exists (select 1 from public.vetting_documents where purpose = 'offer' and doc_type in ('portfolio', 'prc') and deleted_at is null) then
    raise exception 'undo 0036: portfolio or licence offer files still exist; delete them first';
  end if;
end $$;

-- Offer files, as 0035 left them.
alter table public.vetting_documents drop constraint if exists vetting_documents_partner_check;
alter table public.vetting_documents add constraint vetting_documents_partner_check
  check (purpose = 'vetting' and doc_type in ('dti_sec', 'mayors_permit', 'bir')
      or purpose = 'partner' and doc_type in ('dti_sec', 'mayors_permit', 'bir', 'gov_id', 'fda', 'prc', 'certification', 'other')
      or purpose = 'offer' and doc_type in ('product_photo', 'price_list', 'spec_sheet', 'certification', 'fda', 'other')
      or purpose = 'sample' and doc_type in ('sample_photo', 'other')
      or purpose = 'complaint' and doc_type in ('evidence_photo', 'receipt', 'other'));
alter table public.vetting_documents drop constraint if exists vetting_documents_doc_type_check;
alter table public.vetting_documents add constraint vetting_documents_doc_type_check
  check (doc_type in ('dti_sec', 'mayors_permit', 'bir', 'gov_id', 'fda', 'prc', 'certification', 'other', 'product_photo', 'price_list', 'spec_sheet',
    'sample_photo', 'evidence_photo', 'receipt'));

drop table if exists public.service_offer_references;
drop table if exists public.service_offer_packages;
drop function if exists public.service_offer_reference_guard();
drop function if exists public.service_offer_package_guard();

-- The offer and product rules, as 0032 wrote them.
create or replace function public.supplier_offer_guard() returns trigger
language plpgsql as $$
declare r record;
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.revision <> 0 then raise exception 'supplier_offer: new offers start as draft'; end if;
    -- Only an accredited supplier can make offers.
    if not exists (select 1 from public.partner_profiles p where p.user_id = new.user_id and p.status = 'accredited' and 'supplier' = any(p.categories)) then
      raise exception 'supplier_offer: only accredited suppliers can make offers';
    end if;
    if (select count(*) from public.supplier_offers o where o.user_id = new.user_id) >= 20 then
      raise exception 'supplier_offer: limit of 20 offers per supplier';
    end if;
    return new;
  end if;
  if new.user_id <> old.user_id then raise exception 'supplier_offer: the supplier is fixed'; end if;
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
    if not exists (select 1 from public.supplier_offer_items i where i.offer_id = new.id) then
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

create or replace function public.supplier_offer_item_guard() returns trigger
language plpgsql as $$
declare st text;
begin
  select o.status into st from public.supplier_offers o where o.id = coalesce(new.offer_id, old.offer_id);
  if not found then return coalesce(new, old); end if;   -- the offer is being erased with its account
  if tg_op = 'UPDATE' and new.offer_id <> old.offer_id then raise exception 'supplier_offer_item: cannot move to another offer'; end if;
  if st not in ('draft', 'needs_changes') then raise exception 'supplier_offer_item: % offers cannot be edited', st; end if;
  if tg_op = 'INSERT' and (select count(*) from public.supplier_offer_items i where i.offer_id = new.offer_id) >= 30 then
    raise exception 'supplier_offer_item: limit of 30 products per offer';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  new.updated_at := now();
  return new;
end $$;

alter table public.supplier_offers drop constraint if exists supplier_offers_complete;
alter table public.supplier_offers add constraint supplier_offers_complete check (
  status not in ('submitted', 'selected')
  or (title is not null and product_group is not null and valid_until is not null and vat_basis is not null
      and serviceable_areas is not null and shipping_terms is not null and lead_time_days is not null
      and sample_availability is not null and commission_pct is not null and declaration_at is not null and submitted_at is not null)
);
alter table public.supplier_offers drop constraint if exists supplier_offers_kind_fields;
drop index if exists public.supplier_offers_kind;
drop function if exists public.service_blanket_guarantee(text);
alter table public.supplier_offers
  drop column if exists handles_personal_data, drop column if exists confidentiality, drop column if exists refund_policy,
  drop column if exists correction_policy, drop column if exists service_levels, drop column if exists response_hours,
  drop column if exists monthly_clients, drop column if exists availability, drop column if exists trial_terms,
  drop column if exists free_trial, drop column if exists service_mode, drop column if exists portfolio,
  drop column if exists license_valid_until, drop column if exists license_no, drop column if exists license_body,
  drop column if exists license_required, drop column if exists qualifications, drop column if exists profession,
  drop column if exists service_category, drop column if exists kind;
