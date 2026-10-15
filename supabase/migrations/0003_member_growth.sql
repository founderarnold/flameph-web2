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
