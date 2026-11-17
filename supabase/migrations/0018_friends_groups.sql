-- Phase 4A: Friend (mutual), mute, block, Friend-only posts, and industry and chapter groups.
-- Additive: new tables and functions, two new columns on feed_posts (with defaults), and stricter rules on
-- feed_posts, feed_comments and member_follows so blocked members and non-friends cannot reach what they shouldn't.
-- Take a backup before applying to production.

-- ---------------------------------------------------------------------------
-- Friend requests and friendships. One row per pair; status 'pending' until the other member accepts.
-- ---------------------------------------------------------------------------
create table if not exists public.friendships (
  requester_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);
-- Only one row per pair, whoever asked first.
create unique index if not exists friendships_pair on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists friendships_addressee on public.friendships (addressee_id, status);

-- Mute: hide someone's posts from your own feed. Only you can see your mutes.
create table if not exists public.member_mutes (
  muter_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  muted_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (muter_id, muted_id),
  check (muter_id <> muted_id)
);

-- Block: neither member sees the other's posts or comments, and they cannot follow, friend or comment on each other.
create table if not exists public.member_blocks (
  blocker_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index if not exists member_blocks_blocked on public.member_blocks (blocked_id);

create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select a is not null and b is not null and exists (
    select 1 from public.friendships f
    where f.status = 'accepted' and least(f.requester_id, f.addressee_id) = least(a, b) and greatest(f.requester_id, f.addressee_id) = greatest(a, b));
$$;
create or replace function public.is_blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select a is not null and b is not null and exists (
    select 1 from public.member_blocks k where (k.blocker_id = a and k.blocked_id = b) or (k.blocker_id = b and k.blocked_id = a));
$$;
revoke all on function public.are_friends(uuid, uuid) from public;
revoke all on function public.is_blocked_between(uuid, uuid) from public;
grant execute on function public.are_friends(uuid, uuid) to authenticated;
grant execute on function public.is_blocked_between(uuid, uuid) to authenticated;

-- Friend requests: only the asker creates one, never to or from someone blocked; only the other member accepts.
create or replace function public.friendships_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.requester_id := auth.uid(); end if;
    new.status := 'pending'; new.created_at := now(); new.responded_at := null;
    if public.is_blocked_between(new.requester_id, new.addressee_id) then raise exception 'blocked'; end if;
    if not public.member_is_active(new.addressee_id) then raise exception 'not_active_member'; end if;
    if exists (select 1 from public.friendships f where f.requester_id = new.addressee_id and f.addressee_id = new.requester_id) then raise exception 'request_exists'; end if;
    if (select count(*) from public.friendships f where f.requester_id = new.requester_id and f.created_at > now() - interval '1 day') >= 50 then raise exception 'friend_rate_limit'; end if;
    return new;
  end if;
  -- UPDATE: the only change allowed is the addressee accepting a pending request.
  if new.requester_id <> old.requester_id or new.addressee_id <> old.addressee_id or new.created_at <> old.created_at then raise exception 'not_allowed'; end if;
  if auth.uid() is not null and auth.uid() <> old.addressee_id then raise exception 'not_allowed'; end if;
  if not (old.status = 'pending' and new.status = 'accepted') then raise exception 'not_allowed'; end if;
  new.responded_at := now();
  return new;
end $$;
drop trigger if exists friendships_guard on public.friendships;
create trigger friendships_guard before insert or update on public.friendships for each row execute function public.friendships_guard();

alter table public.friendships enable row level security;
revoke all on public.friendships from anon;
revoke all on public.friendships from authenticated;
grant select, insert, delete on public.friendships to authenticated;
grant update (status) on public.friendships to authenticated;
drop policy if exists friendships_select on public.friendships;
create policy friendships_select on public.friendships for select to authenticated using (requester_id = auth.uid() or addressee_id = auth.uid());
drop policy if exists friendships_insert on public.friendships;
create policy friendships_insert on public.friendships for insert to authenticated
  with check (requester_id = auth.uid() and public.member_is_active(auth.uid()));
drop policy if exists friendships_accept on public.friendships;
create policy friendships_accept on public.friendships for update to authenticated using (addressee_id = auth.uid()) with check (addressee_id = auth.uid());
-- Decline, cancel or unfriend: either member can remove the row.
drop policy if exists friendships_delete on public.friendships;
create policy friendships_delete on public.friendships for delete to authenticated using (requester_id = auth.uid() or addressee_id = auth.uid());

alter table public.member_mutes enable row level security;
revoke all on public.member_mutes from anon;
revoke all on public.member_mutes from authenticated;
grant select, insert, delete on public.member_mutes to authenticated;
drop policy if exists member_mutes_own on public.member_mutes;
create policy member_mutes_own on public.member_mutes for all to authenticated using (muter_id = auth.uid()) with check (muter_id = auth.uid());

alter table public.member_blocks enable row level security;
revoke all on public.member_blocks from anon;
revoke all on public.member_blocks from authenticated;
grant select, insert, delete on public.member_blocks to authenticated;
-- Only the blocker sees a block; the blocked member is not told.
drop policy if exists member_blocks_own on public.member_blocks;
create policy member_blocks_own on public.member_blocks for all to authenticated using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

-- Blocking ends any friendship, request and follow between the two members, both ways.
create or replace function public.member_blocks_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.friendships f
    where least(f.requester_id, f.addressee_id) = least(new.blocker_id, new.blocked_id) and greatest(f.requester_id, f.addressee_id) = greatest(new.blocker_id, new.blocked_id);
  delete from public.member_follows m
    where (m.follower_id = new.blocker_id and m.followee_id = new.blocked_id) or (m.follower_id = new.blocked_id and m.followee_id = new.blocker_id);
  return new;
end $$;
drop trigger if exists member_blocks_after on public.member_blocks;
create trigger member_blocks_after after insert on public.member_blocks for each row execute function public.member_blocks_after();

-- Following stays open and needs no approval, but not across a block.
drop policy if exists member_follows_insert on public.member_follows;
create policy member_follows_insert on public.member_follows for insert to authenticated
  with check (follower_id = auth.uid() and not public.is_blocked_between(follower_id, followee_id));

-- ---------------------------------------------------------------------------
-- Groups: one per industry and one per chapter. Fifteen priority industry groups open at launch; the rest of the
-- catalogue opens the first time a member joins, so empty groups are never promoted.
-- ---------------------------------------------------------------------------
create table if not exists public.group_catalog (
  slug text primary key check (slug ~ '^[a-z0-9-]{2,60}$'),
  name text not null check (char_length(name) between 2 and 80),
  sector text not null check (char_length(sector) between 1 and 60),
  priority boolean not null default false,
  sort int not null default 100
);
alter table public.group_catalog enable row level security;
revoke all on public.group_catalog from anon;
revoke all on public.group_catalog from authenticated;
grant select on public.group_catalog to authenticated;
drop policy if exists group_catalog_read on public.group_catalog;
create policy group_catalog_read on public.group_catalog for select to authenticated using (true);

insert into public.group_catalog (slug, name, sector, priority, sort) values
  ('food-and-beverage', 'Food and beverage', 'Food & beverage', true, 1),
  ('real-estate', 'Real estate', 'Services', true, 2),
  ('advertising', 'Advertising', 'Services', true, 3),
  ('marketing', 'Marketing', 'Services', true, 4),
  ('packaging', 'Packaging', 'Manufacturing', true, 5),
  ('ai', 'AI', 'Technology', true, 6),
  ('systems', 'Systems', 'Technology', true, 7),
  ('accounting-services', 'Accounting services', 'Services', true, 8),
  ('legal-services', 'Legal services', 'Services', true, 9),
  ('insurance', 'Insurance', 'Services', true, 10),
  ('tax-compliance', 'Tax compliance', 'Services', true, 11),
  ('logistics', 'Logistics', 'Services', true, 12),
  ('manufacturers', 'Manufacturers', 'Manufacturing', true, 13),
  ('professional-services', 'Professional services', 'Services', true, 14),
  ('suppliers', 'Suppliers', 'Retail / sari-sari', true, 15),
  ('import-and-export', 'Import and export services', 'Services', false, 20),
  ('investors-and-funders', 'Investors and funders', 'Services', false, 21),
  ('agriculture', 'Agriculture', 'Agriculture', false, 30),
  ('retail-and-sari-sari', 'Retail and sari-sari stores', 'Retail / sari-sari', false, 31),
  ('beauty-and-wellness', 'Beauty and wellness', 'Beauty & wellness', false, 32),
  ('crafts-and-fashion', 'Crafts and fashion', 'Crafts & fashion', false, 33),
  ('tourism', 'Tourism', 'Tourism', false, 34),
  ('technology', 'Technology and IT services', 'Technology', false, 35),
  ('services', 'Other services', 'Services', false, 36)
on conflict (slug) do nothing;

create table if not exists public.community_groups (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,80}$'),
  kind text not null check (kind in ('industry', 'chapter')),
  name text not null check (char_length(name) between 2 and 120),
  sector text,
  chapter_id uuid unique references public.chapters(id) on delete cascade,
  priority boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((kind = 'chapter') = (chapter_id is not null))
);
alter table public.community_groups enable row level security;
revoke all on public.community_groups from anon;
revoke all on public.community_groups from authenticated;
grant select on public.community_groups to authenticated;
drop policy if exists community_groups_read on public.community_groups;
create policy community_groups_read on public.community_groups for select to authenticated using (true);

insert into public.community_groups (slug, kind, name, sector, priority)
  select c.slug, 'industry', c.name, c.sector, true from public.group_catalog c where c.priority
on conflict (slug) do nothing;

create table if not exists public.group_members (
  group_id uuid not null references public.community_groups(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists group_members_user on public.group_members (user_id);
alter table public.group_members enable row level security;
revoke all on public.group_members from anon;
revoke all on public.group_members from authenticated;
grant select, insert, delete on public.group_members to authenticated;
drop policy if exists group_members_read on public.group_members;
create policy group_members_read on public.group_members for select to authenticated using (true);
drop policy if exists group_members_join on public.group_members;
create policy group_members_join on public.group_members for insert to authenticated
  with check (user_id = auth.uid() and public.member_is_active(auth.uid()));
drop policy if exists group_members_leave on public.group_members;
create policy group_members_leave on public.group_members for delete to authenticated using (user_id = auth.uid());

-- Join a group by its address. An industry group from the catalogue, or the group of a published chapter, is opened
-- (created) the first time someone joins it. Returns the group's id.
create or replace function public.join_group(p_slug text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  g uuid;
  cat record;
  ch record;
begin
  if me is null or not public.member_is_active(me) then raise exception 'not_active_member'; end if;
  select id into g from public.community_groups where slug = p_slug;
  if g is null then
    select * into cat from public.group_catalog where slug = p_slug;
    if cat.slug is not null then
      insert into public.community_groups (slug, kind, name, sector, priority, created_by)
        values (cat.slug, 'industry', cat.name, cat.sector, cat.priority, me)
        on conflict (slug) do nothing;
    elsif p_slug like 'chapter-%' then
      select c.id, c.name into ch from public.chapters c where c.published and 'chapter-' || coalesce(c.slug, c.id::text) = p_slug;
      if ch.id is null then raise exception 'no_such_group'; end if;
      insert into public.community_groups (slug, kind, name, chapter_id, created_by)
        values (p_slug, 'chapter', ch.name, ch.id, me)
        on conflict do nothing;
    else
      raise exception 'no_such_group';
    end if;
    select id into g from public.community_groups where slug = p_slug;
  end if;
  insert into public.group_members (group_id, user_id) values (g, me) on conflict do nothing;
  return g;
end $$;
revoke all on function public.join_group(text) from public;
grant execute on function public.join_group(text) to authenticated;

-- Member counts for a list of groups (at most 100).
create or replace function public.group_counts(ids uuid[]) returns table (group_id uuid, members int)
language sql stable security definer set search_path = public as $$
  select m.group_id, count(*)::int from public.group_members m
  where m.group_id = any (ids[1:100]) and public.member_is_active(m.user_id) group by m.group_id;
$$;
revoke all on function public.group_counts(uuid[]) from public;
grant execute on function public.group_counts(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Posts: audience (all members, or friends only) and an optional group.
-- ---------------------------------------------------------------------------
alter table public.feed_posts
  add column if not exists audience text not null default 'members',
  add column if not exists group_id uuid references public.community_groups(id) on delete set null;
do $$ begin
  alter table public.feed_posts add constraint feed_posts_audience check (audience in ('members', 'friends'));
exception when duplicate_object then null; end $$;
create index if not exists feed_posts_group on public.feed_posts (group_id, created_at desc, id desc) where status = 'published';

-- Posting in a group needs membership. A post in the investors and funders group is always an investor/funder post.
create or replace function public.feed_posts_group_check() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.group_id is not null then
    if new.audience = 'friends' then raise exception 'group_posts_are_for_members'; end if;
    if auth.uid() is not null and not exists (select 1 from public.group_members m where m.group_id = new.group_id and m.user_id = auth.uid()) then
      raise exception 'join_group_first';
    end if;
    if exists (select 1 from public.community_groups g where g.id = new.group_id and g.slug = 'investors-and-funders') then new.kind := 'investor'; end if;
  end if;
  return new;
end $$;
-- Named so it runs after feed_posts_prepare (same-event triggers fire in name order).
drop trigger if exists feed_posts_zgroup on public.feed_posts;
create trigger feed_posts_zgroup before insert on public.feed_posts for each row execute function public.feed_posts_group_check();

-- Friend-only posts are readable only by the author's friends, at the database level. Blocks hide posts both ways.
drop policy if exists feed_posts_select on public.feed_posts;
create policy feed_posts_select on public.feed_posts for select to authenticated
  using (
    author_id = auth.uid() or public.is_admin()
    or (status = 'published' and public.member_is_active(author_id)
        and not public.is_blocked_between(author_id, auth.uid())
        and (audience = 'members' or public.are_friends(author_id, auth.uid())))
  );

-- Comments: hidden across a block; and no commenting on the post of someone who blocked you (or whom you blocked).
drop policy if exists feed_comments_select on public.feed_comments;
create policy feed_comments_select on public.feed_comments for select to authenticated
  using (((status = 'published' and public.member_is_active(author_id) and not public.is_blocked_between(author_id, auth.uid()))
          or author_id = auth.uid() or public.is_admin())
    and exists (select 1 from public.feed_posts p where p.id = post_id));
drop policy if exists feed_comments_insert on public.feed_comments;
create policy feed_comments_insert on public.feed_comments for insert to authenticated
  with check (author_id = auth.uid() and public.member_is_active(auth.uid())
    and exists (select 1 from public.feed_posts p where p.id = post_id and p.status = 'published' and not public.is_blocked_between(p.author_id, auth.uid())));

-- ---------------------------------------------------------------------------
-- People: display names for members you are connected with, and suggestions with mutual connections.
-- ---------------------------------------------------------------------------
-- Name and public profile address for up to 100 members. Only active members; never contact details.
create or replace function public.member_cards(ids uuid[])
returns table (id uuid, name text, slug text, sector text, city text, province text, chapter_id uuid)
language sql stable security definer set search_path = public as $$
  select p.id,
    coalesce(nullif(btrim(b.name), ''), nullif(btrim(p.full_name), ''), 'FLAME PH member'),
    b.slug, b.sector, coalesce(b.city, p.city), coalesce(b.province, p.province), p.chapter_id
  from public.profiles p
  left join lateral (
    select x.name, x.slug, x.sector, x.city, x.province from public.businesses x
    where x.owner_id = p.id and x.published and x.publication_status = 'published' and x.lifecycle_status = 'approved' and x.risk_level = 'low'
    order by x.created_at limit 1
  ) b on true
  where p.id = any (ids[1:100]) and p.status = 'active' and auth.uid() is not null and not public.is_blocked_between(p.id, auth.uid());
$$;
revoke all on function public.member_cards(uuid[]) from public;
grant execute on function public.member_cards(uuid[]) to authenticated;

-- People you may know: friends of your friends, and people followed by people you follow.
-- Returns only the number of mutual connections, never who they are. At most 50 rows.
create or replace function public.mutual_suggestions(max_rows int default 30)
returns table (user_id uuid, mutual int)
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as id),
  my_friends as (
    select case when f.requester_id = me.id then f.addressee_id else f.requester_id end as id
    from public.friendships f, me where f.status = 'accepted' and (f.requester_id = me.id or f.addressee_id = me.id)
  ),
  my_follows as (select m.followee_id as id from public.member_follows m, me where m.follower_id = me.id),
  hop as (
    select case when f.requester_id = mf.id then f.addressee_id else f.requester_id end as id, mf.id as via
    from public.friendships f join my_friends mf on f.status = 'accepted' and (f.requester_id = mf.id or f.addressee_id = mf.id)
    union
    select m.followee_id, fo.id from public.member_follows m join my_follows fo on m.follower_id = fo.id
  )
  select h.id, count(distinct h.via)::int
  from hop h, me
  where h.id <> me.id
    and h.id not in (select id from my_friends) and h.id not in (select id from my_follows)
    and not public.is_blocked_between(h.id, me.id) and public.member_is_active(h.id)
  group by h.id
  order by 2 desc
  limit least(greatest(max_rows, 1), 50);
$$;
revoke all on function public.mutual_suggestions(int) from public;
grant execute on function public.mutual_suggestions(int) to authenticated;
