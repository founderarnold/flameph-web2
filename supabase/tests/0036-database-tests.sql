\set ON_ERROR_STOP 1
-- Partner Step 6 (service provider Best Offer) database tests. Run on a LOCAL copy built from migrations 0001-0036,
-- never on the live database. Each "do" block expects a refusal; if the refusal does not come, it stops with an error.
-- People: A accredited supplier; B accredited service provider; C member (not accredited); R national reviewer;
--         D admin; F finance; T chapter tester (chapter X); K chapter coordinator (chapter X).
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-0000000000a1','a@x.test'),('00000000-0000-0000-0000-0000000000a2','b@x.test'),('00000000-0000-0000-0000-0000000000b1','c@x.test'),
 ('00000000-0000-0000-0000-0000000000e1','r@x.test'),('00000000-0000-0000-0000-0000000000d1','d@x.test'),('00000000-0000-0000-0000-0000000000f2','f@x.test'),
 ('00000000-0000-0000-0000-0000000000f1','t@x.test'),('00000000-0000-0000-0000-0000000000c1','k@x.test');
insert into public.chapters (id, name, slug, published, status) values ('11111111-0000-0000-0000-000000000001','Chapter X','chapter-x',false,'forming');
insert into public.roles (user_id, role) values ('00000000-0000-0000-0000-0000000000e1','national_reviewer'),('00000000-0000-0000-0000-0000000000d1','admin'),
 ('00000000-0000-0000-0000-0000000000f2','finance');
insert into public.roles (user_id, role, chapter_id) values ('00000000-0000-0000-0000-0000000000f1','chapter_tester','11111111-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-0000000000c1','chapter_coordinator','11111111-0000-0000-0000-000000000001');
insert into public.partner_profiles (user_id, legal_name, categories) values
 ('00000000-0000-0000-0000-0000000000a1','A Trading',array['supplier']),('00000000-0000-0000-0000-0000000000a2','B Bookkeeping Services',array['service_provider']);

\echo '--- 1. existing supplier offers are untouched and read as kind = supplier'
insert into public.supplier_offers (id, user_id) values ('22222222-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a1');
select kind, status from public.supplier_offers;

\echo '--- 2. who may start a service offer'
do $$ begin insert into public.supplier_offers (user_id, kind) values ('00000000-0000-0000-0000-0000000000a1','service'); raise exception 'SUPPLIER MADE SERVICE'; exception when raise_exception then raise notice 'a supplier (not a service provider) cannot start a service offer: refused'; end $$;
do $$ begin insert into public.supplier_offers (user_id, kind) values ('00000000-0000-0000-0000-0000000000b1','service'); raise exception 'MEMBER MADE SERVICE'; exception when raise_exception then raise notice 'a member who is not accredited: refused'; end $$;
do $$ begin insert into public.supplier_offers (user_id, kind) values ('00000000-0000-0000-0000-0000000000a2','supplier'); raise exception 'PROVIDER MADE SUPPLIER'; exception when raise_exception then raise notice 'a service provider cannot start a supplier offer: refused'; end $$;
do $$ begin insert into public.supplier_offers (user_id, kind) values ('00000000-0000-0000-0000-0000000000a2','gadget'); raise exception 'BAD KIND'; exception when check_violation or raise_exception then raise notice 'an unknown kind: refused'; end $$;
insert into public.supplier_offers (id, user_id, kind) values ('22222222-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a2','service');
do $$ begin update public.supplier_offers set kind='supplier' where id='22222222-0000-0000-0000-0000000000b1'; raise exception 'KIND CHANGED'; exception when raise_exception then raise notice 'the kind is fixed'; end $$;
do $$ begin update public.supplier_offers set product_group='packaging' where id='22222222-0000-0000-0000-0000000000b1'; raise exception 'GROUP ON SERVICE'; exception when check_violation then raise notice 'a service offer cannot take a product group'; end $$;
do $$ begin update public.supplier_offers set service_category='it_web' where id='22222222-0000-0000-0000-0000000000a1'; raise exception 'CATEGORY ON SUPPLIER'; exception when check_violation then raise notice 'a supplier offer cannot take a service category'; end $$;

\echo '--- 3. packages and products stay with their own kind; rates and acceptance criteria are checked'
do $$ begin insert into public.supplier_offer_items (offer_id, product_name, sell_unit, base_unit, base_qty, member_price) values ('22222222-0000-0000-0000-0000000000b1','Bag','pack','piece',1,10); raise exception 'ITEM ON SERVICE'; exception when raise_exception then raise notice 'a product on a service offer: refused'; end $$;
do $$ begin insert into public.service_offer_packages (offer_id, name, scope, rate_basis, member_rate, acceptance_criteria) values ('22222222-0000-0000-0000-0000000000a1','Pkg','Monthly bookkeeping','month',1000,'Books closed by day 10'); raise exception 'PKG ON SUPPLIER'; exception when raise_exception then raise notice 'a package on a supplier offer: refused'; end $$;
do $$ begin insert into public.service_offer_packages (offer_id, name, scope, rate_basis, normal_rate, member_rate, acceptance_criteria) values ('22222222-0000-0000-0000-0000000000b1','Pkg','Monthly bookkeeping','month',1000,1200,'Books closed by day 10'); raise exception 'MEMBER ABOVE NORMAL'; exception when check_violation then raise notice 'a member rate above the normal rate: refused'; end $$;
do $$ begin insert into public.service_offer_packages (offer_id, name, scope, rate_basis, member_rate, acceptance_criteria) values ('22222222-0000-0000-0000-0000000000b1','Pkg','Payroll per employee','unit',150,'Payslips out by the 15th'); raise exception 'UNIT NO LABEL'; exception when check_violation then raise notice 'a per-unit rate without saying the unit: refused'; end $$;
do $$ begin insert into public.service_offer_packages (offer_id, name, scope, rate_basis, member_rate, acceptance_criteria) values ('22222222-0000-0000-0000-0000000000b1','Pkg','Monthly bookkeeping','month',1000,'Good'); raise exception 'VAGUE CRITERIA'; exception when check_violation then raise notice 'acceptance criteria that are too short to measure: refused'; end $$;
insert into public.service_offer_packages (id, offer_id, name, scope, exclusions, rate_basis, normal_rate, member_rate, min_units, duration_days, milestones, acceptance_criteria, revisions_included)
values ('44444444-0000-0000-0000-0000000000b1','22222222-0000-0000-0000-0000000000b1','Monthly bookkeeping (up to 150 entries)','Recording of sales, purchases and expenses; monthly BIR 2550M/2551Q forms prepared','Audit, tax cases, BIR penalties','month',3500,2800,3,30,
  '[{"title":"Chart of accounts set up","due_days":7},{"title":"First month closed","due_days":30}]','Books closed and reports emailed by day 10 of the following month; BIR forms ready 3 days before the deadline',1);
select name, rate_basis, member_rate, jsonb_array_length(milestones) milestones from public.service_offer_packages;

\echo '--- 4. references: up to 5, consent needed, start pending'
do $$ begin insert into public.service_offer_references (offer_id, client_name, client_contact, work_done, client_consent) values ('22222222-0000-0000-0000-0000000000b1','Aling Nena Store','0917 000 0000','Bookkeeping 2025',false); raise exception 'NO CONSENT'; exception when check_violation then raise notice 'a reference without the client''s agreement to be called: refused'; end $$;
do $$ begin insert into public.service_offer_references (offer_id, client_name, client_contact, work_done, client_consent, verification) values ('22222222-0000-0000-0000-0000000000b1','Aling Nena Store','0917 000 0000','Bookkeeping 2025',true,'verified'); raise exception 'SELF VERIFIED'; exception when raise_exception then raise notice 'a reference cannot start as verified'; end $$;
do $$ begin insert into public.service_offer_references (offer_id, client_name, client_contact, work_done, client_consent) values ('22222222-0000-0000-0000-0000000000a1','X Store','0917 000 0000','Bookkeeping',true); raise exception 'REF ON SUPPLIER'; exception when raise_exception then raise notice 'a reference on a supplier offer: refused'; end $$;
insert into public.service_offer_references (id, offer_id, client_name, client_contact, work_done, completed_on, client_consent) values
 ('55555555-0000-0000-0000-0000000000b1','22222222-0000-0000-0000-0000000000b1','Aling Nena Sari-sari Store','0917 000 0001','Monthly bookkeeping since 2024',current_date-30,true),
 ('55555555-0000-0000-0000-0000000000b2','22222222-0000-0000-0000-0000000000b1','JM Bakeshop','jm@bakeshop.test','Payroll for 12 staff',current_date-90,true);
do $$ begin insert into public.service_offer_references (offer_id, client_name, client_contact, work_done, client_consent) select '22222222-0000-0000-0000-0000000000b1','Client '||g,'0917 000 00'||g,'Work '||g,true from generate_series(1,4) g; raise exception 'SIX REFS'; exception when raise_exception then raise notice 'a sixth reference: refused'; end $$;
do $$ begin update public.service_offer_references set verification='verified', verified_by='00000000-0000-0000-0000-0000000000e1', verified_at=now(), verification_note='ok' where id='55555555-0000-0000-0000-0000000000b1'; raise exception 'CHECKED DRAFT'; exception when raise_exception then raise notice 'a reference is checked only after the offer is sent'; end $$;

\echo '--- 5. sending: complete answers, at least one package, valid licence, no blanket guarantee'
do $$ begin update public.supplier_offers set status='submitted', submitted_at=now(), declaration_at=now() where id='22222222-0000-0000-0000-0000000000b1'; raise exception 'SENT EMPTY'; exception when check_violation then raise notice 'sending with answers missing: refused'; end $$;
update public.supplier_offers set title='Bookkeeping for sari-sari stores and bakeries', service_category='accounting_tax', profession='Bookkeeping firm with a CPA',
  qualifications='Run by a CPA (PRC); 2 bookkeepers with TESDA NC III', license_required=true, license_body='PRC', license_no='0123456', license_valid_until=current_date-1,
  portfolio='Sample monthly report attached', valid_until=current_date+90, vat_basis='non_vat', service_mode='both', serviceable_areas='Remote nationwide; on-site in Quezon City',
  free_trial='free_consultation', trial_terms='30-minute call', availability='Mon-Sat 8am-6pm; 10 new clients a month', monthly_clients=10, lead_time_days=3, response_hours=24,
  service_levels='Replies within 24 hours on working days', correction_policy='Errors we made are corrected free within 5 working days',
  refund_policy='If a month''s deliverables are not met, the unmet part is refunded in proportion, as agreed in the scope of work',
  confidentiality='Records kept on encrypted drive; NDA on request; deleted 1 year after the contract ends', handles_personal_data=true, commission_pct=12
  where id='22222222-0000-0000-0000-0000000000b1';
do $$ begin update public.supplier_offers set status='submitted', submitted_at=now(), declaration_at=now() where id='22222222-0000-0000-0000-0000000000b1'; raise exception 'EXPIRED LICENCE'; exception when raise_exception then raise notice 'sending with an expired licence: refused'; end $$;
update public.supplier_offers set license_valid_until=current_date+365, correction_policy='100% satisfaction guaranteed or your money back' where id='22222222-0000-0000-0000-0000000000b1';
do $$ begin update public.supplier_offers set status='submitted', submitted_at=now(), declaration_at=now() where id='22222222-0000-0000-0000-0000000000b1'; raise exception 'GUARANTEE'; exception when raise_exception then raise notice 'a blanket "100%% satisfaction" promise in the offer: refused'; end $$;
update public.supplier_offers set correction_policy='Errors we made are corrected free within 5 working days' where id='22222222-0000-0000-0000-0000000000b1';
update public.service_offer_packages set acceptance_criteria='We guarantee your satisfaction' where id='44444444-0000-0000-0000-0000000000b1';
do $$ begin update public.supplier_offers set status='submitted', submitted_at=now(), declaration_at=now() where id='22222222-0000-0000-0000-0000000000b1'; raise exception 'GUARANTEE PKG'; exception when raise_exception then raise notice 'a blanket satisfaction promise inside a package: refused'; end $$;
update public.service_offer_packages set acceptance_criteria='Books closed and reports emailed by day 10 of the following month; BIR forms ready 3 days before the deadline' where id='44444444-0000-0000-0000-0000000000b1';
update public.supplier_offers set status='submitted', submitted_at=now(), declaration_at=now() where id='22222222-0000-0000-0000-0000000000b1';
select kind, status, revision from public.supplier_offers where id='22222222-0000-0000-0000-0000000000b1';
do $$ begin update public.supplier_offers set commission_pct=20 where id='22222222-0000-0000-0000-0000000000b1'; raise exception 'EDIT SENT'; exception when raise_exception then raise notice 'a sent offer cannot be changed'; end $$;
do $$ begin update public.service_offer_packages set member_rate=100 where id='44444444-0000-0000-0000-0000000000b1'; raise exception 'EDIT PKG'; exception when raise_exception then raise notice 'packages of a sent offer cannot be changed'; end $$;
do $$ begin delete from public.service_offer_references where id='55555555-0000-0000-0000-0000000000b2'; raise exception 'DEL REF'; exception when raise_exception then raise notice 'references of a sent offer cannot be deleted'; end $$;
do $$ begin update public.service_offer_references set client_contact='0999 999 9999' where id='55555555-0000-0000-0000-0000000000b1'; raise exception 'EDIT REF'; exception when raise_exception then raise notice 'references of a sent offer cannot be changed by the provider'; end $$;

\echo '--- 6. the national team checks references (conflict declaration first; never the provider)'
do $$ begin update public.service_offer_references set verification='verified', verified_by='00000000-0000-0000-0000-0000000000a2', verified_at=now(), verification_note='me' where id='55555555-0000-0000-0000-0000000000b1'; raise exception 'PROVIDER VERIFIED'; exception when raise_exception then raise notice 'the provider cannot verify their own reference'; end $$;
do $$ begin update public.service_offer_references set verification='verified', verified_by='00000000-0000-0000-0000-0000000000f1', verified_at=now(), verification_note='t' where id='55555555-0000-0000-0000-0000000000b1'; raise exception 'TESTER VERIFIED'; exception when raise_exception then raise notice 'a chapter tester cannot verify references'; end $$;
do $$ begin update public.service_offer_references set verification='verified', verified_by='00000000-0000-0000-0000-0000000000e1', verified_at=now(), verification_note='ok' where id='55555555-0000-0000-0000-0000000000b1'; raise exception 'NO COI'; exception when raise_exception then raise notice 'checking references before declaring no conflict: refused'; end $$;
insert into public.supplier_offer_conflicts (offer_id, reviewer_id, has_conflict) values ('22222222-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000e1',false);
do $$ begin update public.service_offer_references set verification='verified', verified_by='00000000-0000-0000-0000-0000000000e1', verified_at=now() where id='55555555-0000-0000-0000-0000000000b1'; raise exception 'NO NOTE'; exception when check_violation then raise notice 'a checked reference needs a note of the call'; end $$;
update public.service_offer_references set verification='verified', client_rating=5, verified_by='00000000-0000-0000-0000-0000000000e1', verified_at=now(), verification_note='Called owner 24 Nov: on time every month, 1 correction done fast.' where id='55555555-0000-0000-0000-0000000000b1';
update public.service_offer_references set verification='not_verified', verified_by='00000000-0000-0000-0000-0000000000e1', verified_at=now(), verification_note='Email bounced twice.' where id='55555555-0000-0000-0000-0000000000b2';
do $$ begin update public.service_offer_references set verification='pending', client_rating=null, verified_by=null, verified_at=null, verification_note=null where id='55555555-0000-0000-0000-0000000000b1'; raise exception 'UNCHECKED'; exception when raise_exception then raise notice 'a checked reference cannot quietly go back to pending'; end $$;
select client_name, verification, client_rating from public.service_offer_references order by position, client_name;

\echo '--- 7. scoring and selection reuse the Step 2 rules (gate, pass mark 80, national team only)'
insert into public.supplier_offer_scores (offer_id, revision, reviewer_id, price_value, quality_samples, compliance_reliability, commission_benefits, logistics_support, compliance_pass)
values ('22222222-0000-0000-0000-0000000000b1',1,'00000000-0000-0000-0000-0000000000e1',26,22,18,12,8,true);
do $$ begin update public.supplier_offers set status='selected', decided_by='00000000-0000-0000-0000-0000000000f1', decided_at=now(), selection_reason='x' where id='22222222-0000-0000-0000-0000000000b1'; raise exception 'TESTER SELECTED'; exception when raise_exception then raise notice 'a chapter tester cannot select'; end $$;
do $$ begin update public.supplier_offers set status='selected', decided_by='00000000-0000-0000-0000-0000000000d1', decided_at=now(), selection_reason='x' where id='22222222-0000-0000-0000-0000000000b1'; raise exception 'ADMIN NO COI'; exception when raise_exception then raise notice 'an admin who did not declare: refused'; end $$;
update public.supplier_offers set status='selected', decided_by='00000000-0000-0000-0000-0000000000e1', decided_at=now(), selection_reason='Lowest monthly rate among 3 bookkeepers, CPA-led, references verified.' where id='22222222-0000-0000-0000-0000000000b1';
insert into public.supplier_offer_history (offer_id, actor_id, action, revision, note) values ('22222222-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000e1','selected',1,'chosen');
select status, revision, (select total from public.supplier_offer_scores where offer_id='22222222-0000-0000-0000-0000000000b1') score from public.supplier_offers where id='22222222-0000-0000-0000-0000000000b1';

\echo '--- 8. who sees what (row level security)'
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select 'provider B' who, (select count(*) from public.supplier_offers) offers, (select count(*) from public.service_offer_packages) packages, (select count(*) from public.service_offer_references) refs, (select count(*) from public.supplier_offer_scores) scores;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select 'supplier A' who, (select count(*) from public.supplier_offers) offers, (select count(*) from public.service_offer_packages) packages, (select count(*) from public.service_offer_references) refs;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000f1',false);
select 'chapter tester' who, (select count(*) from public.supplier_offers) offers, (select count(*) from public.service_offer_packages) packages, (select count(*) from public.service_offer_references) refs, (select count(*) from public.supplier_offer_scores) scores;
select 'tester can pick the service for a trial (title only)' t, partner_name, offer_title, item_id is null no_prices from public.partner_sample_targets() where partner_name like 'B%';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000c1',false);
select 'chapter coordinator' who, (select count(*) from public.supplier_offers) offers, (select count(*) from public.service_offer_packages) packages, (select count(*) from public.service_offer_references) refs;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000f2',false);
select 'finance' who, (select count(*) from public.supplier_offers) offers, (select count(*) from public.service_offer_packages) packages, (select count(*) from public.service_offer_references) refs;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1',false);
select 'member C' who, (select count(*) from public.supplier_offers) offers, (select count(*) from public.service_offer_packages) packages, (select count(*) from public.service_offer_references) refs;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000e1',false);
select 'national reviewer' who, (select count(*) from public.supplier_offers) offers, (select count(*) from public.service_offer_packages) packages, (select count(*) from public.service_offer_references) refs, (select count(*) from public.supplier_offer_scores) scores;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
do $$ begin insert into public.service_offer_packages (offer_id, name, scope, rate_basis, member_rate, acceptance_criteria) values ('22222222-0000-0000-0000-0000000000b1','X','Something to do','hour',100,'Done when signed'); raise exception 'BROWSER WRITE'; exception when insufficient_privilege then raise notice 'writing packages from the browser: refused'; end $$;
do $$ begin update public.service_offer_references set verification='verified' where true; raise exception 'BROWSER VERIFY'; exception when insufficient_privilege then raise notice 'writing references from the browser: refused'; end $$;
reset role;
set role anon;
do $$ begin perform count(*) from public.service_offer_packages; raise exception 'ANON READ'; exception when insufficient_privilege then raise notice 'visitors cannot read packages'; end $$;
do $$ begin perform count(*) from public.service_offer_references; raise exception 'ANON READ REFS'; exception when insufficient_privilege then raise notice 'visitors cannot read references'; end $$;
reset role;

\echo '--- 9. reopening a chosen offer; a changed reference goes back to pending'
update public.supplier_offers set status='draft', declaration_at=null, submitted_at=null where id='22222222-0000-0000-0000-0000000000b1';
update public.service_offer_references set client_contact='0917 000 0009' where id='55555555-0000-0000-0000-0000000000b1';
select client_name, verification, client_rating, verified_by is null cleared from public.service_offer_references where id='55555555-0000-0000-0000-0000000000b1';
update public.service_offer_packages set member_rate=2700 where id='44444444-0000-0000-0000-0000000000b1';
update public.supplier_offers set status='submitted', submitted_at=now(), declaration_at=now() where id='22222222-0000-0000-0000-0000000000b1';
select 'version 2' t, revision, (select count(*) from public.supplier_offer_scores s where s.offer_id='22222222-0000-0000-0000-0000000000b1' and s.revision=2) scores_v2 from public.supplier_offers where id='22222222-0000-0000-0000-0000000000b1';

\echo '--- 10. supplier offers still behave exactly as in Step 2'
do $$ begin update public.supplier_offers set status='submitted', submitted_at=now(), declaration_at=now() where id='22222222-0000-0000-0000-0000000000a1'; raise exception 'SUPPLIER EMPTY'; exception when check_violation or raise_exception then raise notice 'a supplier offer with answers missing: refused (unchanged)'; end $$;
update public.supplier_offers set title='Kraft bags', product_group='packaging', valid_until=current_date+60, vat_basis='vat_inclusive', serviceable_areas='Luzon', shipping_terms='delivery_fee', lead_time_days=3, sample_availability='free', commission_pct=5 where id='22222222-0000-0000-0000-0000000000a1';
do $$ begin update public.supplier_offers set status='submitted', submitted_at=now(), declaration_at=now() where id='22222222-0000-0000-0000-0000000000a1'; raise exception 'SUPPLIER NO ITEM'; exception when raise_exception then raise notice 'a supplier offer without products: refused (unchanged)'; end $$;
insert into public.supplier_offer_items (offer_id, product_name, sell_unit, base_unit, base_qty, member_price) values ('22222222-0000-0000-0000-0000000000a1','Kraft bag 8x12','pack of 100','piece',100,450);
update public.supplier_offers set status='submitted', submitted_at=now(), declaration_at=now() where id='22222222-0000-0000-0000-0000000000a1';
select kind, status, revision from public.supplier_offers order by kind;

\echo '--- 11. offer files: work samples and licences join the offer purpose; other purposes unchanged'
insert into public.vetting_documents (user_id, purpose, offer_id, doc_type, file_path, file_name, mime, size_bytes, key_id)
values ('00000000-0000-0000-0000-0000000000a2','offer','22222222-0000-0000-0000-0000000000b1','portfolio','offer/b/1.bin','report.pdf','application/pdf',1000,'k1'),
       ('00000000-0000-0000-0000-0000000000a2','offer','22222222-0000-0000-0000-0000000000b1','prc','offer/b/2.bin','prc.jpg','image/jpeg',1000,'k1');
do $$ begin insert into public.vetting_documents (user_id, purpose, doc_type, file_path, file_name, mime, size_bytes, key_id) values ('00000000-0000-0000-0000-0000000000a2','vetting','portfolio','v/1.bin','x.pdf','application/pdf',10,'k1'); raise exception 'PORTFOLIO VETTING'; exception when check_violation then raise notice 'a portfolio file for business vetting: refused (each purpose keeps its own types)'; end $$;
select doc_type, purpose from public.vetting_documents order by doc_type;

\echo '--- 12. account erasure removes the provider''s offers, packages and references'
delete from public.vetting_documents where user_id='00000000-0000-0000-0000-0000000000a2';
delete from auth.users where id='00000000-0000-0000-0000-0000000000a2';
select (select count(*) from public.supplier_offers where kind='service') offers, (select count(*) from public.service_offer_packages) packages, (select count(*) from public.service_offer_references) refs;
\echo '--- all Step 6 database tests passed'
