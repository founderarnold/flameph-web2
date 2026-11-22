-- Partner accreditation, Step 1: four partner roles and the shared partner application (supplier, service provider,
-- toll manufacturer) with draft and resume, admin verification, rejection reasons and resubmission.
-- Additive: three new tables, four new functions, two new roles rules, new columns on vetting_documents, a size and
-- file-type limit on the private-docs bucket. Two existing rules are widened (role names, document types) and one
-- function is replaced so partner documents are kept apart from business-vetting documents. Nothing is removed or
-- renamed and no existing row changes. Take a backup before applying. Safe to run twice.
-- Undo: supabase/rollback/0031_partner_roles_applications_undo.sql (removes only what this file added).
--
--   roles                    + chapter_coordinator, chapter_tester (both tied to a chapter), national_reviewer, finance
--   partner_applications     one per member per category; every write goes through the flameph.org server
--   partner_reviews          the history: submitted, needs changes, approved, rejected, chapter notes (append-only)
--   partner_profiles         one per accredited member, written only when the national team approves
--   vetting_documents        + purpose 'partner', application_id, more document types, reviewer's OK/problem mark
--
-- Who sees what (row level security, and the same checks on the server):
--   applicant                 only their own application, documents list and the non-internal history
--   founder, admin, national reviewer   every application, document and history; only they decide
--   chapter coordinator       a short list (name, category, town, status) of applications from their chapter, through
--                             partner_chapter_applications(); never documents, contact details or TIN
--   chapter tester, finance   nothing in Step 1 (samples come in Step 5, figures in Step 4)
--   visitors                  nothing
-- The TIN is encrypted by the server; no browser role can read the encrypted value, not even the applicant's own.

-- ===========================================================================================================
-- A. Four partner roles. A chapter coordinator or tester is always tied to one chapter.
-- ===========================================================================================================
alter table public.roles drop constraint if exists roles_role_check;
alter table public.roles add constraint roles_role_check
  check (role in ('super_admin', 'admin', 'chapter_leader', 'editor', 'chapter_coordinator', 'chapter_tester', 'national_reviewer', 'finance'));
alter table public.roles drop constraint if exists roles_partner_chapter_check;
alter table public.roles add constraint roles_partner_chapter_check
  check (role not in ('chapter_coordinator', 'chapter_tester') or chapter_id is not null);

-- Founder, admin and national reviewer: the national team that reviews and decides partner applications.
create or replace function public.is_partner_reviewer() returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_role(array['super_admin', 'admin', 'national_reviewer']);
$$;
revoke all on function public.is_partner_reviewer() from public, anon;
grant execute on function public.is_partner_reviewer() to authenticated, service_role;

-- ===========================================================================================================
-- B. Partner applications
-- ===========================================================================================================
create table if not exists public.partner_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete set null,
  chapter_id uuid references public.chapters(id) on delete set null,
  category text not null check (category in ('supplier', 'service_provider', 'toll_manufacturer')),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'needs_changes', 'approved', 'rejected', 'withdrawn')),
  revision int not null default 1 check (revision between 1 and 50),
  legal_name text check (char_length(legal_name) <= 200),
  trade_name text check (char_length(trade_name) <= 200),
  registration_type text check (registration_type in ('dti', 'sec_corporation', 'sec_partnership', 'cda', 'other')),
  registration_no text check (char_length(registration_no) <= 60),
  tin_enc text check (char_length(tin_enc) <= 400),
  tin_key_id text check (char_length(tin_key_id) <= 40),
  tin_last3 text check (tin_last3 ~ '^[0-9]{3}$'),
  industry text check (char_length(industry) <= 80),
  website text check (char_length(website) <= 300),
  rep_name text check (char_length(rep_name) <= 120),
  rep_position text check (char_length(rep_position) <= 120),
  biz_email text check (char_length(biz_email) <= 200),
  biz_phone text check (char_length(biz_phone) <= 40),
  address_line text check (char_length(address_line) <= 300),
  city text check (char_length(city) <= 100),
  province text check (char_length(province) <= 100),
  coverage text check (coverage in ('city', 'province', 'region', 'national')),
  coverage_areas text check (char_length(coverage_areas) <= 500),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object' and pg_column_size(details) <= 20000),
  privacy_ack_at timestamptz,
  privacy_version text check (char_length(privacy_version) <= 20),
  declaration_at timestamptz,
  submitted_at timestamptz,
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  decision_reasons text[] not null default '{}' check (cardinality(decision_reasons) <= 12),
  decision_note text check (char_length(decision_note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category),
  -- Nothing is sent or approved without the basics, the privacy acknowledgement and the truthful declaration.
  constraint partner_applications_complete check (
    status not in ('submitted', 'approved')
    or (legal_name is not null and registration_type is not null and registration_no is not null and tin_enc is not null
        and rep_name is not null and biz_email is not null and biz_phone is not null and city is not null and province is not null
        and coverage is not null and privacy_ack_at is not null and declaration_at is not null and submitted_at is not null)
  )
);
create index if not exists partner_applications_status on public.partner_applications (status, submitted_at desc);
create index if not exists partner_applications_chapter on public.partner_applications (chapter_id) where chapter_id is not null;

-- Allowed status moves. The applicant moves draft/needs_changes -> submitted, withdraws, or reopens a rejected or
-- withdrawn application as a new draft (revision + 1). Only the national team moves submitted -> needs_changes,
-- approved or rejected (checked on the server, which is the only writer).
create or replace function public.partner_application_guard() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then raise exception 'partner_application: new applications start as draft'; end if;
    return new;
  end if;
  if new.user_id <> old.user_id or new.category <> old.category then raise exception 'partner_application: owner and category are fixed'; end if;
  if new.status = old.status then
    if old.status not in ('draft', 'needs_changes') and (new.legal_name, new.registration_no, new.tin_enc, new.details, new.biz_email, new.rep_name)
       is distinct from (old.legal_name, old.registration_no, old.tin_enc, old.details, old.biz_email, old.rep_name) then
      raise exception 'partner_application: % applications cannot be edited', old.status;
    end if;
    return new;
  end if;
  if not ((old.status, new.status) in (
      ('draft', 'submitted'), ('needs_changes', 'submitted'),
      ('draft', 'withdrawn'), ('submitted', 'withdrawn'), ('needs_changes', 'withdrawn'),
      ('submitted', 'needs_changes'), ('submitted', 'approved'), ('submitted', 'rejected'),
      ('rejected', 'draft'), ('withdrawn', 'draft'))) then
    raise exception 'partner_application: cannot move from % to %', old.status, new.status;
  end if;
  if new.status = 'draft' then new.revision := old.revision + 1; end if;
  return new;
end $$;
drop trigger if exists partner_applications_guard on public.partner_applications;
create trigger partner_applications_guard before insert or update on public.partner_applications
  for each row execute function public.partner_application_guard();

alter table public.partner_applications enable row level security;
revoke all on public.partner_applications from anon, authenticated;
-- Every column except the encrypted TIN and its key id.
grant select (id, user_id, business_id, chapter_id, category, status, revision, legal_name, trade_name, registration_type,
  registration_no, tin_last3, industry, website, rep_name, rep_position, biz_email, biz_phone, address_line, city, province,
  coverage, coverage_areas, details, privacy_ack_at, privacy_version, declaration_at, submitted_at, decided_at, decided_by,
  decision_reasons, decision_note, created_at, updated_at) on public.partner_applications to authenticated;
drop policy if exists partner_applications_read on public.partner_applications;
create policy partner_applications_read on public.partner_applications for select to authenticated
  using (user_id = auth.uid() or public.is_partner_reviewer());

-- ===========================================================================================================
-- C. The history of each application. Nobody can change or quietly delete it; rows go only with their application
--    (when the member's account is erased) or through the retention job.
-- ===========================================================================================================
create table if not exists public.partner_reviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.partner_applications(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('submitted', 'needs_changes', 'approved', 'rejected', 'withdrawn', 'reopened', 'chapter_note', 'doc_checked')),
  revision int not null default 1,
  reasons text[] not null default '{}' check (cardinality(reasons) <= 12),
  note text check (char_length(note) <= 2000),
  internal boolean not null default false,
  snapshot jsonb check (snapshot is null or pg_column_size(snapshot) <= 30000),
  created_at timestamptz not null default now()
);
create index if not exists partner_reviews_app on public.partner_reviews (application_id, created_at);

create or replace function public.partner_reviews_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if current_setting('flameph.retention', true) = 'on' then return old; end if;
    if not exists (select 1 from public.partner_applications a where a.id = old.application_id) then return old; end if;
    raise exception 'append_only: partner_reviews rows cannot be deleted';
  end if;
  if (to_jsonb(new) - 'actor_id') is distinct from (to_jsonb(old) - 'actor_id') then
    raise exception 'append_only: partner_reviews rows cannot be changed';
  end if;
  return new;   -- only actor_id may become empty, when that account is erased
end $$;
drop trigger if exists partner_reviews_append_only on public.partner_reviews;
create trigger partner_reviews_append_only before update or delete on public.partner_reviews
  for each row execute function public.partner_reviews_guard();

alter table public.partner_reviews enable row level security;
revoke all on public.partner_reviews from anon, authenticated;
grant select on public.partner_reviews to authenticated;
drop policy if exists partner_reviews_read on public.partner_reviews;
create policy partner_reviews_read on public.partner_reviews for select to authenticated
  using (public.is_partner_reviewer()
    or (not internal and exists (select 1 from public.partner_applications a where a.id = application_id and a.user_id = auth.uid())));

-- ===========================================================================================================
-- D. Accredited partner profile: one per member, written only by the server when the national team approves.
-- ===========================================================================================================
create table if not exists public.partner_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete set null,
  legal_name text not null check (char_length(legal_name) <= 200),
  categories text[] not null default '{}' check (categories <@ array['supplier', 'service_provider', 'toll_manufacturer']),
  status text not null default 'accredited' check (status in ('accredited', 'suspended')),
  accredited_at timestamptz not null default now(),
  accredited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists partner_profiles_touch on public.partner_profiles;
create trigger partner_profiles_touch before update on public.partner_profiles for each row execute function public.touch_updated_at();
alter table public.partner_profiles enable row level security;
revoke all on public.partner_profiles from anon, authenticated;
grant select on public.partner_profiles to authenticated;
drop policy if exists partner_profiles_read on public.partner_profiles;
create policy partner_profiles_read on public.partner_profiles for select to authenticated
  using (user_id = auth.uid() or public.is_partner_reviewer());

-- ===========================================================================================================
-- E. Chapter coordinators: a short list of the applications from their chapter (no documents, contacts or TIN).
-- ===========================================================================================================
create or replace function public.partner_chapter_applications()
returns table (id uuid, category text, legal_name text, city text, province text, status text, submitted_at timestamptz, chapter_id uuid)
language sql stable security definer set search_path = public as $$
  select a.id, a.category, a.legal_name, a.city, a.province, a.status, a.submitted_at, a.chapter_id
  from public.partner_applications a
  where a.status not in ('draft', 'withdrawn')
    and a.chapter_id in (select r.chapter_id from public.roles r where r.user_id = auth.uid() and r.role = 'chapter_coordinator')
  order by a.submitted_at desc nulls last
  limit 200;
$$;
revoke all on function public.partner_chapter_applications() from public, anon;
grant execute on function public.partner_chapter_applications() to authenticated;

-- ===========================================================================================================
-- F. Partner documents reuse the encrypted vetting document store (0022), kept apart by purpose.
-- ===========================================================================================================
alter table public.vetting_documents add column if not exists purpose text not null default 'vetting';
alter table public.vetting_documents drop constraint if exists vetting_documents_purpose_check;
alter table public.vetting_documents add constraint vetting_documents_purpose_check check (purpose in ('vetting', 'partner'));
alter table public.vetting_documents add column if not exists application_id uuid references public.partner_applications(id) on delete set null;
alter table public.vetting_documents add column if not exists review_status text;
alter table public.vetting_documents drop constraint if exists vetting_documents_review_status_check;
alter table public.vetting_documents add constraint vetting_documents_review_status_check check (review_status is null or review_status in ('ok', 'problem'));
alter table public.vetting_documents add column if not exists reviewed_at timestamptz;
alter table public.vetting_documents add column if not exists reviewed_by uuid references auth.users(id) on delete set null;
alter table public.vetting_documents drop constraint if exists vetting_documents_doc_type_check;
alter table public.vetting_documents add constraint vetting_documents_doc_type_check
  check (doc_type in ('dti_sec', 'mayors_permit', 'bir', 'gov_id', 'fda', 'prc', 'certification', 'other'));
alter table public.vetting_documents drop constraint if exists vetting_documents_partner_check;
alter table public.vetting_documents add constraint vetting_documents_partner_check
  check (purpose = 'vetting' and doc_type in ('dti_sec', 'mayors_permit', 'bir') or purpose = 'partner');
create index if not exists vetting_documents_application on public.vetting_documents (application_id) where application_id is not null;
grant select (purpose, application_id, review_status, reviewed_at) on public.vetting_documents to authenticated;
drop policy if exists vetting_documents_partner_read on public.vetting_documents;
create policy vetting_documents_partner_read on public.vetting_documents for select to authenticated
  using (purpose = 'partner' and public.is_partner_reviewer());

-- Documents due for deletion. Business vetting: as before (switch 4 off, or 1 year after the vetting decision), but
-- only for vetting documents. Partner documents: 1 year after the application was rejected or withdrawn, or at once
-- when their application no longer exists. Switch 4 never deletes partner documents.
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

-- ===========================================================================================================
-- G. The private file store: 5 MB per file at the storage level, and only these file types. Encrypted documents are
--    stored as application/octet-stream; HEIC is kept for photos admins upload from iPhones.
-- ===========================================================================================================
update storage.buckets
   set file_size_limit = 5242880,
       allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/octet-stream']
 where id = 'private-docs';
