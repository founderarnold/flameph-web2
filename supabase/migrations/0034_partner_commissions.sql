-- Partner accreditation, Step 4: commission rates and the commission ledger. A RECORD ONLY.
-- flameph.org never collects, holds, pays out or moves money. Every figure here is a note of what MarketplacePH Online
-- Store collected and paid, kept for transparency. Nothing is paid automatically: finance records each step by hand,
-- and a second person approves.
--
-- Additive: five new tables and their functions. Nothing existing is removed, renamed or changed. Take a backup before
-- applying. Safe to run twice. Undo: supabase/rollback/0034_partner_commissions_undo.sql (removes only what this added).
--
--   commission_rules     the default rate per partner category, split into four levels (national, regional, provincial,
--                        city or municipal), and negotiated rates per signed agreement with one partner. Rates are
--                        dated versions: a new default replaces the old one from a date; old sales keep the old rate.
--                        Seeded defaults: supplier 5% (1, 1, 1, 2), service provider 12% (3, 2, 3, 4),
--                        toll manufacturer 8% (2, 1, 2, 3). They are targets for negotiation, not promised payouts.
--   commission_entries   one qualified sale (collected by MarketplacePH Online Store, net of returns, discounts and VAT)
--                        or one refund against an earlier sale. Finance records it; ANOTHER finance person approves it.
--                        On approval the database picks the rate for the sale date, checks the attribution (the
--                        partner's territory, channel, place and excluded accounts) and writes the four lines.
--   commission_lines     the commission for each level and place (e.g. "Pampanga provincial chapter"). Made only by the
--                        database. A refund makes negative lines for the same places (a clawback).
--   commission_payouts   a payout record for one place: the lines not yet paid, less withholding tax. Prepared by
--                        finance, approved by a second person, then marked paid with the MarketplacePH Online Store
--                        payment reference. flameph.org never sends the money.
--   commission_history   every change of status, written by the database (nobody can change or delete it).
--
-- Who sees what (row level security; the flameph.org server is the only writer):
--   founder (super_admin), finance       everything; record, approve, prepare and mark payouts paid
--   admin, national reviewer             everything (read); only they set rates and approve agreements
--   accredited partner                   their own approved sales and refunds, the lines of those, their own active
--                                        agreements, and the default rates. Never team notes, payouts or other partners
--   chapter coordinator, chapter tester, other members, visitors   only the default rates (members) or nothing

-- ===========================================================================================================
-- A. Who may do what
-- ===========================================================================================================
-- Finance desk: the founder and finance. They record and approve the ledger and payouts.
create or replace function public.commission_is_finance(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select uid is not null and exists (select 1 from public.roles x where x.user_id = uid and x.role in ('super_admin', 'finance'));
$$;
revoke all on function public.commission_is_finance(uuid) from public, anon, authenticated;
grant execute on function public.commission_is_finance(uuid) to service_role;

-- Everyone who may read the whole ledger: the national team and finance.
create or replace function public.is_commission_desk() returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_role(array['super_admin', 'admin', 'national_reviewer', 'finance']);
$$;
revoke all on function public.is_commission_desk() from public, anon;
grant execute on function public.is_commission_desk() to authenticated, service_role;

-- ===========================================================================================================
-- B. Commission rates: category defaults and negotiated agreements
-- ===========================================================================================================
create table if not exists public.commission_rules (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('default', 'agreement')),
  partner_category text not null check (partner_category in ('supplier', 'service_provider', 'toll_manufacturer')),
  partner_user_id uuid references auth.users(id) on delete set null,                -- agreements only
  partner_name text check (char_length(partner_name) <= 200),                       -- kept if the account is erased
  appointment_id uuid references public.territorial_appointments(id) on delete set null,   -- only for this territory
  offer_id uuid references public.supplier_offers(id) on delete set null,           -- the Best Offer it came from
  contract_ref text check (char_length(contract_ref) between 2 and 120),            -- the signed agreement's number
  signed_on date,
  national_pct numeric(5,2) not null check (national_pct between 0 and 30),
  regional_pct numeric(5,2) not null check (regional_pct between 0 and 30),
  provincial_pct numeric(5,2) not null check (provincial_pct between 0 and 30),
  city_pct numeric(5,2) not null check (city_pct between 0 and 30),
  total_pct numeric(5,2) generated always as (national_pct + regional_pct + provincial_pct + city_pct) stored,
  effective_from date not null,
  effective_to date,
  basis_note text check (char_length(basis_note) <= 1000),      -- shown to the partner (e.g. "net of VAT and returns")
  internal_note text check (char_length(internal_note) <= 2000), -- team only
  status text not null default 'draft' check (status in ('draft', 'active', 'retired', 'cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  approver_declared_at timestamptz,   -- the approver declared no conflict of interest
  retired_by uuid references auth.users(id) on delete set null,
  retired_at timestamptz,
  status_reason text check (char_length(status_reason) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commission_rules_total check (total_pct > 0 and total_pct <= 50),
  constraint commission_rules_dates check (effective_to is null or effective_to >= effective_from),
  constraint commission_rules_default check (scope <> 'default' or (partner_user_id is null and partner_name is null and appointment_id is null
    and offer_id is null and contract_ref is null and signed_on is null)),
  constraint commission_rules_agreement check (scope <> 'agreement' or (partner_name is not null and contract_ref is not null and signed_on is not null)),
  constraint commission_rules_approved check (status in ('draft', 'cancelled') or (approved_at is not null)),
  constraint commission_rules_reason check (status not in ('retired', 'cancelled') or status_reason is not null)
);
create index if not exists commission_rules_lookup on public.commission_rules (partner_category, scope, status, effective_from desc);
create index if not exists commission_rules_partner on public.commission_rules (partner_user_id) where partner_user_id is not null;

-- The rate for one sale: a live agreement with the partner for that territory, then one for all their territories, then
-- the category default, each as it stood on the sale date (retired versions still apply to their own dates).
create or replace function public.commission_rule_for(p_partner uuid, p_category text, p_appointment uuid, p_date date) returns uuid
language sql stable security definer set search_path = public as $$
  select r.id from public.commission_rules r
  where r.status in ('active', 'retired') and r.partner_category = p_category
    and p_date >= r.effective_from and (r.effective_to is null or p_date <= r.effective_to)
    and (r.scope = 'default'
         or (r.scope = 'agreement' and r.partner_user_id = p_partner and (r.appointment_id is null or r.appointment_id = p_appointment)))
  order by (r.scope = 'agreement') desc, (r.appointment_id is not null) desc, r.effective_from desc
  limit 1;
$$;
revoke all on function public.commission_rule_for(uuid, text, uuid, date) from public, anon, authenticated;
grant execute on function public.commission_rule_for(uuid, text, uuid, date) to service_role;

-- ===========================================================================================================
-- C. History (written by the database; nobody can change or delete it)
-- ===========================================================================================================
create table if not exists public.commission_history (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid references public.commission_rules(id) on delete restrict,
  entry_id uuid,
  payout_id uuid,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (char_length(action) between 2 and 40),
  note text check (char_length(note) <= 2000),
  created_at timestamptz not null default now(),
  constraint commission_history_one check (num_nonnulls(rule_id, entry_id, payout_id) = 1)
);
create index if not exists commission_history_rule on public.commission_history (rule_id, created_at) where rule_id is not null;
create index if not exists commission_history_entry on public.commission_history (entry_id, created_at) where entry_id is not null;
create index if not exists commission_history_payout on public.commission_history (payout_id, created_at) where payout_id is not null;

create or replace function public.commission_history_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'append_only: commission_history rows cannot be deleted'; end if;
  if (to_jsonb(new) - 'actor_id') is distinct from (to_jsonb(old) - 'actor_id') or new.actor_id is not null then
    raise exception 'append_only: commission_history rows cannot be changed';
  end if;
  return new;   -- only actor_id may become empty, when that account is erased
end $$;
drop trigger if exists commission_history_append_only on public.commission_history;
create trigger commission_history_append_only before update or delete on public.commission_history
  for each row execute function public.commission_history_guard();

-- ===========================================================================================================
-- D. Rules the database enforces on rates
-- ===========================================================================================================
create or replace function public.commission_rule_guard() returns trigger
language plpgsql as $$
declare
  p record; old_default record;
  links text[] := array['partner_user_id', 'appointment_id', 'offer_id', 'created_by', 'approved_by', 'retired_by'];
begin
  new.updated_at := now();
  if tg_op = 'DELETE' then raise exception 'commission_rule: rates are never deleted (cancel a draft or retire it)'; end if;
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then raise exception 'commission_rule: new rates start as draft'; end if;
    if not public.partner_is_national(new.created_by) then raise exception 'commission_rule: only the national team sets rates'; end if;
    new.approved_by := null; new.approved_at := null; new.approver_declared_at := null; new.retired_by := null; new.retired_at := null;
    if new.scope = 'agreement' then
      if new.partner_user_id is null or new.partner_user_id = new.created_by then
        raise exception 'commission_rule: choose the partner (never your own business)';
      end if;
      select pp.legal_name, pp.categories into p from public.partner_profiles pp where pp.user_id = new.partner_user_id;
      if not found or not (new.partner_category = any(p.categories)) then
        raise exception 'commission_rule: the partner is not accredited in this category';
      end if;
      new.partner_name := p.legal_name;
      if new.appointment_id is not null and not exists (select 1 from public.territorial_appointments t where t.id = new.appointment_id
           and t.partner_user_id = new.partner_user_id and t.partner_category = new.partner_category) then
        raise exception 'commission_rule: that territory is not this partner''s, for this category';
      end if;
      if new.offer_id is not null and not exists (select 1 from public.supplier_offers o where o.id = new.offer_id and o.user_id = new.partner_user_id) then
        raise exception 'commission_rule: that Best Offer is not this partner''s';
      end if;
      if new.signed_on > current_date then raise exception 'commission_rule: the signing date cannot be in the future'; end if;
    end if;
    return new;
  end if;

  -- UPDATE
  if new.scope <> old.scope or new.partner_category <> old.partner_category or new.created_at <> old.created_at
     or (new.partner_user_id is distinct from old.partner_user_id and new.partner_user_id is not null)
     or (new.created_by is distinct from old.created_by and new.created_by is not null) then
    raise exception 'commission_rule: the kind, category, partner and creator are fixed';
  end if;
  if old.status in ('retired', 'cancelled') then
    -- Only links to an erased account, territory or offer may become empty.
    if (to_jsonb(new) - 'total_pct' - links - 'updated_at') is distinct from (to_jsonb(old) - 'total_pct' - links - 'updated_at')
       or exists (select 1 from unnest(links) k where to_jsonb(new) ->> k is not null and (to_jsonb(new) ->> k) is distinct from (to_jsonb(old) ->> k)) then
      raise exception 'commission_rule: a % rate cannot be changed', old.status;
    end if;
    return new;
  end if;

  if new.status = old.status then
    if old.status = 'active' then
      -- An active rate is locked; only links being emptied and the team note may change.
      if (to_jsonb(new) - 'total_pct' - links - 'updated_at' - 'internal_note') is distinct from (to_jsonb(old) - 'total_pct' - links - 'updated_at' - 'internal_note')
         or exists (select 1 from unnest(links) k where to_jsonb(new) ->> k is not null and (to_jsonb(new) ->> k) is distinct from (to_jsonb(old) ->> k)) then
        raise exception 'commission_rule: an active rate cannot be changed (make a new version, or retire it)';
      end if;
      return new;
    end if;
    -- draft: anything but the approval fields
    if (new.approved_by, new.approved_at, new.retired_by, new.retired_at) is distinct from (old.approved_by, old.approved_at, old.retired_by, old.retired_at) then
      raise exception 'commission_rule: approve it with the approval step';
    end if;
    if new.scope = 'agreement' then
      if new.signed_on > current_date then raise exception 'commission_rule: the signing date cannot be in the future'; end if;
      if new.appointment_id is distinct from old.appointment_id and new.appointment_id is not null and not exists (
           select 1 from public.territorial_appointments t where t.id = new.appointment_id and t.partner_user_id = new.partner_user_id and t.partner_category = new.partner_category) then
        raise exception 'commission_rule: that territory is not this partner''s, for this category';
      end if;
    end if;
    return new;
  end if;

  if not ((old.status, new.status) in (('draft', 'active'), ('draft', 'cancelled'), ('active', 'retired'))) then
    raise exception 'commission_rule: cannot move from % to %', old.status, new.status;
  end if;

  if new.status = 'cancelled' then
    if (to_jsonb(new) - 'total_pct' - array['retired_by', 'updated_at', 'status', 'status_reason', 'retired_at'])
       is distinct from (to_jsonb(old) - 'total_pct' - array['retired_by', 'updated_at', 'status', 'status_reason', 'retired_at']) then
      raise exception 'commission_rule: cancel it on its own, without other changes';
    end if;
    if not public.partner_is_national(new.retired_by) then raise exception 'commission_rule: only the national team cancels'; end if;
    if nullif(btrim(coalesce(new.status_reason, '')), '') is null then raise exception 'commission_rule: write the reason'; end if;
    new.retired_at := now();
    return new;
  end if;

  if new.status = 'active' then
    if (to_jsonb(new) - 'total_pct' - array['approved_by', 'updated_at', 'status', 'approved_at', 'approver_declared_at', 'internal_note'])
       is distinct from (to_jsonb(old) - 'total_pct' - array['approved_by', 'updated_at', 'status', 'approved_at', 'approver_declared_at', 'internal_note']) then
      raise exception 'commission_rule: approve it on its own, without other changes';
    end if;
    if not public.partner_is_national(new.approved_by) then raise exception 'commission_rule: only the national team approves rates'; end if;
    if new.approved_by = old.created_by then raise exception 'commission_rule: a second person approves (not the one who wrote it)'; end if;
    if new.scope = 'agreement' and new.approved_by = new.partner_user_id then raise exception 'commission_rule: never for your own business'; end if;
    if new.approver_declared_at is null then raise exception 'commission_rule: the approver must declare no conflict of interest'; end if;
    new.approved_at := now();
    perform pg_advisory_xact_lock(hashtext('commission_rule:' || new.partner_category));
    if new.scope = 'default' then
      if new.effective_to is not null then raise exception 'commission_rule: a default rate has no end date (a newer default replaces it)'; end if;
      select r.* into old_default from public.commission_rules r
        where r.scope = 'default' and r.partner_category = new.partner_category and r.status = 'active' and r.id <> new.id;
      if found then
        if new.effective_from <= old_default.effective_from then
          raise exception 'commission_rule: the new default must start after the current one (from %)', old_default.effective_from;
        end if;
        update public.commission_rules set status = 'retired', effective_to = new.effective_from - 1, retired_by = new.approved_by,
               status_reason = 'Replaced by the new default from ' || to_char(new.effective_from, 'YYYY-MM-DD')
         where id = old_default.id;
      end if;
    else
      if exists (select 1 from public.partner_profiles pp where pp.user_id = new.partner_user_id and pp.status = 'accredited' and new.partner_category = any(pp.categories)) is not true then
        raise exception 'commission_rule: the partner is no longer accredited in this category';
      end if;
      if exists (select 1 from public.commission_rules r where r.scope = 'agreement' and r.id <> new.id and r.status in ('active', 'retired')
                 and r.partner_user_id = new.partner_user_id and r.partner_category = new.partner_category
                 and r.appointment_id is not distinct from new.appointment_id
                 and daterange(r.effective_from, r.effective_to, '[]') && daterange(new.effective_from, new.effective_to, '[]')) then
        raise exception 'commission_rule: another agreement rate for this partner, category and territory covers the same dates; retire it first';
      end if;
    end if;
    return new;
  end if;

  -- active -> retired: by the national team (or by the database when a newer default replaces it), with a reason.
  if (to_jsonb(new) - 'total_pct' - array['retired_by', 'updated_at', 'status', 'status_reason', 'retired_at', 'effective_to', 'internal_note'])
     is distinct from (to_jsonb(old) - 'total_pct' - array['retired_by', 'updated_at', 'status', 'status_reason', 'retired_at', 'effective_to', 'internal_note']) then
    raise exception 'commission_rule: retire it on its own, without other changes';
  end if;
  if not public.partner_is_national(new.retired_by) then raise exception 'commission_rule: only the national team retires rates'; end if;
  if nullif(btrim(coalesce(new.status_reason, '')), '') is null then raise exception 'commission_rule: write the reason'; end if;
  if old.scope = 'default' and pg_trigger_depth() < 2 then
    raise exception 'commission_rule: a default rate is never left empty; approve a newer default instead';
  end if;
  if new.effective_to is null or new.effective_to < new.effective_from then
    raise exception 'commission_rule: give the last day the rate applies';
  end if;
  if old.effective_to is not null and new.effective_to > old.effective_to then
    raise exception 'commission_rule: retiring cannot make a rate last longer';
  end if;
  -- Sales already approved under this rate stay as they are; the end date cannot cut them out.
  if exists (select 1 from public.commission_entries e where e.rule_id = new.id and e.status = 'approved' and e.kind = 'sale' and e.sale_date > new.effective_to) then
    raise exception 'commission_rule: approved sales after that date already use this rate; choose a later last day';
  end if;
  new.retired_at := now();
  return new;
end $$;

create or replace function public.commission_rule_after() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into public.commission_history (rule_id, actor_id, action, note) values (new.id, new.created_by, 'created', null);
  elsif new.status <> old.status then
    insert into public.commission_history (rule_id, actor_id, action, note)
    values (new.id, case new.status when 'active' then new.approved_by else new.retired_by end, new.status,
            case when new.status = 'active' then 'Rate ' || new.total_pct || '% (' || new.national_pct || ' national, ' || new.regional_pct || ' regional, '
                   || new.provincial_pct || ' provincial, ' || new.city_pct || ' city) from ' || to_char(new.effective_from, 'YYYY-MM-DD')
                 else new.status_reason end);
  end if;
  return null;
end $$;

-- The four default rates (targets for negotiation). Inserted once, before the rules are switched on, already approved
-- by the owner's written program (FLAME_PH_Partner_Prompts_v2, Step 4).
insert into public.commission_rules (scope, partner_category, national_pct, regional_pct, provincial_pct, city_pct, effective_from, basis_note, status, approved_at, approver_declared_at)
select v.scope, v.cat, v.n, v.r, v.p, v.c, date '2026-11-01', 'Percent of qualified collected net sales (after returns, discounts and VAT). A target for negotiation, not a promised payout.', 'active', now(), now()
from (values ('default', 'supplier', 1.00, 1.00, 1.00, 2.00), ('default', 'service_provider', 3.00, 2.00, 3.00, 4.00), ('default', 'toll_manufacturer', 2.00, 1.00, 2.00, 3.00))
  as v(scope, cat, n, r, p, c)
where not exists (select 1 from public.commission_rules x where x.scope = 'default' and x.partner_category = v.cat);

-- ===========================================================================================================
-- E. The ledger: qualified sales and refunds
-- ===========================================================================================================
create table if not exists public.commission_entries (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('sale', 'refund')),
  original_id uuid references public.commission_entries(id) on delete restrict,   -- the sale a refund reverses
  partner_user_id uuid references auth.users(id) on delete set null,
  partner_name text not null check (char_length(partner_name) between 1 and 200),  -- kept if the account is erased
  partner_category text not null check (partner_category in ('supplier', 'service_provider', 'toll_manufacturer')),
  appointment_id uuid references public.territorial_appointments(id) on delete set null,
  channel text check (channel in ('group_order', 'chapter_events', 'direct_members', 'marketplaceph', 'negosyodepot', 'own_online', 'own_store', 'resellers')),
  reference text not null check (char_length(reference) between 2 and 120),        -- MarketplacePH order, invoice or refund number
  sale_date date not null,                                                         -- for a refund: the refund date
  collected_on date,                                                               -- when MarketplacePH Online Store collected (or refunded)
  buyer_name text check (char_length(buyer_name) <= 200),
  city_code text not null references public.ph_cities(code),                       -- where it was delivered or served
  region_code text,
  province_code text,
  place_label text not null default '' check (char_length(place_label) <= 200),
  gross_amount numeric(14,2) not null check (gross_amount >= 0 and gross_amount <= 100000000000),
  deductions numeric(14,2) not null default 0 check (deductions >= 0 and deductions <= 100000000000),   -- returns, discounts, VAT
  net_amount numeric(14,2) not null default 0,                                     -- filled in: sale positive, refund negative
  description text check (char_length(description) <= 500),
  internal_note text check (char_length(internal_note) <= 2000),
  status text not null default 'recorded' check (status in ('recorded', 'approved', 'not_eligible', 'void')),
  rule_id uuid references public.commission_rules(id) on delete restrict,          -- the rate used (fixed on approval)
  national_pct numeric(5,2),
  regional_pct numeric(5,2),
  provincial_pct numeric(5,2),
  city_pct numeric(5,2),
  total_pct numeric(5,2),
  commission_total numeric(14,2),
  recorded_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,   -- marked not eligible or void
  decided_at timestamptz,
  status_reason text check (char_length(status_reason) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commission_entries_refund check ((kind = 'refund') = (original_id is not null)),
  constraint commission_entries_net check (kind <> 'sale' or gross_amount >= deductions),
  constraint commission_entries_approved check (status <> 'approved' or (approved_at is not null and rule_id is not null and collected_on is not null
    and total_pct is not null and commission_total is not null)),
  constraint commission_entries_reason check (status not in ('not_eligible', 'void') or status_reason is not null)
);
create index if not exists commission_entries_status on public.commission_entries (status, sale_date desc);
create index if not exists commission_entries_partner on public.commission_entries (partner_user_id, sale_date desc);
create index if not exists commission_entries_original on public.commission_entries (original_id) where original_id is not null;
-- The same order cannot be recorded twice for the same partner (void ones aside).
create unique index if not exists commission_entries_once on public.commission_entries (partner_name, kind, lower(reference)) where status <> 'void';

create table if not exists public.commission_payouts (
  id uuid primary key default gen_random_uuid(),
  recipient_key text not null check (recipient_key ~ '^(national|(region|province|city):[0-9]{10})$'),
  recipient_label text not null check (char_length(recipient_label) between 2 and 200),
  chapter_id uuid references public.chapters(id) on delete set null,
  period_end date not null,   -- lines of sales and refunds dated up to this day
  line_count int not null default 0,
  total_amount numeric(14,2) not null default 0,
  withholding_pct numeric(5,2) not null default 0 check (withholding_pct between 0 and 25),
  withholding_amount numeric(14,2) generated always as (round(total_amount * withholding_pct / 100, 2)) stored,
  net_amount numeric(14,2) generated always as (total_amount - round(total_amount * withholding_pct / 100, 2)) stored,
  status text not null default 'draft' check (status in ('draft', 'approved', 'paid', 'cancelled')),
  prepared_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  paid_recorded_by uuid references auth.users(id) on delete set null,
  paid_recorded_at timestamptz,
  paid_on date,
  mph_reference text check (char_length(mph_reference) between 2 and 120),   -- MarketplacePH Online Store payment reference
  cancelled_by uuid references auth.users(id) on delete set null,
  status_reason text check (char_length(status_reason) <= 1000),
  note text check (char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commission_payouts_paid check (status <> 'paid' or (paid_on is not null and mph_reference is not null and approved_at is not null)),
  constraint commission_payouts_reason check (status <> 'cancelled' or status_reason is not null)
);
create index if not exists commission_payouts_recipient on public.commission_payouts (recipient_key, created_at desc);
create index if not exists commission_payouts_status on public.commission_payouts (status, created_at desc);

create table if not exists public.commission_lines (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.commission_entries(id) on delete restrict,
  level text not null check (level in ('national', 'regional', 'provincial', 'city')),
  recipient_key text not null check (recipient_key ~ '^(national|(region|province|city):[0-9]{10})$'),
  recipient_label text not null check (char_length(recipient_label) between 2 and 200),
  chapter_id uuid references public.chapters(id) on delete set null,
  pct numeric(5,2) not null,
  amount numeric(14,2) not null,
  payout_id uuid references public.commission_payouts(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint commission_lines_level unique (entry_id, level)
);
create index if not exists commission_lines_recipient on public.commission_lines (recipient_key, payout_id);
create index if not exists commission_lines_payout on public.commission_lines (payout_id) where payout_id is not null;

-- The chapter for a place, if one is open: the same matching as the member's home chapter (0023).
create or replace function public.commission_chapter_for(p_level text, p_region text, p_province text, p_city text) returns uuid
language sql stable security definer set search_path = public as $$
  select c.id from public.chapters c
  where c.published and c.status <> 'inactive'
    and case p_level
      when 'regional' then lower(btrim(coalesce(c.region, ''))) = lower(coalesce(p_region, '-')) and coalesce(btrim(c.province), '') = '' and coalesce(btrim(c.city), '') = ''
      when 'provincial' then lower(btrim(coalesce(c.province, ''))) = lower(coalesce(p_province, '-')) and coalesce(btrim(c.city), '') = ''
      when 'city' then lower(btrim(coalesce(c.province, ''))) = lower(coalesce(p_province, '-'))
        -- "City of Angeles" (official list) matches a chapter typed as "Angeles City" or "Angeles".
        and regexp_replace(regexp_replace(lower(btrim(coalesce(c.city, ''))), '^city of\s+', ''), '\s+city$', '')
          = regexp_replace(regexp_replace(lower(btrim(coalesce(p_city, '-'))), '^city of\s+', ''), '\s+city$', '')
      else false end
  order by (c.status = 'active') desc, c.created_at
  limit 1;
$$;
revoke all on function public.commission_chapter_for(text, text, text, text) from public, anon, authenticated;
grant execute on function public.commission_chapter_for(text, text, text, text) to service_role;

create or replace function public.commission_entry_guard() returns trigger
language plpgsql as $$
declare
  o record; c record; t record; r record; refunded numeric;
  links text[] := array['partner_user_id', 'appointment_id', 'recorded_by', 'approved_by', 'decided_by'];
  facts text[] := array['partner_name', 'partner_category', 'appointment_id', 'channel', 'reference', 'sale_date', 'collected_on', 'buyer_name',
                        'city_code', 'region_code', 'province_code', 'place_label', 'gross_amount', 'deductions', 'net_amount', 'description'];
begin
  new.updated_at := now();
  if tg_op = 'DELETE' then raise exception 'commission_entry: ledger entries are never deleted (void a wrong one with a reason)'; end if;

  if tg_op = 'INSERT' then
    if new.status <> 'recorded' then raise exception 'commission_entry: new entries start as recorded'; end if;
    if not public.commission_is_finance(new.recorded_by) then raise exception 'commission_entry: only finance records sales and refunds'; end if;
    new.rule_id := null; new.national_pct := null; new.regional_pct := null; new.provincial_pct := null; new.city_pct := null;
    new.total_pct := null; new.commission_total := null; new.approved_by := null; new.approved_at := null; new.decided_by := null; new.decided_at := null;
    if new.kind = 'refund' then
      -- A refund reverses part or all of an approved sale, for the same partner and the same places.
      select e.* into o from public.commission_entries e where e.id = new.original_id;
      if not found or o.kind <> 'sale' or o.status <> 'approved' then raise exception 'commission_entry: a refund needs an approved sale'; end if;
      new.partner_user_id := o.partner_user_id; new.partner_name := o.partner_name; new.partner_category := o.partner_category;
      new.appointment_id := o.appointment_id; new.channel := o.channel; new.city_code := o.city_code; new.buyer_name := o.buyer_name;
      if new.sale_date < o.sale_date then raise exception 'commission_entry: the refund date cannot be before the sale'; end if;
      new.deductions := 0;
    else
      if new.original_id is not null then raise exception 'commission_entry: only refunds point to a sale'; end if;
      select pp.legal_name, pp.categories into c from public.partner_profiles pp where pp.user_id = new.partner_user_id;
      if not found or not (new.partner_category = any(c.categories)) then
        raise exception 'commission_entry: the partner is not accredited in this category';
      end if;
      new.partner_name := c.legal_name;
    end if;
  else
    -- UPDATE
    if new.kind <> old.kind or new.original_id is distinct from old.original_id or new.created_at <> old.created_at
       or (new.partner_user_id is distinct from old.partner_user_id and new.partner_user_id is not null)
       or (new.recorded_by is distinct from old.recorded_by and new.recorded_by is not null) then
      raise exception 'commission_entry: the kind, partner, sale and recorder are fixed';
    end if;
    if old.status <> 'recorded' then
      -- Approved, not eligible and void entries are final; only links to an erased account or ended territory may empty.
      if (to_jsonb(new) - links - 'updated_at' - 'internal_note') is distinct from (to_jsonb(old) - links - 'updated_at' - 'internal_note')
         or exists (select 1 from unnest(links) k where to_jsonb(new) ->> k is not null and (to_jsonb(new) ->> k) is distinct from (to_jsonb(old) ->> k)) then
        raise exception 'commission_entry: a % entry cannot be changed (record a refund to correct an approved sale)', replace(old.status, '_', ' ');
      end if;
      return new;
    end if;
    if new.partner_name <> old.partner_name or new.partner_category <> old.partner_category then
      raise exception 'commission_entry: the partner is fixed; void it and record it again';
    end if;
    if new.kind = 'refund' and (new.appointment_id, new.channel, new.city_code, new.buyer_name, new.deductions)
         is distinct from (old.appointment_id, old.channel, old.city_code, old.buyer_name, old.deductions) then
      raise exception 'commission_entry: a refund keeps the sale''s place, channel and territory';
    end if;
    if new.status <> old.status and (to_jsonb(new) - links - 'updated_at' - 'status' - 'status_reason' - 'approved_at' - 'decided_at' - 'internal_note'
         - 'rule_id' - 'national_pct' - 'regional_pct' - 'provincial_pct' - 'city_pct' - 'total_pct' - 'commission_total')
       is distinct from (to_jsonb(old) - links - 'updated_at' - 'status' - 'status_reason' - 'approved_at' - 'decided_at' - 'internal_note'
         - 'rule_id' - 'national_pct' - 'regional_pct' - 'provincial_pct' - 'city_pct' - 'total_pct' - 'commission_total') then
      raise exception 'commission_entry: change the status on its own, without other changes';
    end if;
    if new.status = old.status and (new.rule_id, new.total_pct, new.commission_total, new.approved_by, new.approved_at, new.decided_by, new.decided_at)
         is distinct from (old.rule_id, old.total_pct, old.commission_total, old.approved_by, old.approved_at, old.decided_by, old.decided_at) then
      raise exception 'commission_entry: the rate and approval are set by the approval step';
    end if;
  end if;

  -- Facts, for a new or still-recorded entry: place codes from the official list, the net amount, the dates.
  select x.code, x.name, x.province, x.region_code, x.province_code into t from public.ph_cities x where x.code = new.city_code;
  if not found then raise exception 'commission_entry: % is not a city or municipality code', new.city_code; end if;
  new.region_code := t.region_code; new.province_code := t.province_code;
  new.place_label := t.name || coalesce(', ' || t.province, '');
  new.net_amount := case when new.kind = 'refund' then -(new.gross_amount) else new.gross_amount - new.deductions end;
  if new.collected_on is not null and new.collected_on > current_date then raise exception 'commission_entry: the collection date cannot be in the future'; end if;
  if new.sale_date > current_date then raise exception 'commission_entry: the date cannot be in the future'; end if;
  if new.kind = 'refund' then
    select coalesce(sum(-e.net_amount), 0) into refunded from public.commission_entries e
      where e.original_id = new.original_id and e.kind = 'refund' and e.status in ('recorded', 'approved') and e.id <> new.id;
    select e.net_amount into o from public.commission_entries e where e.id = new.original_id;
    if new.gross_amount <= 0 then raise exception 'commission_entry: type the refunded amount'; end if;
    if refunded + new.gross_amount > o.net_amount then
      raise exception 'commission_entry: refunds would be more than the sale''s net amount (% already refunded of %)', refunded, o.net_amount;
    end if;
  end if;

  if tg_op = 'INSERT' or new.status = old.status then return new; end if;

  -- Status moves
  if not ((old.status, new.status) in (('recorded', 'approved'), ('recorded', 'not_eligible'), ('recorded', 'void'))) then
    raise exception 'commission_entry: cannot move from % to %', old.status, new.status;
  end if;
  if new.status in ('not_eligible', 'void') then
    if not public.commission_is_finance(new.decided_by) then raise exception 'commission_entry: only finance decides'; end if;
    if nullif(btrim(coalesce(new.status_reason, '')), '') is null then raise exception 'commission_entry: write the reason'; end if;
    new.decided_at := now();
    new.rule_id := null; new.national_pct := null; new.regional_pct := null; new.provincial_pct := null; new.city_pct := null;
    new.total_pct := null; new.commission_total := null; new.approved_by := null; new.approved_at := null;
    return new;
  end if;

  -- recorded -> approved: a SECOND finance person, a collected sale, a valid attribution and the rate for the date.
  if not public.commission_is_finance(new.approved_by) then raise exception 'commission_entry: only finance approves'; end if;
  if new.approved_by = old.recorded_by then raise exception 'commission_entry: a second person approves (not the one who recorded it)'; end if;
  if new.approved_by = new.partner_user_id then raise exception 'commission_entry: never for your own business'; end if;
  if new.collected_on is null then raise exception 'commission_entry: only collected sales count; add the date MarketplacePH Online Store collected it'; end if;
  if new.kind = 'sale' then
    if new.collected_on < new.sale_date then raise exception 'commission_entry: collected before the sale date?'; end if;
    if new.net_amount <= 0 then raise exception 'commission_entry: the net sale must be more than zero'; end if;
    if new.appointment_id is not null then
      select a.* into t from public.territorial_appointments a where a.id = new.appointment_id;
      if not found or t.partner_user_id is distinct from new.partner_user_id or t.partner_category <> new.partner_category then
        raise exception 'commission_entry: that territory is not this partner''s';
      end if;
      if t.status not in ('active', 'suspended', 'ended') or new.sale_date < t.start_date or new.sale_date > t.end_date then
        raise exception 'commission_entry: the sale date is outside the territory''s approved dates';
      end if;
      if t.status = 'suspended' then raise exception 'commission_entry: the territory is suspended; mark it not eligible or wait'; end if;
      if t.status = 'ended' and t.ended_at is not null and new.sale_date > (t.ended_at at time zone 'Asia/Manila')::date then
        raise exception 'commission_entry: the territory had ended before the sale';
      end if;
      if new.channel is null or not (new.channel = any(t.channels)) then
        raise exception 'commission_entry: that selling channel is not allowed in the territory';
      end if;
      if not exists (select 1 from public.territory_areas q where q.appointment_id = t.id
                     and public.territory_area_covers(q.region_code, q.province_code, q.city_code, new.region_code, new.province_code, new.city_code)) then
        raise exception 'commission_entry: the place of delivery is outside the territory';
      end if;
      if new.buyer_name is not null and exists (select 1 from unnest(t.excluded_accounts) x where lower(btrim(x)) = lower(btrim(new.buyer_name))) then
        raise exception 'commission_entry: the buyer is an excluded account in this territory';
      end if;
    end if;
    new.rule_id := public.commission_rule_for(new.partner_user_id, new.partner_category, new.appointment_id, new.sale_date);
    if new.rule_id is null then raise exception 'commission_entry: no commission rate applies on that date'; end if;
    select x.* into r from public.commission_rules x where x.id = new.rule_id;
    new.national_pct := r.national_pct; new.regional_pct := r.regional_pct; new.provincial_pct := r.provincial_pct; new.city_pct := r.city_pct;
    new.total_pct := r.total_pct;
  else
    select e.* into o from public.commission_entries e where e.id = new.original_id;
    if o.status <> 'approved' then raise exception 'commission_entry: the sale is not approved'; end if;
    new.rule_id := o.rule_id; new.national_pct := o.national_pct; new.regional_pct := o.regional_pct; new.provincial_pct := o.provincial_pct;
    new.city_pct := o.city_pct; new.total_pct := o.total_pct;
  end if;
  new.commission_total := round(new.net_amount * new.total_pct / 100, 2);
  new.approved_at := now();
  return new;
end $$;

-- On approval, the database writes the four lines. The city line takes the rounding, so the lines always add up.
create or replace function public.commission_entry_after() returns trigger
language plpgsql as $$
declare
  g record; n numeric; rg numeric; pv numeric; ct numeric; o record;
  region_label text; province_name text; city_name text;
begin
  if tg_op = 'INSERT' then
    insert into public.commission_history (entry_id, actor_id, action, note) values (new.id, new.recorded_by, case new.kind when 'refund' then 'refund_recorded' else 'recorded' end, null);
    return null;
  end if;
  if new.status = old.status then return null; end if;
  insert into public.commission_history (entry_id, actor_id, action, note)
  values (new.id, case new.status when 'approved' then new.approved_by else new.decided_by end, new.status,
          case when new.status = 'approved' then 'Net ' || new.net_amount || ' x ' || new.total_pct || '% = ' || new.commission_total else new.status_reason end);
  if new.status <> 'approved' then return null; end if;

  select r.label into region_label from public.ph_regions r where r.code = new.region_code;
  select p.name into province_name from public.ph_provinces p where p.psgc_code = new.province_code;
  select c.name into city_name from public.ph_cities c where c.code = new.city_code;
  n := round(new.net_amount * new.national_pct / 100, 2);
  rg := round(new.net_amount * new.regional_pct / 100, 2);
  pv := round(new.net_amount * new.provincial_pct / 100, 2);
  ct := new.commission_total - n - rg - pv;
  insert into public.commission_lines (entry_id, level, recipient_key, recipient_label, chapter_id, pct, amount) values
    (new.id, 'national', 'national', 'FLAME PH National', null, new.national_pct, n),
    (new.id, 'regional', 'region:' || new.region_code, coalesce(region_label, new.region_code) || ' regional chapter',
       public.commission_chapter_for('regional', region_label, null, null), new.regional_pct, rg),
    (new.id, 'provincial', 'province:' || new.province_code, coalesce(province_name, 'Province ' || new.province_code) || ' provincial chapter',
       public.commission_chapter_for('provincial', region_label, province_name, null), new.provincial_pct, pv),
    (new.id, 'city', 'city:' || new.city_code, coalesce(city_name, new.city_code) || coalesce(', ' || province_name, '') || ' city or municipal chapter',
       public.commission_chapter_for('city', region_label, province_name, city_name), new.city_pct, ct);
  return null;
end $$;

drop trigger if exists commission_entries_guard on public.commission_entries;
create trigger commission_entries_guard before insert or update or delete on public.commission_entries
  for each row execute function public.commission_entry_guard();
drop trigger if exists commission_entries_after on public.commission_entries;
create trigger commission_entries_after after insert or update on public.commission_entries
  for each row execute function public.commission_entry_after();

-- Lines: made only by the database on approval; afterwards only the payout link changes (and only by the payout steps).
create or replace function public.commission_line_guard() returns trigger
language plpgsql as $$
declare e record; p record;
begin
  if tg_op = 'DELETE' then raise exception 'commission_line: lines are never deleted (record a refund instead)'; end if;
  if tg_op = 'INSERT' then
    if pg_trigger_depth() < 2 then raise exception 'commission_line: lines are written only by the database when an entry is approved'; end if;
    new.payout_id := null;
    return new;
  end if;
  if (to_jsonb(new) - 'payout_id' - 'chapter_id') is distinct from (to_jsonb(old) - 'payout_id' - 'chapter_id')
     or (new.chapter_id is distinct from old.chapter_id and new.chapter_id is not null) then
    raise exception 'commission_line: a line cannot be changed';
  end if;
  if new.payout_id is not distinct from old.payout_id then return new; end if;
  if pg_trigger_depth() < 2 then raise exception 'commission_line: lines join or leave a payout only through the payout steps'; end if;
  if new.payout_id is not null then
    if old.payout_id is not null then raise exception 'commission_line: this line is already in a payout'; end if;
    select x.* into p from public.commission_payouts x where x.id = new.payout_id;
    select x.status, x.sale_date into e from public.commission_entries x where x.id = new.entry_id;
    if p.status <> 'draft' or p.recipient_key <> new.recipient_key or e.status <> 'approved' or e.sale_date > p.period_end then
      raise exception 'commission_line: this line does not belong in that payout';
    end if;
  else
    select x.status into p from public.commission_payouts x where x.id = old.payout_id;
    if p.status <> 'cancelled' then raise exception 'commission_line: a line leaves a payout only when the payout is cancelled'; end if;
  end if;
  return new;
end $$;
drop trigger if exists commission_lines_guard on public.commission_lines;
create trigger commission_lines_guard before insert or update or delete on public.commission_lines
  for each row execute function public.commission_line_guard();

-- ===========================================================================================================
-- F. Payouts: prepared by finance, approved by a second person, marked paid with MarketplacePH's reference
-- ===========================================================================================================
create or replace function public.commission_payout_guard() returns trigger
language plpgsql as $$
declare s record;
  links text[] := array['prepared_by', 'approved_by', 'paid_recorded_by', 'cancelled_by', 'chapter_id'];
begin
  -- (Generated columns are empty inside this check, so they are left out of the comparisons.)
  new.updated_at := now();
  if tg_op = 'DELETE' then raise exception 'commission_payout: payouts are never deleted (cancel one with a reason)'; end if;
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then raise exception 'commission_payout: new payouts start as draft'; end if;
    if not public.commission_is_finance(new.prepared_by) then raise exception 'commission_payout: only finance prepares payouts'; end if;
    if new.period_end > current_date then raise exception 'commission_payout: the period cannot end in the future'; end if;
    perform pg_advisory_xact_lock(hashtext('commission_payout:' || new.recipient_key));
    if exists (select 1 from public.commission_payouts x where x.recipient_key = new.recipient_key and x.status in ('draft', 'approved')) then
      raise exception 'commission_payout: this place already has a payout waiting; finish or cancel it first';
    end if;
    new.line_count := 0; new.total_amount := 0; new.approved_by := null; new.approved_at := null; new.paid_recorded_by := null;
    new.paid_recorded_at := null; new.paid_on := null; new.mph_reference := null; new.cancelled_by := null;
    return new;
  end if;

  if new.recipient_key <> old.recipient_key or new.period_end <> old.period_end or new.created_at <> old.created_at
     or (new.prepared_by is distinct from old.prepared_by and new.prepared_by is not null) then
    raise exception 'commission_payout: the place, period and preparer are fixed';
  end if;
  if old.status in ('paid', 'cancelled') then
    if (to_jsonb(new) - 'withholding_amount' - 'net_amount' - links - 'updated_at') is distinct from (to_jsonb(old) - 'withholding_amount' - 'net_amount' - links - 'updated_at')
       or exists (select 1 from unnest(links) k where to_jsonb(new) ->> k is not null and (to_jsonb(new) ->> k) is distinct from (to_jsonb(old) ->> k)) then
      raise exception 'commission_payout: a % payout cannot be changed', old.status;
    end if;
    return new;
  end if;
  -- The total and line count always equal the lines attached (checked here, whoever writes).
  select count(*)::int n, coalesce(sum(l.amount), 0) total into s from public.commission_lines l where l.payout_id = new.id;
  if new.status <> 'cancelled' and (new.line_count <> s.n or new.total_amount <> s.total) then
    raise exception 'commission_payout: the total must equal its lines (% lines, %)', s.n, s.total;
  end if;

  if new.status = old.status then
    if old.status = 'approved' and (to_jsonb(new) - 'withholding_amount' - 'net_amount' - links - 'updated_at' - 'note') is distinct from (to_jsonb(old) - 'withholding_amount' - 'net_amount' - links - 'updated_at' - 'note') then
      raise exception 'commission_payout: an approved payout cannot be changed (cancel it and prepare it again)';
    end if;
    if (new.approved_by, new.approved_at, new.paid_recorded_by, new.paid_on, new.mph_reference) is distinct from (old.approved_by, old.approved_at, old.paid_recorded_by, old.paid_on, old.mph_reference) then
      raise exception 'commission_payout: use the approval and paid steps';
    end if;
    return new;
  end if;

  if not ((old.status, new.status) in (('draft', 'approved'), ('draft', 'cancelled'), ('approved', 'paid'), ('approved', 'cancelled'))) then
    raise exception 'commission_payout: cannot move from % to %', old.status, new.status;
  end if;
  if new.status = 'approved' then
    if (new.withholding_pct, new.line_count, new.total_amount) is distinct from (old.withholding_pct, old.line_count, old.total_amount) then
      raise exception 'commission_payout: approve it on its own, without other changes';
    end if;
    if not public.commission_is_finance(new.approved_by) then raise exception 'commission_payout: only finance approves payouts'; end if;
    if new.approved_by = old.prepared_by then raise exception 'commission_payout: a second person approves (not the one who prepared it)'; end if;
    if new.total_amount <= 0 then raise exception 'commission_payout: nothing to pay (refunds are more than or equal to the commission)'; end if;
    new.approved_at := now();
  elsif new.status = 'paid' then
    if (new.withholding_pct, new.line_count, new.total_amount, new.approved_by, new.approved_at) is distinct from (old.withholding_pct, old.line_count, old.total_amount, old.approved_by, old.approved_at) then
      raise exception 'commission_payout: mark it paid on its own, without other changes';
    end if;
    if not public.commission_is_finance(new.paid_recorded_by) then raise exception 'commission_payout: only finance records a payment'; end if;
    if new.paid_on is null or new.paid_on > current_date then raise exception 'commission_payout: give the date MarketplacePH Online Store paid'; end if;
    if nullif(btrim(coalesce(new.mph_reference, '')), '') is null then raise exception 'commission_payout: give the MarketplacePH Online Store payment reference'; end if;
    new.paid_recorded_at := now();
  else
    if not public.commission_is_finance(new.cancelled_by) then raise exception 'commission_payout: only finance cancels payouts'; end if;
    if nullif(btrim(coalesce(new.status_reason, '')), '') is null then raise exception 'commission_payout: write the reason'; end if;
  end if;
  return new;
end $$;

-- After a payout is prepared, the database attaches every unpaid line of that place up to the period end and sets the
-- total; after it is cancelled, the lines are free again for the next payout.
create or replace function public.commission_payout_after() returns trigger
language plpgsql as $$
declare s record;
begin
  if tg_op = 'INSERT' then
    update public.commission_lines l set payout_id = new.id
      from public.commission_entries e
     where e.id = l.entry_id and e.status = 'approved' and e.sale_date <= new.period_end
       and l.recipient_key = new.recipient_key and l.payout_id is null;
    select count(*)::int n, coalesce(sum(l.amount), 0) total into s from public.commission_lines l where l.payout_id = new.id;
    if s.n = 0 then raise exception 'commission_payout: there is nothing to pay for this place up to that date'; end if;
    update public.commission_payouts set line_count = s.n, total_amount = s.total where id = new.id;
    insert into public.commission_history (payout_id, actor_id, action, note) values (new.id, new.prepared_by, 'prepared', s.n || ' lines, total ' || s.total);
    return null;
  end if;
  if new.status = old.status then return null; end if;
  if new.status = 'cancelled' then
    update public.commission_lines set payout_id = null where payout_id = new.id;
  end if;
  insert into public.commission_history (payout_id, actor_id, action, note)
  values (new.id, case new.status when 'approved' then new.approved_by when 'paid' then new.paid_recorded_by else new.cancelled_by end, new.status,
          case new.status when 'paid' then 'Paid by MarketplacePH Online Store on ' || to_char(new.paid_on, 'YYYY-MM-DD') || ', ref ' || new.mph_reference
               when 'approved' then 'Net to pay ' || new.net_amount || ' after ' || new.withholding_pct || '% withholding'
               else new.status_reason end);
  return null;
end $$;

drop trigger if exists commission_payouts_guard on public.commission_payouts;
create trigger commission_payouts_guard before insert or update or delete on public.commission_payouts
  for each row execute function public.commission_payout_guard();
drop trigger if exists commission_payouts_after on public.commission_payouts;
create trigger commission_payouts_after after insert or update on public.commission_payouts
  for each row execute function public.commission_payout_after();

-- The rate rules are switched on last, after the seeded defaults are in.
drop trigger if exists commission_rules_guard on public.commission_rules;
create trigger commission_rules_guard before insert or update or delete on public.commission_rules
  for each row execute function public.commission_rule_guard();
drop trigger if exists commission_rules_after on public.commission_rules;
create trigger commission_rules_after after insert or update on public.commission_rules
  for each row execute function public.commission_rule_after();

-- ===========================================================================================================
-- G. Reconciliation (server only): the checks that must all be zero, and the balance of every place
-- ===========================================================================================================
create or replace function public.commission_reconcile(p_from date, p_to date)
returns table (check_key text, label text, expected numeric, actual numeric, ok boolean)
language sql stable security definer set search_path = public as $$
  with e as (select * from public.commission_entries x where x.sale_date between p_from and p_to),
  ap as (select * from e where e.status = 'approved'),
  ln as (select l.*, py.status as payout_status from public.commission_lines l join ap on ap.id = l.entry_id left join public.commission_payouts py on py.id = l.payout_id),
  per as (select ap.id, ap.commission_total, round(ap.net_amount * ap.total_pct / 100, 2) as expect, coalesce(sum(ln.amount), 0) as lines, count(ln.id) as n
          from ap left join ln on ln.entry_id = ap.id group by ap.id, ap.commission_total, ap.net_amount, ap.total_pct),
  tot as (select coalesce(sum(amount), 0) t,
                 coalesce(sum(amount) filter (where payout_status = 'paid'), 0) paid,
                 coalesce(sum(amount) filter (where payout_status = 'approved'), 0) approved,
                 coalesce(sum(amount) filter (where payout_status = 'draft'), 0) draft,
                 coalesce(sum(amount) filter (where payout_id is null), 0) open
          from ln)
  select 'lines_add_up', 'Approved entries whose four lines do not add up to net x rate', 0::numeric,
         (select count(*) from per where per.lines <> per.commission_total or per.commission_total <> per.expect)::numeric,
         not exists (select 1 from per where per.lines <> per.commission_total or per.commission_total <> per.expect)
  union all
  select 'four_lines', 'Approved entries without exactly four lines', 0, (select count(*) from per where per.n <> 4)::numeric, not exists (select 1 from per where per.n <> 4)
  union all
  select 'no_stray_lines', 'Lines on entries that are not approved', 0,
         (select count(*) from public.commission_lines l join e on e.id = l.entry_id where e.status <> 'approved')::numeric,
         not exists (select 1 from public.commission_lines l join e on e.id = l.entry_id where e.status <> 'approved')
  union all
  select 'refunds_within_sale', 'Sales refunded for more than their net amount', 0,
         (select count(*) from public.commission_entries s where s.kind = 'sale' and s.sale_date between p_from and p_to and s.net_amount <
            (select coalesce(sum(-r.net_amount), 0) from public.commission_entries r where r.original_id = s.id and r.status in ('recorded', 'approved')))::numeric,
         not exists (select 1 from public.commission_entries s where s.kind = 'sale' and s.sale_date between p_from and p_to and s.net_amount <
            (select coalesce(sum(-r.net_amount), 0) from public.commission_entries r where r.original_id = s.id and r.status in ('recorded', 'approved')))
  union all
  select 'payout_totals', 'Payouts whose total differs from their lines', 0,
         (select count(*) from public.commission_payouts py where py.status in ('draft', 'approved', 'paid')
            and py.total_amount <> (select coalesce(sum(l.amount), 0) from public.commission_lines l where l.payout_id = py.id))::numeric,
         not exists (select 1 from public.commission_payouts py where py.status in ('draft', 'approved', 'paid')
            and py.total_amount <> (select coalesce(sum(l.amount), 0) from public.commission_lines l where l.payout_id = py.id))
  union all
  select 'balance', 'Commission = paid + approved + draft payouts + not yet in a payout', (select t from tot), (select paid + approved + draft + open from tot),
         (select t = paid + approved + draft + open from tot)

  union all
  select 'commission_total', 'Approved commission (record)', (select coalesce(sum(commission_total), 0) from ap), (select coalesce(sum(amount), 0) from ln),
         (select coalesce(sum(commission_total), 0) from ap) = (select coalesce(sum(amount), 0) from ln);
$$;
revoke all on function public.commission_reconcile(date, date) from public, anon, authenticated;
grant execute on function public.commission_reconcile(date, date) to service_role;

create or replace function public.commission_balances(p_from date, p_to date)
returns table (recipient_key text, recipient_label text, level text, commission numeric, paid numeric, approved numeric, draft numeric, open numeric, lines int)
language sql stable security definer set search_path = public as $$
  select l.recipient_key, min(l.recipient_label), min(l.level),
         sum(l.amount), coalesce(sum(l.amount) filter (where py.status = 'paid'), 0), coalesce(sum(l.amount) filter (where py.status = 'approved'), 0),
         coalesce(sum(l.amount) filter (where py.status = 'draft'), 0), coalesce(sum(l.amount) filter (where l.payout_id is null), 0), count(*)::int
  from public.commission_lines l
  join public.commission_entries e on e.id = l.entry_id and e.status = 'approved' and e.sale_date between p_from and p_to
  left join public.commission_payouts py on py.id = l.payout_id
  group by l.recipient_key
  order by min(case l.level when 'national' then 0 when 'regional' then 1 when 'provincial' then 2 else 3 end), min(l.recipient_label);
$$;
revoke all on function public.commission_balances(date, date) from public, anon, authenticated;
grant execute on function public.commission_balances(date, date) to service_role;

-- ===========================================================================================================
-- H. Row level security. No browser role can write. The partner sees their own approved figures only.
-- ===========================================================================================================
create or replace function public.commission_entry_mine(e_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.commission_entries e where e.id = e_id and e.partner_user_id = auth.uid() and e.status = 'approved');
$$;
revoke all on function public.commission_entry_mine(uuid) from public, anon;
grant execute on function public.commission_entry_mine(uuid) to authenticated, service_role;

alter table public.commission_rules enable row level security;
alter table public.commission_entries enable row level security;
alter table public.commission_lines enable row level security;
alter table public.commission_payouts enable row level security;
alter table public.commission_history enable row level security;
revoke all on public.commission_rules from anon, authenticated;
revoke all on public.commission_entries from anon, authenticated;
revoke all on public.commission_lines from anon, authenticated;
revoke all on public.commission_payouts from anon, authenticated;
revoke all on public.commission_history from anon, authenticated;

-- Every column except the team-only notes and who approved.
grant select (id, scope, partner_category, partner_user_id, partner_name, appointment_id, offer_id, contract_ref, signed_on, national_pct, regional_pct,
  provincial_pct, city_pct, total_pct, effective_from, effective_to, basis_note, status, approved_at, retired_at, status_reason, created_at, updated_at)
  on public.commission_rules to authenticated;
grant select (id, kind, original_id, partner_user_id, partner_name, partner_category, appointment_id, channel, reference, sale_date, collected_on, buyer_name,
  city_code, region_code, province_code, place_label, gross_amount, deductions, net_amount, description, status, national_pct, regional_pct, provincial_pct,
  city_pct, total_pct, commission_total, approved_at, created_at)
  on public.commission_entries to authenticated;
grant select (id, entry_id, level, recipient_key, recipient_label, pct, amount, created_at) on public.commission_lines to authenticated;
grant select on public.commission_payouts to authenticated;
grant select on public.commission_history to authenticated;

drop policy if exists commission_rules_read on public.commission_rules;
create policy commission_rules_read on public.commission_rules for select to authenticated
  using (public.is_commission_desk()
         or (scope = 'default' and status in ('active', 'retired'))
         or (scope = 'agreement' and partner_user_id = auth.uid() and status in ('active', 'retired')));
drop policy if exists commission_entries_read on public.commission_entries;
create policy commission_entries_read on public.commission_entries for select to authenticated
  using (public.is_commission_desk() or (partner_user_id = auth.uid() and status = 'approved'));
drop policy if exists commission_lines_read on public.commission_lines;
create policy commission_lines_read on public.commission_lines for select to authenticated
  using (public.is_commission_desk() or public.commission_entry_mine(entry_id));
drop policy if exists commission_payouts_read on public.commission_payouts;
create policy commission_payouts_read on public.commission_payouts for select to authenticated using (public.is_commission_desk());
drop policy if exists commission_history_read on public.commission_history;
create policy commission_history_read on public.commission_history for select to authenticated using (public.is_commission_desk());
