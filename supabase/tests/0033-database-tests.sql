\set ON_ERROR_STOP 1
-- Partner Step 3 (territories and appointments) database tests. Run on a LOCAL copy built from migrations 0001-0033,
-- never on the live database. Each "do" block expects a refusal; if the refusal does not come, it stops with an error.
-- People: A, B, C accredited suppliers; S accredited service provider; N member who is not accredited;
--         R national reviewer; D admin; T chapter tester and K chapter coordinator (chapter X); F finance.
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-0000000000a1','a@x.test'),('00000000-0000-0000-0000-0000000000a2','b@x.test'),('00000000-0000-0000-0000-0000000000a3','c@x.test'),
 ('00000000-0000-0000-0000-0000000000a4','s@x.test'),('00000000-0000-0000-0000-0000000000b1','n@x.test'),('00000000-0000-0000-0000-0000000000e1','r@x.test'),
 ('00000000-0000-0000-0000-0000000000d1','d@x.test'),('00000000-0000-0000-0000-0000000000f1','t@x.test'),('00000000-0000-0000-0000-0000000000c1','k@x.test'),
 ('00000000-0000-0000-0000-0000000000f2','f@x.test');
insert into public.chapters (id, name, slug) values ('11111111-0000-0000-0000-000000000001','Chapter X','chapter-x');
insert into public.roles (user_id, role) values ('00000000-0000-0000-0000-0000000000e1','national_reviewer'),('00000000-0000-0000-0000-0000000000d1','admin'),('00000000-0000-0000-0000-0000000000f2','finance');
insert into public.roles (user_id, role, chapter_id) values ('00000000-0000-0000-0000-0000000000f1','chapter_tester','11111111-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-0000000000c1','chapter_coordinator','11111111-0000-0000-0000-000000000001');
insert into public.partner_profiles (user_id, legal_name, categories) values
 ('00000000-0000-0000-0000-0000000000a1','A Trading',array['supplier']),('00000000-0000-0000-0000-0000000000a2','B Foods',array['supplier']),
 ('00000000-0000-0000-0000-0000000000a3','C Pack',array['supplier']),('00000000-0000-0000-0000-0000000000a4','S Services',array['service_provider']);

\echo '--- 1. official geography codes'
select 'regions / provinces with code / cities and municipalities / cities' t, (select count(*) from ph_regions), (select count(*) from ph_provinces where psgc_code is not null and region_code is not null), (select count(*) from ph_cities), (select count(*) from ph_cities where kind = 'city');
select 'every province region code matches its region label' t, count(*) from ph_provinces p join ph_regions r on r.code = p.region_code where r.label = p.region;
select 'Angeles City sits in Pampanga; Quezon City in Metro Manila; Pateros is a municipality' t, string_agg(name || ' -> ' || coalesce(province, '(none)') || ' ' || kind, '; ' order by name) from ph_cities where code in ('0330100000','1381300000','1381701000');
select 'places outside any province of their region (BARMM SGA, Isabela City)' t, count(*) from ph_cities where province is null;

\echo '--- 2. who can create an appointment'
do $$ begin insert into public.territorial_appointments (partner_user_id, partner_category, category_key, category_label, created_by) values ('00000000-0000-0000-0000-0000000000a1','supplier','packaging','Packaging','00000000-0000-0000-0000-0000000000f1'); raise exception 'TESTER CREATED'; exception when raise_exception then raise notice 'chapter tester cannot appoint: refused'; end $$;
do $$ begin insert into public.territorial_appointments (partner_user_id, partner_category, category_key, category_label, created_by) values ('00000000-0000-0000-0000-0000000000a1','supplier','packaging','Packaging','00000000-0000-0000-0000-0000000000a2'); raise exception 'PARTNER CREATED'; exception when raise_exception then raise notice 'a partner cannot appoint anyone: refused'; end $$;
do $$ begin insert into public.territorial_appointments (partner_user_id, partner_category, category_key, category_label, created_by) values ('00000000-0000-0000-0000-0000000000b1','supplier','packaging','Packaging','00000000-0000-0000-0000-0000000000e1'); raise exception 'NOT ACCREDITED'; exception when raise_exception then raise notice 'member who is not accredited cannot be appointed: refused'; end $$;
do $$ begin insert into public.territorial_appointments (partner_user_id, partner_category, category_key, category_label, created_by) values ('00000000-0000-0000-0000-0000000000a4','supplier','packaging','Packaging','00000000-0000-0000-0000-0000000000e1'); raise exception 'WRONG CATEGORY'; exception when raise_exception then raise notice 'service provider cannot be appointed as supplier: refused'; end $$;
do $$ begin insert into public.territorial_appointments (partner_user_id, partner_category, category_key, category_label, created_by, status) values ('00000000-0000-0000-0000-0000000000a1','supplier','packaging','Packaging','00000000-0000-0000-0000-0000000000e1','active'); raise exception 'STARTED ACTIVE'; exception when raise_exception then raise notice 'new appointment must start as draft'; end $$;
do $$ begin insert into public.territorial_appointments (partner_user_id, partner_category, category_key, category_label, created_by) values ('00000000-0000-0000-0000-0000000000a1','supplier','Packaging Bags!','Packaging','00000000-0000-0000-0000-0000000000e1'); raise exception 'BAD KEY'; exception when check_violation then raise notice 'category key must be a plain code'; end $$;
do $$ begin insert into public.territorial_appointments (partner_user_id, partner_category, category_key, category_label, created_by, channels) values ('00000000-0000-0000-0000-0000000000a1','supplier','packaging','Packaging','00000000-0000-0000-0000-0000000000e1',array['cash_collection']); raise exception 'BAD CHANNEL'; exception when check_violation then raise notice 'unknown selling channel refused'; end $$;
do $$ begin insert into public.territorial_appointments (partner_user_id, partner_category, category_key, category_label, created_by, excluded_accounts) values ('00000000-0000-0000-0000-0000000000a1','supplier','packaging','Packaging','00000000-0000-0000-0000-0000000000e1',array['  ']); raise exception 'BLANK EXCLUDED'; exception when raise_exception then raise notice 'blank excluded account refused'; end $$;

-- A: exclusive, Pampanga province, packaging, Group Order + MarketplacePH, this year and next.
insert into public.territorial_appointments (id, partner_user_id, partner_category, category_key, category_label, created_by, exclusivity, channels, online_sales, start_date, end_date, review_every, target_period, target_net_sales, excluded_accounts)
values ('44444444-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a1','supplier','packaging','Packaging (bags, boxes, bottles, labels)','00000000-0000-0000-0000-0000000000e1','exclusive',array['group_order','marketplaceph'],'delivery_address',current_date,current_date+365,'quarterly','yearly',1200000,array['SM Supermarkets','Government agencies']);

\echo '--- 3. areas: official codes only; filled-in labels; drafts only'
insert into public.territory_areas (appointment_id, level, code) values ('44444444-0000-0000-0000-0000000000a1','province','0305400000');
select 'area label and codes' t, label, region_code, province_code, city_code from public.territory_areas where appointment_id='44444444-0000-0000-0000-0000000000a1';
do $$ begin insert into public.territory_areas (appointment_id, level, code) values ('44444444-0000-0000-0000-0000000000a1','province','0300000000'); raise exception 'REGION AS PROVINCE'; exception when raise_exception then raise notice 'a region code is not a province: refused'; end $$;
do $$ begin insert into public.territory_areas (appointment_id, level, code) values ('44444444-0000-0000-0000-0000000000a1','city','9999999999'); raise exception 'FAKE CITY'; exception when raise_exception then raise notice 'unknown city code refused'; end $$;
do $$ begin insert into public.territory_areas (appointment_id, level, code) values ('44444444-0000-0000-0000-0000000000a1','national','0300000000'); raise exception 'NATIONAL WITH CODE'; exception when check_violation then raise notice 'national area has no code'; end $$;
do $$ begin insert into public.territory_areas (appointment_id, level, code) values ('44444444-0000-0000-0000-0000000000a1','province','0305400000'); raise exception 'DUPLICATE AREA'; exception when unique_violation then raise notice 'same area twice refused'; end $$;

\echo '--- 4. approval: national team only, complete, no-conflict declaration'
do $$ begin update public.territorial_appointments set status='active', changed_by='00000000-0000-0000-0000-0000000000a1', approver_declared_at=now() where id='44444444-0000-0000-0000-0000000000a1'; raise exception 'PARTNER APPROVED OWN'; exception when raise_exception then raise notice 'partner cannot approve own appointment: refused'; end $$;
do $$ begin update public.territorial_appointments set status='active', changed_by='00000000-0000-0000-0000-0000000000c1', approver_declared_at=now() where id='44444444-0000-0000-0000-0000000000a1'; raise exception 'COORDINATOR APPROVED'; exception when raise_exception then raise notice 'chapter coordinator cannot approve: refused'; end $$;
do $$ begin update public.territorial_appointments set status='active', changed_by='00000000-0000-0000-0000-0000000000f2', approver_declared_at=now() where id='44444444-0000-0000-0000-0000000000a1'; raise exception 'FINANCE APPROVED'; exception when raise_exception then raise notice 'finance cannot approve: refused'; end $$;
do $$ begin update public.territorial_appointments set status='active', changed_by='00000000-0000-0000-0000-0000000000e1' where id='44444444-0000-0000-0000-0000000000a1'; raise exception 'NO DECLARATION'; exception when raise_exception or check_violation then raise notice 'approval without the no-conflict declaration refused'; end $$;
do $$ begin update public.territorial_appointments set status='active', changed_by='00000000-0000-0000-0000-0000000000e1', approver_declared_at=now(), exclusivity='non_exclusive' where id='44444444-0000-0000-0000-0000000000a1'; raise exception 'APPROVED WITH EDITS'; exception when raise_exception then raise notice 'approval cannot carry other changes'; end $$;
update public.territorial_appointments set status='active', changed_by='00000000-0000-0000-0000-0000000000e1', approver_declared_at=now() where id='44444444-0000-0000-0000-0000000000a1';
select 'approved by the reviewer' t, status, approved_by = '00000000-0000-0000-0000-0000000000e1' by_r, approved_at is not null at_set from public.territorial_appointments where id='44444444-0000-0000-0000-0000000000a1';
do $$ begin update public.territorial_appointments set exclusivity='non_exclusive' where id='44444444-0000-0000-0000-0000000000a1'; raise exception 'EDITED ACTIVE'; exception when raise_exception then raise notice 'approved appointment cannot be edited'; end $$;
do $$ begin update public.territorial_appointments set end_date=end_date+100 where id='44444444-0000-0000-0000-0000000000a1'; raise exception 'DATES CHANGED'; exception when raise_exception then raise notice 'approved dates cannot be changed'; end $$;
do $$ begin insert into public.territory_areas (appointment_id, level, code) values ('44444444-0000-0000-0000-0000000000a1','province','0306900000'); raise exception 'AREA ADDED'; exception when raise_exception then raise notice 'areas of an approved appointment cannot change'; end $$;
do $$ begin delete from public.territory_areas where appointment_id='44444444-0000-0000-0000-0000000000a1'; raise exception 'AREA REMOVED'; exception when raise_exception then raise notice 'areas of an approved appointment cannot be removed'; end $$;
update public.territorial_appointments set next_review_date=current_date+90, internal_note='Watch Q1 volumes' where id='44444444-0000-0000-0000-0000000000a1';
select 'next review date and team note may change' t, next_review_date = current_date+90 ok from public.territorial_appointments where id='44444444-0000-0000-0000-0000000000a1';

\echo '--- 5. overlap check'
create function pg_temp.draft(p_id text, p_user text, p_excl text, p_channels text[], p_level text, p_code text, p_key text default 'packaging', p_start date default current_date, p_end date default current_date+365) returns void language plpgsql as $f$
begin
  insert into public.territorial_appointments (id, partner_user_id, partner_category, category_key, category_label, created_by, exclusivity, channels, online_sales, start_date, end_date, review_every)
  values (p_id::uuid, p_user::uuid, 'supplier', p_key, 'Test', '00000000-0000-0000-0000-0000000000e1', p_excl, p_channels, 'delivery_address', p_start, p_end, 'quarterly');
  insert into public.territory_areas (appointment_id, level, code) values (p_id::uuid, p_level, p_code);
end $f$;
create function pg_temp.approve(p_id text) returns void language sql as $f$
  update public.territorial_appointments set status='active', changed_by='00000000-0000-0000-0000-0000000000d1', approver_declared_at=now() where id=p_id::uuid;
$f$;
-- B: non-exclusive, City of Angeles (inside Pampanga), packaging, Group Order: overlaps A's exclusive area.
select pg_temp.draft('44444444-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a2','non_exclusive',array['group_order'],'city','0330100000');
select 'conflicts found for B (city inside A''s exclusive province)' t, count(*), min(area) || ' vs ' || min(other_area) detail from public.territory_conflicts('44444444-0000-0000-0000-0000000000b1');
do $$ begin perform pg_temp.approve('44444444-0000-0000-0000-0000000000b1'); raise exception 'OVERLAP APPROVED'; exception when raise_exception then raise notice 'overlap with an exclusive appointment refused'; end $$;
do $$ begin update public.territorial_appointments set overlap_approved=true where id='44444444-0000-0000-0000-0000000000b1'; raise exception 'OVERLAP WITHOUT REASON'; exception when check_violation then raise notice 'approving an overlap needs a written reason'; end $$;
-- B2: Central Luzon region (contains Pampanga) also conflicts; NCR does not.
select pg_temp.draft('44444444-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000a2','non_exclusive',array['group_order'],'region','0300000000');
select pg_temp.draft('44444444-0000-0000-0000-0000000000b3','00000000-0000-0000-0000-0000000000a2','exclusive',array['group_order'],'region','1300000000');
select pg_temp.draft('44444444-0000-0000-0000-0000000000b4','00000000-0000-0000-0000-0000000000a2','non_exclusive',array['group_order'],'national',null);
select 'Central Luzon region / NCR region / whole Philippines vs A' t, (select count(*) from public.territory_conflicts('44444444-0000-0000-0000-0000000000b2')) central_luzon, (select count(*) from public.territory_conflicts('44444444-0000-0000-0000-0000000000b3')) ncr, (select count(*) from public.territory_conflicts('44444444-0000-0000-0000-0000000000b4')) national;
-- Not a conflict: other category, other channel, dates after A ends, both non-exclusive.
select pg_temp.draft('44444444-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a3','exclusive',array['group_order'],'province','0305400000','food_ingredients');
select pg_temp.draft('44444444-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000a3','exclusive',array['chapter_events'],'province','0305400000');
select pg_temp.draft('44444444-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-0000000000a3','exclusive',array['group_order'],'province','0305400000','packaging',current_date+400,current_date+700);
select 'no conflict: other category / other channel / after A ends' t, (select count(*) from public.territory_conflicts('44444444-0000-0000-0000-0000000000c1')) cat, (select count(*) from public.territory_conflicts('44444444-0000-0000-0000-0000000000c2')) chan, (select count(*) from public.territory_conflicts('44444444-0000-0000-0000-0000000000c3')) dates;
select pg_temp.approve('44444444-0000-0000-0000-0000000000c1'); select pg_temp.approve('44444444-0000-0000-0000-0000000000c2'); select pg_temp.approve('44444444-0000-0000-0000-0000000000c3');
select pg_temp.approve('44444444-0000-0000-0000-0000000000b3');
-- Two non-exclusive appointments may overlap: B4 (whole country, non-exclusive) vs NCR exclusive B3 is the same partner, so fine;
-- but against A (exclusive Pampanga) it needs an approved overlap.
update public.territorial_appointments set overlap_approved=true, overlap_reason='Nationwide online catalogue; A agreed in writing (meeting 2026-11-20).' where id='44444444-0000-0000-0000-0000000000b4';
select pg_temp.approve('44444444-0000-0000-0000-0000000000b4');
select 'overlap approved with a reason and recorded' t, status, cardinality(overlap_with) n from public.territorial_appointments where id='44444444-0000-0000-0000-0000000000b4';
-- Exclusive in NCR exists now (B3). A third partner C, exclusive Quezon City, same category and channel: refused.
select pg_temp.draft('44444444-0000-0000-0000-0000000000c4','00000000-0000-0000-0000-0000000000a3','exclusive',array['group_order'],'city','1381300000');
do $$ begin perform pg_temp.approve('44444444-0000-0000-0000-0000000000c4'); raise exception 'QC OVER NCR'; exception when raise_exception then raise notice 'Quezon City inside an exclusive NCR refused'; end $$;
update public.territorial_appointments set status='cancelled', changed_by='00000000-0000-0000-0000-0000000000e1', status_reason='Overlaps NCR' where id='44444444-0000-0000-0000-0000000000c4';

\echo '--- 6. suspend, resume, end'
do $$ begin update public.territorial_appointments set status='suspended', changed_by='00000000-0000-0000-0000-0000000000e1' where id='44444444-0000-0000-0000-0000000000c2'; raise exception 'NO REASON'; exception when raise_exception or check_violation then raise notice 'suspension needs a reason'; end $$;
update public.territorial_appointments set status='suspended', changed_by='00000000-0000-0000-0000-0000000000e1', status_reason='Late deliveries under review' where id='44444444-0000-0000-0000-0000000000c2';
do $$ begin update public.territorial_appointments set status='draft', changed_by='00000000-0000-0000-0000-0000000000e1' where id='44444444-0000-0000-0000-0000000000c2'; raise exception 'BACK TO DRAFT'; exception when raise_exception then raise notice 'suspended -> draft refused'; end $$;
update public.territorial_appointments set status='active', changed_by='00000000-0000-0000-0000-0000000000e1' where id='44444444-0000-0000-0000-0000000000c2';
select 'resumed' t, status from public.territorial_appointments where id='44444444-0000-0000-0000-0000000000c2';
do $$ begin update public.territorial_appointments set status='ended', changed_by='00000000-0000-0000-0000-0000000000a3', status_reason='x' where id='44444444-0000-0000-0000-0000000000c2'; raise exception 'PARTNER ENDED'; exception when raise_exception then raise notice 'partner cannot end own appointment'; end $$;

\echo '--- 7. sub-partners: nominate only; national team appoints inside the main territory'
do $$ begin insert into public.territory_nominations (nominator_id, parent_id, nominee_name, nominee_contact, nominee_phone, proposed_area, reason, nominee_agreed) values ('00000000-0000-0000-0000-0000000000a2','44444444-0000-0000-0000-0000000000a1','Z Store','Zeny','0917','Angeles City','Good reseller in Angeles',true); raise exception 'OTHER PARTNER NOMINATED'; exception when raise_exception then raise notice 'only the appointed partner nominates inside it'; end $$;
do $$ begin insert into public.territory_nominations (nominator_id, parent_id, nominee_name, nominee_contact, nominee_phone, proposed_area, reason, nominee_agreed) values ('00000000-0000-0000-0000-0000000000a1','44444444-0000-0000-0000-0000000000a1','Z Store','Zeny','0917','Angeles City','Good reseller in Angeles',false); raise exception 'NO AGREEMENT'; exception when check_violation then raise notice 'nominee must agree to be contacted'; end $$;
do $$ begin insert into public.territory_nominations (nominator_id, parent_id, nominee_name, nominee_contact, proposed_area, reason, nominee_agreed) values ('00000000-0000-0000-0000-0000000000a1','44444444-0000-0000-0000-0000000000a1','Z Store','Zeny','Angeles City','Good reseller in Angeles',true); raise exception 'NO CONTACT'; exception when check_violation then raise notice 'nominee needs a phone or email'; end $$;
insert into public.territory_nominations (id, nominator_id, parent_id, nominee_name, nominee_contact, nominee_phone, proposed_area, reason, nominee_agreed) values ('55555555-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1','44444444-0000-0000-0000-0000000000a1','C Pack','Carla','0918','City of San Fernando and Angeles','Already delivers to 40 members there',true);
do $$ begin update public.territory_nominations set status='accepted', decided_by='00000000-0000-0000-0000-0000000000a1' where id='55555555-0000-0000-0000-000000000001'; raise exception 'SELF ACCEPTED'; exception when raise_exception then raise notice 'partner cannot accept own nomination (no self-appointment)'; end $$;
do $$ begin update public.territory_nominations set status='accepted', decided_by='00000000-0000-0000-0000-0000000000c1' where id='55555555-0000-0000-0000-000000000001'; raise exception 'COORDINATOR ACCEPTED'; exception when raise_exception then raise notice 'chapter coordinator cannot accept'; end $$;
do $$ begin update public.territory_nominations set reason='changed reason text' where id='55555555-0000-0000-0000-000000000001'; raise exception 'NOMINATION EDITED'; exception when raise_exception then raise notice 'sent nomination cannot be edited'; end $$;
update public.territory_nominations set status='accepted', decided_by='00000000-0000-0000-0000-0000000000e1', decision_note='Start a draft' where id='55555555-0000-0000-0000-000000000001';
-- The national team creates the sub-partner draft: C Pack in Angeles City, under A.
insert into public.territorial_appointments (id, partner_user_id, parent_id, nomination_id, partner_category, category_key, category_label, created_by, exclusivity, channels, online_sales, start_date, end_date, review_every)
values ('44444444-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000a3','44444444-0000-0000-0000-0000000000a1','55555555-0000-0000-0000-000000000001','supplier','packaging','Packaging','00000000-0000-0000-0000-0000000000e1','non_exclusive',array['group_order'],'delivery_address',current_date,current_date+300,'quarterly');
update public.territory_nominations set appointment_id='44444444-0000-0000-0000-0000000000d1' where id='55555555-0000-0000-0000-000000000001';
insert into public.territory_areas (appointment_id, level, code) values ('44444444-0000-0000-0000-0000000000d1','city','0330100000'),('44444444-0000-0000-0000-0000000000d1','city','0306901000');
do $$ begin perform pg_temp.approve('44444444-0000-0000-0000-0000000000d1'); raise exception 'OUTSIDE PARENT'; exception when raise_exception then raise notice 'sub-partner area outside the main territory refused (Tarlac town)'; end $$;
delete from public.territory_areas where appointment_id='44444444-0000-0000-0000-0000000000d1' and code='0306901000';
do $$ begin update public.territorial_appointments set exclusivity='exclusive', channels=array['group_order','own_store'] where id='44444444-0000-0000-0000-0000000000d1'; perform pg_temp.approve('44444444-0000-0000-0000-0000000000d1'); raise exception 'CHANNEL OUTSIDE PARENT'; exception when raise_exception then raise notice 'sub-partner channel outside the main appointment refused'; end $$;
do $$ begin update public.territorial_appointments set end_date=current_date+500 where id='44444444-0000-0000-0000-0000000000d1'; perform pg_temp.approve('44444444-0000-0000-0000-0000000000d1'); raise exception 'DATES OUTSIDE PARENT'; exception when raise_exception then raise notice 'sub-partner dates outside the main appointment refused'; end $$;
select pg_temp.approve('44444444-0000-0000-0000-0000000000d1');
select 'sub-partner inside an exclusive main territory: approved (no conflict with its own main appointment)' t, status from public.territorial_appointments where id='44444444-0000-0000-0000-0000000000d1';
do $$ begin insert into public.territory_nominations (nominator_id, parent_id, nominee_name, nominee_contact, nominee_phone, proposed_area, reason, nominee_agreed) values ('00000000-0000-0000-0000-0000000000a3','44444444-0000-0000-0000-0000000000d1','Y Store','Yolly','0919','Angeles','Sub of a sub partner please',true); raise exception 'SUB NOMINATED'; exception when raise_exception then raise notice 'a sub-partner cannot nominate sub-partners'; end $$;
do $$ begin insert into public.territorial_appointments (partner_user_id, parent_id, partner_category, category_key, category_label, created_by) values ('00000000-0000-0000-0000-0000000000a2','44444444-0000-0000-0000-0000000000d1','supplier','packaging','Packaging','00000000-0000-0000-0000-0000000000e1'); raise exception 'THIRD LEVEL'; exception when raise_exception then raise notice 'no sub-partners of sub-partners'; end $$;

\echo '--- 8. performance reviews'
do $$ begin insert into public.territory_reviews (appointment_id, reviewer_id, period_start, period_end, rating, outcome) values ('44444444-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a1',current_date-90,current_date,'exceeds','continue'); raise exception 'SELF REVIEW'; exception when raise_exception then raise notice 'partner cannot review own appointment'; end $$;
do $$ begin insert into public.territory_reviews (appointment_id, reviewer_id, period_start, period_end, rating, outcome) values ('44444444-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000f1',current_date-90,current_date,'meets','continue'); raise exception 'TESTER REVIEW'; exception when raise_exception then raise notice 'chapter tester cannot review'; end $$;
do $$ begin insert into public.territory_reviews (appointment_id, reviewer_id, period_start, period_end, rating, outcome) values ('44444444-0000-0000-0000-0000000000c4','00000000-0000-0000-0000-0000000000e1',current_date-90,current_date,'meets','continue'); raise exception 'CANCELLED REVIEWED'; exception when raise_exception then raise notice 'cancelled appointment cannot be reviewed'; end $$;
insert into public.territory_reviews (appointment_id, reviewer_id, period_start, period_end, actual_net_sales, actual_members, rating, outcome, note, internal_note) values ('44444444-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000e1',current_date-90,current_date,310000,42,'meets','continue','On track. Keep Group Order stock.','Partner asked about Tarlac');
do $$ begin update public.territory_reviews set rating='exceeds'; raise exception 'REVIEW CHANGED'; exception when raise_exception then raise notice 'review cannot be changed'; end $$;
do $$ begin delete from public.territory_reviews; raise exception 'REVIEW DELETED'; exception when raise_exception then raise notice 'review cannot be deleted'; end $$;
insert into public.territory_history (appointment_id, actor_id, action, note) values ('44444444-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000e1','approved','Approved');
insert into public.territory_history (appointment_id, actor_id, action, note, internal) values ('44444444-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000e1','team_note','Team only',true);
do $$ begin update public.territory_history set note='x'; raise exception 'HISTORY CHANGED'; exception when raise_exception then raise notice 'history cannot be changed'; end $$;
do $$ begin delete from public.territory_history; raise exception 'HISTORY DELETED'; exception when raise_exception then raise notice 'history cannot be deleted'; end $$;

\echo '--- 9. row level security'
-- A (partner) sees own approved appointment, its areas, review and public history; never drafts, team notes or overlap details.
begin;
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select 'A sees: appointments / areas / reviews / history / nominations' t, (select count(*) from public.territorial_appointments), (select count(*) from public.territory_areas), (select count(*) from public.territory_reviews), (select count(*) from public.territory_history), (select count(*) from public.territory_nominations);
select 'A sees the sub-partner (name, area) under it' t, legal_name, areas from public.my_sub_partners();
do $$ begin perform internal_note from public.territorial_appointments; raise exception 'TEAM NOTE READ'; exception when insufficient_privilege then raise notice 'partner cannot read the team-only note'; end $$;
do $$ begin perform overlap_reason from public.territorial_appointments; raise exception 'OVERLAP READ'; exception when insufficient_privilege then raise notice 'partner cannot read overlap details'; end $$;
do $$ begin perform internal_note from public.territory_reviews; raise exception 'REVIEW NOTE READ'; exception when insufficient_privilege then raise notice 'partner cannot read the review team note'; end $$;
do $$ begin perform 1 from public.territory_conflicts('44444444-0000-0000-0000-0000000000a1'); raise exception 'CONFLICTS RUN'; exception when insufficient_privilege then raise notice 'partner cannot run the overlap check'; end $$;
do $$ begin insert into public.territorial_appointments (partner_user_id, partner_category, category_key, category_label, created_by) values ('00000000-0000-0000-0000-0000000000a1','supplier','packaging','x','00000000-0000-0000-0000-0000000000e1'); raise exception 'BROWSER WRITE'; exception when insufficient_privilege then raise notice 'no writes from the browser'; end $$;
do $$ begin insert into public.territory_nominations (nominator_id, parent_id, nominee_name, nominee_contact, nominee_phone, proposed_area, reason, nominee_agreed) values ('00000000-0000-0000-0000-0000000000a1','44444444-0000-0000-0000-0000000000a1','Q','Q','1','x area','reason long enough',true); raise exception 'BROWSER NOMINATION'; exception when insufficient_privilege then raise notice 'nominations only through the server'; end $$;
commit;
begin;
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
select 'B sees only own approved (B3, B4), never the refused drafts; nothing of A' t, (select string_agg(right(id::text, 2), ',' order by id) from public.territorial_appointments), (select count(*) from public.territory_reviews), (select count(*) from public.territory_nominations), (select count(*) from public.my_sub_partners());
commit;
begin;
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
select 'C (sub-partner) sees its own appointments but not A''s, and has no sub-partners' t, (select count(*) from public.territorial_appointments where partner_user_id <> '00000000-0000-0000-0000-0000000000a3'), (select count(*) from public.territorial_appointments), (select count(*) from public.my_sub_partners());
commit;
begin;
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
select 'chapter tester sees nothing' t, (select count(*) from public.territorial_appointments), (select count(*) from public.territory_areas), (select count(*) from public.territory_reviews), (select count(*) from public.territory_history), (select count(*) from public.territory_nominations);
commit;
begin;
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select 'chapter coordinator sees nothing' t, (select count(*) from public.territorial_appointments), (select count(*) from public.territory_areas), (select count(*) from public.territory_nominations);
commit;
begin;
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f2';
select 'finance sees nothing' t, (select count(*) from public.territorial_appointments), (select count(*) from public.territory_reviews);
commit;
begin;
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
select 'national reviewer sees all appointments incl. drafts and cancelled' t, (select count(*) from public.territorial_appointments), (select count(*) from public.territory_nominations);
commit;
begin;
set local role anon;
select 'visitor reads the public geography lists' t, (select count(*) from public.ph_cities), (select count(*) from public.ph_regions);
do $$ begin perform 1 from public.territorial_appointments; raise exception 'ANON READ'; exception when insufficient_privilege then raise notice 'visitor cannot read appointments'; end $$;
commit;

\echo '--- 10. ending a main appointment ends its sub-partners; erasing accounts'
update public.territorial_appointments set status='ended', changed_by='00000000-0000-0000-0000-0000000000d1', status_reason='Contract finished early by agreement' where id='44444444-0000-0000-0000-0000000000a1';
select 'A ended; its sub-partner ended too' t, string_agg(right(id::text, 2) || '=' || status, ', ' order by id) from public.territorial_appointments where id in ('44444444-0000-0000-0000-0000000000a1','44444444-0000-0000-0000-0000000000d1');
do $$ begin update public.territorial_appointments set status='active', changed_by='00000000-0000-0000-0000-0000000000d1' where id='44444444-0000-0000-0000-0000000000a1'; raise exception 'ENDED REVIVED'; exception when raise_exception then raise notice 'an ended appointment stays ended (start a new one)'; end $$;
delete from auth.users where id='00000000-0000-0000-0000-0000000000e1';
select 'reviewer erased: appointments and reviews stay, links emptied' t, (select count(*) from public.territorial_appointments), (select count(*) from public.territory_reviews where reviewer_id is null);
delete from auth.users where id='00000000-0000-0000-0000-0000000000a1';
select 'partner A erased: its appointments, areas, reviews, nominations go; C''s sub-appointment stays' t, (select count(*) from public.territorial_appointments where partner_user_id='00000000-0000-0000-0000-0000000000a1'), (select count(*) from public.territory_nominations), (select count(*) from public.territorial_appointments where id='44444444-0000-0000-0000-0000000000d1' and parent_id is null);
\echo 'ALL TERRITORY TESTS PASSED'
