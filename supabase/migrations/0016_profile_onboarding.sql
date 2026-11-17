-- Phase 3A: profile completion, first-run onboarding, follows and privacy controls.
-- Additive only: new columns with safe defaults and two new tables. Take a backup before applying to production.

-- Member profile: the industries they care about, their chapter, and when they finished first-run onboarding.
alter table public.profiles
  add column if not exists industries text[] not null default '{}',
  add column if not exists chapter_id uuid references public.chapters(id) on delete set null,
  add column if not exists onboarded_at timestamptz;
do $$ begin
  alter table public.profiles add constraint profiles_industries_count check (cardinality(industries) <= 10);
exception when duplicate_object then null; end $$;

-- Business profile: a more specific industry, the chapter, and who can see each group of details.
-- field_visibility holds {"group": "public" | "members"}; a missing group means the default (see src/lib/privacy.ts).
alter table public.businesses
  add column if not exists subsector text,
  add column if not exists chapter_id uuid references public.chapters(id) on delete set null,
  add column if not exists field_visibility jsonb not null default '{}'::jsonb;
do $$ begin
  alter table public.businesses add constraint businesses_subsector_length check (subsector is null or char_length(subsector) <= 80);
exception when duplicate_object then null; end $$;
create or replace function public.valid_field_visibility(j jsonb) returns boolean
language sql immutable set search_path = public as $$
  select jsonb_typeof(j) = 'object'
    and not exists (select 1 from jsonb_each(j) e where e.value not in ('"public"'::jsonb, '"members"'::jsonb));
$$;
do $$ begin
  alter table public.businesses add constraint businesses_field_visibility_shape check (public.valid_field_visibility(field_visibility));
exception when duplicate_object then null; end $$;

-- Optional registration numbers. Kept out of the businesses table so they are never in a public row:
-- only the owner and FLAME PH admins can read this table. Others see what the owner allows through
-- business_registration_view(), and never the TIN.
create table if not exists public.business_registrations (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  dti_bn text check (dti_bn is null or char_length(dti_bn) <= 40),
  sec_reg text check (sec_reg is null or char_length(sec_reg) <= 40),
  cda_reg text check (cda_reg is null or char_length(cda_reg) <= 40),
  bmbe_cert text check (bmbe_cert is null or char_length(bmbe_cert) <= 40),
  mayors_permit text check (mayors_permit is null or char_length(mayors_permit) <= 40),
  bir_tin text check (bir_tin is null or char_length(bir_tin) <= 20),
  visibility text not null default 'private' check (visibility in ('public', 'members', 'private')),
  updated_at timestamptz not null default now()
);
drop trigger if exists business_registrations_touch on public.business_registrations;
create trigger business_registrations_touch before update on public.business_registrations for each row execute function public.touch_updated_at();
alter table public.business_registrations enable row level security;
revoke all on public.business_registrations from anon;
drop policy if exists business_registrations_owner on public.business_registrations;
create policy business_registrations_owner on public.business_registrations for all to authenticated
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() and exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));

create or replace function public.business_registration_view(bid uuid)
returns table (dti_bn text, sec_reg text, cda_reg text, bmbe_cert text, mayors_permit text)
language sql stable security definer set search_path = public as $$
  select r.dti_bn, r.sec_reg, r.cda_reg, r.bmbe_cert, r.mayors_permit
  from public.business_registrations r
  join public.businesses b on b.id = r.business_id
  join public.profiles p on p.id = b.owner_id
  where r.business_id = bid
    and b.published and p.status = 'active'
    and (r.visibility = 'public' or (r.visibility = 'members' and auth.uid() is not null));
$$;
revoke all on function public.business_registration_view(uuid) from public;
grant execute on function public.business_registration_view(uuid) to anon, authenticated;

-- Following: one row per member followed. Only the two members involved can see a row.
create table if not exists public.member_follows (
  follower_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  followee_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index if not exists member_follows_followee on public.member_follows (followee_id);
alter table public.member_follows enable row level security;
revoke all on public.member_follows from anon;
revoke update on public.member_follows from authenticated;
drop policy if exists member_follows_select on public.member_follows;
create policy member_follows_select on public.member_follows for select to authenticated using (follower_id = auth.uid() or followee_id = auth.uid());
drop policy if exists member_follows_insert on public.member_follows;
create policy member_follows_insert on public.member_follows for insert to authenticated with check (follower_id = auth.uid());
drop policy if exists member_follows_delete on public.member_follows;
create policy member_follows_delete on public.member_follows for delete to authenticated using (follower_id = auth.uid());
