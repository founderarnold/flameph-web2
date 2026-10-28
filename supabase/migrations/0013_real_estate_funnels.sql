-- Real Estate for MSMEs: keep the three journeys separate while the existing
-- submissions table remains the single secure public-form entry point.

create table if not exists public.property_inquiries (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid unique not null references public.submissions(id) on delete cascade,
  reference_number text unique not null,
  user_id uuid references auth.users(id) on delete set null,
  name text,
  email text,
  mobile text,
  requirement jsonb not null default '{}',
  consent_at timestamptz not null,
  source text not null default 'Real Estate for MSMEs',
  status text not null default 'new' check (status in ('new','reviewing','contacted','matching','site_visit','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.corporate_h_referral_partners (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid unique not null references public.submissions(id) on delete cascade,
  reference_number text unique not null,
  user_id uuid references auth.users(id) on delete set null,
  name text,
  email text,
  mobile text,
  application jsonb not null default '{}',
  consent_at timestamptz not null,
  orientation_version text,
  orientation_completed_at timestamptz,
  status text not null default 'application_submitted' check (status in ('interested','application_submitted','for_orientation','requirements_incomplete','under_review','approved','active','suspended','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.corporate_h_applications (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid unique not null references public.submissions(id) on delete cascade,
  reference_number text unique not null,
  user_id uuid references auth.users(id) on delete set null,
  name text,
  email text,
  mobile text,
  application jsonb not null default '{}',
  consent_at timestamptz not null,
  company_approved_at timestamptz,
  regulatory_requirements_completed_at timestamptz,
  status text not null default 'submitted' check (status in ('submitted','initial_review','interview','orientation','training','document_verification','company_approved','requirements_incomplete','onboarded','not_selected','withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists property_inquiries_user_created_idx on public.property_inquiries(user_id, created_at desc);
create index if not exists property_inquiries_status_created_idx on public.property_inquiries(status, created_at desc);
create index if not exists referral_partners_user_created_idx on public.corporate_h_referral_partners(user_id, created_at desc);
create index if not exists referral_partners_status_created_idx on public.corporate_h_referral_partners(status, created_at desc);
create index if not exists corporate_h_applications_user_created_idx on public.corporate_h_applications(user_id, created_at desc);
create index if not exists corporate_h_applications_status_created_idx on public.corporate_h_applications(status, created_at desc);

alter table public.property_inquiries enable row level security;
alter table public.corporate_h_referral_partners enable row level security;
alter table public.corporate_h_applications enable row level security;

drop policy if exists "Members read own property inquiries" on public.property_inquiries;
create policy "Members read own property inquiries" on public.property_inquiries for select to authenticated using (user_id = auth.uid());

drop policy if exists "Members read own referral applications" on public.corporate_h_referral_partners;
create policy "Members read own referral applications" on public.corporate_h_referral_partners for select to authenticated using (user_id = auth.uid());

drop policy if exists "Members read own career applications" on public.corporate_h_applications;
create policy "Members read own career applications" on public.corporate_h_applications for select to authenticated using (user_id = auth.uid());

create or replace function public.route_real_estate_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  reference text;
begin
  if new.type = 'real-estate-property' then
    reference := 'PROP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    insert into public.property_inquiries (submission_id, reference_number, user_id, name, email, mobile, requirement, consent_at, source)
    values (new.id, reference, new.user_id, new.name, new.email, new.mobile, new.data, new.created_at, coalesce(new.data->>'source', 'Real Estate for MSMEs'));
  elsif new.type = 'real-estate-referral-partner' then
    reference := 'CH-RP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    insert into public.corporate_h_referral_partners (submission_id, reference_number, user_id, name, email, mobile, application, consent_at)
    values (new.id, reference, new.user_id, new.name, new.email, new.mobile, new.data, new.created_at);
  elsif new.type = 'real-estate-career' then
    reference := 'CH-APP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    insert into public.corporate_h_applications (submission_id, reference_number, user_id, name, email, mobile, application, consent_at)
    values (new.id, reference, new.user_id, new.name, new.email, new.mobile, new.data, new.created_at);
  end if;
  return new;
end;
$$;

drop trigger if exists route_real_estate_submission_after_insert on public.submissions;
create trigger route_real_estate_submission_after_insert
after insert on public.submissions
for each row execute function public.route_real_estate_submission();
