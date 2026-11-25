-- Open directory: listings that pass the automatic checks are published at once, with no admin approval, and
-- Find members lists every active member (not only approved listings), most relevant first.
-- Admins keep every existing tool: hide, restore, suspend listing, reject, ban owner, and (super admin) delete.
-- Additive: replaces one function, adds one function, and publishes listings already waiting for approval that
-- passed the automatic checks (low risk, owner active, complete). Every change is written to audit_log.
-- Rollback: supabase/rollback/0041_open_directory_undo.sql

-- 1. Submitting a listing publishes it right away when the automatic content check found nothing ("low" risk).
--    Listings the check flags ("needs_review") still wait for an admin; "high" is still refused.
create or replace function public.submit_business_for_review(p_business_id uuid, p_owner_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare business public.businesses%rowtype; email_verified boolean; mobile_verified boolean;
  mobile_required boolean := false; missing text[]; auto boolean;
begin
  if current_user not in ('service_role','postgres','supabase_admin') then raise exception 'TRUSTED_SERVER_REQUIRED'; end if;
  select * into business from public.businesses where id = p_business_id;
  if business.id is null or business.owner_id <> p_owner_id then raise exception 'BUSINESS_NOT_FOUND'; end if;
  if business.risk_level = 'high' then raise exception 'BUSINESS_HIGH_SUSPICION'; end if;
  if business.lifecycle_status not in ('draft','needs_correction','rejected') then raise exception 'BUSINESS_NOT_SUBMITTABLE'; end if;
  missing := public.business_submission_missing_requirements(p_business_id, p_owner_id);
  if coalesce(cardinality(missing),0) > 0 then raise exception 'BUSINESS_INCOMPLETE:%', array_to_string(missing, ','); end if;
  select email_verified_at is not null, mobile_verified_at is not null into email_verified, mobile_verified
    from public.profiles where id = p_owner_id;
  select coalesce(value->'require_mobile_for_submission' = 'true'::jsonb,false) into mobile_required
    from public.settings where key = 'business_verification';
  if not coalesce(email_verified,false) then raise exception 'EMAIL_NOT_VERIFIED'; end if;
  if coalesce(mobile_required,false) and not coalesce(mobile_verified,false) then raise exception 'MOBILE_NOT_VERIFIED'; end if;
  auto := business.risk_level = 'low' and exists (select 1 from public.profiles p where p.id = p_owner_id and p.status = 'active');
  if auto then
    update public.businesses set lifecycle_status = 'approved', publication_status = 'published', published = true where id = p_business_id;
  else
    update public.businesses set lifecycle_status = 'submitted', publication_status = 'unpublished', published = false where id = p_business_id;
  end if;
  insert into public.audit_log (actor_id, action, table_name, row_id, detail)
  values (p_owner_id, case when auto then 'business_auto_published' else 'business_submitted' end, 'businesses', p_business_id::text,
    jsonb_build_object('risk_level',business.risk_level,'requirements_complete',true,'email_verified',true,
      'mobile_required',mobile_required,'mobile_verified',mobile_verified,'turnstile_verified',true,'auto_published',auto));
end;
$$;
revoke all on function public.submit_business_for_review(uuid, uuid) from public, anon, authenticated;
grant execute on function public.submit_business_for_review(uuid, uuid) to service_role;

-- 2. Listings already waiting for an admin that passed the automatic check: publish them now (same rule as above).
with ready as (
  select b.id, b.owner_id from public.businesses b
  join public.profiles p on p.id = b.owner_id and p.status = 'active' and p.email_verified_at is not null
  where b.lifecycle_status in ('submitted','pending_review') and b.risk_level = 'low'
    and coalesce(cardinality(public.business_submission_missing_requirements(b.id, b.owner_id)), 0) = 0
), done as (
  update public.businesses b set lifecycle_status = 'approved', publication_status = 'published', published = true
  from ready where b.id = ready.id
  returning b.id, b.owner_id
)
insert into public.audit_log (actor_id, action, table_name, row_id, detail)
select null, 'business_auto_published', 'businesses', done.id::text, jsonb_build_object('reason', '0041 open directory: waiting listing passed automatic checks', 'owner_id', done.owner_id)
from done;

-- 3. Find members: every active member, filtered and ranked for the viewer (same city, chapter, province, shared
--    industries, then members with a photo or logo, Verified, newest). Same privacy rules as suggest_members.
--    Signed-in members only. Followed members are included (shown as "Following") unless p_exclude_followed.
create or replace function public.find_members(p_q text default null, p_industry text default null, p_category text default null,
  p_provinces text[] default null, p_city text default null, p_chapter uuid default null, p_verified boolean default false,
  p_minisite boolean default false, p_exclude_followed boolean default false, max_rows int default 60, p_offset int default 0)
returns table (user_id uuid, total bigint)
language sql stable security definer set search_path = public as $$
  with me as (
    select p.id, nullif(lower(btrim(p.province)), '') as province, nullif(lower(btrim(p.city)), '') as city, p.chapter_id,
      array(select distinct x from unnest(coalesce(p.industries, '{}')
        || coalesce((select array_agg(b.sector) from public.businesses b where b.owner_id = p.id and b.sector is not null), '{}')) x) as wants
    from public.profiles p where p.id = auth.uid() and p.status = 'active'
  ),
  biz as (
    select distinct on (x.owner_id) x.owner_id, x.name, x.sector, x.subsector, x.city, x.province, x.verified, x.logo_url
    from public.businesses x
    where x.published and x.publication_status = 'published' and x.lifecycle_status = 'approved' and x.risk_level = 'low'
    order by x.owner_id, x.verified desc, x.created_at
  ),
  cand as (
    select p.id, p.created_at, b.owner_id is not null as has_biz,
      coalesce(b.verified, false) as verified,
      (p.avatar_path is not null or b.logo_url is not null) as has_photo,
      lower(btrim(coalesce(b.city, p.city, ''))) as city, lower(btrim(coalesce(b.province, p.province, ''))) as province,
      p.chapter_id, coalesce(p.industries, '{}') || array_remove(array[b.sector], null) as inds, b.subsector,
      coalesce(p.full_name, '') || ' ' || coalesce(b.name, '') as names
    from public.profiles p
    cross join me
    left join biz b on b.owner_id = p.id
    where p.id <> me.id and p.status = 'active' and not p.hide_from_suggestions
      and (nullif(btrim(p.full_name), '') is not null or b.owner_id is not null)
      and not public.is_blocked_between(p.id, me.id)
      and not exists (select 1 from public.member_mutes m where m.muter_id = me.id and m.muted_id = p.id)
      and (not p_exclude_followed or not exists (select 1 from public.member_follows f where f.follower_id = me.id and f.followee_id = p.id))
  ),
  hits as (
    select c.*, count(*) over () as total from cand c cross join me
    where (nullif(btrim(p_industry), '') is null or p_industry = any (c.inds))
      and (nullif(btrim(p_category), '') is null or c.subsector ilike btrim(p_category))
      and (p_provinces is null or cardinality(p_provinces) = 0 or c.province = any (select lower(btrim(x)) from unnest(p_provinces) x))
      and (nullif(btrim(p_city), '') is null or c.city like '%' || lower(btrim(p_city)) || '%')
      and (p_chapter is null or c.chapter_id = p_chapter)
      and (not coalesce(p_verified, false) or c.verified)
      and (not coalesce(p_minisite, false) or exists (select 1 from public.member_minisites s where s.owner_id = c.id and s.published))
      and (nullif(btrim(p_q), '') is null or c.names ilike '%' || btrim(p_q) || '%' or c.city like '%' || lower(btrim(p_q)) || '%'
        or c.province like '%' || lower(btrim(p_q)) || '%' or coalesce(c.subsector, '') ilike '%' || btrim(p_q) || '%')
  )
  select h.id, h.total from hits h cross join me
  order by
    (me.city is not null and h.city = me.city)::int * 5 + (me.chapter_id is not null and h.chapter_id = me.chapter_id)::int * 4
    + (me.province is not null and h.province = me.province)::int * 3 + (h.inds && me.wants)::int * 2
    + h.has_photo::int * 2 + h.verified::int + h.has_biz::int desc,
    h.created_at desc
  limit least(greatest(max_rows, 1), 60) offset greatest(p_offset, 0);
$$;
revoke all on function public.find_members(text, text, text, text[], text, uuid, boolean, boolean, boolean, int, int) from public, anon;
grant execute on function public.find_members(text, text, text, text[], text, uuid, boolean, boolean, boolean, int, int) to authenticated;
