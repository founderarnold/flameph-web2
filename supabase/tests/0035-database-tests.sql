\set ON_ERROR_STOP 1
-- Partner Step 5 (sample tests, complaints, corrective actions, penalties, sanctions) database tests. Run on a LOCAL
-- copy built from migrations 0001-0035, never on the live database. Each "do" block expects a refusal; if the refusal
-- does not come, it stops with an error.
-- People: A accredited supplier; B accredited service provider; M and N members; R national reviewer; D admin;
--         O founder (super_admin); F finance; T chapter tester (chapter X); U chapter tester (chapter Y);
--         K chapter coordinator (chapter X).
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-0000000000a1','a@x.test'),('00000000-0000-0000-0000-0000000000a2','b@x.test'),
 ('00000000-0000-0000-0000-0000000000b1','m@x.test'),('00000000-0000-0000-0000-0000000000b2','n@x.test'),
 ('00000000-0000-0000-0000-0000000000e1','r@x.test'),('00000000-0000-0000-0000-0000000000d1','d@x.test'),('00000000-0000-0000-0000-0000000000a0','o@x.test'),
 ('00000000-0000-0000-0000-0000000000f2','f@x.test'),('00000000-0000-0000-0000-0000000000f1','t@x.test'),('00000000-0000-0000-0000-0000000000f3','u@x.test'),
 ('00000000-0000-0000-0000-0000000000c1','k@x.test');
insert into public.chapters (id, name, slug, published, status) values
 ('11111111-0000-0000-0000-000000000001','Chapter X','chapter-x',false,'forming'),('11111111-0000-0000-0000-000000000002','Chapter Y','chapter-y',false,'forming');
insert into public.roles (user_id, role) values ('00000000-0000-0000-0000-0000000000e1','national_reviewer'),('00000000-0000-0000-0000-0000000000d1','admin'),
 ('00000000-0000-0000-0000-0000000000a0','super_admin'),('00000000-0000-0000-0000-0000000000f2','finance');
insert into public.roles (user_id, role, chapter_id) values ('00000000-0000-0000-0000-0000000000f1','chapter_tester','11111111-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-0000000000f3','chapter_tester','11111111-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-0000000000c1','chapter_coordinator','11111111-0000-0000-0000-000000000001');
insert into public.partner_profiles (user_id, legal_name, categories) values
 ('00000000-0000-0000-0000-0000000000a1','A Trading',array['supplier']),('00000000-0000-0000-0000-0000000000a2','B Services',array['service_provider']);
-- A has a sent Best Offer with one product (written with the guards off, as Step 2 would have).
alter table public.supplier_offers disable trigger user; alter table public.supplier_offer_items disable trigger user;
insert into public.supplier_offers (id, user_id, status, revision, title, product_group, commission_pct, valid_until, vat_basis, serviceable_areas, shipping_terms, lead_time_days, sample_availability, declaration_at, submitted_at)
values ('22222222-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a1','submitted',1,'Kraft bags','packaging',5,current_date+60,'vat_inclusive','Luzon','delivery_fee',3,'free',now(),now());
insert into public.supplier_offer_items (id, offer_id, product_name, sell_unit, base_unit, base_qty, member_price) values ('33333333-0000-0000-0000-0000000000a1','22222222-0000-0000-0000-0000000000a1','Kraft bag 8x12','pack of 100','piece',100,450);
alter table public.supplier_offers enable trigger user; alter table public.supplier_offer_items enable trigger user;

\echo '--- 1. seeds: response targets and the default penalty terms'
select severity, first_response_hours, resolve_days, alert_now from public.complaint_targets order by resolve_days;
select scope, late_rate_pct_per_day, late_cap_pct, status from public.partner_penalty_terms;
select 'late penalty examples' t, public.partner_late_penalty(100000, 0.5, 4, 5) four_days, public.partner_late_penalty(100000, 0.5, 30, 5) thirty_days_capped;

\echo '--- 2. sample tests: who may test, for whom, and what is fixed'
do $$ begin insert into public.partner_sample_tests (tester_id, chapter_id, partner_user_id, partner_name, product_name) values ('00000000-0000-0000-0000-0000000000b1',null,'00000000-0000-0000-0000-0000000000a1','A Trading','Kraft bag'); raise exception 'MEMBER TESTED'; exception when raise_exception then raise notice 'an ordinary member cannot record a test: refused'; end $$;
do $$ begin insert into public.partner_sample_tests (tester_id, chapter_id, partner_user_id, partner_name, product_name) values ('00000000-0000-0000-0000-0000000000f1','11111111-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000a1','A Trading','Kraft bag'); raise exception 'OTHER CHAPTER'; exception when raise_exception then raise notice 'a tester for another chapter: refused'; end $$;
do $$ begin insert into public.partner_sample_tests (tester_id, chapter_id, partner_user_id, partner_name, product_name) values ('00000000-0000-0000-0000-0000000000f1','11111111-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000b2','N','Bag'); raise exception 'NOT PARTNER'; exception when raise_exception then raise notice 'testing for a member who is not accredited: refused'; end $$;
do $$ begin insert into public.partner_sample_tests (tester_id, chapter_id, partner_user_id, partner_name, offer_id, product_name) values ('00000000-0000-0000-0000-0000000000f1','11111111-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a2','B Services','22222222-0000-0000-0000-0000000000a1','Bag'); raise exception 'WRONG OFFER'; exception when raise_exception then raise notice 'an offer that is not from this partner: refused'; end $$;
do $$ begin insert into public.partner_sample_tests (tester_id, chapter_id, partner_user_id, partner_name, product_name, status) values ('00000000-0000-0000-0000-0000000000f1','11111111-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1','A Trading','Bag','submitted'); raise exception 'STARTED SENT'; exception when raise_exception then raise notice 'a test must start as draft'; end $$;
insert into public.partner_sample_tests (id, tester_id, chapter_id, partner_user_id, partner_name, offer_id, item_id, product_name)
values ('66666666-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f1','11111111-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1','A Trading','22222222-0000-0000-0000-0000000000a1','33333333-0000-0000-0000-0000000000a1','Kraft bag 8x12');
do $$ begin update public.partner_sample_tests set status='submitted' where id='66666666-0000-0000-0000-000000000001'; raise exception 'SENT EMPTY'; exception when check_violation then raise notice 'sending a test without its scores: refused'; end $$;
update public.partner_sample_tests set received_on=current_date-1, arrival_condition='good', matches_description='yes', label_complete='partly', score_packaging=4, score_appearance=5, score_quality=4, score_performance=4, score_labeling=3, would_recommend='yes', feedback_tags=array['well_packed','missing_label_info'], feedback='Strong bags, label lacks maker address.' where id='66666666-0000-0000-0000-000000000001';
do $$ begin update public.partner_sample_tests set safety_concern=true where id='66666666-0000-0000-0000-000000000001'; raise exception 'NO SAFETY NOTE'; exception when check_violation then raise notice 'a safety concern needs a note'; end $$;
do $$ begin update public.partner_sample_tests set feedback_tags=array['made_up_tag'] where id='66666666-0000-0000-0000-000000000001'; raise exception 'BAD TAG'; exception when check_violation then raise notice 'a feedback tag outside the standard list: refused'; end $$;
update public.partner_sample_tests set status='submitted' where id='66666666-0000-0000-0000-000000000001';
select ref_no, status, total, (submitted_at is not null) sent from public.partner_sample_tests;
do $$ begin update public.partner_sample_tests set score_quality=1 where id='66666666-0000-0000-0000-000000000001'; raise exception 'EDIT SENT'; exception when raise_exception then raise notice 'a sent test cannot be changed'; end $$;
do $$ begin update public.partner_sample_tests set status='reviewed', reviewed_by='00000000-0000-0000-0000-0000000000f1' where id='66666666-0000-0000-0000-000000000001'; raise exception 'TESTER REVIEWED'; exception when raise_exception then raise notice 'the tester cannot review their own test'; end $$;
do $$ begin update public.partner_sample_tests set status='reviewed', reviewed_by='00000000-0000-0000-0000-0000000000f2' where id='66666666-0000-0000-0000-000000000001'; raise exception 'FINANCE REVIEWED'; exception when raise_exception then raise notice 'finance cannot review a test'; end $$;
update public.partner_sample_tests set status='reviewed', reviewed_by='00000000-0000-0000-0000-0000000000e1', review_note='Good; ask for full label.', partner_visible=true where id='66666666-0000-0000-0000-000000000001';
do $$ begin delete from public.partner_sample_tests where id='66666666-0000-0000-0000-000000000001'; raise exception 'DELETED'; exception when raise_exception then raise notice 'a sent test cannot be deleted'; end $$;
-- The national team may test during the pilot (no chapter).
insert into public.partner_sample_tests (tester_id, partner_user_id, partner_name, product_name) values ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000a1','A Trading','Kraft bag 10x14');
delete from public.partner_sample_tests where tester_id='00000000-0000-0000-0000-0000000000e1' and status='draft';
select 'drafts can be deleted' t, count(*) from public.partner_sample_tests;

\echo '--- 3. complaints: draft, send, due dates from the targets'
do $$ begin insert into public.partner_complaints (complainant_id, partner_user_id, partner_name) values ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b2','N'); raise exception 'NOT PARTNER'; exception when raise_exception then raise notice 'a complaint about a member who is not accredited: refused'; end $$;
do $$ begin insert into public.partner_complaints (complainant_id, partner_user_id, partner_name) values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a1','A Trading'); raise exception 'SELF'; exception when raise_exception then raise notice 'a partner complaining about itself: refused'; end $$;
insert into public.partner_complaints (id, complainant_id, partner_user_id, partner_name, partner_category, chapter_id)
values ('77777777-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1','A Trading','supplier','11111111-0000-0000-0000-000000000001');
update public.partner_complaints set order_reference='MPH-10023', order_date=current_date-12, product_or_service='Kraft bags 8x12, 20 packs', issue='late',
  description='Promised in 3 days, arrived after 7.', desired_remedy='credit', affected_value=9000, changed_by='00000000-0000-0000-0000-0000000000b1' where id='77777777-0000-0000-0000-000000000001';
do $$ begin update public.partner_complaints set status='open', changed_by='00000000-0000-0000-0000-0000000000b1' where id='77777777-0000-0000-0000-000000000001'; raise exception 'NO CONSENT'; exception when raise_exception or check_violation then raise notice 'sending without consent: refused'; end $$;
do $$ begin update public.partner_complaints set description='x', changed_by='00000000-0000-0000-0000-0000000000a1' where id='77777777-0000-0000-0000-000000000001'; raise exception 'PARTNER EDIT DRAFT'; exception when raise_exception then raise notice 'the partner cannot touch the member''s draft'; end $$;
update public.partner_complaints set consent_at=now(), consent_version='1.0', status='open', changed_by='00000000-0000-0000-0000-0000000000b1' where id='77777777-0000-0000-0000-000000000001';
select ref_no, status, severity, round(extract(epoch from first_response_due_at - submitted_at)/3600) first_response_hours, round(extract(epoch from resolve_due_at - submitted_at)/86400) resolve_days from public.partner_complaints;
do $$ begin update public.partner_complaints set description='changed', changed_by='00000000-0000-0000-0000-0000000000b1' where id='77777777-0000-0000-0000-000000000001'; raise exception 'EDIT SENT'; exception when raise_exception then raise notice 'a sent complaint cannot be edited'; end $$;
do $$ begin update public.partner_complaints set status='investigating', changed_by='00000000-0000-0000-0000-0000000000a1' where id='77777777-0000-0000-0000-000000000001'; raise exception 'PARTNER MOVED'; exception when raise_exception then raise notice 'the partner cannot move the case'; end $$;
do $$ begin update public.partner_complaints set status='investigating', changed_by='00000000-0000-0000-0000-0000000000f1' where id='77777777-0000-0000-0000-000000000001'; raise exception 'TESTER MOVED'; exception when raise_exception then raise notice 'a chapter tester cannot move the case'; end $$;
do $$ begin update public.partner_complaints set status='resolved', changed_by='00000000-0000-0000-0000-0000000000e1' where id='77777777-0000-0000-0000-000000000001'; raise exception 'SKIPPED'; exception when raise_exception then raise notice 'open cannot jump to resolved'; end $$;
do $$ begin update public.partner_complaints set resolve_due_at=now()+interval '90 days', changed_by='00000000-0000-0000-0000-0000000000e1' where id='77777777-0000-0000-0000-000000000001'; raise exception 'DUE MOVED'; exception when raise_exception then raise notice 'due dates follow the targets (cannot be moved by hand)'; end $$;
-- The partner answers (its right to respond), then the team starts and raises the severity.
update public.partner_complaints set partner_response='Courier delay on our side. We offer a 5% credit.', changed_by='00000000-0000-0000-0000-0000000000a1' where id='77777777-0000-0000-0000-000000000001';
update public.partner_complaints set status='investigating', change_note='Asked the courier for proof.', changed_by='00000000-0000-0000-0000-0000000000e1' where id='77777777-0000-0000-0000-000000000001';
update public.partner_complaints set severity='high', change_note='Repeat delay', changed_by='00000000-0000-0000-0000-0000000000e1' where id='77777777-0000-0000-0000-000000000001';
select 'after severity high' t, status, severity, (first_responded_at is not null) first_response_done, round(extract(epoch from resolve_due_at - submitted_at)/86400) resolve_days from public.partner_complaints;

\echo '--- 4. corrective actions'
do $$ begin insert into public.partner_corrective_actions (complaint_id, kind, description, due_on, created_by) values ('77777777-0000-0000-0000-000000000001','credit','5% credit',current_date+7,'00000000-0000-0000-0000-0000000000a1'); raise exception 'PARTNER SET ACTION'; exception when raise_exception then raise notice 'the partner cannot set its own action'; end $$;
do $$ begin insert into public.partner_corrective_actions (complaint_id, kind, description, due_on, amount, created_by) values ('77777777-0000-0000-0000-000000000001','explanation','Explain',current_date+7,100,'00000000-0000-0000-0000-0000000000e1'); raise exception 'AMOUNT'; exception when check_violation then raise notice 'an amount only on a credit or refund'; end $$;
insert into public.partner_corrective_actions (id, complaint_id, kind, description, due_on, amount, created_by) values ('88888888-0000-0000-0000-000000000001','77777777-0000-0000-0000-000000000001','credit','Credit 5% of the order on the next MarketplacePH order',current_date+7,450,'00000000-0000-0000-0000-0000000000e1');
update public.partner_complaints set status='corrective_action', changed_by='00000000-0000-0000-0000-0000000000e1', change_note=null where id='77777777-0000-0000-0000-000000000001';
do $$ begin update public.partner_corrective_actions set status='verified', changed_by='00000000-0000-0000-0000-0000000000e1' where id='88888888-0000-0000-0000-000000000001'; raise exception 'VERIFY OPEN'; exception when raise_exception then raise notice 'an action cannot be checked before the partner marks it done'; end $$;
do $$ begin update public.partner_corrective_actions set status='done_by_partner', changed_by='00000000-0000-0000-0000-0000000000b1' where id='88888888-0000-0000-0000-000000000001'; raise exception 'MEMBER DONE'; exception when raise_exception then raise notice 'only the partner marks it done'; end $$;
do $$ begin update public.partner_corrective_actions set status='done_by_partner', amount=1, changed_by='00000000-0000-0000-0000-0000000000a1' where id='88888888-0000-0000-0000-000000000001'; raise exception 'PARTNER CHANGED AMOUNT'; exception when raise_exception then raise notice 'the partner cannot change the amount'; end $$;
update public.partner_corrective_actions set status='done_by_partner', partner_note='Credit given on order MPH-10101', changed_by='00000000-0000-0000-0000-0000000000a1' where id='88888888-0000-0000-0000-000000000001';
update public.partner_corrective_actions set status='verified', check_note='Seen on the MarketplacePH order', changed_by='00000000-0000-0000-0000-0000000000d1' where id='88888888-0000-0000-0000-000000000001';
select kind, amount, status, (checked_by='00000000-0000-0000-0000-0000000000d1') checked_by_admin from public.partner_corrective_actions;
do $$ begin delete from public.partner_corrective_actions where id='88888888-0000-0000-0000-000000000001'; raise exception 'DELETED'; exception when raise_exception then raise notice 'actions cannot be deleted'; end $$;

\echo '--- 5. penalties: proposed only, computed by the database, second person, legal review, partner answer or 7 days'
do $$ begin insert into public.partner_penalties (complaint_id, kind, affected_value, days_late, attributable, amount, basis_note, proposed_by) values ('77777777-0000-0000-0000-000000000001','late_delivery',9000,4,false,0,'Clause 7','00000000-0000-0000-0000-0000000000e1'); raise exception 'NOT ATTRIBUTABLE'; exception when raise_exception then raise notice 'a late penalty when the delay was not the partner''s fault: refused'; end $$;
do $$ begin insert into public.partner_penalties (complaint_id, kind, affected_value, days_late, attributable, amount, basis_note, proposed_by) values ('77777777-0000-0000-0000-000000000001','late_delivery',9000,4,true,0,'Clause 7','00000000-0000-0000-0000-0000000000f2'); raise exception 'FINANCE PROPOSED'; exception when raise_exception then raise notice 'finance cannot propose a penalty'; end $$;
insert into public.partner_penalties (id, complaint_id, kind, affected_value, days_late, attributable, amount, basis_note, proposed_by)
values ('99999999-0000-0000-0000-000000000001','77777777-0000-0000-0000-000000000001','late_delivery',9000,4,true,999999,'Supply agreement clause 7: 0.5% per day of the delayed items, max 5%','00000000-0000-0000-0000-0000000000e1');
select 'late 4 days on PHP 9,000' t, rate_pct_per_day, cap_pct, amount, status, partner_name from public.partner_penalties;
do $$ begin update public.partner_penalties set amount=1, changed_by='00000000-0000-0000-0000-0000000000e1' where id='99999999-0000-0000-0000-000000000001'; raise exception 'FIGURE CHANGED'; exception when raise_exception then raise notice 'the figure cannot be changed'; end $$;
do $$ begin update public.partner_penalties set status='approved', changed_by='00000000-0000-0000-0000-0000000000e1' where id='99999999-0000-0000-0000-000000000001'; raise exception 'SELF APPROVED'; exception when raise_exception then raise notice 'the proposer cannot approve'; end $$;
do $$ begin update public.partner_penalties set status='approved', changed_by='00000000-0000-0000-0000-0000000000d1' where id='99999999-0000-0000-0000-000000000001'; raise exception 'NO LEGAL'; exception when raise_exception then raise notice 'no approval before the legal review'; end $$;
update public.partner_penalties set legal_reviewed=true, changed_by='00000000-0000-0000-0000-0000000000d1' where id='99999999-0000-0000-0000-000000000001';
do $$ begin update public.partner_penalties set status='approved', changed_by='00000000-0000-0000-0000-0000000000d1' where id='99999999-0000-0000-0000-000000000001'; raise exception 'NO ANSWER'; exception when raise_exception then raise notice 'no approval before the partner answers or 7 days pass'; end $$;
do $$ begin update public.partner_penalties set partner_response='We disagree', changed_by='00000000-0000-0000-0000-0000000000b1' where id='99999999-0000-0000-0000-000000000001'; raise exception 'MEMBER ANSWERED'; exception when raise_exception then raise notice 'only the partner answers its penalty'; end $$;
update public.partner_penalties set partner_response='We accept; the courier was our choice.', changed_by='00000000-0000-0000-0000-0000000000a1' where id='99999999-0000-0000-0000-000000000001';
do $$ begin update public.partner_penalties set status='approved', changed_by='00000000-0000-0000-0000-0000000000a1' where id='99999999-0000-0000-0000-000000000001'; raise exception 'PARTNER APPROVED'; exception when raise_exception then raise notice 'the partner cannot approve'; end $$;
update public.partner_penalties set status='approved', changed_by='00000000-0000-0000-0000-0000000000d1' where id='99999999-0000-0000-0000-000000000001';
do $$ begin update public.partner_penalties set status='settled', settled_ref='MPH-CR-1', settled_on=current_date, changed_by='00000000-0000-0000-0000-0000000000e1' where id='99999999-0000-0000-0000-000000000001'; raise exception 'REVIEWER SETTLED'; exception when raise_exception then raise notice 'only finance records the settlement'; end $$;
update public.partner_penalties set status='settled', settled_ref='MPH-CR-1', settled_on=current_date, changed_by='00000000-0000-0000-0000-0000000000f2' where id='99999999-0000-0000-0000-000000000001';
select 'penalty' t, status, amount, (approved_by='00000000-0000-0000-0000-0000000000d1') approved_by_admin, settled_ref from public.partner_penalties;
-- 30 days late on PHP 100,000 is capped at 5% = 5,000. The 7-day answer window: after 8 days without an answer, approval is allowed.
insert into public.partner_penalties (id, complaint_id, kind, affected_value, days_late, attributable, amount, basis_note, proposed_by)
values ('99999999-0000-0000-0000-000000000002','77777777-0000-0000-0000-000000000001','late_delivery',100000,30,true,0,'Clause 7','00000000-0000-0000-0000-0000000000e1');
alter table public.partner_penalties disable trigger partner_penalties_guard;
update public.partner_penalties set created_at=now()-interval '8 days', legal_reviewed=true where id='99999999-0000-0000-0000-000000000002';
alter table public.partner_penalties enable trigger partner_penalties_guard;
update public.partner_penalties set status='approved', changed_by='00000000-0000-0000-0000-0000000000a0' where id='99999999-0000-0000-0000-000000000002';
select 'capped' t, amount, status from public.partner_penalties where id='99999999-0000-0000-0000-000000000002';
-- Other penalties: never more than the affected value.
do $$ begin insert into public.partner_penalties (complaint_id, kind, affected_value, attributable, amount, basis_note, proposed_by) values ('77777777-0000-0000-0000-000000000001','other',1000,true,2000,'x','00000000-0000-0000-0000-0000000000e1'); raise exception 'OVER VALUE'; exception when raise_exception then raise notice 'a penalty above the affected value: refused'; end $$;
-- Penalty terms per agreement: written by one, made active by a second national team member; it is used next time.
insert into public.partner_penalty_terms (id, scope, partner_user_id, partner_name, contract_ref, signed_on, late_rate_pct_per_day, late_cap_pct, created_by)
values ('aaaaaaaa-0000-0000-0000-000000000001','agreement','00000000-0000-0000-0000-0000000000a1','A Trading','MPH-2026-001',current_date-3,0.3,3,'00000000-0000-0000-0000-0000000000e1');
do $$ begin update public.partner_penalty_terms set status='active', approved_by='00000000-0000-0000-0000-0000000000e1' where id='aaaaaaaa-0000-0000-0000-000000000001'; raise exception 'SELF ACTIVE'; exception when raise_exception then raise notice 'terms need a second person'; end $$;
update public.partner_penalty_terms set status='active', approved_by='00000000-0000-0000-0000-0000000000a0' where id='aaaaaaaa-0000-0000-0000-000000000001';
insert into public.partner_penalties (id, complaint_id, kind, affected_value, days_late, attributable, amount, basis_note, proposed_by)
values ('99999999-0000-0000-0000-000000000003','77777777-0000-0000-0000-000000000001','late_delivery',10000,4,true,0,'Clause 7 of MPH-2026-001','00000000-0000-0000-0000-0000000000e1');
select 'agreement terms used' t, rate_pct_per_day, cap_pct, amount from public.partner_penalties where id='99999999-0000-0000-0000-000000000003';
do $$ begin update public.partner_penalty_terms set status='retired' where scope='default' and status='active'; raise exception 'DEFAULT RETIRED'; exception when raise_exception then raise notice 'the default is never left empty'; end $$;
do $$ begin delete from public.partner_penalties where id='99999999-0000-0000-0000-000000000003'; raise exception 'DELETED'; exception when raise_exception then raise notice 'penalties cannot be deleted'; end $$;
update public.partner_penalties set status='cancelled', decision_note='Duplicate of the first penalty', changed_by='00000000-0000-0000-0000-0000000000e1' where id='99999999-0000-0000-0000-000000000003';

\echo '--- 6. resolve, appeal within 7 days, the founder decides the appeal'
do $$ begin update public.partner_complaints set status='resolved', changed_by='00000000-0000-0000-0000-0000000000e1' where id='77777777-0000-0000-0000-000000000001'; raise exception 'NO OUTCOME'; exception when raise_exception then raise notice 'resolving needs the written outcome'; end $$;
update public.partner_complaints set status='resolved', outcome_note='Late delivery confirmed. 5% credit given (verified). Penalty recorded.', changed_by='00000000-0000-0000-0000-0000000000e1' where id='77777777-0000-0000-0000-000000000001';
do $$ begin update public.partner_complaints set status='appealed', appeal_reason='x', changed_by='00000000-0000-0000-0000-0000000000e1' where id='77777777-0000-0000-0000-000000000001'; raise exception 'TEAM APPEALED'; exception when raise_exception then raise notice 'only the member or partner appeals'; end $$;
update public.partner_complaints set status='appealed', appeal_reason='The credit was 5%, but I lost a client order.', changed_by='00000000-0000-0000-0000-0000000000b1' where id='77777777-0000-0000-0000-000000000001';
do $$ begin update public.partner_complaints set status='closed', close_reason='other', changed_by='00000000-0000-0000-0000-0000000000e1' where id='77777777-0000-0000-0000-000000000001'; raise exception 'REVIEWER DECIDED APPEAL'; exception when raise_exception then raise notice 'appeals are decided by the founder'; end $$;
update public.partner_complaints set status='closed', close_reason='other', outcome_note='Appeal reviewed: the credit stands. Lost profits are outside the agreement.', changed_by='00000000-0000-0000-0000-0000000000a0' where id='77777777-0000-0000-0000-000000000001';
select ref_no, status, close_reason, appeal_by, (closed_at is not null) closed from public.partner_complaints where id='77777777-0000-0000-0000-000000000001';
do $$ begin update public.partner_complaints set outcome_note='changed', changed_by='00000000-0000-0000-0000-0000000000a0' where id='77777777-0000-0000-0000-000000000001'; raise exception 'EDIT CLOSED'; exception when raise_exception then raise notice 'a closed complaint cannot be changed'; end $$;
do $$ begin delete from public.partner_complaints where id='77777777-0000-0000-0000-000000000001'; raise exception 'DELETED'; exception when raise_exception then raise notice 'a sent complaint cannot be deleted'; end $$;
select side, action, from_status, to_status, internal from public.partner_complaint_events where complaint_id='77777777-0000-0000-0000-000000000001' order by created_at, id;
do $$ begin update public.partner_complaint_events set note='edited' where complaint_id='77777777-0000-0000-0000-000000000001'; raise exception 'HISTORY EDITED'; exception when raise_exception then raise notice 'the history cannot be changed'; end $$;
do $$ begin delete from public.partner_complaint_events where complaint_id='77777777-0000-0000-0000-000000000001'; raise exception 'HISTORY DELETED'; exception when raise_exception then raise notice 'the history cannot be deleted'; end $$;
-- Appeals only within 7 days of the resolution; the member may withdraw an open case; a safety complaint starts critical.
insert into public.partner_complaints (id, complainant_id, partner_user_id, partner_name, order_reference, issue, description, desired_remedy, consent_at)
values ('77777777-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000a1','A Trading','MPH-20001','safety','Bag tore and cut my hand.','refund',now());
update public.partner_complaints set status='open', changed_by='00000000-0000-0000-0000-0000000000b2' where id='77777777-0000-0000-0000-000000000002';
select 'safety complaint' t, severity, round(extract(epoch from first_response_due_at - submitted_at)/3600) first_response_hours from public.partner_complaints where id='77777777-0000-0000-0000-000000000002';
update public.partner_complaints set status='investigating', changed_by='00000000-0000-0000-0000-0000000000e1' where id='77777777-0000-0000-0000-000000000002';
update public.partner_complaints set status='resolved', outcome_note='Refund arranged by MarketplacePH Online Store.', changed_by='00000000-0000-0000-0000-0000000000e1' where id='77777777-0000-0000-0000-000000000002';
alter table public.partner_complaints disable trigger partner_complaints_guard;
update public.partner_complaints set resolved_at=now()-interval '8 days' where id='77777777-0000-0000-0000-000000000002';
alter table public.partner_complaints enable trigger partner_complaints_guard;
do $$ begin update public.partner_complaints set status='appealed', appeal_reason='late', changed_by='00000000-0000-0000-0000-0000000000a1' where id='77777777-0000-0000-0000-000000000002'; raise exception 'LATE APPEAL'; exception when raise_exception then raise notice 'an appeal after 7 days: refused'; end $$;
insert into public.partner_complaints (id, complainant_id, partner_user_id, partner_name, order_reference, issue, description, desired_remedy, consent_at)
values ('77777777-0000-0000-0000-000000000003','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a2','B Services','SVC-1','unsatisfactory_service','Bookkeeping errors.','re_performance',now());
update public.partner_complaints set status='open', changed_by='00000000-0000-0000-0000-0000000000b1' where id='77777777-0000-0000-0000-000000000003';
update public.partner_complaints set status='closed', changed_by='00000000-0000-0000-0000-0000000000b1' where id='77777777-0000-0000-0000-000000000003';
select 'withdrawn' t, status, close_reason from public.partner_complaints where id='77777777-0000-0000-0000-000000000003';

\echo '--- 7. overdue alerts'
insert into public.partner_complaints (id, complainant_id, partner_user_id, partner_name, order_reference, issue, description, desired_remedy, consent_at)
values ('77777777-0000-0000-0000-000000000004','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1','A Trading','MPH-30001','missing','2 of 20 packs missing.','replacement',now());
update public.partner_complaints set status='open', changed_by='00000000-0000-0000-0000-0000000000b1' where id='77777777-0000-0000-0000-000000000004';
alter table public.partner_complaints disable trigger partner_complaints_guard;
update public.partner_complaints set first_response_due_at=now()-interval '2 hours' where id='77777777-0000-0000-0000-000000000004';
alter table public.partner_complaints enable trigger partner_complaints_guard;
select ref_no, severity, kind from public.complaints_overdue();
update public.partner_complaints set alerted_at=now() where id='77777777-0000-0000-0000-000000000004';
select 'after the alert is stamped' t, count(*) from public.complaints_overdue();

\echo '--- 8. sanctions: second person, founder for termination, answer or 7 days, hold suspends the accreditation'
do $$ begin insert into public.partner_sanctions (partner_user_id, partner_name, level, reason, ends_on, proposed_by) values ('00000000-0000-0000-0000-0000000000a1','A Trading','hold','x',current_date+30,'00000000-0000-0000-0000-0000000000c1'); raise exception 'COORDINATOR'; exception when raise_exception then raise notice 'a chapter coordinator cannot propose a sanction (chapters never decide)'; end $$;
do $$ begin insert into public.partner_sanctions (partner_user_id, partner_name, level, reason, proposed_by) values ('00000000-0000-0000-0000-0000000000a1','A Trading','probation','x','00000000-0000-0000-0000-0000000000e1'); raise exception 'NO END'; exception when check_violation then raise notice 'probation needs an end date'; end $$;
insert into public.partner_sanctions (id, partner_user_id, partner_name, complaint_id, level, reason, proposed_by) values ('bbbbbbbb-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1','A Trading','77777777-0000-0000-0000-000000000004','warning','Two late or missing deliveries this quarter.','00000000-0000-0000-0000-0000000000e1');
update public.partner_sanctions set status='active', changed_by='00000000-0000-0000-0000-0000000000d1' where id='bbbbbbbb-0000-0000-0000-000000000001';
insert into public.partner_sanctions (id, partner_user_id, partner_name, complaint_id, level, reason, ends_on, proposed_by) values ('bbbbbbbb-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000a1','A Trading','77777777-0000-0000-0000-000000000004','hold','No new orders until the missing packs are replaced.',current_date+30,'00000000-0000-0000-0000-0000000000e1');
do $$ begin update public.partner_sanctions set status='active', changed_by='00000000-0000-0000-0000-0000000000d1' where id='bbbbbbbb-0000-0000-0000-000000000002'; raise exception 'NO ANSWER WINDOW'; exception when raise_exception then raise notice 'a hold waits for the partner''s answer or 7 days'; end $$;
update public.partner_sanctions set partner_response='We will replace the packs this week.', changed_by='00000000-0000-0000-0000-0000000000a1' where id='bbbbbbbb-0000-0000-0000-000000000002';
update public.partner_sanctions set status='active', changed_by='00000000-0000-0000-0000-0000000000d1' where id='bbbbbbbb-0000-0000-0000-000000000002';
select 'hold active' t, status from public.partner_profiles where user_id='00000000-0000-0000-0000-0000000000a1';
do $$ begin insert into public.supplier_offers (user_id) values ('00000000-0000-0000-0000-0000000000a1'); raise exception 'OFFER WHILE HELD'; exception when raise_exception then raise notice 'a supplier on hold cannot start a new offer'; end $$;
update public.partner_sanctions set status='lifted', lift_note='Packs replaced.', changed_by='00000000-0000-0000-0000-0000000000e1' where id='bbbbbbbb-0000-0000-0000-000000000002';
select 'hold lifted' t, status from public.partner_profiles where user_id='00000000-0000-0000-0000-0000000000a1';
insert into public.partner_sanctions (id, partner_user_id, partner_name, level, reason, proposed_by) values ('bbbbbbbb-0000-0000-0000-000000000003','00000000-0000-0000-0000-0000000000a2','B Services','termination','Repeated failure to re-perform services.','00000000-0000-0000-0000-0000000000e1');
alter table public.partner_sanctions disable trigger partner_sanctions_guard;
update public.partner_sanctions set created_at=now()-interval '8 days' where id='bbbbbbbb-0000-0000-0000-000000000003';
alter table public.partner_sanctions enable trigger partner_sanctions_guard;
do $$ begin update public.partner_sanctions set status='active', changed_by='00000000-0000-0000-0000-0000000000d1' where id='bbbbbbbb-0000-0000-0000-000000000003'; raise exception 'ADMIN TERMINATED'; exception when raise_exception then raise notice 'only the founder approves a termination'; end $$;
update public.partner_sanctions set status='active', changed_by='00000000-0000-0000-0000-0000000000a0' where id='bbbbbbbb-0000-0000-0000-000000000003';
do $$ begin update public.partner_sanctions set status='lifted', lift_note='x', changed_by='00000000-0000-0000-0000-0000000000a0' where id='bbbbbbbb-0000-0000-0000-000000000003'; raise exception 'TERMINATION LIFTED'; exception when raise_exception then raise notice 'a termination is final'; end $$;
select 'terminated' t, status from public.partner_profiles where user_id='00000000-0000-0000-0000-0000000000a2';
do $$ begin insert into public.partner_sanctions (partner_user_id, partner_name, complaint_id, level, reason, ends_on, proposed_by, urgent) values ('00000000-0000-0000-0000-0000000000a1','A Trading','77777777-0000-0000-0000-000000000004','hold','x',current_date+5,'00000000-0000-0000-0000-0000000000e1',true); raise exception 'URGENT NON CRITICAL'; exception when raise_exception then raise notice 'an urgent hold only on a critical complaint'; end $$;

\echo '--- 9. who sees what (row level security)'
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1',false);
select 'member M' who, (select count(*) from public.partner_complaints) complaints, (select count(*) from public.partner_complaint_events) history, (select count(*) from public.partner_complaint_events where internal) team_notes,
  (select count(*) from public.partner_corrective_actions) actions, (select count(*) from public.partner_penalties) penalties, (select count(*) from public.partner_sanctions) sanctions, (select count(*) from public.partner_sample_tests) samples;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b2',false);
select 'member N' who, (select count(*) from public.partner_complaints) complaints, (select count(*) from public.partner_corrective_actions) actions, (select count(*) from public.partner_penalties) penalties;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select 'partner A' who, (select count(*) from public.partner_complaints) complaints, (select count(*) from public.partner_complaint_events where internal) team_notes, (select count(*) from public.partner_penalties) penalties,
  (select count(*) from public.partner_sanctions) sanctions, (select count(*) from public.partner_sample_tests) samples_table, (select count(*) from public.my_sample_results()) shared_results,
  (select count(*) from public.partner_penalty_terms) terms;
do $$ begin perform assigned_to from public.partner_complaints limit 1; raise exception 'SAW ASSIGNED'; exception when insufficient_privilege then raise notice 'members cannot read team-only columns'; end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000f1',false);
select 'tester T' who, (select count(*) from public.partner_sample_tests) samples, (select count(*) from public.partner_complaints) complaints, (select count(*) from public.partner_penalties) penalties, (select count(*) from public.partner_sample_targets()) pick_list;
select * from public.partner_sample_targets() limit 3;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000f3',false);
select 'tester U (chapter Y)' who, (select count(*) from public.partner_sample_tests) samples;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000c1',false);
select 'coordinator K (chapter X)' who, (select count(*) from public.partner_sample_tests) samples, (select count(*) from public.partner_complaints) complaints, (select count(*) from public.partner_sample_targets()) pick_list;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000f2',false);
select 'finance F' who, (select count(*) from public.partner_penalties) penalties, (select count(*) from public.partner_complaints) complaints, (select count(*) from public.partner_sanctions) sanctions;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000e1',false);
select 'reviewer R' who, (select count(*) from public.partner_complaints) complaints, (select count(*) from public.partner_complaint_events) history, (select count(*) from public.partner_penalties) penalties, (select count(*) from public.partner_sanctions) sanctions, (select count(*) from public.partner_sample_tests) samples;
do $$ begin insert into public.partner_complaints (complainant_id, partner_user_id, partner_name) values (auth.uid(),'00000000-0000-0000-0000-0000000000a1','A'); raise exception 'BROWSER WROTE'; exception when insufficient_privilege then raise notice 'no browser role can write'; end $$;
do $$ begin update public.partner_penalties set status='waived'; raise exception 'BROWSER WROTE'; exception when insufficient_privilege then raise notice 'no browser role can write penalties'; end $$;
reset role;
set role anon;
do $$ begin perform 1 from public.partner_complaints; raise exception 'ANON READ'; exception when insufficient_privilege then raise notice 'visitors: refused'; end $$;
do $$ begin perform 1 from public.complaint_targets; raise exception 'ANON READ'; exception when insufficient_privilege then raise notice 'visitors cannot read targets either'; end $$;
reset role;

\echo '--- 10. evidence files are kept apart and readable only by the two sides and the team'
insert into public.vetting_documents (user_id, purpose, complaint_id, doc_type, file_path, file_name, mime, size_bytes, key_id)
values ('00000000-0000-0000-0000-0000000000b1','complaint','77777777-0000-0000-0000-000000000001','evidence_photo','complaint/m/1.bin','box.jpg','image/jpeg',1000,'k1');
insert into public.vetting_documents (user_id, purpose, sample_id, doc_type, file_path, file_name, mime, size_bytes, key_id)
values ('00000000-0000-0000-0000-0000000000f1','sample','66666666-0000-0000-0000-000000000001','sample_photo','sample/t/1.bin','bag.jpg','image/jpeg',1000,'k1');
do $$ begin insert into public.vetting_documents (user_id, purpose, complaint_id, doc_type, file_path, file_name, mime, size_bytes, key_id) values ('00000000-0000-0000-0000-0000000000b1','complaint','77777777-0000-0000-0000-000000000001','dti_sec','x','x.pdf','application/pdf',10,'k1'); raise exception 'WRONG TYPE'; exception when check_violation then raise notice 'a business permit type on complaint evidence: refused'; end $$;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select 'partner A sees evidence' who, count(*) from public.vetting_documents where purpose in ('complaint', 'sample');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b2',false);
select 'member N sees evidence' who, count(*) from public.vetting_documents where purpose in ('complaint', 'sample');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000e1',false);
select 'reviewer R sees evidence' who, count(*) from public.vetting_documents where purpose in ('complaint', 'sample');
reset role;
select 'nothing due for deletion yet' t, count(*) from public.vetting_documents_due() where file_path like 'complaint/%' or file_path like 'sample/%';

\echo '--- 11. erasing an account keeps the case (names kept, account empty)'
delete from auth.users where id='00000000-0000-0000-0000-0000000000b1';
select 'after member M is erased' t, count(*) complaints, count(*) filter (where complainant_id is null) without_account from public.partner_complaints;
select 'member M evidence goes with the account' t, count(*) from public.vetting_documents where purpose='complaint';
delete from auth.users where id='00000000-0000-0000-0000-0000000000e1';
select 'after reviewer R is erased' t, count(*) filter (where actor_id is null) history_without_actor, count(*) total from public.partner_complaint_events;

\echo '--- done: all Step 5 database tests passed'
