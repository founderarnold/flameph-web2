-- Phase 4: the community feed. Member posts, comments and reactions, and the forum view over them.
-- Additive only: three new tables and helper functions. Nothing existing is changed. Take a backup before applying to production.
-- Visitors (anon) can read none of it. Members can read published posts by active members, and their own.

-- True when a member account exists and is not suspended. Lets row rules check another member without opening profiles.
create or replace function public.member_is_active(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = uid and p.status = 'active');
$$;
revoke all on function public.member_is_active(uuid) from public;
grant execute on function public.member_is_active(uuid) to authenticated;

-- Posts. category is a top-level industry from the FLAME PH taxonomy (src/lib/industries.ts), subcategory a specific one.
-- kind 'investor' always shows the investor/funder warning (Community Guidelines section 5) and cannot be changed by the poster.
create table if not exists public.feed_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null default 'update' check (kind in ('update', 'question', 'offer', 'request', 'fulfillment', 'investor')),
  category text not null check (char_length(category) between 1 and 60),
  subcategory text check (subcategory is null or char_length(subcategory) <= 80),
  body text not null check (char_length(btrim(body)) between 2 and 2000),
  chapter_id uuid references public.chapters(id) on delete set null,
  author_name text check (author_name is null or char_length(author_name) <= 120),
  author_slug text check (author_slug is null or char_length(author_slug) <= 120),
  status text not null default 'published' check (status in ('published', 'held', 'hidden')),
  held_reason text check (held_reason is null or char_length(held_reason) <= 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists feed_posts_recent on public.feed_posts (created_at desc, id desc) where status = 'published';
create index if not exists feed_posts_category on public.feed_posts (category, created_at desc, id desc) where status = 'published';
create index if not exists feed_posts_chapter on public.feed_posts (chapter_id, created_at desc, id desc) where status = 'published';
create index if not exists feed_posts_kind on public.feed_posts (kind, created_at desc, id desc) where status = 'published';
create index if not exists feed_posts_author on public.feed_posts (author_id, created_at desc);
drop trigger if exists feed_posts_touch on public.feed_posts;
create trigger feed_posts_touch before update on public.feed_posts for each row execute function public.touch_updated_at();

-- Automated checks (moderation layer 1), run inside the database so no app or API call can skip them.
-- The words below are mirrored in src/lib/feed-rules.ts so the composer can explain a refusal before posting.
create or replace function public.feed_text_flags(t text) returns text[]
language sql immutable set search_path = public as $$
  select array_remove(array[
    case when t ~* '\m(invest|investing|investment|investments|investor|investors|funder|funders|funding|capital|roi|loans?|lending|pautang|paluwagan|equity|shares? of stock|interest rate|interest per month)\M' then 'investor' end,
    case when t ~* '(guarantee[ds]?|guaranteed|sure|fixed|risk[- ]?free|no[- ]risk|walang risk|siguradong|garantisadong)\W+(\w+\W+){0,3}(returns?|profits?|income|interest|kita|tubo)'
           or t ~* '(double your money|doble ang pera|pyramid|downline|recruit(ment)? (bonus|income)|pay[- ]?in)' then 'promises_returns' end
  ], null);
$$;

create or replace function public.feed_link_count(t text) returns int
language sql immutable set search_path = public as $$
  select count(*)::int from regexp_matches(coalesce(t, ''), '(https?://|www\.)', 'gi');
$$;

-- Fills in who posted (from their own profile and public business page) and applies the posting limits.
create or replace function public.feed_posts_prepare() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  prof record;
  biz record;
  flags text[];
  young boolean;
begin
  if me is null then
    if current_user in ('postgres', 'service_role', 'supabase_admin') then return new; end if;
    raise exception 'not_signed_in';
  end if;
  new.author_id := me;
  new.created_at := now();
  new.body := btrim(new.body);
  select p.full_name, p.chapter_id, p.status, p.created_at into prof from public.profiles p where p.id = me;
  if prof is null or prof.status <> 'active' then raise exception 'not_active_member'; end if;
  select b.name, b.slug into biz from public.businesses b
    where b.owner_id = me and b.published and b.publication_status = 'published' and b.lifecycle_status = 'approved' and b.risk_level = 'low'
    order by b.created_at limit 1;
  new.author_name := left(coalesce(nullif(btrim(biz.name), ''), nullif(btrim(prof.full_name), ''), 'FLAME PH member'), 120);
  new.author_slug := biz.slug;
  new.chapter_id := prof.chapter_id;
  young := prof.created_at > now() - interval '1 day';

  if (select count(*) from public.feed_posts f where f.author_id = me and f.created_at > now() - interval '1 hour') >= 10 then raise exception 'post_rate_limit'; end if;
  if young and (select count(*) from public.feed_posts f where f.author_id = me and f.created_at > now() - interval '1 day') >= 3 then raise exception 'new_account_limit'; end if;
  if exists (select 1 from public.feed_posts f where f.author_id = me and f.created_at > now() - interval '1 day' and lower(f.body) = lower(new.body)) then raise exception 'duplicate_post'; end if;
  if public.feed_link_count(new.body) > 3 then raise exception 'too_many_links'; end if;
  if young and public.feed_link_count(new.body) > 0 then raise exception 'new_account_links'; end if;

  flags := public.feed_text_flags(new.body);
  if 'investor' = any(flags) then new.kind := 'investor'; end if;
  new.status := 'published';
  new.held_reason := null;
  if 'promises_returns' = any(flags) then new.status := 'held'; new.held_reason := 'promises_returns'; end if;
  return new;
end $$;
drop trigger if exists feed_posts_prepare on public.feed_posts;
create trigger feed_posts_prepare before insert on public.feed_posts for each row execute function public.feed_posts_prepare();

alter table public.feed_posts enable row level security;
revoke all on public.feed_posts from anon;
revoke all on public.feed_posts from authenticated;
grant select, insert, delete on public.feed_posts to authenticated;
grant update (status, held_reason) on public.feed_posts to authenticated;
drop policy if exists feed_posts_select on public.feed_posts;
create policy feed_posts_select on public.feed_posts for select to authenticated
  using ((status = 'published' and public.member_is_active(author_id)) or author_id = auth.uid() or public.is_admin());
drop policy if exists feed_posts_insert on public.feed_posts;
create policy feed_posts_insert on public.feed_posts for insert to authenticated
  with check (author_id = auth.uid() and public.member_is_active(auth.uid()));
drop policy if exists feed_posts_moderate on public.feed_posts;
create policy feed_posts_moderate on public.feed_posts for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists feed_posts_delete on public.feed_posts;
create policy feed_posts_delete on public.feed_posts for delete to authenticated using (author_id = auth.uid() or public.is_admin());

-- Comments. A comment under an investor/funder post shows the same warning (done by the app, from the post's kind).
create table if not exists public.feed_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  author_name text check (author_name is null or char_length(author_name) <= 120),
  author_slug text check (author_slug is null or char_length(author_slug) <= 120),
  status text not null default 'published' check (status in ('published', 'hidden')),
  created_at timestamptz not null default now()
);
create index if not exists feed_comments_post on public.feed_comments (post_id, created_at desc, id desc);
create index if not exists feed_comments_author on public.feed_comments (author_id, created_at desc);

create or replace function public.feed_comments_prepare() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  prof record;
  biz record;
begin
  if me is null then
    if current_user in ('postgres', 'service_role', 'supabase_admin') then return new; end if;
    raise exception 'not_signed_in';
  end if;
  new.author_id := me;
  new.created_at := now();
  new.status := 'published';
  new.body := btrim(new.body);
  select p.full_name, p.status, p.created_at into prof from public.profiles p where p.id = me;
  if prof is null or prof.status <> 'active' then raise exception 'not_active_member'; end if;
  select b.name, b.slug into biz from public.businesses b
    where b.owner_id = me and b.published and b.publication_status = 'published' and b.lifecycle_status = 'approved' and b.risk_level = 'low'
    order by b.created_at limit 1;
  new.author_name := left(coalesce(nullif(btrim(biz.name), ''), nullif(btrim(prof.full_name), ''), 'FLAME PH member'), 120);
  new.author_slug := biz.slug;
  if (select count(*) from public.feed_comments c where c.author_id = me and c.created_at > now() - interval '1 hour') >= 30 then raise exception 'comment_rate_limit'; end if;
  if exists (select 1 from public.feed_comments c where c.author_id = me and c.post_id = new.post_id and c.created_at > now() - interval '10 minutes' and lower(c.body) = lower(new.body)) then raise exception 'duplicate_comment'; end if;
  if public.feed_link_count(new.body) > 2 then raise exception 'too_many_links'; end if;
  if prof.created_at > now() - interval '1 day' and public.feed_link_count(new.body) > 0 then raise exception 'new_account_links'; end if;
  return new;
end $$;
drop trigger if exists feed_comments_prepare on public.feed_comments;
create trigger feed_comments_prepare before insert on public.feed_comments for each row execute function public.feed_comments_prepare();

alter table public.feed_comments enable row level security;
revoke all on public.feed_comments from anon;
revoke all on public.feed_comments from authenticated;
grant select, insert, delete on public.feed_comments to authenticated;
grant update (status) on public.feed_comments to authenticated;
drop policy if exists feed_comments_select on public.feed_comments;
create policy feed_comments_select on public.feed_comments for select to authenticated
  using (((status = 'published' and public.member_is_active(author_id)) or author_id = auth.uid() or public.is_admin())
    and exists (select 1 from public.feed_posts p where p.id = post_id));
drop policy if exists feed_comments_insert on public.feed_comments;
create policy feed_comments_insert on public.feed_comments for insert to authenticated
  with check (author_id = auth.uid() and public.member_is_active(auth.uid())
    and exists (select 1 from public.feed_posts p where p.id = post_id and p.status = 'published'));
drop policy if exists feed_comments_moderate on public.feed_comments;
create policy feed_comments_moderate on public.feed_comments for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists feed_comments_delete on public.feed_comments;
create policy feed_comments_delete on public.feed_comments for delete to authenticated
  using (author_id = auth.uid() or public.is_admin() or exists (select 1 from public.feed_posts p where p.id = post_id and p.author_id = auth.uid()));

-- Reactions: one per member per post; changing it replaces the kind.
create table if not exists public.feed_reactions (
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null default 'like' check (kind in ('like', 'love', 'helpful')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists feed_reactions_user on public.feed_reactions (user_id);
alter table public.feed_reactions enable row level security;
revoke all on public.feed_reactions from anon;
revoke all on public.feed_reactions from authenticated;
grant select, insert, delete on public.feed_reactions to authenticated;
grant update (kind) on public.feed_reactions to authenticated;
drop policy if exists feed_reactions_select on public.feed_reactions;
create policy feed_reactions_select on public.feed_reactions for select to authenticated
  using (exists (select 1 from public.feed_posts p where p.id = post_id));
drop policy if exists feed_reactions_insert on public.feed_reactions;
create policy feed_reactions_insert on public.feed_reactions for insert to authenticated
  with check (user_id = auth.uid() and public.member_is_active(auth.uid()) and exists (select 1 from public.feed_posts p where p.id = post_id and p.status = 'published'));
drop policy if exists feed_reactions_update on public.feed_reactions;
create policy feed_reactions_update on public.feed_reactions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists feed_reactions_delete on public.feed_reactions;
create policy feed_reactions_delete on public.feed_reactions for delete to authenticated using (user_id = auth.uid());

-- Counts for one page of posts (at most 50 ids). Runs as the member, so row rules apply.
create or replace function public.feed_post_stats(ids uuid[])
returns table (post_id uuid, likes int, loves int, helpful int, comments int, mine text)
language sql stable set search_path = public as $$
  select p.id,
    (select count(*) from public.feed_reactions r where r.post_id = p.id and r.kind = 'like')::int,
    (select count(*) from public.feed_reactions r where r.post_id = p.id and r.kind = 'love')::int,
    (select count(*) from public.feed_reactions r where r.post_id = p.id and r.kind = 'helpful')::int,
    (select count(*) from public.feed_comments c where c.post_id = p.id and c.status = 'published')::int,
    (select r.kind from public.feed_reactions r where r.post_id = p.id and r.user_id = auth.uid())
  from public.feed_posts p
  where p.id = any (ids[1:50]);
$$;
revoke all on function public.feed_post_stats(uuid[]) from public;
grant execute on function public.feed_post_stats(uuid[]) to authenticated;

-- The newest few comments under each post on a page (at most 50 posts, 5 comments each).
create or replace function public.feed_recent_comments(ids uuid[], per_post int default 2)
returns setof public.feed_comments
language sql stable set search_path = public as $$
  select c.* from unnest(ids[1:50]) as i(id)
  cross join lateral (
    select * from public.feed_comments c where c.post_id = i.id and c.status = 'published'
    order by c.created_at desc, c.id desc limit least(greatest(per_post, 1), 5)
  ) c;
$$;
revoke all on function public.feed_recent_comments(uuid[], int) from public;
grant execute on function public.feed_recent_comments(uuid[], int) to authenticated;

-- Forum front page: how many posts each industry has, and when the latest was. One row per industry.
create or replace function public.forum_categories()
returns table (category text, posts int, latest_at timestamptz)
language sql stable set search_path = public as $$
  select f.category, count(*)::int, max(f.created_at) from public.feed_posts f where f.status = 'published' group by f.category;
$$;
revoke all on function public.forum_categories() from public;
grant execute on function public.forum_categories() to authenticated;
