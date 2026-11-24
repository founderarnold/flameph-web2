-- Partner accreditation, Step 6: Service Provider Best Offer. An accredited service provider sends an offer with their
-- profession, qualifications, licence (where needed), portfolio, service packages (scope, exclusions, normal and member
-- rates, milestones and MEASURABLE acceptance criteria), free consultation or trial, availability, areas served or
-- remote work, service levels, correction and refund policy, confidentiality and data handling, past clients the
-- national team can call, and a PROPOSED commission. The national team compares service offers on cost,
-- qualifications, service levels and customer results, scores them (same 30/25/20/15/10 table as Step 2) and only it
-- selects a Best Offer.
--
-- REUSE / EXTEND (nothing removed or renamed, no existing row changes):
--   supplier_offers           + kind ('supplier' for every existing row, or 'service') and the service columns below.
--                             Commissions (0034), complaints and trials (0035) already point at supplier_offers, so
--                             service offers work with them as they are.
--   supplier_offer_history    reused as is (sends with frozen copies, decisions, notes)
--   supplier_offer_conflicts  reused as is (conflict-of-interest declarations)
--   supplier_offer_scores     reused as is; for services the five parts read: cost and member value 30, qualifications
--                             and customer results 25, licences, compliance and service levels 20, commission and
--                             chapter benefits 15, availability, coverage and after-service 10. Same pass mark 80.
--   vetting_documents         purpose 'offer' also takes 'portfolio' (work samples) and 'prc' (licence) files
--   member_reputation()       (0022) reused by the server for verified customer feedback from confirmed deals
-- NEW:
--   service_offer_packages    one row per service package (up to 15 per offer)
--   service_offer_references  up to 5 past clients the national team calls to verify the work (feedback, rating)
--
-- No universal "100% satisfaction" promise: the database refuses to send a service offer that makes one. Results are
-- judged against the written scope of work and its acceptance criteria.
--
-- Money: flameph.org never collects, holds, pays out or moves money. Rates are what members pay the provider directly;
-- the proposed commission is a figure recorded for negotiation only; MarketplacePH Online Store handles any actual money.
--
-- Who sees what: exactly as Step 2. The provider sees only their own offers, packages and references; the national team
-- (founder, admin, national reviewer) sees all; chapter coordinators, testers, finance, other members and visitors see
-- nothing. No browser role can write: every write goes through the flameph.org server.
--
-- Take a backup before applying. Safe to run twice. Undo: supabase/rollback/0036_service_offers_undo.sql.

-- ===========================================================================================================
-- A. Service columns on the shared offer table
-- ===========================================================================================================
alter table public.supplier_offers add column if not exists kind text not null default 'supplier';
alter table public.supplier_offers drop constraint if exists supplier_offers_kind_check;
alter table public.supplier_offers add constraint supplier_offers_kind_check check (kind in ('supplier', 'service'));

alter table public.supplier_offers add column if not exists service_category text;
alter table public.supplier_offers drop constraint if exists supplier_offers_service_category_check;
alter table public.supplier_offers add constraint supplier_offers_service_category_check check (service_category in ('accounting_tax', 'legal_permits',
  'marketing_digital', 'design_printing', 'it_web', 'logistics_delivery', 'repairs_maintenance', 'training_coaching', 'photo_video',
  'business_consulting', 'hr_staffing', 'food_safety_testing', 'construction_renovation', 'cleaning_sanitation', 'other'));
alter table public.supplier_offers add column if not exists profession text check (char_length(profession) <= 150);
alter table public.supplier_offers add column if not exists qualifications text check (char_length(qualifications) <= 1500);
alter table public.supplier_offers add column if not exists license_required boolean;
alter table public.supplier_offers add column if not exists license_body text check (char_length(license_body) <= 120);
alter table public.supplier_offers add column if not exists license_no text check (char_length(license_no) <= 60);
alter table public.supplier_offers add column if not exists license_valid_until date;
alter table public.supplier_offers add column if not exists portfolio text check (char_length(portfolio) <= 1500);
alter table public.supplier_offers add column if not exists service_mode text;
alter table public.supplier_offers drop constraint if exists supplier_offers_service_mode_check;
alter table public.supplier_offers add constraint supplier_offers_service_mode_check check (service_mode in ('onsite', 'remote', 'both'));
alter table public.supplier_offers add column if not exists free_trial text;
alter table public.supplier_offers drop constraint if exists supplier_offers_free_trial_check;
alter table public.supplier_offers add constraint supplier_offers_free_trial_check check (free_trial in ('free_consultation', 'free_trial', 'both', 'none'));
alter table public.supplier_offers add column if not exists trial_terms text check (char_length(trial_terms) <= 500);
alter table public.supplier_offers add column if not exists availability text check (char_length(availability) <= 500);
alter table public.supplier_offers add column if not exists monthly_clients int check (monthly_clients between 1 and 100000);
alter table public.supplier_offers add column if not exists response_hours int check (response_hours between 1 and 720);
alter table public.supplier_offers add column if not exists service_levels text check (char_length(service_levels) <= 1000);
alter table public.supplier_offers add column if not exists correction_policy text check (char_length(correction_policy) <= 1000);
alter table public.supplier_offers add column if not exists refund_policy text check (char_length(refund_policy) <= 1000);
alter table public.supplier_offers add column if not exists confidentiality text check (char_length(confidentiality) <= 1000);
alter table public.supplier_offers add column if not exists handles_personal_data boolean;
-- For services, lead_time_days means "days from booking until the work starts" and valid_until "rates valid until".

-- Each kind keeps its own questions; a service offer never has a product group and a supplier offer never a service
-- category.
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
create index if not exists supplier_offers_kind on public.supplier_offers (kind, status, submitted_at desc);

-- "100% satisfaction guaranteed" and the like: the program uses objective scope-of-work standards instead.
create or replace function public.service_blanket_guarantee(t text) returns boolean language sql immutable as $$
  select coalesce(t, '') ~* '(100\s*(%|percent)|one hundred percent)\s*(customer\s*|client\s*)?satisf|satisfaction\s*(is\s*)?(guarantee|assured)|guarantee[ds]?\s*(your\s*|customer\s*|client\s*)?satisf|satisf\w*\s*or\s*(your\s*)?money\s*back'
$$;

-- ===========================================================================================================
-- B. Service packages (one row per package)
-- ===========================================================================================================
create table if not exists public.service_offer_packages (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.supplier_offers(id) on delete cascade,
  position int not null default 1 check (position between 1 and 100),
  name text not null check (char_length(name) between 1 and 150),
  description text check (char_length(description) <= 1000),
  scope text not null check (char_length(scope) between 10 and 2000),             -- what is included and delivered
  exclusions text check (char_length(exclusions) <= 1000),                        -- what is NOT included
  rate_basis text not null check (rate_basis in ('package', 'hour', 'day', 'month', 'unit')),
  unit_label text check (char_length(unit_label) <= 60),                          -- for 'unit': "per employee", "per 100 flyers"
  normal_rate numeric(12,2) check (normal_rate >= 0 and normal_rate <= 100000000),
  member_rate numeric(12,2) not null check (member_rate > 0 and member_rate <= 100000000),
  min_units int not null default 1 check (min_units between 1 and 100000),        -- e.g. at least 3 months, 4 hours
  duration_days int check (duration_days between 0 and 730),                      -- days to finish the package
  milestones jsonb not null default '[]'::jsonb check (jsonb_typeof(milestones) = 'array' and jsonb_array_length(milestones) <= 8 and pg_column_size(milestones) <= 4000),
  acceptance_criteria text not null check (char_length(acceptance_criteria) between 10 and 1500),   -- measurable: how the member checks it is done
  revisions_included int not null default 0 check (revisions_included between 0 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_offer_packages_member_rate check (normal_rate is null or member_rate <= normal_rate),
  constraint service_offer_packages_unit check (rate_basis <> 'unit' or unit_label is not null)
);
create index if not exists service_offer_packages_offer on public.service_offer_packages (offer_id, position);

-- ===========================================================================================================
-- C. Past clients the national team calls (verified customer feedback outside FLAME PH)
-- ===========================================================================================================
create table if not exists public.service_offer_references (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.supplier_offers(id) on delete cascade,
  position int not null default 1 check (position between 1 and 100),
  client_name text not null check (char_length(client_name) between 2 and 150),
  client_contact text not null check (char_length(client_contact) between 5 and 150),   -- phone or email; private
  work_done text not null check (char_length(work_done) between 5 and 500),
  completed_on date,
  client_consent boolean not null check (client_consent),                       -- the provider says the client agreed to be called
  verification text not null default 'pending' check (verification in ('pending', 'verified', 'not_verified')),
  client_rating smallint check (client_rating between 1 and 5),                  -- what the client said when called
  verification_note text check (char_length(verification_note) <= 1000),
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_offer_references_checked check (verification = 'pending' or (verified_at is not null and verification_note is not null)),
  constraint service_offer_references_pending check (verification <> 'pending' or (verified_by is null and verified_at is null and client_rating is null))
);
create index if not exists service_offer_references_offer on public.service_offer_references (offer_id, position);

-- ===========================================================================================================
-- D. Rules the database enforces, whoever writes
-- ===========================================================================================================
-- The offer guard from 0032, extended: the kind is fixed; each kind needs its own accreditation; sending a service
-- offer needs at least one package, a licence that has not expired (where one is needed) and no blanket guarantee.
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

-- Products (0032), extended: products belong to supplier offers only.
create or replace function public.supplier_offer_item_guard() returns trigger
language plpgsql as $$
declare st text; k text;
begin
  select o.status, o.kind into st, k from public.supplier_offers o where o.id = coalesce(new.offer_id, old.offer_id);
  if not found then return coalesce(new, old); end if;   -- the offer is being erased with its account
  if tg_op = 'UPDATE' and new.offer_id <> old.offer_id then raise exception 'supplier_offer_item: cannot move to another offer'; end if;
  if tg_op = 'INSERT' and k <> 'supplier' then raise exception 'supplier_offer_item: products belong to supplier offers; service offers have packages'; end if;
  if st not in ('draft', 'needs_changes') then raise exception 'supplier_offer_item: % offers cannot be edited', st; end if;
  if tg_op = 'INSERT' and (select count(*) from public.supplier_offer_items i where i.offer_id = new.offer_id) >= 30 then
    raise exception 'supplier_offer_item: limit of 30 products per offer';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  new.updated_at := now();
  return new;
end $$;

-- Packages change only while their service offer is a draft or sent back for changes (or when the offer is erased).
create or replace function public.service_offer_package_guard() returns trigger
language plpgsql as $$
declare st text; k text;
begin
  select o.status, o.kind into st, k from public.supplier_offers o where o.id = coalesce(new.offer_id, old.offer_id);
  if not found then return coalesce(new, old); end if;
  if tg_op = 'UPDATE' and new.offer_id <> old.offer_id then raise exception 'service_offer_package: cannot move to another offer'; end if;
  if k <> 'service' then raise exception 'service_offer_package: packages belong to service offers'; end if;
  if st not in ('draft', 'needs_changes') then raise exception 'service_offer_package: % offers cannot be edited', st; end if;
  if tg_op = 'INSERT' and (select count(*) from public.service_offer_packages p where p.offer_id = new.offer_id) >= 15 then
    raise exception 'service_offer_package: limit of 15 packages per offer';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists service_offer_packages_guard on public.service_offer_packages;
create trigger service_offer_packages_guard before insert or update or delete on public.service_offer_packages
  for each row execute function public.service_offer_package_guard();

-- References: the provider adds and changes them while the offer is editable (a change sends the reference back to
-- "pending"); only the national team records the result of the call, never about their own offer, after declaring no
-- conflict of interest.
create or replace function public.service_offer_reference_guard() returns trigger
language plpgsql as $$
declare o record; client_changed boolean; check_changed boolean;
begin
  select s.status, s.kind, s.user_id into o from public.supplier_offers s where s.id = coalesce(new.offer_id, old.offer_id);
  if not found then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then
    if o.status not in ('draft', 'needs_changes') then raise exception 'service_offer_reference: % offers cannot be edited', o.status; end if;
    return old;
  end if;
  new.updated_at := now();
  if o.kind <> 'service' then raise exception 'service_offer_reference: references belong to service offers'; end if;
  if tg_op = 'INSERT' then
    if o.status not in ('draft', 'needs_changes') then raise exception 'service_offer_reference: % offers cannot be edited', o.status; end if;
    if new.verification <> 'pending' or new.verified_by is not null then raise exception 'service_offer_reference: new references start as pending'; end if;
    if (select count(*) from public.service_offer_references r where r.offer_id = new.offer_id) >= 5 then
      raise exception 'service_offer_reference: limit of 5 references per offer';
    end if;
    return new;
  end if;
  if new.offer_id <> old.offer_id then raise exception 'service_offer_reference: cannot move to another offer'; end if;
  -- A reviewer's account being erased only empties verified_by.
  if new.verified_by is null and old.verified_by is not null
     and (to_jsonb(new) - array['verified_by', 'updated_at']) = (to_jsonb(old) - array['verified_by', 'updated_at']) then
    return new;
  end if;
  client_changed := (new.client_name, new.client_contact, new.work_done, new.completed_on, new.client_consent, new.position)
    is distinct from (old.client_name, old.client_contact, old.work_done, old.completed_on, old.client_consent, old.position);
  check_changed := (new.verification, new.client_rating, new.verification_note, new.verified_by, new.verified_at)
    is distinct from (old.verification, old.client_rating, old.verification_note, old.verified_by, old.verified_at);
  if client_changed then
    if o.status not in ('draft', 'needs_changes') then raise exception 'service_offer_reference: % offers cannot be edited', o.status; end if;
    -- New client details must be checked again.
    new.verification := 'pending'; new.client_rating := null; new.verification_note := null; new.verified_by := null; new.verified_at := null;
    return new;
  end if;
  if check_changed then
    if new.verification = 'pending' then raise exception 'service_offer_reference: a checked reference cannot go back to pending'; end if;
    if new.verified_by is null or new.verified_by = o.user_id
       or not exists (select 1 from public.roles x where x.user_id = new.verified_by and x.role in ('super_admin', 'admin', 'national_reviewer')) then
      raise exception 'service_offer_reference: only the national team checks references, never their own';
    end if;
    if not exists (select 1 from public.supplier_offer_conflicts c where c.offer_id = new.offer_id and c.reviewer_id = new.verified_by and not c.has_conflict) then
      raise exception 'service_offer_reference: declare no conflict of interest before checking references';
    end if;
    if o.status not in ('submitted', 'needs_changes', 'selected', 'not_selected') then
      raise exception 'service_offer_reference: references are checked after the offer is sent';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists service_offer_references_guard on public.service_offer_references;
create trigger service_offer_references_guard before insert or update or delete on public.service_offer_references
  for each row execute function public.service_offer_reference_guard();

-- ===========================================================================================================
-- E. Row level security: the provider sees their own; the national team sees all; nobody else sees anything.
--    No browser role can write: every write goes through the flameph.org server.
-- ===========================================================================================================
alter table public.service_offer_packages enable row level security;
alter table public.service_offer_references enable row level security;
revoke all on public.service_offer_packages from anon, authenticated;
revoke all on public.service_offer_references from anon, authenticated;
grant select on public.service_offer_packages, public.service_offer_references to authenticated;
drop policy if exists service_offer_packages_read on public.service_offer_packages;
create policy service_offer_packages_read on public.service_offer_packages for select to authenticated
  using (public.is_partner_reviewer() or exists (select 1 from public.supplier_offers o where o.id = offer_id and o.user_id = auth.uid()));
drop policy if exists service_offer_references_read on public.service_offer_references;
create policy service_offer_references_read on public.service_offer_references for select to authenticated
  using (public.is_partner_reviewer() or exists (select 1 from public.supplier_offers o where o.id = offer_id and o.user_id = auth.uid()));
revoke all on function public.service_blanket_guarantee(text) from public, anon;
grant execute on function public.service_blanket_guarantee(text) to authenticated, service_role;

-- ===========================================================================================================
-- F. Offer files: work samples (portfolio) and licence files join the 'offer' purpose. Other purposes unchanged
--    (as 0035 left them). Retention is unchanged: offer files go 1 year after an offer is not chosen or withdrawn.
-- ===========================================================================================================
alter table public.vetting_documents drop constraint if exists vetting_documents_doc_type_check;
alter table public.vetting_documents add constraint vetting_documents_doc_type_check
  check (doc_type in ('dti_sec', 'mayors_permit', 'bir', 'gov_id', 'fda', 'prc', 'certification', 'other', 'product_photo', 'price_list', 'spec_sheet',
    'sample_photo', 'evidence_photo', 'receipt', 'portfolio'));
alter table public.vetting_documents drop constraint if exists vetting_documents_partner_check;
alter table public.vetting_documents add constraint vetting_documents_partner_check
  check (purpose = 'vetting' and doc_type in ('dti_sec', 'mayors_permit', 'bir')
      or purpose = 'partner' and doc_type in ('dti_sec', 'mayors_permit', 'bir', 'gov_id', 'fda', 'prc', 'certification', 'other')
      or purpose = 'offer' and doc_type in ('product_photo', 'price_list', 'spec_sheet', 'certification', 'fda', 'other', 'portfolio', 'prc')
      or purpose = 'sample' and doc_type in ('sample_photo', 'other')
      or purpose = 'complaint' and doc_type in ('evidence_photo', 'receipt', 'other'));
