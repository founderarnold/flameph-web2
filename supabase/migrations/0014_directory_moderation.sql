-- Public directory moderation must be enforced by the database, not only by UI code.
-- A published business owned by a suspended member is not publicly readable.
update public.businesses b
set published = false
where b.published
  and exists (select 1 from public.profiles p where p.id = b.owner_id and p.status = 'suspended');

drop policy if exists businesses_public on public.businesses;
create policy businesses_public on public.businesses for select using (
  published
  and exists (
    select 1 from public.profiles
    where profiles.id = businesses.owner_id
      and profiles.status = 'active'
  )
);

-- Products and tracking events follow the same active-owner rule.
drop policy if exists products_public on public.business_products;
create policy products_public on public.business_products for select using (
  exists (
    select 1
    from public.businesses
    join public.profiles on profiles.id = businesses.owner_id
    where businesses.id = business_products.business_id
      and businesses.published
      and profiles.status = 'active'
  )
);

create or replace function public.track_business_event(biz uuid, event_type text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if event_type not in ('view','contact_click') then return; end if;
  if not exists (
    select 1 from public.businesses b
    join public.profiles p on p.id = b.owner_id
    where b.id = biz and b.published and p.status = 'active'
  ) then return; end if;
  insert into public.business_stats (business_id, day, views, contact_clicks)
  values (biz, current_date, case when event_type='view' then 1 else 0 end, case when event_type='contact_click' then 1 else 0 end)
  on conflict (business_id, day) do update set
    views = business_stats.views + excluded.views,
    contact_clicks = business_stats.contact_clicks + excluded.contact_clicks;
end; $$;
