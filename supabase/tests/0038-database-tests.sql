\set ON_ERROR_STOP 1
-- Partner Step 8 (contracts and sign-off) database tests. Run on a LOCAL copy built from migrations 0001-0038, never on
-- the live database. Each "do" block expects a refusal; if the refusal does not come, it stops with an error.
-- People: P and Q accredited suppliers; M accredited toll manufacturer; S accredited service provider; C member (not
--         accredited); R national reviewer; D admin; O founder (super_admin); F finance; T chapter tester and K chapter
--         coordinator (chapter X).
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-0000000000a1','p@x.test'),('00000000-0000-0000-0000-0000000000a3','q@x.test'),('00000000-0000-0000-0000-0000000000a5','m@x.test'),
 ('00000000-0000-0000-0000-0000000000a2','s@x.test'),('00000000-0000-0000-0000-0000000000b1','c@x.test'),('00000000-0000-0000-0000-0000000000e1','r@x.test'),
 ('00000000-0000-0000-0000-0000000000d1','d@x.test'),('00000000-0000-0000-0000-00000000000f','o@x.test'),('00000000-0000-0000-0000-0000000000f2','f@x.test'),
 ('00000000-0000-0000-0000-0000000000f1','t@x.test'),('00000000-0000-0000-0000-0000000000c1','k@x.test');
insert into public.chapters (id, name, slug, published, status) values ('11111111-0000-0000-0000-000000000001','Chapter X','chapter-x',false,'forming');
insert into public.roles (user_id, role) values ('00000000-0000-0000-0000-0000000000e1','national_reviewer'),('00000000-0000-0000-0000-0000000000d1','admin'),
 ('00000000-0000-0000-0000-00000000000f','super_admin'),('00000000-0000-0000-0000-0000000000f2','finance');
insert into public.roles (user_id, role, chapter_id) values ('00000000-0000-0000-0000-0000000000f1','chapter_tester','11111111-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-0000000000c1','chapter_coordinator','11111111-0000-0000-0000-000000000001');
insert into public.partner_profiles (user_id, legal_name, categories) values
 ('00000000-0000-0000-0000-0000000000a1','P Trading Corporation',array['supplier']),('00000000-0000-0000-0000-0000000000a3','Q Packaging',array['supplier']),
 ('00000000-0000-0000-0000-0000000000a5','M Food Manufacturing Corp',array['toll_manufacturer']),('00000000-0000-0000-0000-0000000000a2','S Services',array['service_provider']);

-- Earlier-step records (chosen offers, a territory, a licence) are set up directly; their own rules were tested in 0032-0037.
set session_replication_role = replica;
insert into public.supplier_offers (id, user_id, kind, status, revision, title, product_group, valid_until, vat_basis, serviceable_areas, shipping_terms,
  lead_time_days, sample_availability, commission_pct, declaration_at, submitted_at, decided_at, selection_reason) values
 ('22222222-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a1','supplier','selected',1,'Kraft paper bags','packaging',current_date+180,'vat_inclusive','NCR and Central Luzon','delivery_fee',7,'free',5,now(),now(),now(),'Best value'),
 ('22222222-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000a1','supplier','submitted',1,'Paper cups','packaging',current_date+180,'vat_inclusive','NCR','delivery_fee',7,'free',5,now(),now(),now(),'Best value'),
 ('22222222-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000a3','supplier','selected',1,'Boxes','packaging',current_date+180,'non_vat','NCR','pickup_only',5,'none',4,now(),now(),now(),'Best value');
insert into public.territorial_appointments (id, partner_user_id, partner_category, rights, category_key, category_label, channels, online_sales,
  start_date, end_date, review_every, status, approved_at, approver_declared_at) values
 ('55555555-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a1','supplier','distribution','packaging','Food packaging',array['group_order'],'delivery_address',current_date,current_date+365,'quarterly','active',now(),now()),
 ('55555555-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000a3','supplier','distribution','boxes','Boxes',array['group_order'],'delivery_address',current_date,current_date+365,'quarterly','active',now(),now());
insert into public.signature_licences (id, partner_user_id, partner_name, status) values ('66666666-0000-0000-0000-0000000000a5','00000000-0000-0000-0000-0000000000a5','M Food Manufacturing Corp','draft');
set session_replication_role = origin;

\echo '--- 1. templates: national team only, lawyer review before approval, approved versions fixed'
do $$ begin insert into public.contract_templates (part, version, title, body, created_by) values ('master','1.0','Master','x' || repeat('y', 60),'00000000-0000-0000-0000-0000000000b1'); raise exception 'MEMBER TEMPLATE'; exception when raise_exception then raise notice 'a member writing a template: refused'; end $$;
do $$ begin insert into public.contract_templates (part, version, title, body, created_by) values ('master','1.0','Master','x' || repeat('y', 60),'00000000-0000-0000-0000-0000000000f2'); raise exception 'FINANCE TEMPLATE'; exception when raise_exception then raise notice 'finance writing a template: refused'; end $$;
do $$ begin insert into public.contract_templates (part, version, title, body, created_by, status) values ('master','1.0','Master','x' || repeat('y', 60),'00000000-0000-0000-0000-0000000000e1','approved'); raise exception 'STARTS APPROVED'; exception when raise_exception or check_violation then raise notice 'a template cannot start approved'; end $$;
do $$ begin insert into public.contract_templates (part, version, title, body, created_by) values ('master','v1','Master','x' || repeat('y', 60),'00000000-0000-0000-0000-0000000000e1'); raise exception 'BAD VERSION'; exception when check_violation then raise notice 'a version that is not like 1.0: refused'; end $$;
insert into public.contract_templates (id, part, version, title, body, created_by)
select ('77777777-0000-0000-0000-00000000000' || n)::uuid, p, '1.0', initcap(replace(p, '_', ' ')), 'Standard text for ' || p || '. {{partner_legal_name}} ' || repeat('Lorem ipsum. ', 10), '00000000-0000-0000-0000-0000000000e1'
from unnest(array['master','schedule_supplier','annex_territory','annex_pricing','annex_sla','annex_ip','schedule_service','schedule_manufacturer']) with ordinality t(p, n);
do $$ begin insert into public.contract_templates (part, version, title, body, created_by) values ('master','1.0','Again','x' || repeat('y', 60),'00000000-0000-0000-0000-0000000000e1'); raise exception 'DUP VERSION'; exception when unique_violation then raise notice 'the same part and version twice: refused'; end $$;
do $$ begin update public.contract_templates set status='approved', approved_by='00000000-0000-0000-0000-0000000000e1' where part='master'; raise exception 'NO LAWYER'; exception when raise_exception then raise notice 'approving without the lawyer''s review: refused'; end $$;
do $$ begin update public.contract_templates set status='approved', approved_by='00000000-0000-0000-0000-0000000000e1', lawyer_name='Atty. Juan Dela Cruz', lawyer_reviewed_on=current_date+5 where part='master'; raise exception 'FUTURE REVIEW'; exception when raise_exception then raise notice 'a lawyer review dated in the future: refused'; end $$;
do $$ begin update public.contract_templates set status='approved', approved_by='00000000-0000-0000-0000-0000000000a1', lawyer_name='Atty. Juan Dela Cruz', lawyer_reviewed_on=current_date where part='master'; raise exception 'PARTNER APPROVED'; exception when raise_exception then raise notice 'a partner approving a template: refused'; end $$;
update public.contract_templates set lawyer_name='Atty. Juan Dela Cruz', lawyer_reviewed_on=current_date where part in ('master','schedule_supplier','annex_territory','annex_pricing','annex_sla');
update public.contract_templates set status='approved', approved_by='00000000-0000-0000-0000-0000000000e1' where part in ('master','schedule_supplier','annex_territory','annex_pricing','annex_sla');
do $$ begin update public.contract_templates set body = body || ' changed' where part='master'; raise exception 'APPROVED CHANGED'; exception when raise_exception then raise notice 'changing an approved version: refused'; end $$;
do $$ begin delete from public.contract_templates where part='master'; raise exception 'APPROVED DELETED'; exception when raise_exception then raise notice 'deleting an approved version: refused'; end $$;
-- A new master version replaces the old one when approved.
insert into public.contract_templates (id, part, version, title, body, created_by) values ('77777777-0000-0000-0000-000000000099','master','1.1','Master','Master 1.1 text {{partner_legal_name}} ' || repeat('Lorem ipsum. ', 10),'00000000-0000-0000-0000-0000000000d1');
update public.contract_templates set status='approved', approved_by='00000000-0000-0000-0000-0000000000e1', lawyer_name='Atty. Juan Dela Cruz', lawyer_reviewed_on=current_date where id='77777777-0000-0000-0000-000000000099';
select part, version, status from public.contract_templates where part='master' order by version;

\echo '--- 2. preparing a contract: national team only, from the partner''s own chosen offer, territories and licence'
do $$ begin insert into public.partner_contracts (partner_user_id, partner_name, category, created_by) values ('00000000-0000-0000-0000-0000000000a1','P','supplier','00000000-0000-0000-0000-0000000000f2'); raise exception 'FINANCE PREPARED'; exception when raise_exception then raise notice 'finance preparing a contract: refused'; end $$;
do $$ begin insert into public.partner_contracts (partner_user_id, partner_name, category, created_by) values ('00000000-0000-0000-0000-0000000000a1','P','supplier','00000000-0000-0000-0000-0000000000a1'); raise exception 'SELF PREPARED'; exception when raise_exception then raise notice 'a partner preparing their own contract: refused'; end $$;
do $$ begin insert into public.partner_contracts (partner_user_id, partner_name, category, created_by) values ('00000000-0000-0000-0000-0000000000b1','C','supplier','00000000-0000-0000-0000-0000000000e1'); raise exception 'NOT ACCREDITED'; exception when raise_exception then raise notice 'a member who is not accredited: refused'; end $$;
do $$ begin insert into public.partner_contracts (partner_user_id, partner_name, category, created_by) values ('00000000-0000-0000-0000-0000000000a1','P','service_provider','00000000-0000-0000-0000-0000000000e1'); raise exception 'WRONG CATEGORY'; exception when raise_exception then raise notice 'a category the partner is not accredited in: refused'; end $$;
do $$ begin insert into public.partner_contracts (partner_user_id, partner_name, category, offer_id, created_by) values ('00000000-0000-0000-0000-0000000000a1','P','supplier','22222222-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000e1'); raise exception 'OTHER OFFER'; exception when raise_exception then raise notice 'another partner''s offer: refused'; end $$;
do $$ begin insert into public.partner_contracts (partner_user_id, partner_name, category, offer_id, created_by) values ('00000000-0000-0000-0000-0000000000a1','P','supplier','22222222-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000e1'); raise exception 'NOT SELECTED'; exception when raise_exception then raise notice 'an offer that was not chosen: refused'; end $$;
do $$ begin insert into public.partner_contracts (partner_user_id, partner_name, category, licence_id, created_by) values ('00000000-0000-0000-0000-0000000000a1','P','supplier','66666666-0000-0000-0000-0000000000a5','00000000-0000-0000-0000-0000000000e1'); raise exception 'LICENCE ON SUPPLIER'; exception when raise_exception then raise notice 'a FLAME Signature licence on a supplier contract: refused'; end $$;
do $$ begin insert into public.partner_contracts (partner_user_id, partner_name, category, appointment_ids, created_by) values ('00000000-0000-0000-0000-0000000000a1','P','supplier',array['55555555-0000-0000-0000-0000000000a3']::uuid[],'00000000-0000-0000-0000-0000000000e1'); raise exception 'OTHER TERRITORY'; exception when raise_exception then raise notice 'another partner''s territory: refused'; end $$;
do $$ begin insert into public.partner_contracts (partner_user_id, partner_name, category, created_by, status) values ('00000000-0000-0000-0000-0000000000a1','P','supplier','00000000-0000-0000-0000-0000000000e1','signed'); raise exception 'STARTS SIGNED'; exception when raise_exception or check_violation then raise notice 'a contract cannot start signed'; end $$;
do $$ begin insert into public.partner_contracts (partner_user_id, partner_name, category, created_by, national_pct) values ('00000000-0000-0000-0000-0000000000a1','P','supplier','00000000-0000-0000-0000-0000000000e1',1); raise exception 'HALF SPLIT'; exception when check_violation then raise notice 'a commission split with only one level filled in: refused'; end $$;
do $$ begin insert into public.partner_contracts (partner_user_id, partner_name, category, created_by, effective_date, end_date) values ('00000000-0000-0000-0000-0000000000a1','P','supplier','00000000-0000-0000-0000-0000000000e1',current_date,current_date+2000); raise exception 'TOO LONG'; exception when check_violation then raise notice 'a term longer than 5 years: refused'; end $$;
insert into public.partner_contracts (id, partner_user_id, partner_name, category, offer_id, appointment_ids, created_by, party_reg_type, party_reg_no, party_address,
  signatory_name, signatory_position, signatory_authority, authority_ref, signatory_email, flame_signatory_name, flame_signatory_position,
  effective_date, end_date, national_pct, regional_pct, provincial_pct, city_pct, late_rate_pct_per_day, late_cap_pct, special_terms, internal_note) values
 ('88888888-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a1','P Trading Corporation','supplier','22222222-0000-0000-0000-0000000000a1',
  array['55555555-0000-0000-0000-0000000000a1']::uuid[],'00000000-0000-0000-0000-0000000000e1','sec_corporation','CS201912345','12 Rizal St, San Fernando, Pampanga',
  'Maria  Santos','President','board_resolution','Board Resolution No. 2026-05, 3 Nov 2026','maria@p.test','Arnold Relova','Proprietor, MarketplacePH Online Store',
  current_date, current_date+365, 1, 1, 1, 2, 0.5, 5, 'Free delivery for Group Orders of 10 cartons or more.', 'Team only: negotiated down from 6%.');
select ref_no, status, revision from public.partner_contracts;

\echo '--- 3. legal check of THIS version before sending; a change after the check makes a new version'
do $$ begin insert into public.partner_contract_checks (contract_id, revision, outcome, checklist, note, reviewer_id) values ('88888888-0000-0000-0000-0000000000a1',1,'cleared',public.contract_check_items(),'All good here.','00000000-0000-0000-0000-0000000000a1'); raise exception 'PARTNER CHECK'; exception when raise_exception then raise notice 'the partner checking their own contract: refused'; end $$;
do $$ begin insert into public.partner_contract_checks (contract_id, revision, outcome, checklist, note, reviewer_id) values ('88888888-0000-0000-0000-0000000000a1',1,'cleared',array['parties_authority'],'Partly.','00000000-0000-0000-0000-0000000000e1'); raise exception 'PARTIAL CLEAR'; exception when check_violation then raise notice 'clearing with items not ticked: refused'; end $$;
do $$ begin insert into public.partner_contract_checks (contract_id, revision, outcome, checklist, note, reviewer_id) values ('88888888-0000-0000-0000-0000000000a1',2,'cleared',public.contract_check_items(),'Wrong version.','00000000-0000-0000-0000-0000000000e1'); raise exception 'WRONG REV'; exception when raise_exception then raise notice 'checking a version that is not the current one: refused'; end $$;
insert into public.partner_contract_checks (contract_id, revision, outcome, checklist, note, reviewer_id) values ('88888888-0000-0000-0000-0000000000a1',1,'cleared',public.contract_check_items(),'Parties, authority, annexes and penalties checked against the offer and territory.','00000000-0000-0000-0000-0000000000e1');
update public.partner_contracts set special_terms = 'Free delivery for Group Orders of 12 cartons or more.' where id='88888888-0000-0000-0000-0000000000a1';
select 'after a change, version ' || revision as v from public.partner_contracts where id='88888888-0000-0000-0000-0000000000a1';
update public.partner_contracts set internal_note = 'Team note changes keep the version.' where id='88888888-0000-0000-0000-0000000000a1';
select 'after a team note, still version ' || revision as v from public.partner_contracts where id='88888888-0000-0000-0000-0000000000a1';
do $$ begin update public.partner_contracts set status='out_for_signing', sent_by='00000000-0000-0000-0000-0000000000e1', body=repeat('Contract text. ',100),
  template_ids=array(select id from public.contract_templates where status='approved' and part = any(public.contract_required_parts('supplier'))) where id='88888888-0000-0000-0000-0000000000a1';
  raise exception 'SENT OLD CHECK'; exception when raise_exception then raise notice 'sending with a check of an older version: refused'; end $$;
insert into public.partner_contract_checks (contract_id, revision, outcome, checklist, note, reviewer_id) values ('88888888-0000-0000-0000-0000000000a1',2,'not_cleared','{}','Delivery threshold must match the offer.','00000000-0000-0000-0000-0000000000d1');
do $$ begin update public.partner_contracts set status='out_for_signing', sent_by='00000000-0000-0000-0000-0000000000e1', body=repeat('Contract text. ',100),
  template_ids=array(select id from public.contract_templates where status='approved' and part = any(public.contract_required_parts('supplier'))) where id='88888888-0000-0000-0000-0000000000a1';
  raise exception 'SENT NOT CLEARED'; exception when raise_exception then raise notice 'sending when the latest check did not clear: refused'; end $$;
insert into public.partner_contract_checks (contract_id, revision, outcome, checklist, note, reviewer_id) values ('88888888-0000-0000-0000-0000000000a1',2,'cleared',public.contract_check_items(),'Fixed; cleared.','00000000-0000-0000-0000-0000000000e1');

\echo '--- 4. sending: the national team, approved lawyer-reviewed templates for every part, the text frozen with its fingerprint'
-- annex_ip is still a draft (no lawyer review): it cannot be used.
do $$ begin update public.partner_contracts set status='out_for_signing', sent_by='00000000-0000-0000-0000-0000000000e1', body=repeat('Contract text. ',100),
  template_ids=array(select id from public.contract_templates where (status='approved' or part='annex_ip') and part = any(public.contract_required_parts('supplier'))) where id='88888888-0000-0000-0000-0000000000a1';
  raise exception 'DRAFT TEMPLATE USED'; exception when raise_exception then raise notice 'a template part that no lawyer reviewed: refused'; end $$;
do $$ begin update public.partner_contracts set status='out_for_signing', sent_by='00000000-0000-0000-0000-0000000000e1', body=repeat('Contract text. ',100),
  template_ids=array(select id from public.contract_templates where status='approved') where id='88888888-0000-0000-0000-0000000000a1';
  raise exception 'MISSING PART'; exception when raise_exception or check_violation then raise notice 'a part missing (no approved annex on IP): refused'; end $$;
update public.contract_templates set lawyer_name='Atty. Juan Dela Cruz', lawyer_reviewed_on=current_date, status='approved', approved_by='00000000-0000-0000-0000-0000000000d1' where part in ('annex_ip','schedule_service','schedule_manufacturer');
do $$ begin update public.partner_contracts set status='out_for_signing', sent_by='00000000-0000-0000-0000-0000000000e1', body=repeat('Contract text. ',100),
  template_ids=array(select id from public.contract_templates where status='approved' and part in ('master','schedule_service','annex_territory','annex_pricing','annex_sla','annex_ip')) where id='88888888-0000-0000-0000-0000000000a1';
  raise exception 'WRONG SCHEDULE'; exception when raise_exception then raise notice 'the service schedule on a supplier contract: refused'; end $$;
do $$ begin update public.partner_contracts set status='out_for_signing', sent_by='00000000-0000-0000-0000-0000000000a1', body=repeat('Contract text. ',100),
  template_ids=array(select id from public.contract_templates where status='approved' and part = any(public.contract_required_parts('supplier'))) where id='88888888-0000-0000-0000-0000000000a1';
  raise exception 'PARTNER SENT'; exception when raise_exception then raise notice 'the partner sending their own contract: refused'; end $$;
do $$ begin update public.partner_contracts set status='out_for_signing', sent_by='00000000-0000-0000-0000-0000000000e1', body='too short',
  template_ids=array(select id from public.contract_templates where status='approved' and part = any(public.contract_required_parts('supplier'))) where id='88888888-0000-0000-0000-0000000000a1';
  raise exception 'NO TEXT'; exception when raise_exception then raise notice 'sending without the full text: refused'; end $$;
update public.partner_contracts set status='out_for_signing', sent_by='00000000-0000-0000-0000-0000000000e1', body=repeat('Contract text v2. ',100), body_sha256=repeat('0',64),
  template_ids=array(select id from public.contract_templates where status='approved' and part = any(public.contract_required_parts('supplier'))) where id='88888888-0000-0000-0000-0000000000a1';
select status, revision, body_sha256 = encode(sha256(convert_to(body,'UTF8')),'hex') as fingerprint_by_database, first_sent_at is not null as visible_to_partner
from public.partner_contracts where id='88888888-0000-0000-0000-0000000000a1';
do $$ begin update public.partner_contracts set special_terms='sneaky' where id='88888888-0000-0000-0000-0000000000a1'; raise exception 'CHANGED AFTER SEND'; exception when raise_exception then raise notice 'changing the content after sending: refused'; end $$;
do $$ begin update public.partner_contracts set body = body || ' extra' where id='88888888-0000-0000-0000-0000000000a1'; raise exception 'BODY CHANGED'; exception when raise_exception then raise notice 'changing the frozen text: refused'; end $$;
do $$ begin update public.partner_contracts set status='signed' where id='88888888-0000-0000-0000-0000000000a1'; raise exception 'SIGNED BY UPDATE'; exception when raise_exception then raise notice 'marking it signed without a signature: refused'; end $$;
do $$ begin delete from public.partner_contracts where id='88888888-0000-0000-0000-0000000000a1'; raise exception 'SENT DELETED'; exception when raise_exception then raise notice 'deleting a sent contract: refused'; end $$;

\echo '--- 5. electronic signing is OFF until the founder records a lawyer''s review of the e-signature flow'
do $$ begin insert into public.partner_contract_signatures (contract_id, revision, side, method, signer_user_id, signer_name, signer_position, typed_name, authority_confirmed, consent_esign, body_sha256)
  select id, revision, 'partner', 'electronic', partner_user_id, 'x', 'x', 'Maria Santos', true, true, body_sha256 from public.partner_contracts where id='88888888-0000-0000-0000-0000000000a1';
  raise exception 'ESIGN OFF SIGNED'; exception when raise_exception then raise notice 'an e-signature while e-signing is off: refused'; end $$;
do $$ begin update public.settings set value='{"enabled": true}' where key='contract_esign'; raise exception 'ON NO LAWYER'; exception when raise_exception then raise notice 'switching e-signing on without the lawyer''s review: refused'; end $$;
do $$ begin update public.settings set value='{"enabled": true, "lawyer_name": "Atty. Juan Dela Cruz", "reviewed_on": "2026-11-20", "by": "00000000-0000-0000-0000-0000000000d1"}' where key='contract_esign'; raise exception 'ON BY ADMIN'; exception when raise_exception then raise notice 'an admin (not the founder) switching e-signing on: refused'; end $$;
do $$ begin delete from public.settings where key='contract_esign'; raise exception 'SETTING DELETED'; exception when raise_exception then raise notice 'deleting the e-signing setting: refused'; end $$;
update public.settings set value='{"enabled": true, "lawyer_name": "Atty. Juan Dela Cruz", "reviewed_on": "2026-11-20", "by": "00000000-0000-0000-0000-00000000000f"}' where key='contract_esign';
select public.contract_esign_on() as esign_on, (select is_public from public.settings where key='contract_esign') as public_setting;

\echo '--- 6. signing: partner first (own account, authority, consent, exact name, current text), then the founder'
do $$ begin insert into public.partner_contract_signatures (contract_id, revision, side, method, signer_user_id, signer_name, signer_position, typed_name, authority_confirmed, consent_esign, body_sha256)
  select id, revision, 'flame', 'electronic', '00000000-0000-0000-0000-00000000000f', 'x', 'x', 'Arnold Relova', true, true, body_sha256 from public.partner_contracts where id='88888888-0000-0000-0000-0000000000a1';
  raise exception 'FLAME FIRST'; exception when raise_exception then raise notice 'FLAME signing before the partner: refused'; end $$;
do $$ begin insert into public.partner_contract_signatures (contract_id, revision, side, method, signer_user_id, signer_name, signer_position, typed_name, authority_confirmed, consent_esign, body_sha256)
  select id, revision, 'partner', 'electronic', '00000000-0000-0000-0000-0000000000a3', 'x', 'x', 'Maria Santos', true, true, body_sha256 from public.partner_contracts where id='88888888-0000-0000-0000-0000000000a1';
  raise exception 'OTHER SIGNED'; exception when raise_exception then raise notice 'another account signing for the partner: refused'; end $$;
do $$ begin insert into public.partner_contract_signatures (contract_id, revision, side, method, signer_user_id, signer_name, signer_position, typed_name, authority_confirmed, consent_esign, body_sha256)
  select id, revision, 'partner', 'electronic', partner_user_id, 'x', 'x', 'Maria S.', true, true, body_sha256 from public.partner_contracts where id='88888888-0000-0000-0000-0000000000a1';
  raise exception 'WRONG NAME'; exception when raise_exception then raise notice 'a typed name that is not the signatory''s full name: refused'; end $$;
do $$ begin insert into public.partner_contract_signatures (contract_id, revision, side, method, signer_user_id, signer_name, signer_position, typed_name, authority_confirmed, consent_esign, body_sha256)
  select id, revision, 'partner', 'electronic', partner_user_id, 'x', 'x', 'Maria Santos', false, true, body_sha256 from public.partner_contracts where id='88888888-0000-0000-0000-0000000000a1';
  raise exception 'NO AUTHORITY'; exception when check_violation then raise notice 'signing without confirming authority: refused'; end $$;
do $$ begin insert into public.partner_contract_signatures (contract_id, revision, side, method, signer_user_id, signer_name, signer_position, typed_name, authority_confirmed, consent_esign, body_sha256)
  select id, revision, 'partner', 'electronic', partner_user_id, 'x', 'x', 'Maria Santos', true, false, body_sha256 from public.partner_contracts where id='88888888-0000-0000-0000-0000000000a1';
  raise exception 'NO CONSENT'; exception when check_violation then raise notice 'signing without consenting to e-signing: refused'; end $$;
do $$ begin insert into public.partner_contract_signatures (contract_id, revision, side, method, signer_user_id, signer_name, signer_position, typed_name, authority_confirmed, consent_esign, body_sha256)
  select id, revision, 'partner', 'electronic', partner_user_id, 'x', 'x', 'Maria Santos', true, true, repeat('a',64) from public.partner_contracts where id='88888888-0000-0000-0000-0000000000a1';
  raise exception 'WRONG HASH'; exception when raise_exception then raise notice 'signing a different text (fingerprint does not match): refused'; end $$;
do $$ begin insert into public.partner_contract_signatures (contract_id, revision, side, method, signer_user_id, signer_name, signer_position, typed_name, authority_confirmed, consent_esign, body_sha256)
  select id, revision - 1, 'partner', 'electronic', partner_user_id, 'x', 'x', 'Maria Santos', true, true, body_sha256 from public.partner_contracts where id='88888888-0000-0000-0000-0000000000a1';
  raise exception 'OLD REV'; exception when raise_exception then raise notice 'signing an older version: refused'; end $$;
insert into public.partner_contract_signatures (contract_id, revision, side, method, signer_user_id, signer_name, signer_position, typed_name, authority_confirmed, consent_esign, body_sha256, ip, user_agent)
  select id, revision, 'partner', 'electronic', partner_user_id, 'Someone Else', 'Clerk', '  maria   SANTOS ', true, true, body_sha256, '203.0.113.7', 'Mozilla/5.0 (Android 14)' from public.partner_contracts where id='88888888-0000-0000-0000-0000000000a1';
select side, method, signer_name, signer_position, signed_on = public.ph_today() as dated_today from public.partner_contract_signatures;
select status, partner_signed_at is not null as partner_signed from public.partner_contracts where id='88888888-0000-0000-0000-0000000000a1';
do $$ begin insert into public.partner_contract_signatures (contract_id, revision, side, method, signer_user_id, signer_name, signer_position, typed_name, authority_confirmed, consent_esign, body_sha256)
  select id, revision, 'partner', 'electronic', partner_user_id, 'x', 'x', 'Maria Santos', true, true, body_sha256 from public.partner_contracts where id='88888888-0000-0000-0000-0000000000a1';
  raise exception 'TWICE'; exception when raise_exception or unique_violation then raise notice 'the partner signing twice: refused'; end $$;
do $$ begin update public.partner_contracts set status='draft', changed_by='00000000-0000-0000-0000-0000000000a1', status_reason='changed my mind' where id='88888888-0000-0000-0000-0000000000a1'; raise exception 'PARTNER RETURN AFTER SIGN'; exception when raise_exception then raise notice 'the partner taking it back after signing: refused'; end $$;
do $$ begin insert into public.partner_contract_signatures (contract_id, revision, side, method, signer_user_id, signer_name, signer_position, typed_name, authority_confirmed, consent_esign, body_sha256)
  select id, revision, 'flame', 'electronic', '00000000-0000-0000-0000-0000000000d1', 'x', 'x', 'Arnold Relova', true, true, body_sha256 from public.partner_contracts where id='88888888-0000-0000-0000-0000000000a1';
  raise exception 'ADMIN SIGNED FLAME'; exception when raise_exception then raise notice 'an admin (not the founder) signing for FLAME: refused'; end $$;
insert into public.partner_contract_signatures (contract_id, revision, side, method, signer_user_id, signer_name, signer_position, typed_name, authority_confirmed, consent_esign, body_sha256)
  select id, revision, 'flame', 'electronic', '00000000-0000-0000-0000-00000000000f', 'x', 'x', 'Arnold Relova', true, true, body_sha256 from public.partner_contracts where id='88888888-0000-0000-0000-0000000000a1';
select status, signed_at is not null as signed from public.partner_contracts where id='88888888-0000-0000-0000-0000000000a1';
select action, note from public.partner_contract_history where contract_id='88888888-0000-0000-0000-0000000000a1' order by created_at, action;
do $$ begin update public.partner_contract_signatures set typed_name='Someone' where side='partner'; raise exception 'SIG CHANGED'; exception when raise_exception then raise notice 'changing a signature: refused'; end $$;
do $$ begin delete from public.partner_contract_signatures; raise exception 'SIG DELETED'; exception when raise_exception then raise notice 'deleting a signature: refused'; end $$;
do $$ begin update public.partner_contract_history set note='x'; raise exception 'HISTORY CHANGED'; exception when raise_exception then raise notice 'changing history: refused'; end $$;
do $$ begin delete from public.partner_contract_history; raise exception 'HISTORY DELETED'; exception when raise_exception then raise notice 'deleting history: refused'; end $$;
do $$ begin delete from public.partner_contract_checks; raise exception 'CHECK DELETED'; exception when raise_exception then raise notice 'deleting a legal check: refused'; end $$;

\echo '--- 7. the agreement rate and penalty terms can come from the signed contract (with their own approvals)'
insert into public.partner_contracts (id, partner_user_id, partner_name, category, created_by) values ('88888888-0000-0000-0000-0000000000a9','00000000-0000-0000-0000-0000000000a1','P Trading Corporation','supplier','00000000-0000-0000-0000-0000000000e1');
do $$ begin insert into public.commission_rules (scope, partner_category, partner_user_id, contract_id, national_pct, regional_pct, provincial_pct, city_pct, effective_from, created_by)
  values ('agreement','supplier','00000000-0000-0000-0000-0000000000a1','88888888-0000-0000-0000-0000000000a9',1,1,1,2,current_date,'00000000-0000-0000-0000-0000000000e1');
  raise exception 'UNSIGNED LINK'; exception when raise_exception then raise notice 'a rate from a contract that is not signed: refused'; end $$;
do $$ begin insert into public.commission_rules (scope, partner_category, partner_user_id, contract_id, national_pct, regional_pct, provincial_pct, city_pct, effective_from, created_by)
  values ('agreement','supplier','00000000-0000-0000-0000-0000000000a3','88888888-0000-0000-0000-0000000000a1',1,1,1,2,current_date,'00000000-0000-0000-0000-0000000000e1');
  raise exception 'OTHER PARTNER LINK'; exception when raise_exception then raise notice 'a rate for another partner from this contract: refused'; end $$;
insert into public.commission_rules (scope, partner_category, partner_user_id, contract_id, national_pct, regional_pct, provincial_pct, city_pct, effective_from, created_by)
  values ('agreement','supplier','00000000-0000-0000-0000-0000000000a1','88888888-0000-0000-0000-0000000000a1',1,1,1,2,current_date,'00000000-0000-0000-0000-0000000000e1');
insert into public.partner_penalty_terms (scope, partner_user_id, partner_name, contract_id, late_rate_pct_per_day, late_cap_pct, created_by)
  values ('agreement','00000000-0000-0000-0000-0000000000a1','P Trading Corporation','88888888-0000-0000-0000-0000000000a1',0.5,5,'00000000-0000-0000-0000-0000000000e1');
select 'rate' as what, r.contract_ref = c.ref_no as ref_from_contract, r.signed_on = (c.signed_at at time zone 'Asia/Manila')::date as date_from_contract, r.status
from public.commission_rules r join public.partner_contracts c on c.id = r.contract_id
union all
select 'penalty terms', t.contract_ref = c.ref_no, t.signed_on = (c.signed_at at time zone 'Asia/Manila')::date, t.status
from public.partner_penalty_terms t join public.partner_contracts c on c.id = t.contract_id;
-- A draft that was never checked or sent can be deleted.
delete from public.partner_contracts where id='88888888-0000-0000-0000-0000000000a9';

\echo '--- 8. wet-ink path: the team uploads the signed copy; FLAME''s side only by the founder'
insert into public.partner_contracts (id, partner_user_id, partner_name, category, offer_id, created_by, party_reg_type, party_reg_no, party_address,
  signatory_name, signatory_position, signatory_authority, flame_signatory_name, flame_signatory_position, effective_date, end_date, renewal_notice_days) values
 ('88888888-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000a3','Q Packaging','supplier','22222222-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000d1',
  'dti','3456789','Lot 2 Mabini St, Naga City','Pedro Reyes','Owner','sole_proprietor','Arnold Relova','Proprietor, MarketplacePH Online Store', current_date-300, current_date+40, 60);
insert into public.partner_contract_checks (contract_id, revision, outcome, checklist, note, reviewer_id) values ('88888888-0000-0000-0000-0000000000a3',1,'cleared',public.contract_check_items(),'Checked.','00000000-0000-0000-0000-0000000000d1');
update public.partner_contracts set status='out_for_signing', sent_by='00000000-0000-0000-0000-0000000000d1', body=repeat('Q contract text. ',100),
  template_ids=array(select id from public.contract_templates where status='approved' and part = any(public.contract_required_parts('supplier'))) where id='88888888-0000-0000-0000-0000000000a3';
-- The partner asks for changes: back to draft as version 2, the frozen text is cleared, the check must be done again.
update public.partner_contracts set status='draft', changed_by='00000000-0000-0000-0000-0000000000a3', status_reason='Please correct our DTI number.' where id='88888888-0000-0000-0000-0000000000a3';
select status, revision, body is null as text_cleared, first_sent_at is not null as still_visible_to_partner from public.partner_contracts where id='88888888-0000-0000-0000-0000000000a3';
update public.partner_contracts set party_reg_no='3456780' where id='88888888-0000-0000-0000-0000000000a3';
insert into public.partner_contract_checks (contract_id, revision, outcome, checklist, note, reviewer_id) values ('88888888-0000-0000-0000-0000000000a3',2,'cleared',public.contract_check_items(),'DTI number corrected.','00000000-0000-0000-0000-0000000000d1');
update public.partner_contracts set status='out_for_signing', sent_by='00000000-0000-0000-0000-0000000000d1', body=repeat('Q contract text v2. ',100),
  template_ids=array(select id from public.contract_templates where status='approved' and part = any(public.contract_required_parts('supplier'))) where id='88888888-0000-0000-0000-0000000000a3';
do $$ begin insert into public.partner_contract_signatures (contract_id, revision, side, method, recorded_by, signer_name, signer_position, body_sha256, signed_on)
  select id, revision, 'partner', 'wet_ink', '00000000-0000-0000-0000-0000000000d1', 'x', 'x', body_sha256, current_date from public.partner_contracts where id='88888888-0000-0000-0000-0000000000a3';
  raise exception 'NO COPY'; exception when raise_exception then raise notice 'a wet-ink signature without the signed copy: refused'; end $$;
insert into public.vetting_documents (id, user_id, purpose, contract_id, doc_type, file_path, file_name, mime, size_bytes, key_id) values
 ('99999999-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000d1','contract','88888888-0000-0000-0000-0000000000a3','signed_contract','contract/x/1.bin','PC-signed.pdf','application/pdf',120000,'k1');
do $$ begin insert into public.partner_contract_signatures (contract_id, revision, side, method, recorded_by, signer_name, signer_position, body_sha256, signed_on, document_id)
  select id, revision, 'partner', 'wet_ink', '00000000-0000-0000-0000-0000000000a3', 'x', 'x', body_sha256, current_date, '99999999-0000-0000-0000-0000000000a3' from public.partner_contracts where id='88888888-0000-0000-0000-0000000000a3';
  raise exception 'PARTNER RECORDED'; exception when raise_exception then raise notice 'the partner recording their own wet-ink signature: refused'; end $$;
do $$ begin insert into public.partner_contract_signatures (contract_id, revision, side, method, recorded_by, signer_name, signer_position, body_sha256, signed_on, document_id)
  select id, revision, 'partner', 'wet_ink', '00000000-0000-0000-0000-0000000000d1', 'x', 'x', body_sha256, current_date+1, '99999999-0000-0000-0000-0000000000a3' from public.partner_contracts where id='88888888-0000-0000-0000-0000000000a3';
  raise exception 'FUTURE PAPER'; exception when raise_exception then raise notice 'a signing date in the future: refused'; end $$;
insert into public.partner_contract_signatures (contract_id, revision, side, method, recorded_by, signer_name, signer_position, body_sha256, signed_on, document_id)
  select id, revision, 'partner', 'wet_ink', '00000000-0000-0000-0000-0000000000d1', 'x', 'x', body_sha256, current_date, '99999999-0000-0000-0000-0000000000a3' from public.partner_contracts where id='88888888-0000-0000-0000-0000000000a3';
do $$ begin insert into public.partner_contract_signatures (contract_id, revision, side, method, recorded_by, signer_name, signer_position, body_sha256, signed_on, document_id)
  select id, revision, 'flame', 'wet_ink', '00000000-0000-0000-0000-0000000000d1', 'x', 'x', body_sha256, current_date, '99999999-0000-0000-0000-0000000000a3' from public.partner_contracts where id='88888888-0000-0000-0000-0000000000a3';
  raise exception 'ADMIN FLAME WET'; exception when raise_exception then raise notice 'an admin recording FLAME''s wet-ink signature: refused (founder only)'; end $$;
insert into public.partner_contract_signatures (contract_id, revision, side, method, recorded_by, signer_name, signer_position, body_sha256, signed_on, document_id)
  select id, revision, 'flame', 'wet_ink', '00000000-0000-0000-0000-00000000000f', 'x', 'x', body_sha256, current_date, '99999999-0000-0000-0000-0000000000a3' from public.partner_contracts where id='88888888-0000-0000-0000-0000000000a3';
select ref_no, status, revision from public.partner_contracts where id='88888888-0000-0000-0000-0000000000a3';

\echo '--- 9. renewal alerts, ending and termination'
select ref_no, days_left from public.partner_contracts_renewal_due();
update public.partner_contracts set renewal_alerted_at = now() where id='88888888-0000-0000-0000-0000000000a3';
select count(*) as still_due_after_alert from public.partner_contracts_renewal_due();
-- A renewal follows a signed contract of the same partner and category.
do $$ begin insert into public.partner_contracts (partner_user_id, partner_name, category, renews_id, created_by) values ('00000000-0000-0000-0000-0000000000a1','P','supplier','88888888-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000e1'); raise exception 'OTHER RENEWAL'; exception when raise_exception then raise notice 'renewing another partner''s contract: refused'; end $$;
insert into public.partner_contracts (partner_user_id, partner_name, category, renews_id, created_by) values ('00000000-0000-0000-0000-0000000000a3','Q Packaging','supplier','88888888-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000e1');
do $$ begin update public.partner_contracts set status='terminated', changed_by='00000000-0000-0000-0000-0000000000e1', status_reason='Repeated late deliveries.' where id='88888888-0000-0000-0000-0000000000a1'; raise exception 'TERMINATED NO SANCTION'; exception when raise_exception then raise notice 'terminating without an approved termination sanction: refused'; end $$;
do $$ begin update public.partner_contracts set status='ended', changed_by='00000000-0000-0000-0000-0000000000e1' where id='88888888-0000-0000-0000-0000000000a1'; raise exception 'END NO REASON'; exception when raise_exception or check_violation then raise notice 'ending without a reason: refused'; end $$;
do $$ begin update public.partner_contracts set status='ended', changed_by='00000000-0000-0000-0000-0000000000a1', status_reason='I quit' where id='88888888-0000-0000-0000-0000000000a1'; raise exception 'PARTNER ENDED'; exception when raise_exception then raise notice 'the partner ending it in the system: refused (they write to the team)'; end $$;
set session_replication_role = replica;
insert into public.partner_sanctions (partner_user_id, partner_name, level, reason, status, approved_at) values ('00000000-0000-0000-0000-0000000000a1','P Trading Corporation','termination','Repeated late deliveries.','active',now());
set session_replication_role = origin;
update public.partner_contracts set status='terminated', changed_by='00000000-0000-0000-0000-0000000000e1', status_reason='Repeated late deliveries (sanction approved).' where id='88888888-0000-0000-0000-0000000000a1';
select ref_no, status, ended_at is not null as ended from public.partner_contracts where id='88888888-0000-0000-0000-0000000000a1';
do $$ begin update public.partner_contracts set status='signed' where id='88888888-0000-0000-0000-0000000000a1'; raise exception 'REVIVED'; exception when raise_exception then raise notice 'reviving a terminated contract: refused'; end $$;
-- A partner on hold or terminated cannot be sent a new contract.
insert into public.partner_contracts (id, partner_user_id, partner_name, category, created_by, party_reg_type, party_reg_no, party_address,
  signatory_name, signatory_position, signatory_authority, authority_ref, flame_signatory_name, flame_signatory_position, effective_date, end_date) values
 ('88888888-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1','P Trading Corporation','supplier','00000000-0000-0000-0000-0000000000e1','sec_corporation','CS201912345','12 Rizal St, San Fernando, Pampanga',
  'Maria Santos','President','board_resolution','BR 2026-05','Arnold Relova','Proprietor', current_date, current_date+365);
insert into public.partner_contract_checks (contract_id, revision, outcome, checklist, note, reviewer_id) values ('88888888-0000-0000-0000-0000000000b1',1,'cleared',public.contract_check_items(),'Checked.','00000000-0000-0000-0000-0000000000e1');
do $$ begin update public.partner_contracts set status='out_for_signing', sent_by='00000000-0000-0000-0000-0000000000e1', body=repeat('Contract text. ',100),
  template_ids=array(select id from public.contract_templates where status='approved' and part = any(public.contract_required_parts('supplier'))) where id='88888888-0000-0000-0000-0000000000b1';
  raise exception 'SENT TO TERMINATED'; exception when raise_exception then raise notice 'sending a contract to a terminated partner: refused'; end $$;
update public.partner_contracts set status='cancelled', changed_by='00000000-0000-0000-0000-0000000000e1', status_reason='Partner terminated.' where id='88888888-0000-0000-0000-0000000000b1';

\echo '--- 10. who sees what (row level security)'
insert into public.partner_contract_history (contract_id, actor_id, action, note, internal) values
 ('88888888-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000e1','team_note','Team only: watch deliveries.',true);
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select 'partner P' as who, ref_no, status from public.partner_contracts order by ref_no;
select 'partner P history (no team notes)' as who, count(*) filter (where internal) as team_notes, count(*) as rows from public.partner_contract_history;
select 'partner P signatures' as who, count(*) from public.partner_contract_signatures;
do $$ begin perform internal_note from public.partner_contracts; raise exception 'NOTE READ'; exception when insufficient_privilege then raise notice 'partner reading the team note: refused'; end $$;
do $$ begin perform ip from public.partner_contract_signatures; raise exception 'IP READ'; exception when insufficient_privilege then raise notice 'reading signers'' IP addresses: refused'; end $$;
select 'partner P legal checks' as who, count(*) from public.partner_contract_checks;
select 'partner P templates' as who, count(*) from public.contract_templates;
do $$ begin insert into public.partner_contract_signatures (contract_id, revision, side, method, signer_name, signer_position, body_sha256) values ('88888888-0000-0000-0000-0000000000a1',1,'partner','electronic','x','x',repeat('a',64)); raise exception 'BROWSER WRITE'; exception when insufficient_privilege then raise notice 'writing from the browser: refused'; end $$;
do $$ begin update public.partner_contracts set special_terms='x'; raise exception 'BROWSER UPDATE'; exception when insufficient_privilege then raise notice 'changing a contract from the browser: refused'; end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false);
select 'partner Q (sees its own sent contract, not the unsent renewal draft)' as who, ref_no, status from public.partner_contracts order by ref_no;
select 'partner Q signed copy' as who, count(*) from public.vetting_documents where purpose='contract';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select 'service provider S' as who, count(*) from public.partner_contracts;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000f2',false);
select 'finance' as who, (select count(*) from public.partner_contracts) as contracts, (select count(*) from public.contract_templates) as templates, (select count(*) from public.vetting_documents where purpose='contract') as files;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000f1',false);
select 'chapter tester' as who, count(*) from public.partner_contracts;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000c1',false);
select 'chapter coordinator' as who, count(*) from public.partner_contracts;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1',false);
select 'member C' as who, count(*) from public.partner_contracts;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000e1',false);
select 'national reviewer' as who, (select count(*) from public.partner_contracts) as contracts, (select count(*) from public.partner_contract_checks) as checks,
  (select count(*) from public.contract_templates) as templates, (select count(*) from public.partner_contract_history where internal) as team_notes;
reset role;
set role anon;
do $$ begin perform 1 from public.partner_contracts; raise exception 'ANON READ'; exception when insufficient_privilege then raise notice 'visitors: no access'; end $$;
do $$ begin perform 1 from public.contract_templates; raise exception 'ANON TEMPLATES'; exception when insufficient_privilege then raise notice 'visitors: no access to templates'; end $$;
do $$ begin perform public.contract_esign_on(); raise exception 'ANON FN'; exception when insufficient_privilege then raise notice 'visitors: cannot call contract functions'; end $$;
reset role;
select set_config('request.jwt.claim.sub','',false);

\echo '--- 11. an erased partner account: the contract and its signatures are kept'
delete from auth.users where id='00000000-0000-0000-0000-0000000000a3';
select ref_no, partner_user_id is null as account_gone, partner_name, status from public.partner_contracts where id='88888888-0000-0000-0000-0000000000a3';
select count(*) as signatures_kept from public.partner_contract_signatures where contract_id='88888888-0000-0000-0000-0000000000a3';
select count(*) as signed_copy_kept from public.vetting_documents where contract_id='88888888-0000-0000-0000-0000000000a3' and deleted_at is null;
select count(*) as files_due_for_deletion from public.vetting_documents_due() where id='99999999-0000-0000-0000-0000000000a3';

\echo '--- all Step 8 database tests passed'
