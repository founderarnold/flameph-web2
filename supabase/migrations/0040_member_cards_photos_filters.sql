-- Member cards: a profile photo, business name, place, follower count and Verified badge; and filters for "Follow members".
-- Additive only: one new nullable column on profiles and two new read-only functions. No existing data is changed.
-- Rollback: supabase/rollback/0040_member_cards_photos_filters_undo.sql

-- 1. Profile photo or avatar. A path in the member's own folder of the public `media` bucket (uploads there are
--    already limited to the member's own folder). Empty means: use the business logo, then initials.
alter table public.profiles add column if not exists avatar_path text;
do $$ begin
  alter table public.profiles add constraint profiles_avatar_path_own_folder check (
    avatar_path is null or (char_length(avatar_path) <= 300 and split_part(avatar_path, '/', 1) = id::text
      and avatar_path ~ '^[0-9a-f-]{36}/avatar-[A-Za-z0-9_.-]+$'));
exception when duplicate_object then null; end $$;

-- 2. Card details for a list of members, in one call: person's name, photo, first published business (name, logo,
--    category, place, Verified), and follower count. Signed-in members only; blocked members are left out.
create or replace function public.member_cards_v2(ids uuid[])
returns table (id uuid, person_name text, business_name text, slug text, sector text, subsector text, city text, province text,
  chapter_id uuid, avatar_path text, logo_url text, verified boolean, followers int)
language sql stable security definer set search_path = public as $$
  select p.id,
    coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(b.name), ''), 'FLAME PH member'),
    nullif(btrim(b.name), ''), b.slug, b.sector, b.subsector,
    coalesce(nullif(btrim(b.city), ''), nullif(btrim(p.city), '')), coalesce(nullif(btrim(b.province), ''), nullif(btrim(p.province), '')),
    p.chapter_id, p.avatar_path, b.logo_url, coalesce(b.verified, false),
    (select count(*) from public.member_follows f where f.followee_id = p.id)::int
  from public.profiles p
  left join lateral (
    select x.name, x.slug, x.sector, x.subsector, x.city, x.province, x.logo_url, x.verified from public.businesses x
    where x.owner_id = p.id and x.published and x.publication_status = 'published' and x.lifecycle_status = 'approved' and x.risk_level = 'low'
    order by x.verified desc, x.created_at limit 1
  ) b on true
  where p.id = any (ids[1:100]) and p.status = 'active' and auth.uid() is not null and not public.is_blocked_between(p.id, auth.uid());
$$;
revoke all on function public.member_cards_v2(uuid[]) from public, anon;
grant execute on function public.member_cards_v2(uuid[]) to authenticated;

-- 3. Members to follow, filtered by industry, business category, province, city, Verified, or a name.
--    Same privacy rules as suggest_members: active members only, never people who hid themselves from suggestions,
--    blocked, muted, already followed, or the viewer. Closest matches first (same city, chapter, province), then newest.
create or replace function public.browse_members(p_industry text default null, p_category text default null, p_province text default null,
  p_city text default null, p_verified boolean default false, p_q text default null, max_rows int default 24)
returns table (user_id uuid)
language sql stable security definer set search_path = public as $$
  with me as (select p.id, p.province, p.city, p.chapter_id from public.profiles p where p.id = auth.uid() and p.status = 'active'),
  biz as (
    select x.owner_id, x.name, x.sector, x.subsector, x.city, x.province, x.verified from public.businesses x
    where x.published and x.publication_status = 'published' and x.lifecycle_status = 'approved' and x.risk_level = 'low'
  )
  select p.id
  from public.profiles p cross join me
  where p.id <> me.id and p.status = 'active' and not p.hide_from_suggestions
    and (nullif(btrim(p.full_name), '') is not null or exists (select 1 from biz where biz.owner_id = p.id and nullif(btrim(biz.name), '') is not null))
    and not public.is_blocked_between(p.id, me.id)
    and not exists (select 1 from public.member_follows f where f.follower_id = me.id and f.followee_id = p.id)
    and not exists (select 1 from public.member_mutes m where m.muter_id = me.id and m.muted_id = p.id)
    and (nullif(btrim(p_industry), '') is null or p_industry = any (coalesce(p.industries, '{}'))
      or exists (select 1 from biz where biz.owner_id = p.id and biz.sector = p_industry))
    and (nullif(btrim(p_category), '') is null or exists (select 1 from biz where biz.owner_id = p.id and biz.subsector ilike btrim(p_category)))
    and (nullif(btrim(p_province), '') is null or lower(btrim(coalesce(p.province, ''))) = lower(btrim(p_province))
      or exists (select 1 from biz where biz.owner_id = p.id and lower(btrim(coalesce(biz.province, ''))) = lower(btrim(p_province))))
    and (nullif(btrim(p_city), '') is null or btrim(coalesce(p.city, '')) ilike '%' || btrim(p_city) || '%'
      or exists (select 1 from biz where biz.owner_id = p.id and btrim(coalesce(biz.city, '')) ilike '%' || btrim(p_city) || '%'))
    and (not coalesce(p_verified, false) or exists (select 1 from biz where biz.owner_id = p.id and biz.verified))
    and (nullif(btrim(p_q), '') is null or p.full_name ilike '%' || btrim(p_q) || '%'
      or exists (select 1 from biz where biz.owner_id = p.id and biz.name ilike '%' || btrim(p_q) || '%'))
  order by (me.city is not null and lower(btrim(coalesce(p.city, ''))) = lower(btrim(me.city)))::int * 3
         + (me.chapter_id is not null and p.chapter_id = me.chapter_id)::int * 2
         + (me.province is not null and lower(btrim(coalesce(p.province, ''))) = lower(btrim(me.province)))::int desc,
    p.created_at desc
  limit least(greatest(max_rows, 1), 60);
$$;
revoke all on function public.browse_members(text, text, text, text, boolean, text, int) from public, anon;
grant execute on function public.browse_members(text, text, text, text, boolean, text, int) to authenticated;
