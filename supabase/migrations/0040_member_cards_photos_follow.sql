-- Member cards on "Follow members" and Find members: a profile photo, business name, city and province, followers and
-- the verified badge; plus a filtered member search for the follow step. Additive only:
--   * profiles.avatar_url (new, optional; the member's own photo in the public 'media' bucket, their own folder)
--   * member_cards_v2(ids)   (new; the old member_cards stays as it is)
--   * find_members(...)      (new)
-- Undo: supabase/rollback/0040_member_cards_photos_follow_undo.sql

alter table public.profiles add column if not exists avatar_url text;
do $$ begin
  alter table public.profiles add constraint profiles_avatar_url_shape
    check (avatar_url is null or (char_length(avatar_url) <= 300 and avatar_url ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,200}$'));
exception when duplicate_object then null; end $$;

-- Cards for up to 100 members: never contact details. Only active members the viewer has not blocked (or been blocked by).
create or replace function public.member_cards_v2(ids uuid[])
returns table (id uuid, name text, avatar_url text, business_name text, business_logo text, slug text, sector text,
               city text, province text, chapter_id uuid, verified boolean, followers int)
language sql stable security definer set search_path = public as $$
  select p.id,
    coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(b.name), ''), 'FLAME PH member'),
    p.avatar_url,
    nullif(btrim(b.name), ''),
    b.logo_url,
    b.slug, b.sector, coalesce(b.city, p.city), coalesce(b.province, p.province), p.chapter_id,
    coalesce(b.verified, false),
    (select count(*)::int from public.member_follows f where f.followee_id = p.id)
  from public.profiles p
  left join lateral (
    select x.name, x.slug, x.sector, x.city, x.province, x.logo_url, x.verified from public.businesses x
    where x.owner_id = p.id and x.published and x.publication_status = 'published' and x.lifecycle_status = 'approved' and x.risk_level = 'low'
    order by x.created_at limit 1
  ) b on true
  where p.id = any (ids[1:100]) and p.status = 'active' and auth.uid() is not null and not public.is_blocked_between(p.id, auth.uid());
$$;
revoke all on function public.member_cards_v2(uuid[]) from public;
grant execute on function public.member_cards_v2(uuid[]) to authenticated;

-- Members to follow, filtered by industry, province and/or chapter. Returns ids only (cards come from member_cards_v2).
-- Matches the member's own industries or their published business's industry. Never the viewer, never blocked members.
create or replace function public.find_members(p_industry text default null, p_province text default null, p_chapter uuid default null, max_rows int default 24)
returns table (user_id uuid)
language sql stable security definer set search_path = public as $$
  select p.id
  from public.profiles p
  left join lateral (
    select x.sector, x.province from public.businesses x
    where x.owner_id = p.id and x.published and x.publication_status = 'published' and x.lifecycle_status = 'approved' and x.risk_level = 'low'
    order by x.created_at limit 1
  ) b on true
  where auth.uid() is not null and p.id <> auth.uid() and p.status = 'active' and not public.is_blocked_between(p.id, auth.uid())
    and (p_industry is null or p_industry = any (p.industries) or b.sector = p_industry)
    and (p_province is null or lower(coalesce(b.province, p.province, '')) = lower(p_province))
    and (p_chapter is null or p.chapter_id = p_chapter)
  order by (b.sector is not null) desc, p.created_at desc
  limit least(greatest(coalesce(max_rows, 24), 1), 60);
$$;
revoke all on function public.find_members(text, text, uuid, int) from public;
grant execute on function public.find_members(text, text, uuid, int) to authenticated;
