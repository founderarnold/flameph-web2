-- Partner accreditation, Step 2: Supplier Best Offer. An accredited supplier sends a Best Offer (one or many products,
-- prices for members, minimum orders, delivery areas, samples, after-sales terms and a PROPOSED commission). The
-- national team compares offers side by side, scores them (30/25/20/15/10), and only it selects a Best Offer.
-- Additive: five new tables, six new functions, two widened rules on vetting_documents (purpose, document types), two
-- new columns there, and the document clean-up function extended for offer files. Nothing is removed or renamed and no
-- existing row changes. Take a backup before applying. Safe to run twice.
-- Undo: supabase/rollback/0032_supplier_offers_undo.sql (removes only what this file added).
--
--   supplier_offers           one offer (a product group) by an accredited supplier; draft -> sent -> selected or not
--   supplier_offer_items      one row per product (SKU): units, prices, quantity tiers, MOQ, capacity, stock, delivery cost
--   supplier_offer_history    sends (with a frozen copy = the version), decisions and notes; nobody can change it
--   supplier_offer_conflicts  each reviewer's conflict-of-interest declaration for an offer; a conflict means no score, no vote
--   supplier_offer_scores     each reviewer's score for one version: 30 price/member value, 25 quality/samples,
--                             20 compliance/reliability, 15 commission/chapter benefits, 10 logistics/support, and the
--                             compliance gate (pass or fail)
--   vetting_documents         + purpose 'offer' (product photos, price lists, spec sheets, certificates), offer_id, item_id
--
-- Money: flameph.org never collects, holds, pays out or moves money. The proposed commission is a figure recorded for
-- negotiation only; MarketplacePH Online Store handles any actual money. Nothing here is a payment, invoice or contract.
--
-- Who sees what (row level security, and the same checks on the server, which is the only writer):
--   supplier                  only their own offers, products, files list and the non-internal history; never scores
--   founder, admin, national reviewer   every offer, file, score and declaration; only they score and select
--   chapter coordinator, chapter tester, finance, other members, visitors   nothing (commercial offers are private)

-- ===========================================================================================================
-- A. Offers
-- ===========================================================================================================
create table if not exists public.supplier_offers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid references public.partner_applications(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'needs_changes', 'selected', 'not_selected', 'withdrawn')),
  revision int not null default 0 check (revision between 0 and 200),   -- version number: how many times it was sent
  title text check (char_length(title) <= 150),
  product_group text check (product_group in ('packaging', 'food_ingredients', 'beverages', 'personal_care', 'household_cleaning',
    'office_school', 'equipment_tools', 'agri_inputs', 'construction_hardware', 'garments_textiles', 'electronics_gadgets', 'other')),
  valid_until date,
  vat_basis text check (vat_basis in ('vat_inclusive', 'vat_exclusive', 'non_vat')),
  serviceable_areas text check (char_length(serviceable_areas) <= 1000),
  shipping_terms text check (shipping_terms in ('free_delivery', 'delivery_fee', 'courier_buyer_pays', 'pickup_only')),
  shipping_note text check (char_length(shipping_note) <= 500),
  lead_time_days int check (lead_time_days between 0 and 365),
  warranty text check (char_length(warranty) <= 500),
  returns_policy text check (char_length(returns_policy) <= 800),
  sample_availability text check (sample_availability in ('free', 'paid', 'none')),
  sample_terms text check (char_length(sample_terms) <= 500),
  certifications text check (char_length(certifications) <= 500),
  commission_pct numeric(5,2) check (commission_pct between 0 and 50),   -- a proposal to negotiate, never a payout
  commission_note text check (char_length(commission_note) <= 500),
  declaration_at timestamptz,
  submitted_at timestamptz,
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  decision_reasons text[] not null default '{}' check (cardinality(decision_reasons) <= 12),
  decision_note text check (char_length(decision_note) <= 2000),
  selection_reason text check (char_length(selection_reason) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Nothing is sent or selected without the basics and the supplier's declaration.
  constraint supplier_offers_complete check (
    status not in ('submitted', 'selected')
    or (title is not null and product_group is not null and valid_until is not null and vat_basis is not null
        and serviceable_areas is not null and shipping_terms is not null and lead_time_days is not null
        and sample_availability is not null and commission_pct is not null and declaration_at is not null and submitted_at is not null)
  ),
  constraint supplier_offers_selection_reason check (status <> 'selected' or selection_reason is not null)
);
create index if not exists supplier_offers_user on public.supplier_offers (user_id, created_at desc);
create index if not exists supplier_offers_status on public.supplier_offers (status, product_group, submitted_at desc);

-- ===========================================================================================================
-- B. Products (one row per SKU)
-- ===========================================================================================================
create table if not exists public.supplier_offer_items (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.supplier_offers(id) on delete cascade,
  position int not null default 1 check (position between 1 and 100),
  product_name text not null check (char_length(product_name) between 1 and 150),
  brand text check (char_length(brand) <= 100),
  sku text check (char_length(sku) <= 60),
  description text check (char_length(description) <= 1000),
  sell_unit text not null check (char_length(sell_unit) between 1 and 60),          -- how it is sold: "box of 50", "18 L tin"
  base_unit text not null check (base_unit in ('piece', 'kg', 'liter', 'meter', 'set')),   -- what the comparison counts in
  base_qty numeric(12,3) not null check (base_qty > 0 and base_qty <= 1000000),     -- base units in one selling unit
  regular_price numeric(12,2) check (regular_price >= 0 and regular_price <= 100000000),
  wholesale_price numeric(12,2) check (wholesale_price >= 0 and wholesale_price <= 100000000),
  member_price numeric(12,2) not null check (member_price > 0 and member_price <= 100000000),
  tiers jsonb not null default '[]'::jsonb check (jsonb_typeof(tiers) = 'array' and jsonb_array_length(tiers) <= 5 and pg_column_size(tiers) <= 2000),
  moq int not null default 1 check (moq between 1 and 10000000),
  monthly_capacity int check (monthly_capacity between 0 and 1000000000),
  stock_status text not null default 'in_stock' check (stock_status in ('in_stock', 'made_to_order', 'limited', 'seasonal')),
  lead_time_days int check (lead_time_days between 0 and 365),
  shipping_per_unit numeric(12,2) not null default 0 check (shipping_per_unit >= 0 and shipping_per_unit <= 10000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The member price is never above the regular price, so the member discount is never negative.
  constraint supplier_offer_items_member_price check (regular_price is null or member_price <= regular_price),
  constraint supplier_offer_items_wholesale check (regular_price is null or wholesale_price is null or wholesale_price <= regular_price)
);
create index if not exists supplier_offer_items_offer on public.supplier_offer_items (offer_id, position);

-- ===========================================================================================================
-- C. History (= version history) and the national team's conflict declarations and scores
-- ===========================================================================================================
create table if not exists public.supplier_offer_history (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.supplier_offers(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('submitted', 'needs_changes', 'selected', 'not_selected', 'withdrawn', 'reopened', 'team_note')),
  revision int not null default 0,
  reasons text[] not null default '{}' check (cardinality(reasons) <= 12),
  note text check (char_length(note) <= 2000),
  internal boolean not null default false,
  snapshot jsonb check (snapshot is null or pg_column_size(snapshot) <= 120000),   -- the offer and its products as sent
  created_at timestamptz not null default now()
);
create index if not exists supplier_offer_history_offer on public.supplier_offer_history (offer_id, created_at);

create table if not exists public.supplier_offer_conflicts (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.supplier_offers(id) on delete cascade,
  reviewer_id uuid references auth.users(id) on delete set null,
  has_conflict boolean not null,
  details text check (char_length(details) <= 1000),
  declared_at timestamptz not null default now(),
  unique (offer_id, reviewer_id),
  constraint supplier_offer_conflicts_details check (not has_conflict or details is not null)
);

create table if not exists public.supplier_offer_scores (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.supplier_offers(id) on delete cascade,
  revision int not null,
  reviewer_id uuid references auth.users(id) on delete set null,
  price_value int not null check (price_value between 0 and 30),
  quality_samples int not null check (quality_samples between 0 and 25),
  compliance_reliability int not null check (compliance_reliability between 0 and 20),
  commission_benefits int not null check (commission_benefits between 0 and 15),
  logistics_support int not null check (logistics_support between 0 and 10),
  total int generated always as (price_value + quality_samples + compliance_reliability + commission_benefits + logistics_support) stored,
  compliance_pass boolean not null,
  compliance_note text check (char_length(compliance_note) <= 1000),
  note text check (char_length(note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (offer_id, revision, reviewer_id),
  constraint supplier_offer_scores_fail_note check (compliance_pass or compliance_note is not null)
);
create index if not exists supplier_offer_scores_offer on public.supplier_offer_scores (offer_id, revision);

-- The pass mark for a Best Offer (suggested 80 out of 100). The compliance gate must also pass.
create or replace function public.supplier_offer_pass_mark() returns int language sql immutable as $$ select 80 $$;

-- ===========================================================================================================
-- D. Rules the database enforces, whoever writes
-- ===========================================================================================================
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
drop trigger if exists supplier_offers_guard on public.supplier_offers;
create trigger supplier_offers_guard before insert or update on public.supplier_offers
  for each row execute function public.supplier_offer_guard();

-- Products change only while the offer is a draft or sent back for changes (or when the offer itself is erased).
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
drop trigger if exists supplier_offer_items_guard on public.supplier_offer_items;
create trigger supplier_offer_items_guard before insert or update or delete on public.supplier_offer_items
  for each row execute function public.supplier_offer_item_guard();

-- History: nobody can change or quietly delete it (rows go only with their offer, or through the retention job).
create or replace function public.supplier_offer_history_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if current_setting('flameph.retention', true) = 'on' then return old; end if;
    if not exists (select 1 from public.supplier_offers o where o.id = old.offer_id) then return old; end if;
    raise exception 'append_only: supplier_offer_history rows cannot be deleted';
  end if;
  if (to_jsonb(new) - 'actor_id') is distinct from (to_jsonb(old) - 'actor_id') then
    raise exception 'append_only: supplier_offer_history rows cannot be changed';
  end if;
  return new;
end $$;
drop trigger if exists supplier_offer_history_append_only on public.supplier_offer_history;
create trigger supplier_offer_history_append_only before update or delete on public.supplier_offer_history
  for each row execute function public.supplier_offer_history_guard();

-- Conflict declarations: made by the national team, never about their own offer. "No conflict" may later become
-- "conflict" (then that reviewer's scores for the offer are removed); a declared conflict can never be taken back.
create or replace function public.supplier_offer_conflict_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.supplier_offers o where o.id = old.offer_id) then return old; end if;
    raise exception 'append_only: conflict declarations cannot be deleted';
  end if;
  if tg_op = 'INSERT' then
    if new.reviewer_id is null or not exists (select 1 from public.roles x where x.user_id = new.reviewer_id and x.role in ('super_admin', 'admin', 'national_reviewer')) then
      raise exception 'supplier_offer_conflict: only the national team declares';
    end if;
    if exists (select 1 from public.supplier_offers o where o.id = new.offer_id and o.user_id = new.reviewer_id) then
      raise exception 'supplier_offer_conflict: nobody reviews their own offer';
    end if;
    return new;
  end if;
  if new.offer_id <> old.offer_id or new.reviewer_id is distinct from old.reviewer_id and new.reviewer_id is not null then
    raise exception 'supplier_offer_conflict: offer and reviewer are fixed';
  end if;
  if old.has_conflict and not new.has_conflict then raise exception 'supplier_offer_conflict: a declared conflict cannot be taken back'; end if;
  if new.has_conflict and not old.has_conflict then
    delete from public.supplier_offer_scores s where s.offer_id = new.offer_id and s.reviewer_id = new.reviewer_id;
  end if;
  return new;
end $$;
drop trigger if exists supplier_offer_conflicts_guard on public.supplier_offer_conflicts;
create trigger supplier_offer_conflicts_guard before insert or update or delete on public.supplier_offer_conflicts
  for each row execute function public.supplier_offer_conflict_guard();

-- Scores: only for an offer waiting for review, for its current version, by a national team member who declared no
-- conflict and is not the supplier.
create or replace function public.supplier_offer_score_guard() returns trigger
language plpgsql as $$
declare o record;
begin
  new.updated_at := now();
  -- A reviewer's account being erased only empties reviewer_id; the score stays as a record.
  if tg_op = 'UPDATE' and new.reviewer_id is null and old.reviewer_id is not null
     and (to_jsonb(new) - array['reviewer_id', 'updated_at', 'total']) = (to_jsonb(old) - array['reviewer_id', 'updated_at', 'total']) then
    return new;
  end if;
  select status, revision, user_id into o from public.supplier_offers where id = new.offer_id;
  if not found or o.status <> 'submitted' then raise exception 'supplier_offer_score: only offers waiting for review can be scored'; end if;
  if new.revision <> o.revision then raise exception 'supplier_offer_score: scores are for the current version only'; end if;
  if new.reviewer_id is null or new.reviewer_id = o.user_id then raise exception 'supplier_offer_score: nobody scores their own offer'; end if;
  if tg_op = 'UPDATE' and (new.offer_id, new.revision, new.reviewer_id) is distinct from (old.offer_id, old.revision, old.reviewer_id) then
    raise exception 'supplier_offer_score: offer, version and reviewer are fixed';
  end if;
  if not exists (select 1 from public.supplier_offer_conflicts c where c.offer_id = new.offer_id and c.reviewer_id = new.reviewer_id and not c.has_conflict) then
    raise exception 'supplier_offer_score: declare no conflict of interest before scoring';
  end if;
  return new;
end $$;
drop trigger if exists supplier_offer_scores_guard on public.supplier_offer_scores;
create trigger supplier_offer_scores_guard before insert or update on public.supplier_offer_scores
  for each row execute function public.supplier_offer_score_guard();

-- ===========================================================================================================
-- E. Row level security: the supplier sees their own; the national team sees all; nobody else sees anything.
--    No browser role can write: every write goes through the flameph.org server.
-- ===========================================================================================================
alter table public.supplier_offers enable row level security;
alter table public.supplier_offer_items enable row level security;
alter table public.supplier_offer_history enable row level security;
alter table public.supplier_offer_conflicts enable row level security;
alter table public.supplier_offer_scores enable row level security;
revoke all on public.supplier_offers from anon, authenticated;
revoke all on public.supplier_offer_items from anon, authenticated;
revoke all on public.supplier_offer_history from anon, authenticated;
revoke all on public.supplier_offer_conflicts from anon, authenticated;
revoke all on public.supplier_offer_scores from anon, authenticated;
grant select on public.supplier_offers, public.supplier_offer_items, public.supplier_offer_history,
  public.supplier_offer_conflicts, public.supplier_offer_scores to authenticated;

drop policy if exists supplier_offers_read on public.supplier_offers;
create policy supplier_offers_read on public.supplier_offers for select to authenticated
  using (user_id = auth.uid() or public.is_partner_reviewer());
drop policy if exists supplier_offer_items_read on public.supplier_offer_items;
create policy supplier_offer_items_read on public.supplier_offer_items for select to authenticated
  using (public.is_partner_reviewer() or exists (select 1 from public.supplier_offers o where o.id = offer_id and o.user_id = auth.uid()));
drop policy if exists supplier_offer_history_read on public.supplier_offer_history;
create policy supplier_offer_history_read on public.supplier_offer_history for select to authenticated
  using (public.is_partner_reviewer()
    or (not internal and exists (select 1 from public.supplier_offers o where o.id = offer_id and o.user_id = auth.uid())));
drop policy if exists supplier_offer_conflicts_read on public.supplier_offer_conflicts;
create policy supplier_offer_conflicts_read on public.supplier_offer_conflicts for select to authenticated
  using (public.is_partner_reviewer());
drop policy if exists supplier_offer_scores_read on public.supplier_offer_scores;
create policy supplier_offer_scores_read on public.supplier_offer_scores for select to authenticated
  using (public.is_partner_reviewer());

-- ===========================================================================================================
-- F. Offer files reuse the encrypted document store (0022, 0031), kept apart by purpose 'offer'.
-- ===========================================================================================================
alter table public.vetting_documents add column if not exists offer_id uuid references public.supplier_offers(id) on delete set null;
alter table public.vetting_documents add column if not exists item_id uuid references public.supplier_offer_items(id) on delete set null;
alter table public.vetting_documents drop constraint if exists vetting_documents_purpose_check;
alter table public.vetting_documents add constraint vetting_documents_purpose_check check (purpose in ('vetting', 'partner', 'offer'));
alter table public.vetting_documents drop constraint if exists vetting_documents_doc_type_check;
alter table public.vetting_documents add constraint vetting_documents_doc_type_check
  check (doc_type in ('dti_sec', 'mayors_permit', 'bir', 'gov_id', 'fda', 'prc', 'certification', 'other', 'product_photo', 'price_list', 'spec_sheet'));
alter table public.vetting_documents drop constraint if exists vetting_documents_partner_check;
alter table public.vetting_documents add constraint vetting_documents_partner_check
  check (purpose = 'vetting' and doc_type in ('dti_sec', 'mayors_permit', 'bir')
      or purpose = 'partner' and doc_type in ('dti_sec', 'mayors_permit', 'bir', 'gov_id', 'fda', 'prc', 'certification', 'other')
      or purpose = 'offer' and doc_type in ('product_photo', 'price_list', 'spec_sheet', 'certification', 'fda', 'other'));
create index if not exists vetting_documents_offer on public.vetting_documents (offer_id) where offer_id is not null;
grant select (offer_id, item_id) on public.vetting_documents to authenticated;
drop policy if exists vetting_documents_offer_read on public.vetting_documents;
create policy vetting_documents_offer_read on public.vetting_documents for select to authenticated
  using (purpose = 'offer' and public.is_partner_reviewer());

-- Documents due for deletion. Business vetting and partner documents exactly as in 0031. Offer files: 1 year after the
-- offer was not selected or withdrawn, or at once when their offer no longer exists. Switch 4 never deletes them.
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
