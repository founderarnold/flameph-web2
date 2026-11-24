-- Partner accreditation, Step 7: Toll Manufacturer / FLAME Signature. An accredited toll manufacturer sends a FLAME
-- Signature proposal: the products it would make under the FLAME Signature mark (with FDA product registration,
-- packaging, shelf life, batch size, MOQ and a per-unit toll price), its manufacturing sites (FDA License to Operate,
-- capacity), who owns the formula, how it tests, keeps batch records and traces lots, its recall plan, sample batches,
-- and acceptance of the FLAME Signature trademark licence terms. The national team reviews it like any Best Offer, but
-- a FLAME Signature proposal can be chosen only after a REGULATORY review and a LEGAL review both clear it.
--
-- After it is chosen, the national team approves individual products (SKUs) and issues a FLAME Signature licence that
-- names the approved products, the approved sites, the partner's MANUFACTURING territorial rights and the DISTRIBUTION
-- territorial rights where the products may be sold. Use of the mark is limited to those products and territories:
-- a production batch can be recorded only under an active licence, and released for sale only by the national team.
-- Batch records give traceability (lot, raw-material lots, dates, quality check, certificate of analysis) and recalls.
--
-- REUSE / EXTEND (nothing removed or renamed, no existing row changes):
--   supplier_offers            + kind 'manufacturer' and the manufacturer columns below. Commissions (0034, default
--                              toll manufacturer 8%), complaints and chapter trials (0035) already point at offers.
--   supplier_offer_history     reused as is (sends with frozen copies, decisions, notes)
--   supplier_offer_conflicts   reused as is (conflict-of-interest declarations, also for regulatory/legal reviews,
--                              product approval and licences)
--   supplier_offer_scores      reused as is; for FLAME Signature the five parts read: toll price and member value 30,
--                              product quality and sample batches 25, permits, regulatory and quality systems 20,
--                              commission and chapter benefits 15, capacity, lead time and supply 10. Pass mark 80.
--   territorial_appointments   (0033) already separates rights 'manufacturing' and 'distribution'; licences point at them
--   territory_area_covers()    (0033) reused to check that each site lies inside the manufacturing rights
--   partner_sample_tests       (0035) reused for chapter tests of sample batches; the pick list now shows FLAME Signature
--                              products (partner_sample_targets)
--   vetting_documents          purpose 'offer' also takes FDA product registration (CPR), lab reports and packaging
--                              artwork; new purpose 'batch' (certificate of analysis, lab report, photos) with batch_id
-- NEW:
--   signature_sites            manufacturing sites of a proposal (up to 5)
--   signature_products         product proposals (SKUs) of a proposal (up to 15), each approved or not by the team
--   signature_reviews          regulatory and legal reviews of each version (append-only)
--   signature_licences         the FLAME Signature trademark licence: approved SKUs, sites, manufacturing and
--                              distribution territories, dates
--   signature_batches          batch records: sample, pilot and production lots, quality check, release, hold, recall
--   signature_history          what happened to each licence and batch (append-only)
--   signature_mark_allowed()   may this product carry the mark in this area on this date?
--
-- Money: flameph.org never collects, holds, pays out or moves money. The toll price is a figure for comparison and
-- negotiation; the proposed commission is recorded only; MarketplacePH Online Store handles any actual money.
--
-- Who sees what: the manufacturer sees only their own proposals, sites, products, licences and batches (never the
-- team's reviews or notes); the national team (founder, admin, national reviewer) sees all; chapter coordinators,
-- testers, finance, other members and visitors see nothing here. No browser role can write: every write goes through
-- the flameph.org server.
--
-- Take a backup before applying. Safe to run twice. Undo: supabase/rollback/0037_signature_manufacturing_undo.sql.

-- ===========================================================================================================
-- A. Manufacturer columns on the shared offer table
-- ===========================================================================================================
alter table public.supplier_offers drop constraint if exists supplier_offers_kind_check;
alter table public.supplier_offers add constraint supplier_offers_kind_check check (kind in ('supplier', 'service', 'manufacturer'));

alter table public.supplier_offers add column if not exists signature_category text;
alter table public.supplier_offers drop constraint if exists supplier_offers_signature_category_check;
alter table public.supplier_offers add constraint supplier_offers_signature_category_check check (signature_category in ('sauces_condiments',
  'snacks_bakery', 'beverages', 'coffee_tea_cocoa', 'frozen_processed', 'food_supplements', 'skincare_cosmetics', 'soap_personal_care',
  'household_cleaning', 'agri_inputs', 'other'));
alter table public.supplier_offers add column if not exists formulation_ownership text;
alter table public.supplier_offers drop constraint if exists supplier_offers_formulation_ownership_check;
alter table public.supplier_offers add constraint supplier_offers_formulation_ownership_check
  check (formulation_ownership in ('flame', 'manufacturer', 'joint', 'licensed'));
alter table public.supplier_offers add column if not exists formulation_note text check (char_length(formulation_note) <= 1000);
alter table public.supplier_offers add column if not exists rnd_support boolean;
alter table public.supplier_offers add column if not exists qc_testing text check (char_length(qc_testing) <= 1500);
alter table public.supplier_offers add column if not exists lab_partner text check (char_length(lab_partner) <= 200);
alter table public.supplier_offers add column if not exists traceability text check (char_length(traceability) <= 1000);
alter table public.supplier_offers add column if not exists batch_record_years int check (batch_record_years between 1 and 20);
alter table public.supplier_offers add column if not exists recall_plan text check (char_length(recall_plan) <= 1500);
alter table public.supplier_offers add column if not exists recall_contact text check (char_length(recall_contact) <= 200);
alter table public.supplier_offers add column if not exists mock_recall_on date;
alter table public.supplier_offers add column if not exists packaging_supply text;
alter table public.supplier_offers drop constraint if exists supplier_offers_packaging_supply_check;
alter table public.supplier_offers add constraint supplier_offers_packaging_supply_check check (packaging_supply in ('manufacturer', 'flame', 'either'));
alter table public.supplier_offers add column if not exists ip_terms_version text check (char_length(ip_terms_version) <= 20);
alter table public.supplier_offers add column if not exists ip_terms_accepted_at timestamptz;
-- For FLAME Signature, lead_time_days means "days from purchase order to delivery of a production batch",
-- serviceable_areas "where finished goods are delivered", and sample_availability / sample_terms the sample batches.

-- Each kind keeps its own questions.
alter table public.supplier_offers drop constraint if exists supplier_offers_kind_fields;
alter table public.supplier_offers add constraint supplier_offers_kind_fields check (
  (kind = 'supplier' and service_category is null and signature_category is null)
  or (kind = 'service' and product_group is null and signature_category is null)
  or (kind = 'manufacturer' and product_group is null and service_category is null)
);
-- Nothing is sent or selected without the basics and the declaration. Supplier and service offers: exactly as 0036.
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
  or (kind = 'manufacturer' and title is not null and signature_category is not null and formulation_ownership is not null
      and rnd_support is not null and valid_until is not null and vat_basis is not null and serviceable_areas is not null
      and lead_time_days is not null and sample_availability is not null and qc_testing is not null and traceability is not null
      and batch_record_years is not null and recall_plan is not null and recall_contact is not null and packaging_supply is not null
      and ip_terms_version is not null and ip_terms_accepted_at is not null
      and commission_pct is not null and declaration_at is not null and submitted_at is not null)
);

-- Who may make which kind of offer.
create or replace function public.offer_kind_category(k text) returns text language sql immutable as $$
  select case k when 'service' then 'service_provider' when 'manufacturer' then 'toll_manufacturer' else 'supplier' end
$$;

-- ===========================================================================================================
-- B. Manufacturing sites (up to 5 per proposal). The city or municipality is a PSGC code; the trigger fills in the
--    province and region so the site can be checked against manufacturing rights.
-- ===========================================================================================================
create table if not exists public.signature_sites (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.supplier_offers(id) on delete cascade,
  position int not null default 1 check (position between 1 and 100),
  site_name text not null check (char_length(site_name) between 2 and 150),
  site_type text not null default 'own' check (site_type in ('own', 'contract')),   -- 'contract': another company's plant
  operator_name text check (char_length(operator_name) <= 150),                       -- needed for a contract plant
  address text not null check (char_length(address) between 5 and 300),
  city_code text not null references public.ph_cities(code),
  province_code text,
  region_code text,
  place_label text not null default '' check (char_length(place_label) <= 200),
  lto_no text check (char_length(lto_no) <= 60),                                     -- FDA License to Operate
  lto_valid_until date,
  certifications text check (char_length(certifications) <= 300),                    -- GMP, HACCP, Halal, ISO 22000
  monthly_capacity text not null check (char_length(monthly_capacity) between 2 and 200),
  production_lines text check (char_length(production_lines) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint signature_sites_operator check (site_type = 'own' or operator_name is not null),
  constraint signature_sites_lto check ((lto_no is null) = (lto_valid_until is null))
);
create index if not exists signature_sites_offer on public.signature_sites (offer_id, position);

-- ===========================================================================================================
-- C. Product proposals (SKUs), up to 15 per proposal. The national team approves each one for the mark.
-- ===========================================================================================================
create table if not exists public.signature_products (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.supplier_offers(id) on delete cascade,
  site_id uuid references public.signature_sites(id) on delete set null,
  position int not null default 1 check (position between 1 and 100),
  product_name text not null check (char_length(product_name) between 2 and 150),
  description text check (char_length(description) <= 1000),
  product_type text not null check (product_type in ('food', 'beverage', 'food_supplement', 'cosmetic', 'household_chemical', 'agri_input', 'other')),
  fda_needed boolean not null,
  cpr_status text not null check (cpr_status in ('registered', 'will_register', 'not_needed')),   -- FDA product registration
  cpr_no text check (char_length(cpr_no) <= 60),
  cpr_holder text check (cpr_holder in ('manufacturer', 'flame', 'to_agree')),
  net_content text not null check (char_length(net_content) between 1 and 60),                  -- "250 ml", "1 kg"
  packaging text not null check (char_length(packaging) between 3 and 500),                     -- primary and outer pack
  shelf_life_months int not null check (shelf_life_months between 1 and 120),
  storage text check (char_length(storage) <= 200),
  batch_size int not null check (batch_size between 1 and 10000000),                             -- units per batch
  moq int not null check (moq between 1 and 10000000),                                           -- smallest order, units
  toll_price numeric(12,2) not null check (toll_price > 0 and toll_price <= 10000000),           -- per unit
  price_includes text not null default 'formula_and_packaging' check (price_includes in ('formula_and_packaging', 'formula_only', 'labor_only')),
  suggested_srp numeric(12,2) check (suggested_srp > 0 and suggested_srp <= 10000000),
  lead_time_days int check (lead_time_days between 0 and 365),
  sample_qty int check (sample_qty between 1 and 100000),                                        -- units in a sample batch
  approval text not null default 'pending' check (approval in ('pending', 'approved', 'not_approved')),
  approval_note text check (char_length(approval_note) <= 1000),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint signature_products_cpr check (
    (not fda_needed and cpr_status = 'not_needed') or (fda_needed and cpr_status <> 'not_needed')),
  constraint signature_products_cpr_no check (cpr_status <> 'registered' or cpr_no is not null),
  constraint signature_products_moq check (moq <= batch_size * 100),
  constraint signature_products_decided check (approval = 'pending' or (approved_at is not null and approval_note is not null)),
  constraint signature_products_pending check (approval <> 'pending' or (approved_by is null and approved_at is null))
);
create index if not exists signature_products_offer on public.signature_products (offer_id, position);

-- ===========================================================================================================
-- D. Regulatory and legal reviews of a version (append-only). A review clears only with every check ticked.
-- ===========================================================================================================
create or replace function public.signature_review_items(t text) returns text[] language sql immutable as $$
  select case t
    when 'regulatory' then array['lto_valid', 'product_registration', 'labeling', 'gmp_haccp', 'testing', 'traceability', 'recall']
    when 'legal' then array['formula_ownership', 'ip_license', 'trademark_scope', 'confidentiality', 'liability', 'territory_rights']
  end
$$;

create table if not exists public.signature_reviews (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.supplier_offers(id) on delete cascade,
  revision int not null check (revision >= 1),
  review_type text not null check (review_type in ('regulatory', 'legal')),
  outcome text not null check (outcome in ('cleared', 'not_cleared')),
  checklist text[] not null default '{}' check (cardinality(checklist) <= 12),
  note text not null check (char_length(note) between 5 and 2000),
  reviewer_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint signature_reviews_items check (checklist <@ public.signature_review_items(review_type)),
  constraint signature_reviews_cleared check (outcome <> 'cleared' or checklist @> public.signature_review_items(review_type))
);
create index if not exists signature_reviews_offer on public.signature_reviews (offer_id, revision, review_type, created_at desc);

-- The latest regulatory and the latest legal review of this version both cleared it.
create or replace function public.signature_cleared(oid uuid, rev int, t text default null) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(bool_and(x.outcome = 'cleared'), false) and count(*) = case when t is null then 2 else 1 end
  from (
    select distinct on (r.review_type) r.review_type, r.outcome
    from public.signature_reviews r
    where r.offer_id = oid and r.revision = rev and (t is null or r.review_type = t)
    order by r.review_type, r.created_at desc, r.id desc
  ) x;
$$;
revoke all on function public.signature_cleared(uuid, int, text) from public, anon, authenticated;
grant execute on function public.signature_cleared(uuid, int, text) to service_role;

-- The reviewer belongs to the national team, is not the manufacturer and declared no conflict of interest.
create or replace function public.signature_reviewer_ok(oid uuid, uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select uid is not null
     and public.partner_is_national(uid)
     and not exists (select 1 from public.supplier_offers o where o.id = oid and o.user_id = uid)
     and exists (select 1 from public.supplier_offer_conflicts c where c.offer_id = oid and c.reviewer_id = uid and not c.has_conflict);
$$;
revoke all on function public.signature_reviewer_ok(uuid, uuid) from public, anon, authenticated;
grant execute on function public.signature_reviewer_ok(uuid, uuid) to service_role;

-- ===========================================================================================================
-- E. FLAME Signature licences and batch records
-- ===========================================================================================================
create sequence if not exists public.signature_licence_no;
create table if not exists public.signature_licences (
  id uuid primary key default gen_random_uuid(),
  ref_no text not null unique default ('SL-' || lpad(nextval('public.signature_licence_no')::text, 5, '0')),
  partner_user_id uuid references auth.users(id) on delete set null,
  partner_name text not null check (char_length(partner_name) between 1 and 200),   -- kept if the account is erased
  offer_id uuid references public.supplier_offers(id) on delete set null,
  product_ids uuid[] not null default '{}' check (cardinality(product_ids) <= 15),
  site_ids uuid[] not null default '{}' check (cardinality(site_ids) <= 5),
  mfg_appointment_ids uuid[] not null default '{}' check (cardinality(mfg_appointment_ids) <= 10),     -- manufacturing rights
  dist_appointment_ids uuid[] not null default '{}' check (cardinality(dist_appointment_ids) <= 30),   -- distribution rights
  start_date date,
  end_date date,
  terms_note text check (char_length(terms_note) <= 2000),          -- shown to the manufacturer
  internal_note text check (char_length(internal_note) <= 2000),    -- national team only
  status text not null default 'draft' check (status in ('draft', 'active', 'suspended', 'ended', 'cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz,
  status_reason text check (char_length(status_reason) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint signature_licences_dates check (start_date is null or end_date is null or (end_date > start_date and end_date <= start_date + 3653)),
  constraint signature_licences_complete check (status in ('draft', 'cancelled') or (start_date is not null and end_date is not null
    and cardinality(product_ids) >= 1 and cardinality(site_ids) >= 1 and cardinality(mfg_appointment_ids) >= 1 and approved_at is not null)),
  constraint signature_licences_reason check (status not in ('suspended', 'ended', 'cancelled') or status_reason is not null)
);
create index if not exists signature_licences_partner on public.signature_licences (partner_user_id, created_at desc);
create index if not exists signature_licences_offer on public.signature_licences (offer_id) where offer_id is not null;
create index if not exists signature_licences_products on public.signature_licences using gin (product_ids);

create sequence if not exists public.signature_batch_no;
create table if not exists public.signature_batches (
  id uuid primary key default gen_random_uuid(),
  ref_no text not null unique default ('B-' || lpad(nextval('public.signature_batch_no')::text, 5, '0')),
  partner_user_id uuid references auth.users(id) on delete set null,
  offer_id uuid references public.supplier_offers(id) on delete set null,
  product_id uuid references public.signature_products(id) on delete set null,
  site_id uuid references public.signature_sites(id) on delete set null,
  licence_id uuid references public.signature_licences(id) on delete set null,
  product_name text not null check (char_length(product_name) between 1 and 150),   -- kept if the product is erased
  batch_type text not null check (batch_type in ('sample', 'pilot', 'production')),
  lot_no text not null check (lot_no ~ '^[A-Za-z0-9][A-Za-z0-9 ._/-]{0,59}$'),
  produced_on date not null,
  expiry_on date not null,
  quantity int not null check (quantity between 1 and 100000000),
  unit text not null default 'pieces' check (char_length(unit) between 1 and 30),
  raw_material_lots text check (char_length(raw_material_lots) <= 1000),   -- traceability: lots of the ingredients and packaging
  qc_result text not null default 'pending' check (qc_result in ('pending', 'pass', 'fail')),   -- the manufacturer's own quality check
  qc_note text check (char_length(qc_note) <= 1000),
  status text not null default 'recorded' check (status in ('recorded', 'released', 'on_hold', 'rejected', 'recalled')),
  status_reason text check (char_length(status_reason) <= 1000),
  status_by uuid references auth.users(id) on delete set null,
  status_at timestamptz,
  recall_scope text check (recall_scope in ('consumer', 'retail', 'wholesale')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint signature_batches_dates check (expiry_on > produced_on),
  constraint signature_batches_qc check (qc_result <> 'fail' or qc_note is not null),
  constraint signature_batches_reason check (status not in ('on_hold', 'rejected', 'recalled') or status_reason is not null),
  constraint signature_batches_recall check ((status = 'recalled') = (recall_scope is not null)),
  constraint signature_batches_released check (status not in ('released', 'recalled') or batch_type = 'production')
);
create unique index if not exists signature_batches_lot on public.signature_batches (product_id, lower(lot_no)) where product_id is not null;
create index if not exists signature_batches_partner on public.signature_batches (partner_user_id, produced_on desc);
create index if not exists signature_batches_status on public.signature_batches (status, created_at desc);
create index if not exists signature_batches_licence on public.signature_batches (licence_id) where licence_id is not null;

create table if not exists public.signature_history (
  id uuid primary key default gen_random_uuid(),
  licence_id uuid references public.signature_licences(id) on delete cascade,
  batch_id uuid references public.signature_batches(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('created', 'changed', 'activated', 'suspended', 'reactivated', 'ended', 'cancelled', 'recorded',
    'released', 'on_hold', 'rejected', 'recalled', 'team_note')),
  note text check (char_length(note) <= 2000),
  internal boolean not null default false,
  created_at timestamptz not null default now(),
  constraint signature_history_target check ((licence_id is null) <> (batch_id is null))
);
create index if not exists signature_history_licence on public.signature_history (licence_id, created_at) where licence_id is not null;
create index if not exists signature_history_batch on public.signature_history (batch_id, created_at) where batch_id is not null;

-- ===========================================================================================================
-- F. Rules the database enforces, whoever writes
-- ===========================================================================================================
-- The offer guard from 0036, extended: manufacturer proposals need an accredited toll manufacturer; sending needs at least
-- one site and one product, a current FDA License to Operate at the site of every product that needs FDA, and the
-- trademark licence terms accepted; choosing needs the regulatory AND the legal review of this version cleared.
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
    elsif new.kind = 'manufacturer' then
      -- Only an accredited toll manufacturer can make FLAME Signature proposals.
      if not exists (select 1 from public.partner_profiles p where p.user_id = new.user_id and p.status = 'accredited' and 'toll_manufacturer' = any(p.categories)) then
        raise exception 'supplier_offer: only accredited toll manufacturers can make FLAME Signature proposals';
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
    elsif new.kind = 'manufacturer' then
      if not exists (select 1 from public.signature_sites s where s.offer_id = new.id) then
        raise exception 'supplier_offer: add at least one manufacturing site before sending';
      end if;
      if not exists (select 1 from public.signature_products p where p.offer_id = new.id) then
        raise exception 'supplier_offer: add at least one product before sending';
      end if;
      if exists (select 1 from public.signature_products p where p.offer_id = new.id and p.site_id is null) then
        raise exception 'supplier_offer: choose the manufacturing site of every product';
      end if;
      if exists (select 1 from public.signature_products p join public.signature_sites s on s.id = p.site_id
                 where p.offer_id = new.id and p.fda_needed and (s.lto_no is null or s.lto_valid_until < current_date)) then
        raise exception 'supplier_offer: a product that needs FDA is made at a site without a current FDA License to Operate';
      end if;
      if exists (select 1 from public.signature_sites s where s.offer_id = new.id and s.lto_valid_until < current_date) then
        raise exception 'supplier_offer: a site''s FDA License to Operate has expired';
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
    -- FLAME Signature: regulatory and legal review before approval.
    if new.kind = 'manufacturer' and not public.signature_cleared(new.id, new.revision) then
      raise exception 'supplier_offer: a FLAME Signature proposal needs the regulatory and the legal review of this version cleared';
    end if;
  end if;
  return new;
end $$;

-- Products of supplier offers (0036), unchanged in effect: they belong to supplier offers only.
-- (supplier_offer_item_guard already refuses any kind other than 'supplier'.)

-- When a chosen FLAME Signature proposal is opened for changes or withdrawn, its active licences are suspended at once.
create or replace function public.signature_offer_left_selected() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'manufacturer' and old.status = 'selected' and new.status <> 'selected' then
    perform set_config('flame.signature_system', 'on', true);
    update public.signature_licences set status = 'suspended', changed_at = now(), changed_by = null,
      status_reason = case when new.status = 'withdrawn' then 'The FLAME Signature proposal was withdrawn.' else 'The FLAME Signature proposal was opened for changes.' end
      where offer_id = new.id and status = 'active';
    insert into public.signature_history (licence_id, action, note)
      select l.id, 'suspended', l.status_reason from public.signature_licences l where l.offer_id = new.id and l.status = 'suspended' and l.changed_at = now() and l.changed_by is null;
    perform set_config('flame.signature_system', 'off', true);
  end if;
  return new;
end $$;
drop trigger if exists supplier_offers_signature_left on public.supplier_offers;
create trigger supplier_offers_signature_left after update of status on public.supplier_offers
  for each row execute function public.signature_offer_left_selected();

-- Sites: change only while the proposal is a draft or sent back; the place is filled in from the PSGC city code.
create or replace function public.signature_site_guard() returns trigger
language plpgsql as $$
declare st text; k text; c record;
begin
  select o.status, o.kind into st, k from public.supplier_offers o where o.id = coalesce(new.offer_id, old.offer_id);
  if not found then return coalesce(new, old); end if;   -- the offer is being erased with its account
  if tg_op = 'UPDATE' and new.offer_id <> old.offer_id then raise exception 'signature_site: cannot move to another offer'; end if;
  if k <> 'manufacturer' then raise exception 'signature_site: sites belong to FLAME Signature proposals'; end if;
  if st not in ('draft', 'needs_changes') then raise exception 'signature_site: % offers cannot be edited', st; end if;
  if tg_op = 'DELETE' then return old; end if;
  if tg_op = 'INSERT' and (select count(*) from public.signature_sites s where s.offer_id = new.offer_id) >= 5 then
    raise exception 'signature_site: limit of 5 sites per proposal';
  end if;
  select x.code, x.name, x.province, x.province_code, x.region_code into c from public.ph_cities x where x.code = new.city_code;
  if not found then raise exception 'signature_site: % is not a city or municipality code', new.city_code; end if;
  new.province_code := c.province_code; new.region_code := c.region_code;
  new.place_label := c.name || coalesce(', ' || c.province, '');
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists signature_sites_guard on public.signature_sites;
create trigger signature_sites_guard before insert or update or delete on public.signature_sites
  for each row execute function public.signature_site_guard();

-- Products: the manufacturer adds and changes them while the proposal is editable (a change sends the approval back to
-- "pending"); only the national team approves a product for the mark, never their own, after declaring no conflict, with
-- the regulatory review of this version cleared, while the proposal is under review or chosen.
create or replace function public.signature_product_guard() returns trigger
language plpgsql as $$
declare o record; details_changed boolean; approval_changed boolean;
begin
  select s.status, s.kind, s.user_id, s.revision into o from public.supplier_offers s where s.id = coalesce(new.offer_id, old.offer_id);
  if not found then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then
    if o.status not in ('draft', 'needs_changes') then raise exception 'signature_product: % offers cannot be edited', o.status; end if;
    return old;
  end if;
  new.updated_at := now();
  if o.kind <> 'manufacturer' then raise exception 'signature_product: products belong to FLAME Signature proposals'; end if;
  if new.site_id is not null and not exists (select 1 from public.signature_sites s where s.id = new.site_id and s.offer_id = new.offer_id) then
    raise exception 'signature_product: the site must be one of this proposal''s sites';
  end if;
  if tg_op = 'INSERT' then
    if o.status not in ('draft', 'needs_changes') then raise exception 'signature_product: % offers cannot be edited', o.status; end if;
    if new.approval <> 'pending' or new.approved_by is not null then raise exception 'signature_product: new products start as pending'; end if;
    if (select count(*) from public.signature_products p where p.offer_id = new.offer_id) >= 15 then
      raise exception 'signature_product: limit of 15 products per proposal';
    end if;
    return new;
  end if;
  if new.offer_id <> old.offer_id then raise exception 'signature_product: cannot move to another offer'; end if;
  -- A site being removed or an account being erased only empties site_id or approved_by.
  if public.partner_only_nulled(to_jsonb(new), to_jsonb(old), array['site_id', 'approved_by']) then return new; end if;
  approval_changed := (new.approval, new.approval_note, new.approved_by, new.approved_at) is distinct from (old.approval, old.approval_note, old.approved_by, old.approved_at);
  details_changed := (to_jsonb(new) - array['approval', 'approval_note', 'approved_by', 'approved_at', 'updated_at'])
    is distinct from (to_jsonb(old) - array['approval', 'approval_note', 'approved_by', 'approved_at', 'updated_at']);
  if details_changed then
    if o.status not in ('draft', 'needs_changes') then raise exception 'signature_product: % offers cannot be edited', o.status; end if;
    if approval_changed and new.approval <> 'pending' then raise exception 'signature_product: the manufacturer cannot approve products'; end if;
    -- Changed details must be approved again.
    new.approval := 'pending'; new.approval_note := null; new.approved_by := null; new.approved_at := null;
    return new;
  end if;
  if approval_changed then
    if new.approval = 'pending' then raise exception 'signature_product: an approval cannot go back to pending'; end if;
    if not public.signature_reviewer_ok(new.offer_id, new.approved_by) then
      raise exception 'signature_product: only the national team approves products, never their own, after declaring no conflict';
    end if;
    if o.status not in ('submitted', 'selected') then raise exception 'signature_product: products are approved while the proposal is under review or chosen'; end if;
    if new.approval = 'approved' and not public.signature_cleared(new.offer_id, o.revision, 'regulatory') then
      raise exception 'signature_product: the regulatory review of this version must clear the proposal before a product is approved';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists signature_products_guard on public.signature_products;
create trigger signature_products_guard before insert or update or delete on public.signature_products
  for each row execute function public.signature_product_guard();

-- Reviews: append-only; only for the version under review; reviewer from the national team with no conflict.
create or replace function public.signature_review_guard() returns trigger
language plpgsql as $$
declare o record;
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.supplier_offers s where s.id = old.offer_id) then return old; end if;
    raise exception 'signature_review: reviews cannot be deleted';
  end if;
  if tg_op = 'UPDATE' then
    if public.partner_only_nulled(to_jsonb(new), to_jsonb(old), array['reviewer_id']) then return new; end if;
    raise exception 'signature_review: reviews cannot be changed; add a new review instead';
  end if;
  select s.status, s.kind, s.revision into o from public.supplier_offers s where s.id = new.offer_id;
  if o.kind <> 'manufacturer' then raise exception 'signature_review: reviews are for FLAME Signature proposals'; end if;
  if o.status <> 'submitted' then raise exception 'signature_review: a proposal is reviewed while it waits for review'; end if;
  if new.revision <> o.revision then raise exception 'signature_review: review the current version'; end if;
  if not public.signature_reviewer_ok(new.offer_id, new.reviewer_id) then
    raise exception 'signature_review: only the national team reviews, never their own proposal, after declaring no conflict';
  end if;
  new.created_at := now();
  return new;
end $$;
drop trigger if exists signature_reviews_guard on public.signature_reviews;
create trigger signature_reviews_guard before insert or update or delete on public.signature_reviews
  for each row execute function public.signature_review_guard();

-- Everything a licence needs to be active, checked when it is activated or reactivated and when a batch is recorded or
-- released. Returns null when fine, or the reason in plain words.
create or replace function public.signature_licence_problem(l public.signature_licences) returns text
language plpgsql stable security definer set search_path = public as $$
declare o record; n int; bad_site text;
begin
  select s.id, s.status, s.kind, s.user_id, s.revision into o from public.supplier_offers s where s.id = l.offer_id;
  if not found or o.kind <> 'manufacturer' then return 'the licence must point at a FLAME Signature proposal'; end if;
  if o.user_id is distinct from l.partner_user_id then return 'the licence partner must be the manufacturer of the proposal'; end if;
  if o.status <> 'selected' then return 'the FLAME Signature proposal must be chosen (selected)'; end if;
  if not public.signature_cleared(o.id, o.revision) then return 'the regulatory and legal reviews of the chosen version must be cleared'; end if;
  if not exists (select 1 from public.partner_profiles p where p.user_id = l.partner_user_id and p.status = 'accredited' and 'toll_manufacturer' = any(p.categories)) then
    return 'the manufacturer must be an accredited toll manufacturer';
  end if;
  if exists (select 1 from public.partner_sanctions x where x.partner_user_id = l.partner_user_id and x.status = 'active' and x.level in ('hold', 'termination')) then
    return 'the manufacturer is on hold or terminated';
  end if;
  select count(*) into n from public.signature_products p where p.id = any(l.product_ids) and p.offer_id = o.id and p.approval = 'approved';
  if n <> cardinality(l.product_ids) or n = 0 then return 'every product must be an approved product of this proposal'; end if;
  select count(*) into n from public.signature_sites s where s.id = any(l.site_ids) and s.offer_id = o.id;
  if n <> cardinality(l.site_ids) or n = 0 then return 'every site must be a site of this proposal'; end if;
  if exists (select 1 from public.signature_products p where p.id = any(l.product_ids) and not (p.site_id = any(l.site_ids))) then
    return 'the site of every licensed product must be one of the licensed sites';
  end if;
  if exists (select 1 from public.signature_sites s join public.signature_products p on p.site_id = s.id
             where p.id = any(l.product_ids) and p.fda_needed and (s.lto_no is null or s.lto_valid_until < current_date)) then
    return 'a site making a product that needs FDA has no current FDA License to Operate';
  end if;
  select count(*) into n from public.territorial_appointments a
    where a.id = any(l.mfg_appointment_ids) and a.partner_user_id = l.partner_user_id and a.rights = 'manufacturing' and a.status = 'active'
      and a.start_date <= l.start_date and a.end_date >= l.end_date;
  if n <> cardinality(l.mfg_appointment_ids) or n = 0 then
    return 'each manufacturing right must be an active manufacturing appointment of this manufacturer that covers the licence dates';
  end if;
  select string_agg(s.site_name, ', ') into bad_site from public.signature_sites s
    where s.id = any(l.site_ids) and not exists (
      select 1 from public.territory_areas t where t.appointment_id = any(l.mfg_appointment_ids)
        and public.territory_area_covers(t.region_code, t.province_code, t.city_code, s.region_code, s.province_code, s.city_code));
  if bad_site is not null then return 'these sites are outside the manufacturing rights: ' || bad_site; end if;
  select count(*) into n from public.territorial_appointments a
    where a.id = any(l.dist_appointment_ids) and a.rights = 'distribution' and a.status = 'active';
  if n <> cardinality(l.dist_appointment_ids) then return 'each distribution right must be an active distribution appointment'; end if;
  return null;
end $$;
revoke all on function public.signature_licence_problem(public.signature_licences) from public, anon, authenticated;
grant execute on function public.signature_licence_problem(public.signature_licences) to service_role;

create or replace function public.signature_licence_guard() returns trigger
language plpgsql as $$
declare problem text; sys boolean := coalesce(current_setting('flame.signature_system', true), 'off') = 'on';
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then raise exception 'signature_licence: new licences start as draft'; end if;
    if new.created_by is null or not public.partner_is_national(new.created_by) then raise exception 'signature_licence: only the national team writes licences'; end if;
    if new.created_by = new.partner_user_id then raise exception 'signature_licence: nobody licenses themselves'; end if;
    new.approved_by := null; new.approved_at := null;
    return new;
  end if;
  -- An account being erased only empties a person.
  if public.partner_only_nulled(to_jsonb(new), to_jsonb(old), array['partner_user_id', 'offer_id', 'created_by', 'approved_by', 'changed_by']) then return new; end if;
  if new.ref_no <> old.ref_no or new.created_by is distinct from old.created_by or new.created_at <> old.created_at then
    raise exception 'signature_licence: the reference and author are fixed';
  end if;
  if new.status = old.status then
    if old.status <> 'draft' and (to_jsonb(new) - array['updated_at', 'internal_note']) is distinct from (to_jsonb(old) - array['updated_at', 'internal_note']) then
      raise exception 'signature_licence: only a draft licence can be changed';
    end if;
    return new;
  end if;
  if not ((old.status, new.status) in (('draft', 'active'), ('draft', 'cancelled'), ('active', 'suspended'), ('active', 'ended'),
      ('suspended', 'active'), ('suspended', 'ended'))) then
    raise exception 'signature_licence: cannot move from % to %', old.status, new.status;
  end if;
  if old.status <> 'draft' and (to_jsonb(new) - array['updated_at', 'internal_note', 'status', 'status_reason', 'changed_by', 'changed_at', 'approved_by', 'approved_at'])
       is distinct from (to_jsonb(old) - array['updated_at', 'internal_note', 'status', 'status_reason', 'changed_by', 'changed_at', 'approved_by', 'approved_at']) then
    raise exception 'signature_licence: only a draft licence can be changed';
  end if;
  if sys and new.status = 'suspended' then return new; end if;   -- the proposal left "selected" (trigger above)
  if new.status = 'active' then
    -- Only the national team, never the manufacturer, with a no-conflict declaration on the proposal; everything checked.
    if not public.signature_reviewer_ok(new.offer_id, new.approved_by) then
      raise exception 'signature_licence: only the national team activates a licence, never their own, after declaring no conflict';
    end if;
    if new.start_date is null or new.end_date is null or new.end_date < current_date then raise exception 'signature_licence: the dates are missing or already over'; end if;
    problem := public.signature_licence_problem(new);
    if problem is not null then raise exception 'signature_licence: %', problem; end if;
    new.approved_at := now(); new.changed_by := new.approved_by; new.changed_at := now();
    if old.status = 'draft' then new.status_reason := null; end if;
  else
    if new.changed_by is null or not public.partner_is_national(new.changed_by) or new.changed_by = new.partner_user_id then
      raise exception 'signature_licence: only the national team suspends, ends or cancels a licence';
    end if;
    if new.status_reason is null then raise exception 'signature_licence: give the reason'; end if;
    new.changed_at := now();
  end if;
  return new;
end $$;
drop trigger if exists signature_licences_guard on public.signature_licences;
create trigger signature_licences_guard before insert or update on public.signature_licences
  for each row execute function public.signature_licence_guard();

-- The active licence that lets this product be made at this site on this date (null when there is none).
create or replace function public.signature_licence_for(prod uuid, site uuid, d date) returns uuid
language sql stable security definer set search_path = public as $$
  select l.id from public.signature_licences l
  where l.status = 'active' and prod = any(l.product_ids) and site = any(l.site_ids) and d between l.start_date and l.end_date
    and public.signature_licence_problem(l) is null
  order by l.approved_at desc limit 1;
$$;
revoke all on function public.signature_licence_for(uuid, uuid, date) from public, anon, authenticated;
grant execute on function public.signature_licence_for(uuid, uuid, date) to service_role;

-- Batches. The manufacturer records them (sample and pilot batches for testing; production batches only under an active
-- licence for that product, site and date) and may change or delete one while it is only "recorded". Only the national
-- team releases a production batch for sale under the mark (own quality check passed, licence still valid), puts a
-- batch on hold, rejects it or recalls it, always with a reason.
create or replace function public.signature_batch_guard() returns trigger
language plpgsql as $$
declare p record; nat boolean;
begin
  if tg_op = 'DELETE' then
    if old.status <> 'recorded' and exists (select 1 from public.supplier_offers o where o.id = old.offer_id) then
      raise exception 'signature_batch: only a batch that is still "recorded" can be deleted';
    end if;
    return old;
  end if;
  new.updated_at := now();
  if tg_op = 'UPDATE' and public.partner_only_nulled(to_jsonb(new), to_jsonb(old), array['partner_user_id', 'offer_id', 'product_id', 'site_id', 'licence_id', 'status_by']) then
    return new;
  end if;
  if tg_op = 'UPDATE' and (new.ref_no <> old.ref_no or new.partner_user_id is distinct from old.partner_user_id or new.created_at <> old.created_at) then
    raise exception 'signature_batch: the reference and manufacturer are fixed';
  end if;
  if tg_op = 'INSERT' or (to_jsonb(new) - array['status', 'status_reason', 'status_by', 'status_at', 'recall_scope', 'updated_at', 'licence_id'])
       is distinct from (to_jsonb(old) - array['status', 'status_reason', 'status_by', 'status_at', 'recall_scope', 'updated_at', 'licence_id']) then
    -- The manufacturer's details of the batch.
    if tg_op = 'UPDATE' and (old.status <> 'recorded' or new.status <> 'recorded') then
      raise exception 'signature_batch: only a batch that is still "recorded" can be changed';
    end if;
    if tg_op = 'INSERT' and (new.status <> 'recorded' or new.status_by is not null) then raise exception 'signature_batch: new batches start as recorded'; end if;
    select sp.id, sp.product_name, sp.shelf_life_months, sp.site_id, o.id offer_id, o.user_id, o.kind, o.status offer_status
      into p from public.signature_products sp join public.supplier_offers o on o.id = sp.offer_id where sp.id = new.product_id;
    if not found or p.kind <> 'manufacturer' then raise exception 'signature_batch: choose a product of a FLAME Signature proposal'; end if;
    if p.user_id is distinct from new.partner_user_id then raise exception 'signature_batch: a manufacturer records batches of their own products only'; end if;
    if new.offer_id is distinct from p.offer_id then raise exception 'signature_batch: the batch belongs to the product''s proposal'; end if;
    if not exists (select 1 from public.signature_sites s where s.id = new.site_id and s.offer_id = p.offer_id) then
      raise exception 'signature_batch: the site must be one of this proposal''s sites';
    end if;
    if p.offer_status = 'withdrawn' then raise exception 'signature_batch: the proposal was withdrawn'; end if;
    if (select count(*) from public.signature_batches b where b.partner_user_id = new.partner_user_id and b.created_at > now() - interval '1 day') >= 50 and tg_op = 'INSERT' then
      raise exception 'signature_batch: limit of 50 new batches a day';
    end if;
    if new.produced_on > current_date or new.produced_on < current_date - 1095 then raise exception 'signature_batch: the production date must be within the last 3 years and not in the future'; end if;
    if new.expiry_on > (new.produced_on + make_interval(months => p.shelf_life_months))::date then
      raise exception 'signature_batch: the expiry date is beyond the product''s shelf life of % months', p.shelf_life_months;
    end if;
    new.product_name := p.product_name;
    if new.batch_type = 'production' then
      new.licence_id := public.signature_licence_for(new.product_id, new.site_id, new.produced_on);
      if new.licence_id is null then
        raise exception 'signature_batch: a production batch under the FLAME Signature mark needs an active licence for this product, site and date';
      end if;
    else
      new.licence_id := null;
    end if;
    return new;
  end if;
  -- A status change by the national team.
  if new.status = old.status then return new; end if;
  nat := new.status_by is not null and public.partner_is_national(new.status_by) and new.status_by is distinct from new.partner_user_id;
  if not nat then raise exception 'signature_batch: only the national team releases, holds, rejects or recalls a batch, never their own'; end if;
  if not ((old.status, new.status) in (('recorded', 'released'), ('recorded', 'on_hold'), ('recorded', 'rejected'),
      ('on_hold', 'released'), ('on_hold', 'rejected'), ('released', 'on_hold'), ('released', 'recalled'), ('on_hold', 'recalled'))) then
    raise exception 'signature_batch: cannot move from % to %', old.status, new.status;
  end if;
  if new.status = 'released' then
    if new.batch_type <> 'production' then raise exception 'signature_batch: only production batches are released for sale'; end if;
    if new.qc_result <> 'pass' then raise exception 'signature_batch: the quality check must pass before release'; end if;
    if new.expiry_on <= current_date then raise exception 'signature_batch: the batch has expired'; end if;
    if public.signature_licence_for(new.product_id, new.site_id, new.produced_on) is null then
      raise exception 'signature_batch: there is no active licence for this product, site and date';
    end if;
  end if;
  if new.status = 'recalled' and old.status = 'on_hold' and not exists (
       select 1 from public.signature_history h where h.batch_id = new.id and h.action = 'released') then
    raise exception 'signature_batch: a batch that was never released is rejected, not recalled';
  end if;
  new.status_at := now();
  return new;
end $$;
drop trigger if exists signature_batches_guard on public.signature_batches;
create trigger signature_batches_guard before insert or update or delete on public.signature_batches
  for each row execute function public.signature_batch_guard();

-- History is append-only (an account being erased only empties the actor).
create or replace function public.signature_history_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if (old.licence_id is not null and not exists (select 1 from public.signature_licences l where l.id = old.licence_id))
       or (old.batch_id is not null and not exists (select 1 from public.signature_batches b where b.id = old.batch_id)) then
      return old;
    end if;
    raise exception 'signature_history: history cannot be deleted';
  end if;
  if public.partner_only_nulled(to_jsonb(new), to_jsonb(old), array['actor_id']) then return new; end if;
  raise exception 'signature_history: history cannot be changed';
end $$;
drop trigger if exists signature_history_guard on public.signature_history;
create trigger signature_history_guard before update or delete on public.signature_history
  for each row execute function public.signature_history_guard();

-- May this product carry the FLAME Signature mark in this area (a PSGC region, province or city code; null = anywhere
-- it is licensed) on this date? Needs an active, still-valid licence for an approved product, and the area inside one
-- of the licence's active DISTRIBUTION rights.
create or replace function public.signature_mark_allowed(prod uuid, area text default null, d date default current_date) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare r text; p text; c text;
begin
  if area is not null then
    select x.region_code, x.province_code, x.code into r, p, c from public.ph_cities x where x.code = area;
    if not found then
      select x.region_code, x.psgc_code into r, p from public.ph_provinces x where x.psgc_code = area;
      if not found then
        select x.code into r from public.ph_regions x where x.code = area;
        if not found then return false; end if;
      end if;
    end if;
  end if;
  return exists (
    select 1 from public.signature_licences l
    join public.signature_products sp on sp.id = prod and sp.approval = 'approved'
    where l.status = 'active' and prod = any(l.product_ids) and d between l.start_date and l.end_date
      and public.signature_licence_problem(l) is null
      and (area is null or exists (
        select 1 from public.territorial_appointments a join public.territory_areas t on t.appointment_id = a.id
        where a.id = any(l.dist_appointment_ids) and a.rights = 'distribution' and a.status = 'active' and d between a.start_date and a.end_date
          and public.territory_area_covers(t.region_code, t.province_code, t.city_code, r, p, c))));
end $$;
revoke all on function public.signature_mark_allowed(uuid, text, date) from public, anon;
grant execute on function public.signature_mark_allowed(uuid, text, date) to authenticated, service_role;

-- ===========================================================================================================
-- G. Row level security: the manufacturer sees their own; the national team sees all; nobody else sees anything.
--    No browser role can write: every write goes through the flameph.org server.
-- ===========================================================================================================
create or replace function public.signature_offer_mine(oid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.supplier_offers o where o.id = oid and o.user_id = auth.uid());
$$;
revoke all on function public.signature_offer_mine(uuid) from public, anon;
grant execute on function public.signature_offer_mine(uuid) to authenticated, service_role;

alter table public.signature_sites enable row level security;
alter table public.signature_products enable row level security;
alter table public.signature_reviews enable row level security;
alter table public.signature_licences enable row level security;
alter table public.signature_batches enable row level security;
alter table public.signature_history enable row level security;
revoke all on public.signature_sites, public.signature_products, public.signature_reviews, public.signature_licences,
  public.signature_batches, public.signature_history from anon, authenticated;
grant select on public.signature_sites, public.signature_products, public.signature_batches to authenticated;
grant select on public.signature_reviews to authenticated;
-- Every licence column except the team-only note.
grant select (id, ref_no, partner_user_id, partner_name, offer_id, product_ids, site_ids, mfg_appointment_ids, dist_appointment_ids, start_date,
  end_date, terms_note, status, approved_at, changed_at, status_reason, created_at, updated_at) on public.signature_licences to authenticated;
grant select (id, licence_id, batch_id, action, note, internal, created_at) on public.signature_history to authenticated;

drop policy if exists signature_sites_read on public.signature_sites;
create policy signature_sites_read on public.signature_sites for select to authenticated
  using (public.is_partner_reviewer() or public.signature_offer_mine(offer_id));
drop policy if exists signature_products_read on public.signature_products;
create policy signature_products_read on public.signature_products for select to authenticated
  using (public.is_partner_reviewer() or public.signature_offer_mine(offer_id));
drop policy if exists signature_reviews_read on public.signature_reviews;
create policy signature_reviews_read on public.signature_reviews for select to authenticated
  using (public.is_partner_reviewer());
drop policy if exists signature_licences_read on public.signature_licences;
create policy signature_licences_read on public.signature_licences for select to authenticated
  using (public.is_partner_reviewer() or (partner_user_id = auth.uid() and status in ('active', 'suspended', 'ended')));
drop policy if exists signature_batches_read on public.signature_batches;
create policy signature_batches_read on public.signature_batches for select to authenticated
  using (public.is_partner_reviewer() or partner_user_id = auth.uid());
drop policy if exists signature_history_read on public.signature_history;
create policy signature_history_read on public.signature_history for select to authenticated
  using (public.is_partner_reviewer() or (not internal and (
    exists (select 1 from public.signature_licences l where l.id = licence_id and l.partner_user_id = auth.uid() and l.status in ('active', 'suspended', 'ended'))
    or exists (select 1 from public.signature_batches b where b.id = batch_id and b.partner_user_id = auth.uid()))));

-- ===========================================================================================================
-- H. Files: FLAME Signature proposal files (FDA product registration, lab reports, packaging artwork) join purpose
--    'offer'; batch files (certificate of analysis, lab report, photos) are a new purpose 'batch'. Kept 3 years after
--    the batch's expiry date (or deleted at once when the batch is gone). A lawyer may set a longer period.
-- ===========================================================================================================
alter table public.vetting_documents add column if not exists batch_id uuid references public.signature_batches(id) on delete set null;
create index if not exists vetting_documents_batch on public.vetting_documents (batch_id) where batch_id is not null;
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
grant select (batch_id) on public.vetting_documents to authenticated;
drop policy if exists vetting_documents_batch_read on public.vetting_documents;
create policy vetting_documents_batch_read on public.vetting_documents for select to authenticated
  using (purpose = 'batch' and public.is_partner_reviewer());

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

-- ===========================================================================================================
-- I. Chapter tests of sample batches: the testers' pick list (0035) also lists FLAME Signature products, still without
--    any price.
-- ===========================================================================================================
create or replace function public.partner_sample_targets()
returns table (partner_user_id uuid, partner_name text, categories text[], offer_id uuid, offer_title text, item_id uuid, product_name text, sell_unit text)
language sql stable security definer set search_path = public as $$
  select * from (
    select p.user_id, p.legal_name, p.categories, o.id, o.title, i.id, i.product_name, i.sell_unit
    from public.partner_profiles p
    left join public.supplier_offers o on o.user_id = p.user_id and o.status in ('submitted', 'selected') and o.kind <> 'manufacturer'
    left join public.supplier_offer_items i on i.offer_id = o.id
    where public.can_test_samples() and p.status = 'accredited' and p.user_id <> auth.uid()
    union all
    select p.user_id, p.legal_name, p.categories, o.id, o.title, null::uuid, sp.product_name, sp.net_content
    from public.partner_profiles p
    join public.supplier_offers o on o.user_id = p.user_id and o.status in ('submitted', 'selected') and o.kind = 'manufacturer'
    join public.signature_products sp on sp.offer_id = o.id
    where public.can_test_samples() and p.status = 'accredited' and p.user_id <> auth.uid()
  ) t
  order by 2, 5, 7
  limit 2000;
$$;
revoke all on function public.partner_sample_targets() from public, anon;
grant execute on function public.partner_sample_targets() to authenticated, service_role;

revoke all on function public.offer_kind_category(text) from public, anon;
grant execute on function public.offer_kind_category(text) to authenticated, service_role;
revoke all on function public.signature_review_items(text) from public, anon;
grant execute on function public.signature_review_items(text) to authenticated, service_role;
