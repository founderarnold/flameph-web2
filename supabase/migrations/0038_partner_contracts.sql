-- Partner accreditation, Step 8: contract generation and sign-off. The national team keeps versioned agreement
-- templates (a Master Partner Agreement, a schedule for each kind of partner, and annexes for territory, pricing and
-- commission, service levels and penalties, and intellectual property and the FLAME marks). A template can be used only
-- after a LAWYER has reviewed that version and the national team has approved it.
--
-- For each accredited partner the national team prepares a contract from what is already on record: the chosen Best
-- Offer (supplier, service or FLAME Signature), the FLAME Signature licence, the territorial appointments, the agreed
-- commission split and the penalty terms. A person on the national team does a LEGAL CHECK of that exact version (every
-- item ticked) before it can be sent; nothing is sent, signed or executed automatically. The site then freezes the full
-- text (with its SHA-256 fingerprint) and both sides sign it: first the partner's authorized signatory, then FLAME's
-- signatory (the founder). Signing is either electronic (RA 8792, Electronic Commerce Act: the signer is signed in,
-- confirms their authority, consents to signing electronically and types their full name; the fingerprint, time, IP
-- address and browser are kept) or by a wet-ink signed copy that the team uploads. ELECTRONIC SIGNING STAYS OFF until a
-- lawyer has reviewed the e-signature flow and the founder records that review. Every step is kept in an append-only
-- history. Signed copies are kept 10 years after the contract ends (a lawyer may set another period). Renewal alerts go
-- to the national team and the partner before the end date.
--
-- The contracting parties are MarketplacePH Online Store (the Operator, which handles all commercial contracting and
-- money) and the partner, with FLAME PH as the accrediting community. flameph.org never collects, holds, pays out or
-- moves money: commissions and penalties in a contract are recorded figures; any actual money is handled by
-- MarketplacePH Online Store.
--
-- REUSE / EXTEND (nothing removed or renamed, no existing row changes):
--   partner_profiles, partner_applications (0031)  the partner and its legal details (prefill only)
--   supplier_offers (0032, 0036, 0037)              the chosen Best Offer behind a contract
--   signature_licences (0037)                       the FLAME Signature licence behind a manufacturer's contract
--   territorial_appointments (0033)                 the territory annex
--   commission_rules (0034), partner_penalty_terms (0035) + contract_id: the agreement rate and penalty terms can be
--                                                   started from a SIGNED contract (they keep their own approvals)
--   partner_sanctions (0035)                        a partner on hold or terminated cannot be sent a contract
--   vetting_documents                               new purpose 'contract' (signed copy, proof of authority), encrypted
--   settings                                        key 'contract_esign' (off until the lawyer's review is recorded)
--   partner_only_nulled(), partner_is_national(), is_partner_reviewer(), offer_kind_category()
-- NEW:
--   contract_templates               versioned template texts, lawyer review, approval
--   partner_contracts                one contract per partner per term (with renewals)
--   partner_contract_checks          legal checks of each version (append-only)
--   partner_contract_signatures      the signature audit trail (append-only)
--   partner_contract_history         what happened (append-only)
--
-- Who sees what: the partner sees only their own contracts once they have been sent (never drafts, legal checks, team
-- notes or anyone's IP address); the national team (founder, admin, national reviewer) sees all; chapter roles, finance,
-- other members and visitors see nothing here. No browser role can write: every write goes through the flameph.org
-- server, and the database checks every rule again.
--
-- Take a backup before applying. Safe to run twice. Undo: supabase/rollback/0038_partner_contracts_undo.sql.

-- ===========================================================================================================
-- A. Helpers
-- ===========================================================================================================
-- Today in the Philippines.
create or replace function public.ph_today() returns date language sql stable as $$
  select (now() at time zone 'Asia/Manila')::date
$$;

-- The template parts every contract of this category needs, in order.
create or replace function public.contract_required_parts(cat text) returns text[] language sql immutable as $$
  select array['master',
    case cat when 'service_provider' then 'schedule_service' when 'toll_manufacturer' then 'schedule_manufacturer' else 'schedule_supplier' end,
    'annex_territory', 'annex_pricing', 'annex_sla', 'annex_ip']
$$;

-- The legal check: every item must be ticked to clear a version.
create or replace function public.contract_check_items() returns text[] language sql immutable as $$
  select array['parties_authority', 'schedule_offer', 'territory', 'pricing_commission', 'sla_penalties', 'ip_confidentiality',
    'dates_renewal', 'templates_lawyer']
$$;

-- FLAME's signatory: the founder (super_admin) only.
create or replace function public.contract_flame_signer(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select uid is not null and exists (select 1 from public.roles x where x.user_id = uid and x.role = 'super_admin');
$$;
revoke all on function public.contract_flame_signer(uuid) from public, anon, authenticated;
grant execute on function public.contract_flame_signer(uuid) to service_role;

-- Electronic signing is on only after a lawyer reviewed the e-signature flow and the founder recorded it.
insert into public.settings (key, value, is_public)
select 'contract_esign', '{"enabled": false, "lawyer_name": null, "reviewed_on": null}'::jsonb, false
where not exists (select 1 from public.settings where key = 'contract_esign');

create or replace function public.contract_esign_on() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (s.value->>'enabled')::boolean and coalesce(s.value->>'lawyer_name', '') <> '' and coalesce(s.value->>'reviewed_on', '') <> ''
    from public.settings s where s.key = 'contract_esign'), false);
$$;
revoke all on function public.contract_esign_on() from public, anon;
grant execute on function public.contract_esign_on() to authenticated, service_role;

create or replace function public.settings_contract_esign_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.key = 'contract_esign' then raise exception 'contract_esign: this setting cannot be deleted (switch it off instead)'; end if;
    return old;
  end if;
  if new.key <> 'contract_esign' then return new; end if;
  new.is_public := false;
  if jsonb_typeof(new.value) <> 'object' or jsonb_typeof(new.value->'enabled') <> 'boolean' then
    raise exception 'contract_esign: the value needs "enabled" true or false';
  end if;
  if (new.value->>'enabled')::boolean then
    if coalesce(new.value->>'lawyer_name', '') !~ '^.{3,150}$' or coalesce(new.value->>'reviewed_on', '') !~ '^\d{4}-\d{2}-\d{2}$'
       or (new.value->>'reviewed_on')::date > public.ph_today() then
      raise exception 'contract_esign: switching electronic signing on needs the lawyer''s name and the review date';
    end if;
    if not public.contract_flame_signer(nullif(new.value->>'by', '')::uuid) then
      raise exception 'contract_esign: only the founder switches electronic signing on';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists settings_contract_esign_guard on public.settings;
create trigger settings_contract_esign_guard before insert or update or delete on public.settings
  for each row execute function public.settings_contract_esign_guard();

-- ===========================================================================================================
-- B. Templates (versioned; a version is fixed once approved)
-- ===========================================================================================================
create table if not exists public.contract_templates (
  id uuid primary key default gen_random_uuid(),
  part text not null check (part in ('master', 'schedule_supplier', 'schedule_service', 'schedule_manufacturer', 'annex_territory',
    'annex_pricing', 'annex_sla', 'annex_ip')),
  version text not null check (version ~ '^[0-9]{1,2}\.[0-9]{1,2}$'),
  title text not null check (char_length(title) between 3 and 150),
  body text not null check (char_length(body) between 50 and 60000),
  change_note text check (char_length(change_note) <= 1000),
  status text not null default 'draft' check (status in ('draft', 'approved', 'retired')),
  lawyer_name text check (char_length(lawyer_name) between 3 and 150),   -- the lawyer who reviewed THIS version
  lawyer_reviewed_on date,
  created_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (part, version),
  constraint contract_templates_approved check (status = 'draft' or (lawyer_name is not null and lawyer_reviewed_on is not null and approved_at is not null))
);
create unique index if not exists contract_templates_one_approved on public.contract_templates (part) where status = 'approved';

create or replace function public.contract_template_guard() returns trigger
language plpgsql as $$
declare sys boolean := coalesce(current_setting('flame.contract_system', true), 'off') = 'on';
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then raise exception 'contract_template: an approved or retired version is kept (retire it instead)'; end if;
    if exists (select 1 from public.partner_contracts c where old.id = any(c.template_ids)) then
      raise exception 'contract_template: this version was used in a contract';
    end if;
    return old;
  end if;
  new.updated_at := now();
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then raise exception 'contract_template: new versions start as draft'; end if;
    if new.created_by is null or not public.partner_is_national(new.created_by) then raise exception 'contract_template: only the national team writes templates'; end if;
    new.approved_by := null; new.approved_at := null; new.retired_at := null;
    return new;
  end if;
  if public.partner_only_nulled(to_jsonb(new), to_jsonb(old), array['created_by', 'approved_by']) then return new; end if;
  if new.part <> old.part or new.version <> old.version or new.created_at <> old.created_at or new.created_by is distinct from old.created_by then
    raise exception 'contract_template: the part, version and author are fixed';
  end if;
  if old.status <> 'draft' and (to_jsonb(new) - array['status', 'retired_at', 'updated_at']) is distinct from (to_jsonb(old) - array['status', 'retired_at', 'updated_at']) then
    raise exception 'contract_template: an approved version cannot be changed; write a new version';
  end if;
  if new.status = old.status then
    if old.status = 'draft' and (new.approved_by is not null or new.approved_at is not null) then raise exception 'contract_template: approval goes through the approve step'; end if;
    return new;
  end if;
  if (old.status, new.status) = ('draft', 'approved') then
    if new.approved_by is null or not public.partner_is_national(new.approved_by) then
      raise exception 'contract_template: only the national team approves a template';
    end if;
    if new.lawyer_name is null or new.lawyer_reviewed_on is null or new.lawyer_reviewed_on > public.ph_today() then
      raise exception 'contract_template: record the lawyer who reviewed this version and the date first';
    end if;
    new.approved_at := now();
    -- The version it replaces is retired.
    perform set_config('flame.contract_system', 'on', true);
    update public.contract_templates x set status = 'retired', retired_at = now() where x.part = new.part and x.status = 'approved' and x.id <> new.id;
    perform set_config('flame.contract_system', 'off', true);
    return new;
  end if;
  if (old.status, new.status) = ('approved', 'retired') then
    new.retired_at := now();
    return new;
  end if;
  raise exception 'contract_template: cannot move from % to %', old.status, new.status;
end $$;

-- ===========================================================================================================
-- C. Contracts
-- ===========================================================================================================
create sequence if not exists public.partner_contract_no;
create table if not exists public.partner_contracts (
  id uuid primary key default gen_random_uuid(),
  ref_no text not null unique default ('PC-' || lpad(nextval('public.partner_contract_no')::text, 5, '0')),
  partner_user_id uuid references auth.users(id) on delete set null,
  partner_name text not null check (char_length(partner_name) between 1 and 200),   -- the partner's legal name; kept if the account is erased
  category text not null check (category in ('supplier', 'service_provider', 'toll_manufacturer')),
  offer_id uuid references public.supplier_offers(id) on delete set null,          -- the chosen Best Offer
  licence_id uuid references public.signature_licences(id) on delete set null,     -- the FLAME Signature licence (manufacturers)
  appointment_ids uuid[] not null default '{}' check (cardinality(appointment_ids) <= 30),   -- territorial appointments
  renews_id uuid references public.partner_contracts(id) on delete set null,        -- the contract this one renews
  -- The partner, as a legal party, and its authorized signatory
  party_reg_type text check (party_reg_type in ('dti', 'sec_corporation', 'sec_partnership', 'cda', 'other')),
  party_reg_no text check (char_length(party_reg_no) between 2 and 60),
  party_address text check (char_length(party_address) between 5 and 300),
  signatory_name text check (char_length(signatory_name) between 3 and 120),
  signatory_position text check (char_length(signatory_position) between 2 and 120),
  signatory_authority text check (signatory_authority in ('sole_proprietor', 'board_resolution', 'secretary_certificate',
    'partnership_resolution', 'special_power_of_attorney', 'other')),
  authority_ref text check (char_length(authority_ref) between 3 and 200),           -- e.g. "Board Resolution No. 2026-05, 3 Nov 2026"
  signatory_email text check (char_length(signatory_email) <= 200),
  -- FLAME's signatory for MarketplacePH Online Store
  flame_signatory_name text check (char_length(flame_signatory_name) between 3 and 120),
  flame_signatory_position text check (char_length(flame_signatory_position) between 2 and 120),
  -- Terms
  effective_date date,
  end_date date,
  renewal_notice_days int not null default 60 check (renewal_notice_days between 30 and 180),
  national_pct numeric(5,2) check (national_pct between 0 and 30),     -- the negotiated commission split (a recorded figure)
  regional_pct numeric(5,2) check (regional_pct between 0 and 30),
  provincial_pct numeric(5,2) check (provincial_pct between 0 and 30),
  city_pct numeric(5,2) check (city_pct between 0 and 30),
  late_rate_pct_per_day numeric(5,3) check (late_rate_pct_per_day > 0 and late_rate_pct_per_day <= 5),   -- proposed late-delivery penalty
  late_cap_pct numeric(5,2) check (late_cap_pct > 0 and late_cap_pct <= 50),
  special_terms text check (char_length(special_terms) <= 4000),   -- part of the contract text
  internal_note text check (char_length(internal_note) <= 2000),   -- national team only
  -- Sending and signing
  status text not null default 'draft' check (status in ('draft', 'out_for_signing', 'partner_signed', 'signed', 'ended', 'terminated', 'cancelled')),
  revision int not null default 1 check (revision between 1 and 100),
  template_ids uuid[] not null default '{}' check (cardinality(template_ids) <= 10),
  body text check (char_length(body) <= 300000),   -- the frozen full text that is signed
  body_sha256 text check (body_sha256 ~ '^[0-9a-f]{64}$'),
  sent_at timestamptz,
  sent_by uuid references auth.users(id) on delete set null,
  first_sent_at timestamptz,                        -- the partner can see the contract from then on
  partner_signed_at timestamptz,
  signed_at timestamptz,                            -- both sides signed
  ended_at timestamptz,
  status_reason text check (char_length(status_reason) <= 1000),
  changed_by uuid references auth.users(id) on delete set null,
  renewal_alerted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_contracts_dates check (effective_date is null or end_date is null or (end_date > effective_date and end_date <= effective_date + 1827)),
  constraint partner_contracts_commission check (num_nonnulls(national_pct, regional_pct, provincial_pct, city_pct) in (0, 4)
    and coalesce(national_pct + regional_pct + provincial_pct + city_pct, 1) between 0.01 and 50),
  constraint partner_contracts_penalty check (num_nonnulls(late_rate_pct_per_day, late_cap_pct) in (0, 2) and coalesce(late_cap_pct >= late_rate_pct_per_day, true)),
  constraint partner_contracts_draft check (status <> 'draft' or (body is null and body_sha256 is null and sent_at is null and cardinality(template_ids) = 0)),
  constraint partner_contracts_sent check (status in ('draft', 'cancelled') or (body is not null and body_sha256 is not null and sent_at is not null
    and effective_date is not null and end_date is not null and party_reg_type is not null and party_reg_no is not null and party_address is not null
    and signatory_name is not null and signatory_position is not null and signatory_authority is not null and flame_signatory_name is not null
    and flame_signatory_position is not null and cardinality(template_ids) = 6)),
  constraint partner_contracts_signed check (status not in ('signed', 'ended', 'terminated') or (partner_signed_at is not null and signed_at is not null)),
  constraint partner_contracts_partner_signed check (status <> 'partner_signed' or partner_signed_at is not null),
  constraint partner_contracts_reason check (status not in ('ended', 'terminated', 'cancelled') or status_reason is not null),
  constraint partner_contracts_authority check (signatory_authority is null or signatory_authority = 'sole_proprietor' or authority_ref is not null)
);
create index if not exists partner_contracts_partner on public.partner_contracts (partner_user_id, created_at desc);
create index if not exists partner_contracts_status on public.partner_contracts (status, end_date);
create index if not exists partner_contracts_offer on public.partner_contracts (offer_id) where offer_id is not null;
create index if not exists partner_contracts_licence on public.partner_contracts (licence_id) where licence_id is not null;

-- Legal checks of each version (append-only).
create table if not exists public.partner_contract_checks (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.partner_contracts(id) on delete cascade,
  revision int not null check (revision >= 1),
  outcome text not null check (outcome in ('cleared', 'not_cleared')),
  checklist text[] not null default '{}' check (cardinality(checklist) <= 12),
  note text not null check (char_length(note) between 5 and 2000),
  reviewer_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint partner_contract_checks_items check (checklist <@ public.contract_check_items()),
  constraint partner_contract_checks_cleared check (outcome <> 'cleared' or checklist @> public.contract_check_items())
);
create index if not exists partner_contract_checks_contract on public.partner_contract_checks (contract_id, revision, created_at desc);

-- The signature audit trail (append-only). One signature per side per version.
create table if not exists public.partner_contract_signatures (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.partner_contracts(id) on delete cascade,
  revision int not null check (revision >= 1),
  side text not null check (side in ('partner', 'flame')),
  method text not null check (method in ('electronic', 'wet_ink')),
  signer_user_id uuid references auth.users(id) on delete set null,   -- electronic: the signed-in signer
  recorded_by uuid references auth.users(id) on delete set null,      -- wet ink: the team member who uploaded the signed copy
  signer_name text not null check (char_length(signer_name) between 3 and 120),
  signer_position text not null check (char_length(signer_position) between 2 and 120),
  typed_name text check (char_length(typed_name) between 3 and 120),
  authority_confirmed boolean not null default false,
  consent_esign boolean not null default false,
  body_sha256 text not null check (body_sha256 ~ '^[0-9a-f]{64}$'),   -- the fingerprint of the text that was signed
  document_id uuid references public.vetting_documents(id) on delete set null,   -- wet ink: the signed copy
  signed_on date,                                                      -- wet ink: the date on the paper
  ip text check (char_length(ip) <= 64),
  user_agent text check (char_length(user_agent) <= 300),
  signed_at timestamptz not null default now(),
  unique (contract_id, revision, side),
  constraint partner_contract_signatures_electronic check (method <> 'electronic' or (signer_user_id is not null and typed_name is not null
    and authority_confirmed and consent_esign)),
  constraint partner_contract_signatures_wet check (method <> 'wet_ink' or (recorded_by is not null and signed_on is not null))
);
create index if not exists partner_contract_signatures_contract on public.partner_contract_signatures (contract_id, revision);

create table if not exists public.partner_contract_history (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.partner_contracts(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('created', 'changed', 'legal_check', 'sent', 'returned', 'changes_asked', 'partner_signed', 'signed',
    'ended', 'terminated', 'cancelled', 'renewal_alert', 'renewal_started', 'file_added', 'file_removed', 'rate_started', 'team_note')),
  note text check (char_length(note) <= 2000),
  internal boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists partner_contract_history_contract on public.partner_contract_history (contract_id, created_at);

-- ===========================================================================================================
-- D. Rules the database enforces, whoever writes
-- ===========================================================================================================
-- What a contract points at must belong to the partner and fit the category. Returns null when fine, or the reason.
create or replace function public.partner_contract_problem(c public.partner_contracts) returns text
language plpgsql stable security definer set search_path = public as $$
declare o record; n int;
begin
  if c.partner_user_id is null then return 'the partner''s account no longer exists'; end if;
  if not exists (select 1 from public.partner_profiles p where p.user_id = c.partner_user_id and p.status = 'accredited' and c.category = any(p.categories)) then
    return 'the partner must be accredited in this category';
  end if;
  if c.offer_id is not null then
    select s.user_id, s.kind, s.status into o from public.supplier_offers s where s.id = c.offer_id;
    if not found or o.user_id <> c.partner_user_id then return 'the Best Offer must be this partner''s'; end if;
    if public.offer_kind_category(o.kind) <> c.category then return 'the Best Offer is for another kind of partner'; end if;
    if o.status <> 'selected' then return 'the Best Offer must be chosen (selected)'; end if;
  end if;
  if c.licence_id is not null then
    if c.category <> 'toll_manufacturer' then return 'only a toll manufacturer''s contract takes a FLAME Signature licence'; end if;
    if not exists (select 1 from public.signature_licences l where l.id = c.licence_id and l.partner_user_id = c.partner_user_id and l.status <> 'cancelled') then
      return 'the FLAME Signature licence must be this manufacturer''s';
    end if;
  end if;
  select count(*) into n from public.territorial_appointments a
    where a.id = any(c.appointment_ids) and a.partner_user_id = c.partner_user_id and a.partner_category = c.category and a.status in ('draft', 'active', 'suspended');
  if n <> cardinality(c.appointment_ids) then return 'every territory must be one of this partner''s appointments in this category (not ended or cancelled)'; end if;
  if c.renews_id is not null and not exists (select 1 from public.partner_contracts r where r.id = c.renews_id and r.partner_user_id = c.partner_user_id
       and r.category = c.category and r.status in ('signed', 'ended')) then
    return 'a renewal must follow a signed contract of the same partner and category';
  end if;
  return null;
end $$;
revoke all on function public.partner_contract_problem(public.partner_contracts) from public, anon, authenticated;
grant execute on function public.partner_contract_problem(public.partner_contracts) to service_role;

-- The latest legal check of this version cleared it.
create or replace function public.partner_contract_cleared(cid uuid, rev int) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select k.outcome = 'cleared' from public.partner_contract_checks k where k.contract_id = cid and k.revision = rev
    order by k.created_at desc, k.id desc limit 1), false);
$$;
revoke all on function public.partner_contract_cleared(uuid, int) from public, anon, authenticated;
grant execute on function public.partner_contract_cleared(uuid, int) to service_role;

create or replace function public.partner_contract_guard() returns trigger
language plpgsql as $$
declare
  sys boolean := coalesce(current_setting('flame.contract_system', true), 'off') = 'on';
  problem text; n int;
  content text[] := array['partner_name', 'offer_id', 'licence_id', 'appointment_ids', 'renews_id', 'party_reg_type', 'party_reg_no',
    'party_address', 'signatory_name', 'signatory_position', 'signatory_authority', 'authority_ref', 'signatory_email', 'flame_signatory_name',
    'flame_signatory_position', 'effective_date', 'end_date', 'renewal_notice_days', 'national_pct', 'regional_pct', 'provincial_pct', 'city_pct',
    'late_rate_pct_per_day', 'late_cap_pct', 'special_terms'];
  send_cols text[] := array['status', 'template_ids', 'body', 'body_sha256', 'sent_at', 'sent_by', 'first_sent_at', 'revision', 'status_reason', 'changed_by'];
begin
  if tg_op = 'DELETE' then
    if old.status = 'draft' and old.first_sent_at is null
       and not exists (select 1 from public.partner_contract_checks k where k.contract_id = old.id) then
      return old;
    end if;
    raise exception 'partner_contract: a contract that was checked or sent is kept (cancel it instead)';
  end if;
  new.updated_at := now();
  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.revision <> 1 then raise exception 'partner_contract: new contracts start as draft'; end if;
    if new.created_by is null or not public.partner_is_national(new.created_by) then raise exception 'partner_contract: only the national team prepares contracts'; end if;
    if new.created_by = new.partner_user_id then raise exception 'partner_contract: nobody prepares a contract with their own business'; end if;
    new.first_sent_at := null; new.partner_signed_at := null; new.signed_at := null; new.ended_at := null; new.renewal_alerted_at := null;
    problem := public.partner_contract_problem(new);
    if problem is not null then raise exception 'partner_contract: %', problem; end if;
    if (select count(*) from public.partner_contracts c where c.partner_user_id = new.partner_user_id and c.status not in ('ended', 'terminated', 'cancelled')) >= 10 then
      raise exception 'partner_contract: limit of 10 open contracts per partner';
    end if;
    return new;
  end if;
  -- An account being erased only empties a person (the contract itself is kept).
  if public.partner_only_nulled(to_jsonb(new), to_jsonb(old), array['partner_user_id', 'offer_id', 'licence_id', 'renews_id', 'sent_by', 'changed_by', 'created_by']) then
    return new;
  end if;
  if new.ref_no <> old.ref_no or new.created_at <> old.created_at or new.created_by is distinct from old.created_by
     or new.partner_user_id is distinct from old.partner_user_id or new.category <> old.category then
    raise exception 'partner_contract: the number, partner, category and author are fixed';
  end if;
  if new.first_sent_at is distinct from old.first_sent_at and not (old.first_sent_at is null and new.status = 'out_for_signing') then
    raise exception 'partner_contract: the first sending time is fixed';
  end if;

  if new.status = old.status then
    if old.status <> 'draft' then
      -- After sending, only the team note and the renewal alert stamp change.
      if (to_jsonb(new) - array['updated_at', 'internal_note', 'renewal_alerted_at']) is distinct from (to_jsonb(old) - array['updated_at', 'internal_note', 'renewal_alerted_at']) then
        raise exception 'partner_contract: only a draft can be changed (take it back to draft first)';
      end if;
      return new;
    end if;
    if (to_jsonb(new) - content - 'internal_note' - 'updated_at' - 'revision') is distinct from (to_jsonb(old) - content - 'internal_note' - 'updated_at' - 'revision') then
      raise exception 'partner_contract: sending and signing go through their own steps';
    end if;
    if new.revision <> old.revision then raise exception 'partner_contract: the version number changes only by itself'; end if;
    -- A change to the content after a legal check makes a new version, so the check has to be done again.
    if (select jsonb_object_agg(k, to_jsonb(new)->k) from unnest(content) k) is distinct from (select jsonb_object_agg(k, to_jsonb(old)->k) from unnest(content) k)
       and exists (select 1 from public.partner_contract_checks k where k.contract_id = old.id and k.revision = old.revision) then
      new.revision := old.revision + 1;
    end if;
    problem := public.partner_contract_problem(new);
    if problem is not null then raise exception 'partner_contract: %', problem; end if;
    return new;
  end if;

  -- Status changes. Nothing but the sending/status columns may change at the same time.
  if (to_jsonb(new) - send_cols - array['updated_at', 'internal_note', 'partner_signed_at', 'signed_at', 'ended_at'])
     is distinct from (to_jsonb(old) - send_cols - array['updated_at', 'internal_note', 'partner_signed_at', 'signed_at', 'ended_at']) then
    raise exception 'partner_contract: change the content while it is a draft';
  end if;
  if not ((old.status, new.status) in (('draft', 'out_for_signing'), ('out_for_signing', 'draft'), ('partner_signed', 'draft'),
      ('out_for_signing', 'partner_signed'), ('partner_signed', 'signed'), ('signed', 'ended'), ('signed', 'terminated'),
      ('draft', 'cancelled'), ('out_for_signing', 'cancelled'), ('partner_signed', 'cancelled'))) then
    raise exception 'partner_contract: cannot move from % to %', old.status, new.status;
  end if;

  if new.status in ('partner_signed', 'signed') then
    -- Only the signature step moves a contract here.
    if not sys then raise exception 'partner_contract: a contract is signed only through a signature'; end if;
    if new.status = 'partner_signed' then new.partner_signed_at := now(); else new.signed_at := now(); end if;
    return new;
  end if;
  if new.partner_signed_at is distinct from old.partner_signed_at or new.signed_at is distinct from old.signed_at then
    raise exception 'partner_contract: signing times are set by the signature step';
  end if;

  if new.status = 'out_for_signing' then
    -- A person on the national team (never the partner) sends it, after a cleared legal check of THIS version, with the
    -- approved template versions; the text is frozen here and its fingerprint is worked out by the database.
    if new.sent_by is null or not public.partner_is_national(new.sent_by) or new.sent_by = new.partner_user_id then
      raise exception 'partner_contract: only the national team sends a contract, never for their own business';
    end if;
    if new.revision <> old.revision then raise exception 'partner_contract: the version number changes only by itself'; end if;
    if not public.partner_contract_cleared(new.id, new.revision) then
      raise exception 'partner_contract: a legal check must clear this version before it is sent';
    end if;
    select count(*) into n from public.contract_templates t
      where t.id = any(new.template_ids) and t.status = 'approved' and t.part = any(public.contract_required_parts(new.category));
    if n <> 6 or cardinality(new.template_ids) <> 6
       or (select count(distinct t.part) from public.contract_templates t where t.id = any(new.template_ids)) <> 6 then
      raise exception 'partner_contract: every part of the contract needs a template version that a lawyer reviewed and the team approved';
    end if;
    if new.body is null or char_length(new.body) < 500 then raise exception 'partner_contract: the contract text is missing'; end if;
    if new.end_date <= public.ph_today() then raise exception 'partner_contract: the end date has passed'; end if;
    problem := public.partner_contract_problem(new);
    if problem is not null then raise exception 'partner_contract: %', problem; end if;
    if exists (select 1 from public.partner_sanctions x where x.partner_user_id = new.partner_user_id and x.status = 'active' and x.level in ('hold', 'termination')) then
      raise exception 'partner_contract: the partner is on hold or terminated';
    end if;
    new.body_sha256 := encode(sha256(convert_to(new.body, 'UTF8')), 'hex');
    new.sent_at := now();
    new.first_sent_at := coalesce(old.first_sent_at, now());
    new.status_reason := null;
    return new;
  end if;

  if new.status = 'draft' then
    -- Taken back to change it, or the partner asked for changes: a new version; the frozen text and checks no longer apply.
    if new.changed_by is null or not (public.partner_is_national(new.changed_by) or new.changed_by = new.partner_user_id) then
      raise exception 'partner_contract: only the national team or the partner sends a contract back to draft';
    end if;
    if new.changed_by = new.partner_user_id and old.status <> 'out_for_signing' then
      raise exception 'partner_contract: the partner can ask for changes only before signing';
    end if;
    if new.status_reason is null then raise exception 'partner_contract: say what should change'; end if;
    new.revision := old.revision + 1;
    new.body := null; new.body_sha256 := null; new.template_ids := '{}'; new.sent_at := null; new.sent_by := null;
    new.partner_signed_at := null;
    return new;
  end if;

  -- Ending, termination and cancellation: the national team, never for their own business, with the reason.
  if new.changed_by is null or not public.partner_is_national(new.changed_by) or new.changed_by = new.partner_user_id then
    raise exception 'partner_contract: only the national team ends, terminates or cancels a contract';
  end if;
  if new.status_reason is null then raise exception 'partner_contract: give the reason'; end if;
  if new.status in ('ended', 'terminated') then new.ended_at := now(); end if;
  if new.status = 'terminated' and not exists (select 1 from public.partner_sanctions x where x.partner_user_id = old.partner_user_id
       and x.level = 'termination' and x.status = 'active') then
    raise exception 'partner_contract: termination follows an approved termination sanction (Admin > Partners > Sanctions); otherwise end the contract';
  end if;
  return new;
end $$;
drop trigger if exists partner_contracts_guard on public.partner_contracts;
create trigger partner_contracts_guard before insert or update or delete on public.partner_contracts
  for each row execute function public.partner_contract_guard();

drop trigger if exists contract_templates_guard on public.contract_templates;
create trigger contract_templates_guard before insert or update or delete on public.contract_templates
  for each row execute function public.contract_template_guard();

-- Legal checks: append-only; only on a draft, on its current version; by the national team, never on their own business.
create or replace function public.partner_contract_check_guard() returns trigger
language plpgsql as $$
declare c record;
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.partner_contracts x where x.id = old.contract_id) then return old; end if;
    raise exception 'partner_contract_check: legal checks cannot be deleted';
  end if;
  if tg_op = 'UPDATE' then
    if public.partner_only_nulled(to_jsonb(new), to_jsonb(old), array['reviewer_id']) then return new; end if;
    raise exception 'partner_contract_check: legal checks cannot be changed; add a new one';
  end if;
  select x.status, x.revision, x.partner_user_id into c from public.partner_contracts x where x.id = new.contract_id;
  if c.status <> 'draft' then raise exception 'partner_contract_check: a contract is checked while it is a draft'; end if;
  if new.revision <> c.revision then raise exception 'partner_contract_check: check the current version'; end if;
  if new.reviewer_id is null or not public.partner_is_national(new.reviewer_id) or new.reviewer_id = c.partner_user_id then
    raise exception 'partner_contract_check: only the national team does the legal check, never on their own business';
  end if;
  new.created_at := now();
  return new;
end $$;
drop trigger if exists partner_contract_checks_guard on public.partner_contract_checks;
create trigger partner_contract_checks_guard before insert or update or delete on public.partner_contract_checks
  for each row execute function public.partner_contract_check_guard();

-- Signatures: in order (partner first, then FLAME), on the frozen text of the current version only.
create or replace function public.partner_contract_signature_guard() returns trigger
language plpgsql as $$
declare c record;
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.partner_contracts x where x.id = old.contract_id) then return old; end if;
    raise exception 'partner_contract_signature: signatures cannot be deleted';
  end if;
  if tg_op = 'UPDATE' then
    if public.partner_only_nulled(to_jsonb(new), to_jsonb(old), array['signer_user_id', 'recorded_by', 'document_id']) then return new; end if;
    raise exception 'partner_contract_signature: signatures cannot be changed';
  end if;
  select x.* into c from public.partner_contracts x where x.id = new.contract_id for update;
  if not found then raise exception 'partner_contract_signature: no such contract'; end if;
  if new.revision <> c.revision or new.body_sha256 is distinct from c.body_sha256 then
    raise exception 'partner_contract_signature: the text changed; sign the current version';
  end if;
  if new.side = 'partner' and c.status <> 'out_for_signing' then raise exception 'partner_contract_signature: the partner signs while the contract is out for signing'; end if;
  if new.side = 'flame' and c.status <> 'partner_signed' then raise exception 'partner_contract_signature: FLAME signs after the partner'; end if;
  if new.method = 'electronic' then
    if not public.contract_esign_on() then
      raise exception 'partner_contract_signature: electronic signing is off until a lawyer reviews it; use a wet-ink signed copy';
    end if;
    if new.side = 'partner' and new.signer_user_id is distinct from c.partner_user_id then
      raise exception 'partner_contract_signature: only the partner''s own account signs for the partner';
    end if;
    if new.side = 'flame' and (not public.contract_flame_signer(new.signer_user_id) or new.signer_user_id = c.partner_user_id) then
      raise exception 'partner_contract_signature: only the founder signs for FLAME, never for their own business';
    end if;
    if lower(regexp_replace(btrim(new.typed_name), '\s+', ' ', 'g')) <>
       lower(regexp_replace(btrim(case new.side when 'partner' then c.signatory_name else c.flame_signatory_name end), '\s+', ' ', 'g')) then
      raise exception 'partner_contract_signature: type the signatory''s full name exactly as written in the contract';
    end if;
    new.recorded_by := null; new.document_id := null; new.signed_on := public.ph_today();
  else
    if new.recorded_by is null or not public.partner_is_national(new.recorded_by) or new.recorded_by = c.partner_user_id then
      raise exception 'partner_contract_signature: only the national team records a wet-ink signature, never for their own business';
    end if;
    if new.side = 'flame' and not public.contract_flame_signer(new.recorded_by) then
      raise exception 'partner_contract_signature: only the founder records FLAME''s own signature';
    end if;
    if not exists (select 1 from public.vetting_documents d where d.id = new.document_id and d.purpose = 'contract' and d.contract_id = c.id
         and d.doc_type = 'signed_contract' and d.deleted_at is null) then
      raise exception 'partner_contract_signature: upload the signed copy first';
    end if;
    if new.signed_on > public.ph_today() or new.signed_on < (c.sent_at at time zone 'Asia/Manila')::date then
      raise exception 'partner_contract_signature: the signing date must be between sending and today';
    end if;
    new.signer_user_id := null; new.typed_name := null; new.consent_esign := false; new.ip := null; new.user_agent := null;
  end if;
  new.signer_name := case new.side when 'partner' then c.signatory_name else c.flame_signatory_name end;
  new.signer_position := case new.side when 'partner' then c.signatory_position else c.flame_signatory_position end;
  new.signed_at := now();
  return new;
end $$;
drop trigger if exists partner_contract_signatures_guard on public.partner_contract_signatures;
create trigger partner_contract_signatures_guard before insert or update or delete on public.partner_contract_signatures
  for each row execute function public.partner_contract_signature_guard();

create or replace function public.partner_contract_signature_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('flame.contract_system', 'on', true);
  update public.partner_contracts set status = case new.side when 'partner' then 'partner_signed' else 'signed' end where id = new.contract_id;
  perform set_config('flame.contract_system', 'off', true);
  insert into public.partner_contract_history (contract_id, actor_id, action, note)
  values (new.contract_id, coalesce(new.signer_user_id, new.recorded_by), case new.side when 'partner' then 'partner_signed' else 'signed' end,
    case new.method when 'electronic' then 'Signed electronically by ' else 'Wet-ink signed copy recorded for ' end || new.signer_name || ' (' || new.signer_position || ')');
  return new;
end $$;
revoke all on function public.partner_contract_signature_after() from public, anon, authenticated;
drop trigger if exists partner_contract_signatures_after on public.partner_contract_signatures;
create trigger partner_contract_signatures_after after insert on public.partner_contract_signatures
  for each row execute function public.partner_contract_signature_after();

-- History is append-only (an account being erased only empties the actor).
create or replace function public.partner_contract_history_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.partner_contracts c where c.id = old.contract_id) then return old; end if;
    raise exception 'partner_contract_history: history cannot be deleted';
  end if;
  if public.partner_only_nulled(to_jsonb(new), to_jsonb(old), array['actor_id']) then return new; end if;
  raise exception 'partner_contract_history: history cannot be changed';
end $$;
drop trigger if exists partner_contract_history_guard on public.partner_contract_history;
create trigger partner_contract_history_guard before update or delete on public.partner_contract_history
  for each row execute function public.partner_contract_history_guard();

-- Signed contracts whose renewal notice period has started and that have not been alerted or renewed yet.
create or replace function public.partner_contracts_renewal_due()
returns table (id uuid, ref_no text, partner_user_id uuid, partner_name text, end_date date, days_left int)
language sql stable security definer set search_path = public as $$
  select c.id, c.ref_no, c.partner_user_id, c.partner_name, c.end_date, (c.end_date - public.ph_today())::int
  from public.partner_contracts c
  where c.status = 'signed' and c.renewal_alerted_at is null and c.end_date - c.renewal_notice_days <= public.ph_today()
    and not exists (select 1 from public.partner_contracts r where r.renews_id = c.id and r.status <> 'cancelled')
  order by c.end_date
  limit 200;
$$;
revoke all on function public.partner_contracts_renewal_due() from public, anon, authenticated;
grant execute on function public.partner_contracts_renewal_due() to service_role;

-- ===========================================================================================================
-- E. The agreement rate (0034) and penalty terms (0035) can be started from a SIGNED contract: the contract number and
--    signing date then come from the contract. They keep their own approval steps.
-- ===========================================================================================================
alter table public.commission_rules add column if not exists contract_id uuid references public.partner_contracts(id) on delete set null;
alter table public.partner_penalty_terms add column if not exists contract_id uuid references public.partner_contracts(id) on delete set null;
create index if not exists commission_rules_contract on public.commission_rules (contract_id) where contract_id is not null;
create index if not exists partner_penalty_terms_contract on public.partner_penalty_terms (contract_id) where contract_id is not null;

create or replace function public.partner_contract_link_guard() returns trigger
language plpgsql as $$
declare c record;
begin
  if new.contract_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.contract_id is not distinct from old.contract_id then return new; end if;
  select x.status, x.partner_user_id, x.category, x.ref_no, x.signed_at into c from public.partner_contracts x where x.id = new.contract_id;
  if not found or c.status <> 'signed' then raise exception 'contract_link: the contract must be signed by both sides'; end if;
  if new.scope <> 'agreement' or new.partner_user_id is distinct from c.partner_user_id then
    raise exception 'contract_link: the rate or terms must be an agreement with the same partner';
  end if;
  if tg_table_name = 'commission_rules' and to_jsonb(new)->>'partner_category' <> c.category then
    raise exception 'contract_link: the commission category must match the contract';
  end if;
  new.contract_ref := c.ref_no;
  new.signed_on := (c.signed_at at time zone 'Asia/Manila')::date;
  return new;
end $$;
-- Named to run before the existing guards (triggers run in name order).
drop trigger if exists commission_rules_a_contract on public.commission_rules;
create trigger commission_rules_a_contract before insert or update of contract_id on public.commission_rules
  for each row execute function public.partner_contract_link_guard();
drop trigger if exists partner_penalty_terms_a_contract on public.partner_penalty_terms;
create trigger partner_penalty_terms_a_contract before insert or update of contract_id on public.partner_penalty_terms
  for each row execute function public.partner_contract_link_guard();
grant select (contract_id) on public.commission_rules to authenticated;
grant select (contract_id) on public.partner_penalty_terms to authenticated;

-- ===========================================================================================================
-- F. Row level security: the partner sees their own contracts once sent; the national team sees all; nobody else sees
--    anything. No browser role can write.
-- ===========================================================================================================
create or replace function public.partner_contract_mine(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.partner_contracts c where c.id = cid and c.partner_user_id = auth.uid() and c.first_sent_at is not null);
$$;
revoke all on function public.partner_contract_mine(uuid) from public, anon;
grant execute on function public.partner_contract_mine(uuid) to authenticated, service_role;

alter table public.contract_templates enable row level security;
alter table public.partner_contracts enable row level security;
alter table public.partner_contract_checks enable row level security;
alter table public.partner_contract_signatures enable row level security;
alter table public.partner_contract_history enable row level security;
revoke all on public.contract_templates, public.partner_contracts, public.partner_contract_checks, public.partner_contract_signatures,
  public.partner_contract_history from anon, authenticated;
grant select on public.contract_templates, public.partner_contract_checks to authenticated;
-- Every contract column except the team-only note.
grant select (id, ref_no, partner_user_id, partner_name, category, offer_id, licence_id, appointment_ids, renews_id, party_reg_type, party_reg_no,
  party_address, signatory_name, signatory_position, signatory_authority, authority_ref, signatory_email, flame_signatory_name, flame_signatory_position,
  effective_date, end_date, renewal_notice_days, national_pct, regional_pct, provincial_pct, city_pct, late_rate_pct_per_day, late_cap_pct,
  special_terms, status, revision, template_ids, body, body_sha256, sent_at, first_sent_at, partner_signed_at, signed_at, ended_at, status_reason,
  renewal_alerted_at, created_at, updated_at) on public.partner_contracts to authenticated;
-- Every signature column except the IP address and browser (the team reads them on the server).
grant select (id, contract_id, revision, side, method, signer_name, signer_position, typed_name, authority_confirmed, consent_esign, body_sha256,
  signed_on, signed_at) on public.partner_contract_signatures to authenticated;
grant select (id, contract_id, action, note, internal, created_at) on public.partner_contract_history to authenticated;

drop policy if exists contract_templates_read on public.contract_templates;
create policy contract_templates_read on public.contract_templates for select to authenticated using (public.is_partner_reviewer());
drop policy if exists partner_contracts_read on public.partner_contracts;
create policy partner_contracts_read on public.partner_contracts for select to authenticated
  using (public.is_partner_reviewer() or (partner_user_id = auth.uid() and first_sent_at is not null));
drop policy if exists partner_contract_checks_read on public.partner_contract_checks;
create policy partner_contract_checks_read on public.partner_contract_checks for select to authenticated using (public.is_partner_reviewer());
drop policy if exists partner_contract_signatures_read on public.partner_contract_signatures;
create policy partner_contract_signatures_read on public.partner_contract_signatures for select to authenticated
  using (public.is_partner_reviewer() or public.partner_contract_mine(contract_id));
drop policy if exists partner_contract_history_read on public.partner_contract_history;
create policy partner_contract_history_read on public.partner_contract_history for select to authenticated
  using (public.is_partner_reviewer() or (not internal and public.partner_contract_mine(contract_id)));

-- ===========================================================================================================
-- G. Files: the signed copy and the proof of the signatory's authority (board resolution, secretary's certificate,
--    special power of attorney). Encrypted like every partner file. Kept 10 years after the contract ends; a draft that
--    was never signed keeps them 1 year after it was cancelled. A lawyer may set other periods.
-- ===========================================================================================================
alter table public.vetting_documents add column if not exists contract_id uuid references public.partner_contracts(id) on delete set null;
create index if not exists vetting_documents_contract on public.vetting_documents (contract_id) where contract_id is not null;
alter table public.vetting_documents drop constraint if exists vetting_documents_purpose_check;
alter table public.vetting_documents add constraint vetting_documents_purpose_check check (purpose in ('vetting', 'partner', 'offer', 'sample', 'complaint', 'batch', 'contract'));
alter table public.vetting_documents drop constraint if exists vetting_documents_doc_type_check;
alter table public.vetting_documents add constraint vetting_documents_doc_type_check
  check (doc_type in ('dti_sec', 'mayors_permit', 'bir', 'gov_id', 'fda', 'prc', 'certification', 'other', 'product_photo', 'price_list', 'spec_sheet',
    'sample_photo', 'evidence_photo', 'receipt', 'portfolio', 'cpr', 'lab_report', 'packaging_art', 'coa', 'batch_photo', 'signed_contract', 'authority_proof'));
alter table public.vetting_documents drop constraint if exists vetting_documents_partner_check;
alter table public.vetting_documents add constraint vetting_documents_partner_check
  check (purpose = 'vetting' and doc_type in ('dti_sec', 'mayors_permit', 'bir')
      or purpose = 'partner' and doc_type in ('dti_sec', 'mayors_permit', 'bir', 'gov_id', 'fda', 'prc', 'certification', 'other')
      or purpose = 'offer' and doc_type in ('product_photo', 'price_list', 'spec_sheet', 'certification', 'fda', 'other', 'portfolio', 'prc', 'cpr', 'lab_report', 'packaging_art')
      or purpose = 'sample' and doc_type in ('sample_photo', 'other')
      or purpose = 'complaint' and doc_type in ('evidence_photo', 'receipt', 'other')
      or purpose = 'batch' and doc_type in ('coa', 'lab_report', 'batch_photo', 'other')
      or purpose = 'contract' and doc_type in ('signed_contract', 'authority_proof', 'other'));
grant select (contract_id) on public.vetting_documents to authenticated;
drop policy if exists vetting_documents_contract_read on public.vetting_documents;
create policy vetting_documents_contract_read on public.vetting_documents for select to authenticated
  using (purpose = 'contract' and (public.is_partner_reviewer() or public.partner_contract_mine(contract_id)));

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
    and (b.id is null or b.expiry_on < current_date - interval '3 years')
  union all
  select d.id, d.file_path, 'retention'
  from public.vetting_documents d
  left join public.partner_contracts k on k.id = d.contract_id
  where d.deleted_at is null and d.purpose = 'contract'
    and (k.id is null
      or (k.status in ('ended', 'terminated') and greatest(k.ended_at::date, coalesce(k.end_date, k.ended_at::date)) < current_date - interval '10 years')
      or (k.status = 'signed' and k.end_date < current_date - interval '10 years')
      or (k.status = 'cancelled' and k.updated_at < now() - interval '1 year'));
$$;
revoke all on function public.vetting_documents_due() from public, anon, authenticated;
grant execute on function public.vetting_documents_due() to service_role;

revoke all on function public.contract_required_parts(text) from public, anon;
grant execute on function public.contract_required_parts(text) to authenticated, service_role;
revoke all on function public.contract_check_items() from public, anon;
grant execute on function public.contract_check_items() to authenticated, service_role;
revoke all on function public.ph_today() from public, anon;
grant execute on function public.ph_today() to authenticated, service_role;
