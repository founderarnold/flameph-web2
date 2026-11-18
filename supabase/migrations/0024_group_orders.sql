-- Phase 10: Group Order. Members start group orders on the existing buy-together deals (public.deals, public.deal_participants),
-- gather members who want the same item, and send one bulk request to a supplier through the existing requests (0022).
-- Members pay the supplier directly. No money passes through FLAME PH. Additive only: nothing is renamed or removed.

-- 1. Member group orders are ordinary deals with an organizer, a minimum quantity and a link to the bulk request.
alter table public.deals
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists members_only boolean not null default false,
  add column if not exists min_quantity int check (min_quantity is null or min_quantity between 1 and 100000),
  add column if not exists category text check (category is null or char_length(category) between 2 and 60),
  add column if not exists supplier_id uuid references auth.users(id) on delete set null,
  add column if not exists request_id uuid references public.service_requests(id) on delete set null,
  add column if not exists sent_at timestamptz;
create index if not exists deals_created_by on public.deals (created_by, created_at desc) where created_by is not null;
create unique index if not exists deals_request on public.deals (request_id) where request_id is not null;

-- True when the viewer is a signed-in, active member. Visitors (anon) may call it (member_is_active is not theirs to call).
create or replace function public.viewer_is_active_member() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and public.member_is_active(auth.uid());
$$;
revoke all on function public.viewer_is_active_member() from public;
grant execute on function public.viewer_is_active_member() to anon, authenticated;

-- Visitors keep seeing FLAME PH's published deals; member group orders are for signed-in active members only.
drop policy if exists deals_public on public.deals;
create policy deals_public on public.deals for select
  using (published and (not members_only or public.viewer_is_active_member()));

-- Joining: only while the group order is open, before its deadline (Manila date) and before it is sent to the supplier,
-- and never into a member's group order across a block. Staff rules and leaving are unchanged.
drop policy if exists deal_participants_self on public.deal_participants;
create policy deal_participants_self on public.deal_participants for all
  using (user_id = auth.uid() or public.is_staff())
  with check (user_id = auth.uid() and exists (
    select 1 from public.deals d
    where d.id = deal_id and d.published and d.status = 'open' and d.sent_at is null
      and (d.deadline is null or d.deadline >= (now() at time zone 'Asia/Manila')::date)
      and (not d.members_only or public.viewer_is_active_member())
      and (d.created_by is null or not public.is_blocked_between(d.created_by, auth.uid()))));

-- 2. Start a group order (the organizer also joins it with their own quantity).
create or replace function public.start_group_order(
  p_title text, p_description text, p_category text, p_unit text, p_price numeric, p_target int, p_min_qty int,
  p_deadline date, p_supplier text, p_supplier_id uuid, p_quantity int) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); today date := (now() at time zone 'Asia/Manila')::date; did uuid; txt text;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if not public.member_is_active(me) then raise exception 'not_active_member'; end if;
  if public.member_is_muted(me) then raise exception 'moderator_mute'; end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 3 and 120 then raise exception 'bad_input'; end if;
  if char_length(coalesce(p_description, '')) > 1000 or char_length(coalesce(p_unit, '')) > 30 or char_length(coalesce(p_supplier, '')) > 120 then raise exception 'bad_input'; end if;
  if char_length(coalesce(p_category, '')) not between 2 and 60 then raise exception 'bad_input'; end if;
  if p_price is not null and (p_price < 0 or p_price > 10000000) then raise exception 'bad_input'; end if;
  if p_target is null or p_target not between 2 and 500 then raise exception 'bad_input'; end if;
  if p_min_qty is not null and p_min_qty not between 1 and 100000 then raise exception 'bad_input'; end if;
  if p_quantity is null or p_quantity not between 1 and 10000 then raise exception 'bad_input'; end if;
  if p_deadline is null or p_deadline < today + 1 or p_deadline > today + 60 then raise exception 'bad_deadline'; end if;
  if p_supplier_id is not null then
    if p_supplier_id = me then raise exception 'own_request'; end if;
    if not public.member_is_active(p_supplier_id) then raise exception 'not_available'; end if;
    if public.is_blocked_between(me, p_supplier_id) then raise exception 'blocked'; end if;
  end if;
  if (select count(*) from public.deals d where d.created_by = me and d.status = 'open' and d.sent_at is null) >= 3 then raise exception 'group_order_limit'; end if;
  if (select count(*) from public.deals d where d.created_by = me and d.created_at > now() - interval '1 day') >= 5 then raise exception 'group_order_limit'; end if;
  txt := p_title || ' ' || coalesce(p_description, '') || ' ' || coalesce(p_supplier, '');
  if public.moderation_text_check(txt) is not null then raise exception 'blocked_words'; end if;
  insert into public.deals (title, supplier, description, unit, deal_price, target_members, deadline, status, published,
                            created_by, members_only, min_quantity, category, supplier_id)
    values (btrim(p_title), nullif(btrim(coalesce(p_supplier, '')), ''), nullif(btrim(coalesce(p_description, '')), ''),
            nullif(btrim(coalesce(p_unit, '')), ''), p_price, p_target, p_deadline, 'open', true,
            me, true, p_min_qty, p_category, p_supplier_id)
    returning id into did;
  insert into public.deal_participants (deal_id, user_id, quantity) values (did, me, p_quantity);
  return did;
end $$;
revoke all on function public.start_group_order(text, text, text, text, numeric, int, int, date, text, uuid, int) from public, anon;
grant execute on function public.start_group_order(text, text, text, text, numeric, int, int, date, text, uuid, int) to authenticated;

-- 3. Who has joined (signed-in active members only; never across a block; no contact details).
create or replace function public.group_order_members(p_deal uuid)
returns table (user_id uuid, quantity int, joined_at timestamptz, is_organizer boolean)
language sql stable security definer set search_path = public as $$
  select dp.user_id, dp.quantity, dp.created_at, dp.user_id = d.created_by
  from public.deals d join public.deal_participants dp on dp.deal_id = d.id
  where d.id = p_deal and d.published and public.member_is_active(auth.uid())
    and (dp.user_id = auth.uid() or not public.is_blocked_between(dp.user_id, auth.uid()))
  order by dp.created_at
  limit 200;
$$;
revoke all on function public.group_order_members(uuid) from public, anon;
grant execute on function public.group_order_members(uuid) to authenticated;

-- 4. Progress of group orders: totals, and where the bulk request stands (status only: no terms, amounts or names).
create or replace function public.group_order_progress(ids uuid[])
returns table (deal_id uuid, members bigint, quantity bigint, request_status text, quotes bigint, record_id uuid, record_status text)
language sql stable security definer set search_path = public as $$
  select d.id,
    (select count(*) from public.deal_participants dp where dp.deal_id = d.id),
    (select coalesce(sum(dp.quantity), 0) from public.deal_participants dp where dp.deal_id = d.id),
    r.status,
    (select count(*) from public.service_quotes q where q.request_id = d.request_id and q.status in ('sent', 'accepted')),
    -- The record id only for its two members (the organizer and the supplier); everyone else sees its status.
    (select case when t.requester_id = auth.uid() or t.provider_id = auth.uid() then t.id end
       from public.transaction_records t where t.request_id = d.request_id order by t.created_at desc limit 1),
    (select t.status from public.transaction_records t where t.request_id = d.request_id order by t.created_at desc limit 1)
  from public.deals d left join public.service_requests r on r.id = d.request_id
  where d.id = any (ids[1:100]) and d.published and public.member_is_active(auth.uid());
$$;
revoke all on function public.group_order_progress(uuid[]) from public, anon;
grant execute on function public.group_order_progress(uuid[]) to authenticated;

-- 5. The organizer sends one bulk request to the supplier (a member, or open to all members), once the minimum is reached.
-- The request goes through the existing requests checks (service_requests_prepare): active, records consent, limits, words.
create or replace function public.send_group_order(p_deal uuid, p_needed_by date) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); d public.deals; total bigint; n bigint; rid uuid; body text;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  select * into d from public.deals where id = p_deal for update;
  if d.id is null or d.created_by is distinct from me then raise exception 'not_found'; end if;
  if d.status <> 'open' or d.sent_at is not null then raise exception 'already_sent'; end if;
  select count(*), coalesce(sum(quantity), 0) into n, total from public.deal_participants where deal_id = d.id;
  if total < coalesce(d.min_quantity, 1) then raise exception 'below_minimum'; end if;
  if p_needed_by is not null and (p_needed_by < (now() at time zone 'Asia/Manila')::date or p_needed_by > (now() at time zone 'Asia/Manila')::date + 180) then raise exception 'bad_date'; end if;
  body := 'Group order from ' || n || ' FLAME PH member' || case when n = 1 then '' else 's' end || '. Total: ' || total
    || coalesce(' ' || d.unit, '') || case when d.deal_price is not null then '. Price asked: PHP ' || d.deal_price || coalesce(' per ' || d.unit, '') else '' end
    || '. Each member pays the supplier directly; no money passes through FLAME PH.'
    || coalesce(E'\n\n' || left(d.description, 700), '');
  insert into public.service_requests (provider_id, title, category, details, needed_by)
    values (d.supplier_id, left('Group order: ' || d.title, 120), d.category, left(body, 1000), p_needed_by)
    returning id into rid;
  update public.deals set request_id = rid, sent_at = now() where id = d.id;
  return rid;
end $$;
revoke all on function public.send_group_order(uuid, date) from public, anon;
grant execute on function public.send_group_order(uuid, date) to authenticated;

-- 6. The organizer closes their group order (members are told in the app; nothing is charged anywhere).
create or replace function public.close_group_order(p_deal uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  update public.deals set status = 'closed' where id = p_deal and created_by = me and status <> 'closed';
  if not found then raise exception 'not_found'; end if;
end $$;
revoke all on function public.close_group_order(uuid) from public, anon;
grant execute on function public.close_group_order(uuid) to authenticated;
