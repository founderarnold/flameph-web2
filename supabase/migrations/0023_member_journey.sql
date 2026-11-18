-- Member journey: home chapter from the profile, member suggestions, photos and videos in posts, business news headlines.
-- Additive only: two new tables, new functions and two new columns on feed_posts. Nothing existing is renamed or removed.
-- Take a backup before applying to production. Row level security is on for every new table.

-- ---------------------------------------------------------------------------
-- 1. Provinces (and their region) so a chapter can be opened only for a real province.
-- ---------------------------------------------------------------------------
create table if not exists public.ph_provinces (
  name text primary key check (char_length(name) between 2 and 60),
  region text not null check (char_length(region) between 2 and 60)
);
alter table public.ph_provinces enable row level security;
revoke all on public.ph_provinces from anon;
revoke all on public.ph_provinces from authenticated;
grant select on public.ph_provinces to anon, authenticated;
drop policy if exists ph_provinces_read on public.ph_provinces;
create policy ph_provinces_read on public.ph_provinces for select to anon, authenticated using (true);

insert into public.ph_provinces (name, region) values
  ('Abra', 'CAR'),
  ('Agusan del Norte', 'Region XIII (Caraga)'),
  ('Agusan del Sur', 'Region XIII (Caraga)'),
  ('Aklan', 'Region VI (Western Visayas)'),
  ('Albay', 'Region V (Bicol)'),
  ('Antique', 'Region VI (Western Visayas)'),
  ('Apayao', 'CAR'),
  ('Aurora', 'Region III (Central Luzon)'),
  ('Basilan', 'BARMM'),
  ('Bataan', 'Region III (Central Luzon)'),
  ('Batanes', 'Region II (Cagayan Valley)'),
  ('Batangas', 'Region IV-A (CALABARZON)'),
  ('Benguet', 'CAR'),
  ('Biliran', 'Region VIII (Eastern Visayas)'),
  ('Bohol', 'Region VII (Central Visayas)'),
  ('Bukidnon', 'Region X (Northern Mindanao)'),
  ('Bulacan', 'Region III (Central Luzon)'),
  ('Cagayan', 'Region II (Cagayan Valley)'),
  ('Camarines Norte', 'Region V (Bicol)'),
  ('Camarines Sur', 'Region V (Bicol)'),
  ('Camiguin', 'Region X (Northern Mindanao)'),
  ('Capiz', 'Region VI (Western Visayas)'),
  ('Catanduanes', 'Region V (Bicol)'),
  ('Cavite', 'Region IV-A (CALABARZON)'),
  ('Cebu', 'Region VII (Central Visayas)'),
  ('Cotabato', 'Region XII (SOCCSKSARGEN)'),
  ('Davao de Oro', 'Region XI (Davao)'),
  ('Davao del Norte', 'Region XI (Davao)'),
  ('Davao del Sur', 'Region XI (Davao)'),
  ('Davao Occidental', 'Region XI (Davao)'),
  ('Davao Oriental', 'Region XI (Davao)'),
  ('Dinagat Islands', 'Region XIII (Caraga)'),
  ('Eastern Samar', 'Region VIII (Eastern Visayas)'),
  ('Guimaras', 'Region VI (Western Visayas)'),
  ('Ifugao', 'CAR'),
  ('Ilocos Norte', 'Region I (Ilocos)'),
  ('Ilocos Sur', 'Region I (Ilocos)'),
  ('Iloilo', 'Region VI (Western Visayas)'),
  ('Isabela', 'Region II (Cagayan Valley)'),
  ('Kalinga', 'CAR'),
  ('La Union', 'Region I (Ilocos)'),
  ('Laguna', 'Region IV-A (CALABARZON)'),
  ('Lanao del Norte', 'Region X (Northern Mindanao)'),
  ('Lanao del Sur', 'BARMM'),
  ('Leyte', 'Region VIII (Eastern Visayas)'),
  ('Maguindanao del Norte', 'BARMM'),
  ('Maguindanao del Sur', 'BARMM'),
  ('Marinduque', 'MIMAROPA'),
  ('Masbate', 'Region V (Bicol)'),
  ('Metro Manila', 'NCR'),
  ('Misamis Occidental', 'Region X (Northern Mindanao)'),
  ('Misamis Oriental', 'Region X (Northern Mindanao)'),
  ('Mountain Province', 'CAR'),
  ('Negros Occidental', 'NIR (Negros Island)'),
  ('Negros Oriental', 'NIR (Negros Island)'),
  ('Northern Samar', 'Region VIII (Eastern Visayas)'),
  ('Nueva Ecija', 'Region III (Central Luzon)'),
  ('Nueva Vizcaya', 'Region II (Cagayan Valley)'),
  ('Occidental Mindoro', 'MIMAROPA'),
  ('Oriental Mindoro', 'MIMAROPA'),
  ('Palawan', 'MIMAROPA'),
  ('Pampanga', 'Region III (Central Luzon)'),
  ('Pangasinan', 'Region I (Ilocos)'),
  ('Quezon', 'Region IV-A (CALABARZON)'),
  ('Quirino', 'Region II (Cagayan Valley)'),
  ('Rizal', 'Region IV-A (CALABARZON)'),
  ('Romblon', 'MIMAROPA'),
  ('Samar', 'Region VIII (Eastern Visayas)'),
  ('Sarangani', 'Region XII (SOCCSKSARGEN)'),
  ('Siquijor', 'NIR (Negros Island)'),
  ('Sorsogon', 'Region V (Bicol)'),
  ('South Cotabato', 'Region XII (SOCCSKSARGEN)'),
  ('Southern Leyte', 'Region VIII (Eastern Visayas)'),
  ('Sultan Kudarat', 'Region XII (SOCCSKSARGEN)'),
  ('Sulu', 'BARMM'),
  ('Surigao del Norte', 'Region XIII (Caraga)'),
  ('Surigao del Sur', 'Region XIII (Caraga)'),
  ('Tarlac', 'Region III (Central Luzon)'),
  ('Tawi-Tawi', 'BARMM'),
  ('Zambales', 'Region III (Central Luzon)'),
  ('Zamboanga del Norte', 'Region IX (Zamboanga Peninsula)'),
  ('Zamboanga del Sur', 'Region IX (Zamboanga Peninsula)'),
  ('Zamboanga Sibugay', 'Region IX (Zamboanga Peninsula)')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Home chapter: the chapter for the member's own province (and city), taken from their profile.
--    When the province has no chapter yet, a "forming" chapter is opened for it, so new members have somewhere to start.
--    Never moves anyone: it only returns the chapter. The member still chooses on the welcome screen.
-- ---------------------------------------------------------------------------
create or replace function public.home_chapter()
returns table (id uuid, name text, slug text, province text, city text, status text, created boolean)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
  prof record;
  pv record;
  ch record;
  new_slug text;
  made int := 0;
begin
  if me is null or not public.member_is_active(me) then raise exception 'not_active_member'; end if;
  select p.province, p.city into prof from public.profiles p where p.id = me;
  select v.name, v.region into pv from public.ph_provinces v where lower(v.name) = lower(btrim(coalesce(prof.province, '')));
  if pv.name is null then return; end if;

  -- A chapter in the member's city first, then one for the whole province, then any chapter in the province.
  select c.id, c.name, c.slug, c.province, c.city, c.status into ch from public.chapters c
  where c.published and c.status <> 'inactive' and lower(btrim(coalesce(c.province, ''))) = lower(pv.name)
  order by (prof.city is not null and lower(btrim(coalesce(c.city, ''))) = lower(btrim(prof.city))) desc,
           (c.city is null) desc, (c.status = 'active') desc, c.created_at
  limit 1;

  if ch.id is null then
    new_slug := 'flame-ph-' || trim(both '-' from regexp_replace(lower(pv.name), '[^a-z0-9]+', '-', 'g'));
    insert into public.chapters (name, slug, region, province, status, published, description)
      values ('FLAME PH ' || pv.name || ' Chapter', new_slug, pv.region, pv.name, 'forming', true,
              'A forming chapter for MSMEs in ' || pv.name || '. Members here meet, post and buy together while a volunteer leader steps up.')
      on conflict (slug) do nothing;
    get diagnostics made = row_count;
    select c.id, c.name, c.slug, c.province, c.city, c.status into ch from public.chapters c
      where c.slug = new_slug and c.published and c.status <> 'inactive';
    if ch.id is null then return; end if; -- an admin closed or unpublished it: suggest nothing
  end if;
  return query select ch.id, ch.name, ch.slug, ch.province, ch.city, ch.status, made > 0;
end $$;
revoke all on function public.home_chapter() from public;
grant execute on function public.home_chapter() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Members to follow: every active member with a name, not only published businesses.
--    Ranked by same city, same chapter, people you both know, shared industries, same province and shared groups.
--    Never yourself, anyone blocked either way, anyone you follow, muted or are already Friends with.
--    Returns only why each one is suggested (and one shared industry), never contact details.
-- ---------------------------------------------------------------------------
create or replace function public.suggest_members(max_rows int default 24)
returns table (user_id uuid, reason text, detail text, score int)
language sql stable security definer set search_path = public as $$
  with me as (
    select p.id, nullif(btrim(p.province), '') as province, nullif(btrim(p.city), '') as city, p.chapter_id,
      array(select distinct x from unnest(coalesce(p.industries, '{}')
        || coalesce((select array_agg(b.sector) from public.businesses b where b.owner_id = p.id and b.sector is not null), '{}')) x) as wants
    from public.profiles p where p.id = auth.uid() and p.status = 'active'
  ),
  my_groups as (select g.group_id from public.group_members g join me on g.user_id = me.id),
  mutual as (select m.user_id, m.mutual from public.mutual_suggestions(50) m),
  cand as (
    select p.id, p.created_at,
      (me.city is not null and lower(btrim(coalesce(p.city, ''))) = lower(me.city)
        and lower(btrim(coalesce(p.province, ''))) = lower(coalesce(me.province, ''))) as same_city,
      (me.province is not null and lower(btrim(coalesce(p.province, ''))) = lower(me.province)) as same_province,
      (me.chapter_id is not null and p.chapter_id = me.chapter_id) as same_chapter,
      (select x from unnest(coalesce(p.industries, '{}')
         || coalesce((select array_agg(b.sector) from public.businesses b where b.owner_id = p.id and b.sector is not null), '{}')) x
       where x = any (me.wants) limit 1) as shared,
      (select count(*) from unnest(coalesce(p.industries, '{}')) x where x = any (me.wants))::int as shared_n,
      (select count(*) from public.group_members g where g.user_id = p.id and g.group_id in (select group_id from my_groups))::int as groups_n,
      coalesce(mu.mutual, 0) as mutual,
      p.city, p.province
    from public.profiles p
    cross join me
    left join mutual mu on mu.user_id = p.id
    where p.id <> me.id and p.status = 'active'
      and (nullif(btrim(p.full_name), '') is not null or exists (select 1 from public.businesses b where b.owner_id = p.id and nullif(btrim(b.name), '') is not null))
      and not public.is_blocked_between(p.id, me.id)
      and not exists (select 1 from public.member_follows f where f.follower_id = me.id and f.followee_id = p.id)
      and not exists (select 1 from public.member_mutes m where m.muter_id = me.id and m.muted_id = p.id)
      and not exists (select 1 from public.friendships f where (f.requester_id = me.id and f.addressee_id = p.id) or (f.requester_id = p.id and f.addressee_id = me.id))
  )
  select c.id,
    case when c.same_city then 'city' when c.same_chapter then 'chapter' when c.mutual > 0 then 'mutual'
         when c.shared is not null then 'industry' when c.same_province then 'province' when c.groups_n > 0 then 'group' else 'new' end,
    case when c.same_city then c.city when c.same_chapter then null when c.mutual > 0 then c.mutual::text
         when c.shared is not null then c.shared when c.same_province then c.province else null end,
    (c.same_city::int * 5 + c.same_chapter::int * 4 + least(c.mutual, 3) * 3 + c.same_province::int * 3
      + least(greatest(c.shared_n, (c.shared is not null)::int), 3) * 2 + least(c.groups_n, 3))
  from cand c
  order by 4 desc, c.created_at desc
  limit least(greatest(max_rows, 1), 50);
$$;
revoke all on function public.suggest_members(int) from public;
grant execute on function public.suggest_members(int) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Photos and videos in posts. Files go to the public `media` bucket under the member's own folder (existing rule);
--    a post may list up to 4 photos (5 MB each) and one short video (20 MB), or one YouTube, Facebook or TikTok link.
--    Checked here against the stored file itself, so no app can attach someone else's file or a bigger one.
-- ---------------------------------------------------------------------------
alter table public.feed_posts
  add column if not exists media jsonb not null default '[]'::jsonb,
  add column if not exists video_url text;
do $$ begin
  alter table public.feed_posts add constraint feed_posts_media_shape check (jsonb_typeof(media) = 'array' and jsonb_array_length(media) <= 5);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.feed_posts add constraint feed_posts_video_url check (video_url is null or (char_length(video_url) <= 300 and video_url ~* '^https://([a-z0-9-]+\.)?(youtube\.com|youtu\.be|facebook\.com|fb\.watch|tiktok\.com)/[^\s<>"]*$'));
exception when duplicate_object then null; end $$;

create or replace function public.feed_posts_media_check() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  item jsonb;
  obj record;
  photos int := 0;
  videos int := 0;
  kind text;
  size bigint;
  mime text;
begin
  if auth.uid() is null and current_user in ('postgres', 'service_role', 'supabase_admin') then return new; end if;
  if new.media is null then new.media := '[]'::jsonb; end if;
  for item in select * from jsonb_array_elements(new.media) loop
    kind := item->>'type';
    if jsonb_typeof(item) <> 'object' or kind not in ('image', 'video')
       or coalesce(item->>'path', '') !~ ('^' || new.author_id::text || '/post-[A-Za-z0-9._-]{1,120}$') then
      raise exception 'bad_media';
    end if;
    select o.metadata into obj from storage.objects o where o.bucket_id = 'media' and o.name = item->>'path';
    if not found then raise exception 'bad_media'; end if;
    size := coalesce((obj.metadata->>'size')::bigint, 0);
    mime := lower(coalesce(obj.metadata->>'mimetype', ''));
    if kind = 'image' then
      photos := photos + 1;
      if mime not in ('image/jpeg', 'image/png', 'image/webp') or size > 5242880 then raise exception 'bad_media'; end if;
    else
      videos := videos + 1;
      if mime not in ('video/mp4', 'video/webm', 'video/quicktime') or size > 20971520 then raise exception 'bad_media'; end if;
    end if;
  end loop;
  if photos > 4 then raise exception 'too_many_photos'; end if;
  if videos + (new.video_url is not null)::int > 1 then raise exception 'one_video'; end if;
  -- Same rule as links in the text: accounts younger than a day cannot post a link.
  if new.video_url is not null and exists (select 1 from public.profiles p where p.id = new.author_id and p.created_at > now() - interval '1 day') then
    raise exception 'new_account_links';
  end if;
  return new;
end $$;
-- Named so it runs after feed_posts_prepare (which sets author_id) and before feed_posts_zgroup.
drop trigger if exists feed_posts_qmedia on public.feed_posts;
create trigger feed_posts_qmedia before insert on public.feed_posts for each row execute function public.feed_posts_media_check();

-- Members cannot change media after posting (only status and held_reason are updatable, as before). Nothing to grant.

-- Post files that never made it into a post (the member removed them or left the page) are removed after 2 days
-- by the daily server job. Server only: no member can call this.
create or replace function public.orphan_post_media(max_rows int default 200)
returns table (name text)
language sql stable security definer set search_path = public as $$
  select o.name from storage.objects o
  where o.bucket_id = 'media' and o.name ~ '^[0-9a-f-]{36}/post-' and o.created_at < now() - interval '2 days'
    and not exists (select 1 from public.feed_posts f where f.media @> jsonb_build_array(jsonb_build_object('path', o.name)))
  order by o.created_at
  limit least(greatest(max_rows, 1), 500);
$$;
revoke all on function public.orphan_post_media(int) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Business news headlines: title, source and link from public Philippine business and government news feeds,
--    fetched once a day by the server (/api/cron/news) and kept 30 days. Members read them; only the server writes.
-- ---------------------------------------------------------------------------
create table if not exists public.news_headlines (
  id uuid primary key default gen_random_uuid(),
  url text not null unique check (char_length(url) <= 600 and url ~* '^https://'),
  title text not null check (char_length(title) between 5 and 300),
  source text not null check (char_length(source) between 2 and 80),
  published_at timestamptz not null,
  fetched_at timestamptz not null default now(),
  hidden boolean not null default false
);
create index if not exists news_headlines_recent on public.news_headlines (published_at desc) where not hidden;
alter table public.news_headlines enable row level security;
revoke all on public.news_headlines from anon;
revoke all on public.news_headlines from authenticated;
grant select on public.news_headlines to authenticated;
grant update (hidden) on public.news_headlines to authenticated;
drop policy if exists news_headlines_read on public.news_headlines;
create policy news_headlines_read on public.news_headlines for select to authenticated using (not hidden or public.is_admin());
drop policy if exists news_headlines_hide on public.news_headlines;
create policy news_headlines_hide on public.news_headlines for update to authenticated using (public.is_admin()) with check (public.is_admin());
