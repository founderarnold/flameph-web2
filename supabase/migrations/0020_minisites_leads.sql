-- Phase 5: business identity, mini-sites, directory and leads.
-- Additive only: one new table, three new columns on business_inquiries, and one rule relaxed (an inquiry from a
-- mini-site may arrive before the member has a flameph.org listing, so business_id may be empty for those).
-- Nothing is deleted or renamed. Take a backup before applying to production.
--
-- Mini-sites live in the separate FlamePH Pages app (pages.flameph.org, its own database). The Pages app tells
-- flameph.org, server to server and signed with the shared FLAME PH sign-in secret, which mini-sites a member has
-- published and when a visitor sends a lead. Members are matched by their verified email.

-- ---------------------------------------------------------------------------
-- A member's published mini-sites, as last reported by the Pages app.
-- ---------------------------------------------------------------------------
create table if not exists public.member_minisites (
  site_id uuid primary key,                       -- the site's id in the Pages app
  owner_id uuid not null references auth.users(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  name text not null check (char_length(name) between 1 and 120),
  category text check (category is null or char_length(category) <= 40),
  published boolean not null default false,
  updated_at timestamptz not null default now()
);
create index if not exists member_minisites_owner on public.member_minisites (owner_id) where published;

alter table public.member_minisites enable row level security;
revoke all on public.member_minisites from anon, authenticated;
-- A published mini-site is a public web page, so its name and address may be shown on the member's profile to anyone.
-- Its owner also sees the unpublished ones. Only the server (the Pages sync) writes.
grant select on public.member_minisites to anon, authenticated;
grant select, insert, update on public.member_minisites to service_role;
drop policy if exists member_minisites_read on public.member_minisites;
create policy member_minisites_read on public.member_minisites for select
  using (published or owner_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- Leads from a mini-site join the member's existing Inquiries inbox (Workspace → Messages and inquiries).
-- ---------------------------------------------------------------------------
alter table public.business_inquiries
  add column if not exists source text not null default 'listing',
  add column if not exists external_id text,
  add column if not exists minisite_slug text;
do $$ begin
  alter table public.business_inquiries add constraint business_inquiries_source_check check (source in ('listing', 'minisite'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.business_inquiries add constraint business_inquiries_minisite_slug_len check (minisite_slug is null or char_length(minisite_slug) <= 63);
exception when duplicate_object then null; end $$;
-- The same lead is never saved twice, even if the Pages app sends it again.
create unique index if not exists business_inquiries_external on public.business_inquiries (external_id) where external_id is not null;
-- Listing inquiries still always name the listing.
alter table public.business_inquiries alter column business_id drop not null;
do $$ begin
  alter table public.business_inquiries add constraint business_inquiries_listing_has_business check (source <> 'listing' or business_id is not null);
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Finds a member by verified email, for the Pages sync only (server key). Never callable from the browser.
-- ---------------------------------------------------------------------------
create or replace function public.member_id_for_verified_email(p_email text)
returns uuid language sql stable security definer set search_path = public, auth as $$
  -- Same proof rule as the sign-in hub: a confirmed email that the member has also proven (profiles.email_verified_at).
  select u.id from auth.users u join public.profiles p on p.id = u.id
  where lower(u.email) = lower(btrim(p_email)) and u.email_confirmed_at is not null and p.email_verified_at is not null
  limit 1;
$$;
revoke all on function public.member_id_for_verified_email(text) from public, anon, authenticated;
grant execute on function public.member_id_for_verified_email(text) to service_role;
