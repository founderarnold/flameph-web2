-- FLAME PH one-time database setup. Paste into Supabase → SQL Editor → Run.

-- ===== 0001_init.sql =====
-- FLAME PH platform schema
-- Row Level Security is enabled on every table. Public visitors can read only published rows.
-- Members read and write only their own rows. Admin roles come from public.roles.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Roles and helpers
-- ---------------------------------------------------------------------------
create table public.roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('super_admin','admin','chapter_leader','editor')),
  chapter_id uuid,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create or replace function public.has_role(roles_wanted text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.roles r where r.user_id = auth.uid() and r.role = any(roles_wanted));
$$;

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(array['super_admin','admin']);
$$;

-- Server-side code using the service role key (admin console) is trusted.
create or replace function public.is_trusted() returns boolean language sql stable as $$
  select current_user in ('service_role', 'postgres', 'supabase_admin') or public.is_admin();
$$;

create or replace function public.is_staff() returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(array['super_admin','admin','editor','chapter_leader']);
$$;

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- ---------------------------------------------------------------------------
-- Members
-- ---------------------------------------------------------------------------
create sequence public.member_no_seq start 1;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  member_code text unique not null default ('FP-' || lpad(nextval('public.member_no_seq')::text, 6, '0')),
  full_name text,
  mobile text,
  province text,
  city text,
  business_stage text check (business_stage in ('discover','start','build','grow','scale')),
  tier text not null default 'free',
  status text not null default 'active' check (status in ('active','suspended')),
  consent_privacy boolean not null default false,
  consent_marketing boolean not null default false,
  consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();

-- Create a profile row automatically for every new auth user.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, consent_privacy, consent_marketing, consent_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    coalesce((new.raw_user_meta_data->>'consent_privacy')::boolean, false),
    coalesce((new.raw_user_meta_data->>'consent_marketing')::boolean, false),
    case when (new.raw_user_meta_data->>'consent_privacy')::boolean then now() end
  ) on conflict (id) do nothing;
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Members cannot change their own tier or status.
create or replace function public.protect_profile_fields() returns trigger language plpgsql as $$
begin
  if not public.is_trusted() then
    new.tier = old.tier; new.status = old.status; new.member_code = old.member_code;
  end if;
  return new;
end; $$;
create trigger profiles_protect before update on public.profiles for each row execute function public.protect_profile_fields();

-- Public verification of a member ID shows only name, member since, tier and status.
create or replace function public.verify_member(code text)
returns table (member_code text, full_name text, member_since timestamptz, tier text, status text)
language sql stable security definer set search_path = public as $$
  select p.member_code, p.full_name, p.created_at, p.tier, p.status
  from public.profiles p join auth.users u on u.id = p.id
  where p.member_code = upper(code) and u.email_confirmed_at is not null;
$$;

-- ---------------------------------------------------------------------------
-- Directory
-- ---------------------------------------------------------------------------
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text unique not null,
  sector text,
  description text,
  products text,
  city text,
  province text,
  region text,
  contact_messenger text,
  contact_viber text,
  contact_phone text,
  contact_email text,
  marketplaceph_url text,
  photos text[] not null default '{}',
  published boolean not null default false,
  verified boolean not null default false,
  verification_status text not null default 'none' check (verification_status in ('none','pending','approved','rejected')),
  verification_docs text[] not null default '{}',
  verification_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger businesses_touch before update on public.businesses for each row execute function public.touch_updated_at();

create or replace function public.protect_business_fields() returns trigger language plpgsql as $$
begin
  if not public.is_trusted() then
    new.verified = coalesce(old.verified, false);
    if new.verification_status not in ('none','pending') then new.verification_status = coalesce(old.verification_status,'none'); end if;
    new.verification_note = old.verification_note;
  end if;
  return new;
end; $$;
create trigger businesses_protect before insert or update on public.businesses for each row execute function public.protect_business_fields();

-- ---------------------------------------------------------------------------
-- Community and content
-- ---------------------------------------------------------------------------
create table public.chapters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  region text, province text, city text,
  leader_name text,
  leader_user_id uuid references auth.users(id) on delete set null,
  description text,
  contact_url text,
  status text not null default 'forming' check (status in ('forming','active','inactive')),
  featured boolean not null default false,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger chapters_touch before update on public.chapters for each row execute function public.touch_updated_at();
alter table public.roles add constraint roles_chapter_fk foreign key (chapter_id) references public.chapters(id) on delete cascade;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('workshop','training','webinar','expo','summit','talk')),
  title text not null,
  slug text unique,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  venue text, city text, province text,
  online_url text,
  chapter_id uuid references public.chapters(id) on delete set null,
  status text not null default 'scheduled' check (status in ('draft','scheduled','completed','cancelled')),
  capacity int,
  registration_open boolean not null default true,
  attendance_actual int check (attendance_actual is null or attendance_actual >= 0),
  attendance_source text,
  photos text[] not null default '{}', -- real photos uploaded by admin only
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger events_touch before update on public.events for each row execute function public.touch_updated_at();

create table public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  full_name text not null,
  email text not null,
  mobile text,
  city text,
  attended boolean,
  created_at timestamptz not null default now()
);

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique,
  summary text,
  body text,
  type text not null default 'guide' check (type in ('guide','template','checklist','video','article')),
  stage text check (stage in ('discover','start','build','grow','scale')),
  topic text,
  file_path text,
  external_url text,
  last_reviewed date,
  source_links jsonb not null default '[]',
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger resources_touch before update on public.resources for each row execute function public.touch_updated_at();

create table public.resource_downloads (
  id bigserial primary key,
  resource_id uuid not null references public.resources(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique not null,
  excerpt text,
  body text,
  cover_path text,
  cover_is_real_photo boolean not null default false,
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger posts_touch before update on public.posts for each row execute function public.touch_updated_at();

create table public.episodes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  guest text,
  video_url text,
  aired_on date,
  published boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  stage text check (stage in ('discover','start','build','grow','scale')),
  summary text,
  url text,
  published boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.founders (
  id uuid primary key default gen_random_uuid(),
  sort int not null default 0,
  name text not null unique,
  title text not null,
  bio text not null,
  photo_path text,
  linkedin_url text,
  facebook_url text,
  published boolean not null default true
);

create table public.mentors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  expertise text,
  bio text,
  city text,
  photo_path text,
  profile_url text,
  consent_to_list boolean not null default false,
  featured boolean not null default false,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  constraint mentors_consent check (published = false or consent_to_list = true)
);

create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  sort int not null default 0,
  name text not null,
  role text,
  bio text,
  photo_path text,
  consent_to_list boolean not null default false,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  constraint team_consent check (published = false or consent_to_list = true)
);

create table public.partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  logo_path text,
  website text,
  partnership_type text,
  proof_file text, -- private storage path; never exposed publicly
  featured boolean not null default false,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  constraint partners_proof check (published = false or proof_file is not null)
);

create table public.stories (
  id uuid primary key default gen_random_uuid(),
  member_name text not null,
  business_name text,
  city text,
  story text not null,
  photo_path text,
  consent_file text, -- private storage path
  published boolean not null default false,
  created_at timestamptz not null default now(),
  constraint stories_consent check (published = false or consent_file is not null)
);

create table public.merch_products (
  id uuid primary key default gen_random_uuid(),
  sort int not null default 0,
  name text not null,
  description text,
  price_php numeric(10,2),
  photo_path text,
  kind text not null default 'merch' check (kind in ('merch','signature_brand')),
  maker text,
  published boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.tiers (
  slug text primary key,
  sort int not null,
  name text not null,
  price_php numeric(10,2), -- null = not yet set by founders, hidden on the site
  price_period text default 'month',
  benefits jsonb not null default '[]', -- [{ "label": "...", "status": "live|beta|soon" }]
  available boolean not null default false
);

create table public.awards_cycles (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  title text not null,
  nominations_open boolean not null default false,
  opens_on date, closes_on date, ceremony_on date,
  criteria text,
  published boolean not null default false
);

create table public.policy_positions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  approved_by text,
  published boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Forms and newsletter
-- ---------------------------------------------------------------------------
create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  name text,
  email text,
  mobile text,
  data jsonb not null default '{}',
  user_id uuid references auth.users(id) on delete set null,
  ip_hash text,
  status text not null default 'new' check (status in ('new','contacted','done')),
  notes text,
  created_at timestamptz not null default now()
);
create index submissions_type_idx on public.submissions(type, created_at desc);
create index submissions_ip_idx on public.submissions(ip_hash, created_at desc);

create table public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  consent boolean not null default false,
  confirm_token text unique not null default encode(gen_random_bytes(24),'hex'),
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Ka-FLAME AI
-- ---------------------------------------------------------------------------
create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  anon_id text,
  feature text not null default 'chat' check (feature in ('chat','listing')),
  title text,
  created_at timestamptz not null default now()
);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  anon_id text,
  ip_hash text,
  feature text not null default 'chat',
  question text not null,
  answer text,
  model text,
  input_tokens int, output_tokens int,
  latency_ms int,
  cost_usd numeric(10,6),
  resources_used uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index ai_messages_user_idx on public.ai_messages(user_id, created_at desc);
create index ai_messages_anon_idx on public.ai_messages(anon_id, created_at desc);
create index ai_messages_ip_idx on public.ai_messages(ip_hash, created_at desc);

create table public.ai_feedback (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique references public.ai_messages(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  helpful boolean not null,
  comment text,
  reviewed boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Settings and audit
-- ---------------------------------------------------------------------------
create table public.settings (
  key text primary key,
  value jsonb not null,
  is_public boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.audit_log (
  id bigserial primary key,
  actor_id uuid,
  action text not null,
  table_name text,
  row_id text,
  detail jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['roles','profiles','businesses','chapters','events','event_registrations','resources',
    'resource_downloads','posts','episodes','courses','founders','mentors','team_members','partners','stories',
    'merch_products','tiers','awards_cycles','policy_positions','submissions','newsletter_subscribers',
    'ai_conversations','ai_messages','ai_feedback','settings','audit_log']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Staff can do everything on content tables (the app also checks roles server side).
do $$
declare t text;
begin
  foreach t in array array['chapters','events','resources','posts','episodes','courses','founders','mentors',
    'team_members','partners','stories','merch_products','tiers','awards_cycles','policy_positions']
  loop
    execute format('create policy %I on public.%I for all using (public.is_staff()) with check (public.is_staff())', t || '_staff_all', t);
  end loop;
end $$;

-- Public reads of published rows
create policy chapters_public on public.chapters for select using (published);
create policy events_public on public.events for select using (published and status <> 'draft');
create policy resources_public on public.resources for select using (published);
create policy posts_public on public.posts for select using (published);
create policy episodes_public on public.episodes for select using (published);
create policy courses_public on public.courses for select using (published);
create policy founders_public on public.founders for select using (published);
create policy mentors_public on public.mentors for select using (published and consent_to_list);
create policy team_public on public.team_members for select using (published and consent_to_list);
create policy merch_public on public.merch_products for select using (published);
create policy tiers_public on public.tiers for select using (true);
create policy awards_public on public.awards_cycles for select using (published);
create policy policy_public on public.policy_positions for select using (published);
create policy settings_public on public.settings for select using (is_public);
create policy settings_admin on public.settings for all using (public.is_admin()) with check (public.is_admin());
-- Partners and stories: public sees published rows through views that hide proof/consent paths.
create policy partners_public on public.partners for select using (false);
create policy stories_public on public.stories for select using (false);

create view public.partners_public with (security_invoker = off) as
  select id, name, description, logo_path, website, partnership_type, featured
  from public.partners where published and proof_file is not null;
create view public.stories_public with (security_invoker = off) as
  select id, member_name, business_name, city, story, photo_path, created_at
  from public.stories where published and consent_file is not null;
grant select on public.partners_public, public.stories_public to anon, authenticated;

-- Roles
create policy roles_self on public.roles for select using (user_id = auth.uid() or public.is_admin());
create policy roles_admin on public.roles for all using (public.has_role(array['super_admin'])) with check (public.has_role(array['super_admin']));

-- Profiles
create policy profiles_self_select on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy profiles_self_update on public.profiles for update using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

-- Businesses
create policy businesses_public on public.businesses for select using (published);
create policy businesses_owner_select on public.businesses for select using (owner_id = auth.uid() or public.is_admin());
create policy businesses_owner_insert on public.businesses for insert with check (owner_id = auth.uid());
create policy businesses_owner_update on public.businesses for update using (owner_id = auth.uid() or public.is_admin()) with check (owner_id = auth.uid() or public.is_admin());
create policy businesses_owner_delete on public.businesses for delete using (owner_id = auth.uid() or public.is_admin());

-- Event registrations
create policy regs_self on public.event_registrations for select using (user_id = auth.uid() or public.is_staff());
create policy regs_staff on public.event_registrations for update using (public.is_staff());

-- Downloads, submissions, newsletter: inserted by the server with the service role only.
create policy downloads_admin on public.resource_downloads for select using (public.is_admin());
create policy submissions_admin on public.submissions for all using (public.is_admin()) with check (public.is_admin());
create policy newsletter_admin on public.newsletter_subscribers for select using (public.is_admin());

-- AI history: members see and delete their own
create policy ai_conv_self on public.ai_conversations for select using (user_id = auth.uid() or public.is_admin());
create policy ai_conv_delete on public.ai_conversations for delete using (user_id = auth.uid());
create policy ai_msg_self on public.ai_messages for select using (user_id = auth.uid() or public.is_admin());
create policy ai_msg_delete on public.ai_messages for delete using (user_id = auth.uid());
create policy ai_fb_admin on public.ai_feedback for select using (public.is_admin() or user_id = auth.uid());
create policy ai_fb_admin_update on public.ai_feedback for update using (public.is_admin());

create policy audit_admin on public.audit_log for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Live statistics (never hard-coded)
-- ---------------------------------------------------------------------------
create or replace function public.public_stats() returns jsonb
language sql stable security definer set search_path = public as $$
  with m as (
    select p.* from public.profiles p join auth.users u on u.id = p.id where u.email_confirmed_at is not null
  ), rated as (
    select count(*) as n, count(*) filter (where helpful) as up from public.ai_feedback
  )
  select jsonb_build_object(
    'members', (select count(*) from m),
    'members_this_month', (select count(*) from m where created_at >= date_trunc('month', now() at time zone 'Asia/Manila') at time zone 'Asia/Manila'),
    'provinces', (select count(distinct lower(trim(province))) from m where coalesce(trim(province),'') <> ''),
    'cities', (select count(distinct lower(trim(city)) || '|' || lower(trim(coalesce(province,'')))) from m where coalesce(trim(city),'') <> ''),
    'businesses', (select count(*) from public.businesses where published),
    'verified_businesses', (select count(*) from public.businesses where published and verified),
    'active_chapters', (select count(*) from public.chapters where status = 'active'),
    'events_held', (select count(*) from public.events where status = 'completed'),
    'event_attendees', (select coalesce(sum(attendance_actual),0) from public.events where status = 'completed'),
    'ai_answers', (select count(*) from public.ai_messages where answer is not null),
    'ai_ratings', (select n from rated),
    'ai_helpful_rate', (select case when n > 0 then round(up::numeric / n, 3) end from rated),
    'resource_downloads', (select count(*) from public.resource_downloads),
    'generated_at', now()
  );
$$;

create or replace function public.member_provinces() returns table (province text, members bigint)
language sql stable security definer set search_path = public as $$
  select initcap(trim(p.province)), count(*) from public.profiles p join auth.users u on u.id = p.id
  where u.email_confirmed_at is not null and coalesce(trim(p.province),'') <> ''
  group by 1 order by 2 desc, 1;
$$;

create or replace function public.weekly_member_growth() returns table (week date, new_members bigint, total bigint)
language sql stable security definer set search_path = public as $$
  with w as (
    select date_trunc('week', p.created_at)::date as week, count(*) as n
    from public.profiles p join auth.users u on u.id = p.id where u.email_confirmed_at is not null group by 1
  ), series as (
    select generate_series(coalesce((select min(week) from w), date_trunc('week', now())::date), date_trunc('week', now())::date, interval '1 week')::date as week
  )
  select s.week, coalesce(w.n,0), sum(coalesce(w.n,0)) over (order by s.week) from series s left join w using (week) order by s.week;
$$;

grant execute on function public.public_stats(), public.member_provinces(), public.weekly_member_growth(), public.verify_member(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage buckets: public media (real photos, logos) and private documents (proofs, consents, verification)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('media','media', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('private-docs','private-docs', false) on conflict (id) do nothing;

create policy media_read on storage.objects for select using (bucket_id = 'media');
create policy media_staff_write on storage.objects for insert with check (bucket_id = 'media' and (public.is_staff() or (storage.foldername(name))[1] = auth.uid()::text));
create policy media_staff_delete on storage.objects for delete using (bucket_id = 'media' and (public.is_staff() or (storage.foldername(name))[1] = auth.uid()::text));
create policy docs_owner_insert on storage.objects for insert with check (bucket_id = 'private-docs' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff()));
create policy docs_read on storage.objects for select using (bucket_id = 'private-docs' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));


-- ===== 0002_listing_extras.sql =====
-- Richer business listings: logo, cover photo, opening hours, a map landmark and online shop/social links.
-- Safe to run more than once.
alter table public.businesses
  add column if not exists logo_url text,
  add column if not exists cover_url text,
  add column if not exists hours text check (char_length(hours) <= 200),
  add column if not exists map_landmark text check (char_length(map_landmark) <= 200),
  add column if not exists facebook_url text,
  add column if not exists tiktok_url text,
  add column if not exists instagram_url text,
  add column if not exists shopee_url text,
  add column if not exists lazada_url text,
  add column if not exists website_url text;


-- ===== 0003_member_growth.sql =====
-- FLAME PH member growth features: products, inquiries, reviews, listing stats,
-- opportunities, buy-together deals, growth milestones, referrals, rewards and push notifications.
-- Safe to run more than once on an existing database (Supabase → SQL Editor → paste → Run).

-- ---------------------------------------------------------------------------
-- Listing products, inquiries, reviews and stats (builds on 0002_listing_extras.sql)
-- ---------------------------------------------------------------------------
-- Products and packages with prices
create table if not exists public.business_products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text check (description is null or char_length(description) <= 600),
  price numeric(12,2) check (price is null or price >= 0),
  price_from boolean not null default false,
  unit text,
  min_order text,
  photo_path text,
  link_url text,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists business_products_biz on public.business_products (business_id, sort);

-- Inquiries sent from a listing (inserted by the server; owners read and manage their own)
create table if not exists public.business_inquiries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  from_user_id uuid references auth.users(id) on delete set null,
  name text not null,
  email text,
  mobile text,
  message text not null,
  product_name text,
  status text not null default 'new' check (status in ('new','read','replied','archived')),
  created_at timestamptz not null default now()
);
create index if not exists business_inquiries_owner on public.business_inquiries (owner_id, created_at desc);

-- Member reviews (one per member per business; owners cannot review themselves)
create table if not exists public.business_reviews (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reviewer_name text,
  reviewer_city text,
  rating int not null check (rating between 1 and 5),
  body text check (body is null or char_length(body) <= 800),
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  unique (business_id, user_id)
);

-- Not security definer: is_trusted() must see the real caller so members can't unhide their own review.
create or replace function public.protect_review() returns trigger language plpgsql set search_path = public as $$
begin
  if exists (select 1 from public.businesses b where b.id = new.business_id and b.owner_id = new.user_id) then
    raise exception 'You cannot review your own business.';
  end if;
  if not public.is_trusted() then
    new.hidden = coalesce(old.hidden, false);
  end if;
  return new;
end; $$;
drop trigger if exists business_reviews_protect on public.business_reviews;
create trigger business_reviews_protect before insert or update on public.business_reviews for each row execute function public.protect_review();

-- Daily listing views and contact clicks
create table if not exists public.business_stats (
  business_id uuid not null references public.businesses(id) on delete cascade,
  day date not null default (now() at time zone 'Asia/Manila')::date,
  views int not null default 0,
  clicks int not null default 0,
  primary key (business_id, day)
);

create or replace function public.track_business(biz uuid, kind text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.businesses where id = biz and published) then return; end if;
  insert into public.business_stats (business_id, day, views, clicks)
  values (biz, (now() at time zone 'Asia/Manila')::date, case when kind = 'view' then 1 else 0 end, case when kind = 'click' then 1 else 0 end)
  on conflict (business_id, day) do update
    set views = business_stats.views + excluded.views, clicks = business_stats.clicks + excluded.clicks;
end; $$;
grant execute on function public.track_business(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Opportunities board and buy-together deals (posted by FLAME PH staff)
-- ---------------------------------------------------------------------------
create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind text not null default 'program' check (kind in ('grant','loan','trade_fair','bazaar','training','buyer_request','program','competition','other')),
  organizer text,
  summary text,
  url text,
  province text, -- empty means nationwide
  sectors text[] not null default '{}', -- empty means all sectors
  stages text[] not null default '{}',  -- empty means all stages
  deadline date,
  starts_on date,
  members_only boolean not null default false,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists opportunities_touch on public.opportunities;
create trigger opportunities_touch before update on public.opportunities for each row execute function public.touch_updated_at();

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  supplier text,
  description text,
  unit text,
  deal_price numeric(12,2),
  regular_price numeric(12,2),
  target_members int not null default 10 check (target_members > 0),
  deadline date,
  status text not null default 'open' check (status in ('open','reached','closed')),
  photo_path text,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists deals_touch on public.deals;
create trigger deals_touch before update on public.deals for each row execute function public.touch_updated_at();

create table if not exists public.deal_participants (
  deal_id uuid not null references public.deals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  quantity int not null default 1 check (quantity between 1 and 10000),
  note text,
  created_at timestamptz not null default now(),
  primary key (deal_id, user_id)
);

create or replace function public.deal_counts() returns table (deal_id uuid, members bigint, quantity bigint)
language sql stable security definer set search_path = public as $$
  select dp.deal_id, count(*), coalesce(sum(dp.quantity),0) from public.deal_participants dp
  join public.deals d on d.id = dp.deal_id where d.published group by dp.deal_id;
$$;
grant execute on function public.deal_counts() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Growth milestones (self-reported) and referrals
-- ---------------------------------------------------------------------------
create table if not exists public.member_milestones (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null check (char_length(key) <= 60),
  achieved_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.profiles add column if not exists referred_by uuid references auth.users(id) on delete set null;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare ref uuid;
begin
  select p.id into ref from public.profiles p where p.member_code = upper(nullif(trim(new.raw_user_meta_data->>'ref'), ''));
  insert into public.profiles (id, full_name, consent_privacy, consent_marketing, consent_at, business_stage, referred_by)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    coalesce((new.raw_user_meta_data->>'consent_privacy')::boolean, false),
    coalesce((new.raw_user_meta_data->>'consent_marketing')::boolean, false),
    case when (new.raw_user_meta_data->>'consent_privacy')::boolean then now() end,
    case when new.raw_user_meta_data->>'business_stage' in ('discover','start','build','grow','scale') then new.raw_user_meta_data->>'business_stage' end,
    ref
  ) on conflict (id) do nothing;
  return new;
end; $$;

create or replace function public.protect_profile_fields() returns trigger language plpgsql as $$
begin
  if not public.is_trusted() then
    new.tier = old.tier; new.status = old.status; new.member_code = old.member_code; new.referred_by = old.referred_by;
  end if;
  return new;
end; $$;

-- How many confirmed members a member has invited (members cannot read other profiles directly).
create or replace function public.my_referrals() returns bigint
language sql stable security definer set search_path = public as $$
  select count(*) from public.profiles p join auth.users u on u.id = p.id
  where p.referred_by = auth.uid() and u.email_confirmed_at is not null;
$$;
grant execute on function public.my_referrals() to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.business_products enable row level security;
alter table public.business_inquiries enable row level security;
alter table public.business_reviews enable row level security;
alter table public.business_stats enable row level security;
alter table public.opportunities enable row level security;
alter table public.deals enable row level security;
alter table public.deal_participants enable row level security;
alter table public.member_milestones enable row level security;

drop policy if exists products_public on public.business_products;
create policy products_public on public.business_products for select using (exists (select 1 from public.businesses b where b.id = business_id and b.published));
drop policy if exists products_owner on public.business_products;
create policy products_owner on public.business_products for all
  using (owner_id = auth.uid() or public.is_admin())
  with check ((owner_id = auth.uid() and exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid())) or public.is_admin());

drop policy if exists inquiries_owner_select on public.business_inquiries;
create policy inquiries_owner_select on public.business_inquiries for select using (owner_id = auth.uid() or public.is_admin());
drop policy if exists inquiries_owner_update on public.business_inquiries;
create policy inquiries_owner_update on public.business_inquiries for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists inquiries_owner_delete on public.business_inquiries;
create policy inquiries_owner_delete on public.business_inquiries for delete using (owner_id = auth.uid());

drop policy if exists reviews_public on public.business_reviews;
create policy reviews_public on public.business_reviews for select using (not hidden or user_id = auth.uid() or public.is_admin());
drop policy if exists reviews_self_insert on public.business_reviews;
create policy reviews_self_insert on public.business_reviews for insert with check (user_id = auth.uid());
drop policy if exists reviews_self_update on public.business_reviews;
create policy reviews_self_update on public.business_reviews for update using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
drop policy if exists reviews_self_delete on public.business_reviews;
create policy reviews_self_delete on public.business_reviews for delete using (user_id = auth.uid() or public.is_admin());

drop policy if exists stats_owner on public.business_stats;
create policy stats_owner on public.business_stats for select using (exists (select 1 from public.businesses b where b.id = business_id and (b.owner_id = auth.uid() or public.is_admin())));

drop policy if exists opportunities_staff_all on public.opportunities;
create policy opportunities_staff_all on public.opportunities for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists opportunities_public on public.opportunities;
create policy opportunities_public on public.opportunities for select using (published and (not members_only or auth.uid() is not null));

drop policy if exists deals_staff_all on public.deals;
create policy deals_staff_all on public.deals for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists deals_public on public.deals;
create policy deals_public on public.deals for select using (published);

drop policy if exists deal_participants_self on public.deal_participants;
create policy deal_participants_self on public.deal_participants for all
  using (user_id = auth.uid() or public.is_staff())
  with check (user_id = auth.uid() and exists (select 1 from public.deals d where d.id = deal_id and d.published and d.status = 'open'));

drop policy if exists milestones_self on public.member_milestones;
create policy milestones_self on public.member_milestones for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Rewards: points are computed from activity; members spend them on items FLAME PH posts
-- ---------------------------------------------------------------------------
create table if not exists public.reward_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  points_cost int not null check (points_cost > 0),
  stock int check (stock is null or stock >= 0), -- empty means unlimited
  photo_path text,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists reward_items_touch on public.reward_items;
create trigger reward_items_touch before update on public.reward_items for each row execute function public.touch_updated_at();

create table if not exists public.reward_redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null references public.reward_items(id) on delete restrict,
  item_title text not null,
  points int not null check (points > 0),
  status text not null default 'pending' check (status in ('pending','fulfilled','cancelled')),
  note text,
  created_at timestamptz not null default now()
);

-- Same weights as POINTS in src/lib/growth.ts
create or replace function public.member_points(uid uuid default auth.uid()) returns table (earned bigint, spent bigint, balance bigint)
language sql stable security definer set search_path = public as $$
  with e as (
    select
      (select count(*) from public.profiles p join auth.users u on u.id = p.id where p.referred_by = uid and u.email_confirmed_at is not null) * 50
    + (select count(*) from public.business_reviews where user_id = uid) * 10
    + (select count(*) from public.event_registrations where user_id = uid) * 20
    + (select count(*) from public.member_milestones where user_id = uid) * 15
    + (select count(*) from public.deal_participants where user_id = uid) * 10 as earned
  ), s as (
    select coalesce(sum(points),0) as spent from public.reward_redemptions where user_id = uid and status <> 'cancelled'
  )
  select e.earned, s.spent, e.earned - s.spent from e, s
  where uid = auth.uid() or public.is_admin();
$$;
grant execute on function public.member_points(uuid) to authenticated;

create or replace function public.redeem_reward(item uuid) returns text
language plpgsql security definer set search_path = public as $$
declare it public.reward_items; bal bigint;
begin
  if auth.uid() is null then return 'login'; end if;
  select * into it from public.reward_items where id = item and published for update;
  if not found then return 'missing'; end if;
  if it.stock is not null and it.stock <= 0 then return 'out'; end if;
  select balance into bal from public.member_points(auth.uid());
  if coalesce(bal,0) < it.points_cost then return 'points'; end if;
  insert into public.reward_redemptions (user_id, item_id, item_title, points) values (auth.uid(), it.id, it.title, it.points_cost);
  if it.stock is not null then update public.reward_items set stock = stock - 1 where id = it.id; end if;
  return 'ok';
end; $$;
grant execute on function public.redeem_reward(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Push notifications (phone and desktop) for members who turn them on
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.reward_items enable row level security;
alter table public.reward_redemptions enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists reward_items_staff_all on public.reward_items;
create policy reward_items_staff_all on public.reward_items for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists reward_items_public on public.reward_items;
create policy reward_items_public on public.reward_items for select using (published);
drop policy if exists redemptions_self on public.reward_redemptions;
create policy redemptions_self on public.reward_redemptions for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists redemptions_admin on public.reward_redemptions;
create policy redemptions_admin on public.reward_redemptions for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists push_self on public.push_subscriptions;
create policy push_self on public.push_subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Add Opportunities and Buy Together to the saved site menu (Membership group), once.
-- ---------------------------------------------------------------------------
update public.settings set value = (
  select jsonb_agg(
    case when g->>'key' = 'membership' and not (g->'items' @> '[{"href":"/opportunities"}]'::jsonb)
      then jsonb_set(g, '{items}', (g->'items') || '[{"label":"Opportunities for MSMEs","href":"/opportunities"},{"label":"Buy Together Deals","href":"/deals"}]'::jsonb)
      else g end
    order by ord)
  from jsonb_array_elements(value) with ordinality as t(g, ord)
) where key = 'menu' and jsonb_typeof(value) = 'array';


-- ===== seed.sql =====
-- FLAME PH seed: verified facts (section 3) and menu structure ONLY.
-- All other content tables intentionally start empty. Generated by scripts/build-seed.mjs.

insert into public.founders (sort, name, title, bio, published) values
  (1, 'Dr. Joliber Mapiles, ECE', 'Chairman & Co-Founder, FLAME PH', 'Dr. Joliber Mapiles is a real estate entrepreneur and business leader with extensive experience in property investment, development, and entrepreneurship. His work in real estate has given him practical insights into business growth, investment strategies, and building sustainable enterprises. As Chairman and Co-Founder of FLAME PH, he brings this experience to his advocacy of empowering Filipino MSMEs, fostering business collaboration, and creating opportunities for entrepreneurs to grow together toward a more competitive and prosperous Philippines.', true),
  (2, 'Mr. Arnold Relova, MBA', 'Founder & Vice Chairman, FLAME PH', 'Mr. Arnold Relova is a seasoned MSME entrepreneur and business builder with hands-on experience in developing and expanding businesses across multiple industries. He is the founder of NegosyoDepot.com, MarketplacePH.com, Manager''s Pizza, ProBoxx Packaging Solutions, and YOBO Sports, with several outlets and distributors serving customers across Luzon, Visayas, and Mindanao. As Vice-Chairman and Founder of FLAME PH, he brings his practical experience in entrepreneurship, business development, distribution, and MSME growth to help build a stronger network of Filipino entrepreneurs—encouraging collaboration, shared opportunities, and sustainable business growth.', true),
  (3, 'Ms. Karen Dizon, MBA', 'Executive Director, FLAME PH', 'Ms. Karen Dizon is a business and organizational development professional with experience in MSME development, administration, and public-sector engagement. She serves as Vice President of MSME BrandBuilders Network Corp. (MBNC) and previously served as an Executive Staff member of the Secretary of the Department of Tourism (DOT). As Executive Director of FLAME PH, she helps lead the organization''s programs, partnerships, and initiatives focused on strengthening Filipino MSMEs and fostering collaboration between entrepreneurs and key stakeholders.', true),
  (4, 'Mr. Mark Tomon', 'Deputy Executive Director, FLAME PH', 'Mr. Mark Tomon is an entrepreneur and business development leader with experience in MSME branding, marketing, business development, and enterprise development. He is the President of MSME BrandBuilders Network Corp. (MBNC), Vice President of Managers'' Pizza, and Co-Founder of ProBoxx Packaging Solutions. As Deputy Executive Director of FLAME PH, he contributes his expertise in brand building, marketing, business development, and MSME collaboration to help Filipino entrepreneurs strengthen their businesses and become more competitive in the local and global marketplace.', true)
on conflict (name) do nothing;

insert into public.tiers (slug, sort, name, price_php, benefits, available) values
  ('free', 0, 'Free', null, '[{"label":"Member account & digital ID","status":"live"},{"label":"Free business directory listing","status":"live"},{"label":"Ka-FLAME AI daily questions","status":"beta"},{"label":"Resource library","status":"live"},{"label":"Event registration","status":"live"}]'::jsonb, true),
  ('starter', 1, 'Starter', null, '[]'::jsonb, false),
  ('micro', 2, 'Micro', null, '[]'::jsonb, false),
  ('neo', 3, 'Neo', null, '[]'::jsonb, false),
  ('pro', 4, 'Pro', null, '[]'::jsonb, false),
  ('champion', 5, 'Champion', null, '[]'::jsonb, false)
on conflict (slug) do nothing;

insert into public.settings (key, value, is_public) values
  ('organization', '{"name":"FLAME PH — Federation of Leaders Advancing MSME Ecosystem in the Philippines","former_name":"FAME PH — Founders'' Association of MSMEs and Entrepreneurs, Inc.","type":"Non-stock, non-profit corporation","sec_no":"2024050150009-15","sec_registered_on":"2024-05-09","address":"Greenville Subd., Barangay San Jose, San Fernando City, Pampanga","email_primary":"flameph.org@gmail.com","email_partnerships":"federationofmsmes@gmail.com"}'::jsonb, true),
  ('menu', '[{"key":"whatWeDo","label":"What We Do","fil":"Ano ang Ginagawa Namin","items":[{"label":"Programs & MSME Ecosystem","href":"/programs-ecosystem"},{"label":"FLAME PH Academy","href":"/academy"},{"label":"FLAME PH NegosyoTalks","href":"/negosyo-talks"},{"label":"Educational Workshops","href":"/workshops"},{"label":"Trainings & Webinars","href":"/trainings-webinars"},{"label":"Expos & Summits","href":"/expos-summits"},{"label":"Annual Awards for MSMEs","href":"/awards"}]},{"key":"membership","label":"Membership","fil":"Membership","items":[{"label":"Avail Free MSME Benefits","href":"/membership/free-benefits"},{"label":"Get More MSME Benefits","href":"/membership/more-benefits"},{"label":"Resources","href":"/resources"},{"label":"Advocacy","href":"/advocacy"},{"label":"Chapters Near You","href":"/chapters"},{"label":"Volunteering","href":"/volunteering"},{"label":"Free POS for MSMEs","href":"/pos"},{"label":"Free Business Directory","href":"/directory"},{"label":"Opportunities for MSMEs","href":"/opportunities"},{"label":"Buy Together Deals","href":"/deals"},{"label":"Biz Consult with FLAME AI","href":"/bizconsult-ai"}]},{"key":"supportUs","label":"Support Us","fil":"Suportahan Kami","items":[{"label":"FLAME PH Merchs","href":"/merch"},{"label":"Flame Signature Brands","href":"/signature-brands"},{"label":"Personalized by FLAMEPH","href":"/personalized"},{"label":"Shop/Sell/Jobs @ MarketplacePH","href":"https://www.marketplaceph.com","external":true},{"label":"Start/Grow/ScaleUp @ NegosyoDepot","href":"https://www.negosyodepot.com","external":true},{"label":"Fulfillment by MSMEs","href":"/fulfillment"}]},{"key":"getInvolved","label":"Get Involved","fil":"Makilahok","items":[{"label":"Volunteer as Mentor","href":"/get-involved/mentor"},{"label":"Join as Partner","href":"/get-involved/partner"},{"label":"Sponsor an Event","href":"/get-involved/sponsor-event"},{"label":"Sponsor a Community","href":"/get-involved/sponsor-community"},{"label":"Nominate an MSME Awardee","href":"/get-involved/nominate"},{"label":"Support Poverty Alleviation Program","href":"/get-involved/poverty-alleviation"},{"label":"News & Updates","href":"/news"},{"label":"Become an Affiliate Marketer","href":"/get-involved/affiliate"},{"label":"Become a Chapter Leader","href":"/get-involved/chapter-leader"},{"label":"Volunteer as a Resource Speaker","href":"/get-involved/resource-speaker"},{"label":"Volunteer Professional Services","href":"/get-involved/professional-services"}]},{"key":"about","label":"About Us","fil":"Tungkol sa Amin","items":[{"label":"What is FLAME PH","href":"/about"},{"label":"Meet the Founders","href":"/about/founders"},{"label":"Meet the Teams","href":"/about/team"},{"label":"Featured Chapters","href":"/about/chapters"},{"label":"Featured Mentors","href":"/about/mentors"},{"label":"Featured Partners","href":"/about/partners"}]}]'::jsonb, true),
  ('stat_thresholds', '{"founding_members":50,"ai_helpful_min_ratings":20}'::jsonb, true),
  ('social_links', '{}'::jsonb, true),
  ('launch_date', 'null'::jsonb, true),
  ('donation_details', 'null'::jsonb, true),
  ('ai_limits', '{"guest":3,"free":10,"starter":20,"micro":30,"neo":40,"pro":60,"champion":100}'::jsonb, true),
  ('ai_monthly_cap_usd', '0'::jsonb, true),
  ('legal_status', '{"terms":"draft","privacy":"draft","membership":"draft"}'::jsonb, true)
on conflict (key) do nothing;
