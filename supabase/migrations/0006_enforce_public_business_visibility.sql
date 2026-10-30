-- Enforce business publication eligibility at the database boundary.
-- Application filters remain useful defense-in-depth, but RLS is authoritative:
-- modified browser requests cannot read a draft, quarantined or unpublished row.

drop policy if exists businesses_public on public.businesses;
create policy businesses_public
  on public.businesses for select
  using (
    published
    and publication_status = 'published'
    and lifecycle_status = 'approved'
  );

drop policy if exists products_public on public.business_products;
create policy products_public
  on public.business_products for select
  using (
    exists (
      select 1
      from public.businesses b
      where b.id = business_products.business_id
        and b.published
        and b.publication_status = 'published'
        and b.lifecycle_status = 'approved'
    )
  );

-- Public reviews must not reveal the existence or identity of an unpublished
-- business. Review authors retain access to their own row and admins retain
-- moderation access.
drop policy if exists reviews_public on public.business_reviews;
create policy reviews_public
  on public.business_reviews for select
  using (
    user_id = auth.uid()
    or public.is_admin()
    or (
      not hidden
      and exists (
        select 1
        from public.businesses b
        where b.id = business_reviews.business_id
          and b.published
          and b.publication_status = 'published'
          and b.lifecycle_status = 'approved'
      )
    )
  );

-- A forged client request cannot add a review to a non-public business.
drop policy if exists reviews_self_insert on public.business_reviews;
create policy reviews_self_insert
  on public.business_reviews for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.businesses b
      where b.id = business_reviews.business_id
        and b.published
        and b.publication_status = 'published'
        and b.lifecycle_status = 'approved'
    )
  );

create index if not exists businesses_public_directory_idx
  on public.businesses (created_at desc)
  where published
    and publication_status = 'published'
    and lifecycle_status = 'approved';

create or replace function public.track_business(biz uuid, kind text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.businesses
    where id = biz
      and published
      and publication_status = 'published'
      and lifecycle_status = 'approved'
  ) then return; end if;

  insert into public.business_stats (business_id, day, views, clicks)
  values (
    biz,
    (now() at time zone 'Asia/Manila')::date,
    case when kind = 'view' then 1 else 0 end,
    case when kind = 'click' then 1 else 0 end
  )
  on conflict (business_id, day) do update
    set views = business_stats.views + excluded.views,
        clicks = business_stats.clicks + excluded.clicks;
end;
$$;

create or replace function public.public_stats() returns jsonb
language sql stable security definer set search_path = public as $$
  with m as (
    select p.* from public.profiles p
    join auth.users u on u.id = p.id
    where u.email_confirmed_at is not null
  ), rated as (
    select count(*) as n, count(*) filter (where helpful) as up
    from public.ai_feedback
  ), public_businesses as (
    select * from public.businesses
    where published
      and publication_status = 'published'
      and lifecycle_status = 'approved'
  )
  select jsonb_build_object(
    'members', (select count(*) from m),
    'members_this_month', (select count(*) from m where created_at >= date_trunc('month', now() at time zone 'Asia/Manila') at time zone 'Asia/Manila'),
    'provinces', (select count(distinct lower(trim(province))) from m where coalesce(trim(province),'') <> ''),
    'cities', (select count(distinct lower(trim(city)) || '|' || lower(trim(coalesce(province,'')))) from m where coalesce(trim(city),'') <> ''),
    'businesses', (select count(*) from public_businesses),
    'verified_businesses', (select count(*) from public_businesses where verified),
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

-- Rollback guidance: restore the policy and function definitions from 0001 and
-- 0003 only if application code has also been rolled back. Leave lifecycle data
-- intact; this migration never modifies or deletes a business record.
