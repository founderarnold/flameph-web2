-- Partner accreditation, Step 5: sample testing, complaints, corrective actions, proposed penalties and sanctions.
-- Additive: nine new tables, their functions, two new columns and widened rules on vetting_documents (purpose, document
-- types), and the document clean-up function extended for sample photos and complaint evidence. Nothing is removed or
-- renamed and no existing row changes. Take a backup before applying. Safe to run twice.
-- Undo: supabase/rollback/0035_partner_samples_complaints_undo.sql (removes only what this file added).
--
--   partner_sample_tests        a chapter tester's (or the national team's) test of a partner's sample: arrival, five
--                               1-to-5 scores, standard feedback, photos, safety flag. Testers never see prices.
--   complaint_targets           response targets per severity (first response in hours, resolution in days) and
--                               whether the team is alerted at once. Changed only by the national team.
--   partner_complaints          a member's complaint about an accredited partner's order or service: order reference,
--                               issue (late, missing, damaged, defective, unsatisfactory service, safety, other),
--                               evidence, desired remedy and consent. Draft -> open -> investigating ->
--                               corrective action -> resolved -> (appealed) -> closed.
--   partner_complaint_events    the case history and conversation: every status move, severity change, note and
--                               response (nobody can change or delete it).
--   partner_corrective_actions  replacement, credit, refund, re-performance, proportionate refund, explanation or a
--                               process fix, with a due date; the partner marks it done, the team checks it.
--   partner_penalty_terms       the late-delivery penalty terms: default 0.5% per day, capped at 5% of the affected
--                               net value; a signed agreement can set its own. Two people make a change active.
--   partner_penalties           PROPOSED penalty figures only. Late goods: affected net value x rate x days, capped.
--                               Approval needs a second national team member, legal review, and the partner's reply
--                               (or 7 days without one). A RECORD ONLY: MarketplacePH Online Store settles any money.
--   partner_sanctions           warning, probation, hold, downgrade, termination. Proposed by one national team member,
--                               made active by another (termination: by the founder). The partner may answer first.
--                               An active hold or termination sets the partner's accreditation to suspended.
--   vetting_documents           + purpose 'sample' (sample photos) and 'complaint' (evidence), sample_id, complaint_id
--
-- Money: flameph.org never collects, holds, pays out or moves money. Penalties, credits and refunds here are figures
-- recorded for transparency; MarketplacePH Online Store handles any actual money.
--
-- Who sees what (row level security; the flameph.org server is the only writer, and the database checks the roles):
--   member who complains        their own complaints, the case history (not team-only notes), actions and evidence
--   the partner complained about the complaints about them (never drafts), the same history, actions, evidence, and
--                               their own penalties, sanctions and penalty terms; reviewed sample results the team
--                               chose to share (without the tester's name)
--   chapter tester              their own sample tests; a product list without prices (partner_sample_targets())
--   chapter coordinator         the sample tests of their chapter
--   founder, admin, national reviewer   everything; only they decide
--   finance                     penalties and penalty terms (to record settlement by MarketplacePH Online Store)
--   other members, visitors     the response targets (members) or nothing

-- ===========================================================================================================
-- A. Who may do what
-- ===========================================================================================================
-- partner_is_national(uid) (0033) = founder, admin or national reviewer. commission_is_finance(uid) (0034) = founder or
-- finance. Both are reused here.
create or replace function public.partner_is_tester(uid uuid, chap uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select uid is not null and exists (select 1 from public.roles x where x.user_id = uid and x.role = 'chapter_tester' and x.chapter_id is not distinct from chap);
$$;
revoke all on function public.partner_is_tester(uuid, uuid) from public, anon, authenticated;
grant execute on function public.partner_is_tester(uuid, uuid) to service_role;

-- Founder, admin, national reviewer and chapter testers may record sample tests (the national team tests during the
-- supplier pilot while chapters are still forming).
create or replace function public.can_test_samples() returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_role(array['super_admin', 'admin', 'national_reviewer', 'chapter_tester']);
$$;
revoke all on function public.can_test_samples() from public, anon;
grant execute on function public.can_test_samples() to authenticated, service_role;

-- True when a column change on UPDATE only empties foreign keys (an account, chapter or offer was erased).
create or replace function public.partner_only_nulled(n jsonb, o jsonb, cols text[]) returns boolean
language sql immutable as $$
  select (n - cols - 'updated_at') = (o - cols - 'updated_at')
     and not exists (select 1 from unnest(cols) c where n->c is distinct from o->c and n->>c is not null);
$$;

-- ===========================================================================================================
-- B. Sample tests
-- ===========================================================================================================
create sequence if not exists public.partner_sample_no;
create table if not exists public.partner_sample_tests (
  id uuid primary key default gen_random_uuid(),
  ref_no text not null unique default ('S-' || lpad(nextval('public.partner_sample_no')::text, 5, '0')),
  tester_id uuid references auth.users(id) on delete set null,
  chapter_id uuid references public.chapters(id) on delete set null,
  partner_user_id uuid references auth.users(id) on delete set null,
  partner_name text not null check (char_length(partner_name) between 1 and 200),   -- kept if the account is erased
  offer_id uuid references public.supplier_offers(id) on delete set null,
  item_id uuid references public.supplier_offer_items(id) on delete set null,
  product_name text not null check (char_length(product_name) between 1 and 150),
  batch_lot text check (char_length(batch_lot) <= 60),
  received_on date,
  expiry_on date,
  arrival_condition text check (arrival_condition in ('good', 'minor_issues', 'damaged', 'incomplete')),
  matches_description text check (matches_description in ('yes', 'partly', 'no')),
  label_complete text check (label_complete in ('yes', 'partly', 'no')),
  score_packaging int check (score_packaging between 1 and 5),
  score_appearance int check (score_appearance between 1 and 5),
  score_quality int check (score_quality between 1 and 5),
  score_performance int check (score_performance between 1 and 5),
  score_labeling int check (score_labeling between 1 and 5),
  total int generated always as (score_packaging + score_appearance + score_quality + score_performance + score_labeling) stored,
  would_recommend text check (would_recommend in ('yes', 'maybe', 'no')),
  feedback_tags text[] not null default '{}' check (cardinality(feedback_tags) <= 12 and feedback_tags <@ array[
    'good_value_look', 'well_packed', 'clear_label', 'consistent', 'durable', 'tastes_good', 'works_as_described',
    'poor_packaging', 'leaking_or_broken', 'missing_label_info', 'short_expiry', 'inconsistent', 'weak_or_flimsy',
    'off_taste_or_smell', 'not_as_described', 'too_small_or_short']),
  feedback text check (char_length(feedback) <= 2000),
  safety_concern boolean not null default false,
  safety_note text check (char_length(safety_note) <= 1000),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'reviewed')),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_note text check (char_length(review_note) <= 2000),          -- national team only
  partner_visible boolean not null default false,                       -- the team shares the result with the partner
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_sample_tests_complete check (status = 'draft' or (received_on is not null and arrival_condition is not null
    and matches_description is not null and label_complete is not null and score_packaging is not null and score_appearance is not null
    and score_quality is not null and score_performance is not null and score_labeling is not null and would_recommend is not null
    and submitted_at is not null)),
  constraint partner_sample_tests_safety check (not safety_concern or safety_note is not null),
  constraint partner_sample_tests_reviewed check (status <> 'reviewed' or reviewed_at is not null)
);
create index if not exists partner_sample_tests_partner on public.partner_sample_tests (partner_user_id, created_at desc);
create index if not exists partner_sample_tests_tester on public.partner_sample_tests (tester_id, created_at desc);
create index if not exists partner_sample_tests_status on public.partner_sample_tests (status, submitted_at desc);
create index if not exists partner_sample_tests_offer on public.partner_sample_tests (offer_id) where offer_id is not null;

create or replace function public.partner_sample_guard() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then raise exception 'partner_sample: new tests start as draft'; end if;
    if new.tester_id is null then raise exception 'partner_sample: the tester is required'; end if;
    -- A chapter tester tests for their own chapter; the national team may test without a chapter.
    if not (public.partner_is_national(new.tester_id)
            or (new.chapter_id is not null and public.partner_is_tester(new.tester_id, new.chapter_id))) then
      raise exception 'partner_sample: only chapter testers (for their chapter) and the national team record sample tests';
    end if;
    if new.tester_id = new.partner_user_id then raise exception 'partner_sample: nobody tests their own products'; end if;
    if not exists (select 1 from public.partner_profiles p where p.user_id = new.partner_user_id) then
      raise exception 'partner_sample: samples are tested only for accredited partners';
    end if;
    if new.offer_id is not null and not exists (select 1 from public.supplier_offers o where o.id = new.offer_id and o.user_id = new.partner_user_id) then
      raise exception 'partner_sample: that offer is not from this partner';
    end if;
    if new.item_id is not null and not exists (select 1 from public.supplier_offer_items i where i.id = new.item_id and i.offer_id = new.offer_id) then
      raise exception 'partner_sample: that product is not in this offer';
    end if;
    if (select count(*) from public.partner_sample_tests t where t.tester_id = new.tester_id and t.status = 'draft') >= 20 then
      raise exception 'partner_sample: limit of 20 unfinished tests per tester';
    end if;
    return new;
  end if;
  if public.partner_only_nulled(to_jsonb(new), to_jsonb(old), array['tester_id', 'chapter_id', 'partner_user_id', 'offer_id', 'item_id', 'reviewed_by', 'total']) then
    return new;   -- an account, chapter or offer was erased
  end if;
  if new.tester_id is distinct from old.tester_id or new.partner_user_id is distinct from old.partner_user_id
     or new.chapter_id is distinct from old.chapter_id or new.ref_no <> old.ref_no then
    raise exception 'partner_sample: tester, partner, chapter and number are fixed';
  end if;
  new.created_at := old.created_at;
  if old.status = 'draft' and new.status = 'draft' then return new; end if;
  if old.status = 'draft' and new.status = 'submitted' then
    new.submitted_at := now();
    if new.received_on > (now() at time zone 'Asia/Manila')::date then raise exception 'partner_sample: the date received is in the future'; end if;
    return new;
  end if;
  if old.status = 'submitted' and new.status = 'reviewed' then
    new.reviewed_at := now();
    if new.reviewed_by is null or not public.partner_is_national(new.reviewed_by) or new.reviewed_by = old.tester_id or new.reviewed_by = old.partner_user_id then
      raise exception 'partner_sample: a national team member other than the tester reviews the test';
    end if;
    if (to_jsonb(new) - array['status', 'reviewed_at', 'reviewed_by', 'review_note', 'partner_visible', 'updated_at', 'total'])
       is distinct from (to_jsonb(old) - array['status', 'reviewed_at', 'reviewed_by', 'review_note', 'partner_visible', 'updated_at', 'total']) then
      raise exception 'partner_sample: the tester''s answers cannot be changed at review';
    end if;
    return new;
  end if;
  if old.status = 'reviewed' and new.status = 'reviewed' then
    -- After review only the team's note and the "share with partner" choice can change.
    if (to_jsonb(new) - array['review_note', 'partner_visible', 'updated_at', 'total']) is distinct from (to_jsonb(old) - array['review_note', 'partner_visible', 'updated_at', 'total']) then
      raise exception 'partner_sample: a reviewed test cannot be changed';
    end if;
    return new;
  end if;
  raise exception 'partner_sample: cannot move from % to %', old.status, new.status;
end $$;
drop trigger if exists partner_sample_tests_guard on public.partner_sample_tests;
create trigger partner_sample_tests_guard before insert or update on public.partner_sample_tests
  for each row execute function public.partner_sample_guard();

-- Only unfinished drafts can be deleted (sent tests stay as evidence), except when the tester's account is erased.
create or replace function public.partner_sample_delete_guard() returns trigger
language plpgsql as $$
begin
  if old.status = 'draft' or current_setting('flameph.retention', true) = 'on' then return old; end if;
  raise exception 'partner_sample: sent tests cannot be deleted';
end $$;
drop trigger if exists partner_sample_tests_delete on public.partner_sample_tests;
create trigger partner_sample_tests_delete before delete on public.partner_sample_tests
  for each row execute function public.partner_sample_delete_guard();

-- What a tester can pick: accredited partners and, for suppliers, their sent or chosen offers and product names.
-- NEVER prices, commissions or scores.
create or replace function public.partner_sample_targets()
returns table (partner_user_id uuid, partner_name text, categories text[], offer_id uuid, offer_title text, item_id uuid, product_name text, sell_unit text)
language sql stable security definer set search_path = public as $$
  select p.user_id, p.legal_name, p.categories, o.id, o.title, i.id, i.product_name, i.sell_unit
  from public.partner_profiles p
  left join public.supplier_offers o on o.user_id = p.user_id and o.status in ('submitted', 'selected')
  left join public.supplier_offer_items i on i.offer_id = o.id
  where public.can_test_samples() and p.status = 'accredited' and p.user_id <> auth.uid()
  order by p.legal_name, o.title, i.position
  limit 2000;
$$;
revoke all on function public.partner_sample_targets() from public, anon;
grant execute on function public.partner_sample_targets() to authenticated, service_role;

-- The partner's own reviewed results that the team chose to share, without the tester or the team's note.
create or replace function public.my_sample_results()
returns table (id uuid, ref_no text, product_name text, received_on date, arrival_condition text, matches_description text, label_complete text,
  score_packaging int, score_appearance int, score_quality int, score_performance int, score_labeling int, total int, would_recommend text,
  feedback_tags text[], feedback text, safety_concern boolean, reviewed_at timestamptz)
language sql stable security definer set search_path = public as $$
  select t.id, t.ref_no, t.product_name, t.received_on, t.arrival_condition, t.matches_description, t.label_complete, t.score_packaging,
    t.score_appearance, t.score_quality, t.score_performance, t.score_labeling, t.total, t.would_recommend, t.feedback_tags, t.feedback,
    t.safety_concern, t.reviewed_at
  from public.partner_sample_tests t
  where t.partner_user_id = auth.uid() and t.status = 'reviewed' and t.partner_visible
  order by t.reviewed_at desc
  limit 200;
$$;
revoke all on function public.my_sample_results() from public, anon;
grant execute on function public.my_sample_results() to authenticated, service_role;

-- ===========================================================================================================
-- C. Response targets (configurable by the national team)
-- ===========================================================================================================
create table if not exists public.complaint_targets (
  severity text primary key check (severity in ('low', 'medium', 'high', 'critical')),
  first_response_hours int not null check (first_response_hours between 1 and 720),
  resolve_days int not null check (resolve_days between 1 and 365),
  alert_now boolean not null default false,          -- email the team the moment a complaint of this severity comes in
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.complaint_targets (severity, first_response_hours, resolve_days, alert_now)
select v.* from (values ('critical', 4, 3, true), ('high', 24, 7, true), ('medium', 48, 14, false), ('low', 72, 30, false)) v
where not exists (select 1 from public.complaint_targets);

create or replace function public.complaint_target_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'complaint_targets: the four severities always exist'; end if;
  if tg_op = 'UPDATE' and public.partner_only_nulled(to_jsonb(new), to_jsonb(old), array['updated_by']) then return new; end if;
  if tg_op = 'INSERT' or new.severity <> old.severity then raise exception 'complaint_targets: the four severities are fixed'; end if;
  if new.updated_by is null or not public.partner_is_national(new.updated_by) then
    raise exception 'complaint_targets: only the national team changes response targets';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists complaint_targets_guard on public.complaint_targets;
create trigger complaint_targets_guard before insert or update or delete on public.complaint_targets
  for each row execute function public.complaint_target_guard();

-- ===========================================================================================================
-- D. Complaints
-- ===========================================================================================================
create sequence if not exists public.partner_complaint_no;
create table if not exists public.partner_complaints (
  id uuid primary key default gen_random_uuid(),
  ref_no text not null unique default ('C-' || lpad(nextval('public.partner_complaint_no')::text, 5, '0')),
  complainant_id uuid references auth.users(id) on delete set null,
  partner_user_id uuid references auth.users(id) on delete set null,
  partner_name text not null check (char_length(partner_name) between 1 and 200),   -- kept if the account is erased
  partner_category text check (partner_category in ('supplier', 'service_provider', 'toll_manufacturer')),
  chapter_id uuid references public.chapters(id) on delete set null,                  -- the member's chapter when filed
  order_reference text check (char_length(order_reference) between 2 and 120),        -- MarketplacePH order or service reference
  order_date date,
  product_or_service text check (char_length(product_or_service) <= 200),
  issue text check (issue in ('late', 'missing', 'damaged', 'defective', 'unsatisfactory_service', 'safety', 'other')),
  description text check (char_length(description) <= 3000),
  desired_remedy text check (desired_remedy in ('replacement', 'credit', 'refund', 're_performance', 'proportionate_refund', 'explanation', 'other')),
  remedy_note text check (char_length(remedy_note) <= 500),
  affected_value numeric(14,2) check (affected_value >= 0 and affected_value <= 100000000000),   -- typed by the member, never verified
  consent_at timestamptz,
  consent_version text check (char_length(consent_version) <= 20),
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  status text not null default 'draft' check (status in ('draft', 'open', 'investigating', 'corrective_action', 'resolved', 'appealed', 'closed')),
  close_reason text check (close_reason in ('resolved', 'withdrawn', 'not_valid', 'duplicate', 'appeal_decided', 'other')),
  outcome_note text check (char_length(outcome_note) <= 2000),     -- the team's decision, shown to both sides
  submitted_at timestamptz,
  first_response_due_at timestamptz,
  resolve_due_at timestamptz,
  first_responded_at timestamptz,
  resolved_at timestamptz,
  appealed_at timestamptz,
  appeal_by text check (appeal_by in ('member', 'partner')),
  appeal_reason text check (char_length(appeal_reason) <= 2000),
  closed_at timestamptz,
  partner_response text check (char_length(partner_response) <= 3000),
  partner_responded_at timestamptz,
  assigned_to uuid references auth.users(id) on delete set null,
  alerted_at timestamptz,                                           -- last overdue alert sent to the team
  changed_by uuid references auth.users(id) on delete set null,     -- who made this change (written by the server)
  change_note text check (char_length(change_note) <= 2000),        -- why (goes into the history)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_complaints_complete check (status = 'draft' or (order_reference is not null and issue is not null and description is not null
    and desired_remedy is not null and consent_at is not null and submitted_at is not null and first_response_due_at is not null and resolve_due_at is not null)),
  constraint partner_complaints_closed check (status <> 'closed' or (closed_at is not null and close_reason is not null)),
  constraint partner_complaints_appeal check (status <> 'appealed' or (appeal_by is not null and appeal_reason is not null and appealed_at is not null))
);
create index if not exists partner_complaints_status on public.partner_complaints (status, severity, submitted_at desc);
create index if not exists partner_complaints_partner on public.partner_complaints (partner_user_id, submitted_at desc);
create index if not exists partner_complaints_member on public.partner_complaints (complainant_id, created_at desc);

-- The severity a complaint starts with, from its issue (the team may change it).
create or replace function public.complaint_default_severity(p_issue text) returns text language sql immutable as $$
  select case p_issue when 'safety' then 'critical' when 'missing' then 'high' when 'damaged' then 'high' when 'defective' then 'high'
                      when 'late' then 'medium' when 'unsatisfactory_service' then 'medium' else 'low' end;
$$;

create or replace function public.partner_complaint_guard() returns trigger
language plpgsql as $$
declare
  t record;
  actor uuid := new.changed_by;
  team boolean;
  member boolean;
  partner boolean;
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then raise exception 'partner_complaint: new complaints start as draft'; end if;
    if new.complainant_id is null or new.partner_user_id is null then raise exception 'partner_complaint: member and partner are required'; end if;
    if new.complainant_id = new.partner_user_id then raise exception 'partner_complaint: a partner cannot complain about itself'; end if;
    if not exists (select 1 from public.partner_profiles p where p.user_id = new.partner_user_id) then
      raise exception 'partner_complaint: complaints are only about accredited partners';
    end if;
    if (select count(*) from public.partner_complaints c where c.complainant_id = new.complainant_id and c.status = 'draft') >= 10 then
      raise exception 'partner_complaint: limit of 10 unsent complaints per member';
    end if;
    new.changed_by := new.complainant_id;
    return new;
  end if;
  if public.partner_only_nulled(to_jsonb(new), to_jsonb(old), array['complainant_id', 'partner_user_id', 'chapter_id', 'assigned_to', 'changed_by']) then
    return new;   -- an account or chapter was erased
  end if;
  if new.complainant_id is distinct from old.complainant_id or new.partner_user_id is distinct from old.partner_user_id
     or new.ref_no <> old.ref_no or new.created_at <> old.created_at then
    raise exception 'partner_complaint: member, partner and number are fixed';
  end if;
  -- Dates kept by the database alone (set below on the moves that make them).
  new.submitted_at := old.submitted_at; new.first_responded_at := old.first_responded_at; new.resolved_at := old.resolved_at;
  new.appealed_at := old.appealed_at; new.appeal_by := old.appeal_by; new.closed_at := old.closed_at;
  if new.partner_response is not distinct from old.partner_response then new.partner_responded_at := old.partner_responded_at; end if;
  if new.status = old.status then new.appeal_reason := old.appeal_reason; end if;
  if old.status = 'closed' and (to_jsonb(new) - array['alerted_at', 'updated_at', 'changed_by', 'change_note']) is distinct from (to_jsonb(old) - array['alerted_at', 'updated_at', 'changed_by', 'change_note']) then
    raise exception 'partner_complaint: a closed complaint cannot be changed';
  end if;
  -- The overdue alert stamp is written by the scheduled job alone.
  if (to_jsonb(new) - array['alerted_at', 'updated_at']) = (to_jsonb(old) - array['alerted_at', 'updated_at']) then return new; end if;
  if actor is null then raise exception 'partner_complaint: who made the change is required'; end if;
  team := public.partner_is_national(actor) and actor is distinct from old.complainant_id and actor is distinct from old.partner_user_id;
  member := actor = old.complainant_id;
  partner := actor = old.partner_user_id;
  if not (team or member or partner) then raise exception 'partner_complaint: only the member, the partner or the national team can change a complaint'; end if;

  -- What each side may change, besides the status.
  if old.status = 'draft' then
    if not member then raise exception 'partner_complaint: only the member edits a draft'; end if;
  else
    if (new.order_reference, new.order_date, new.product_or_service, new.issue, new.description, new.desired_remedy, new.remedy_note,
        new.affected_value, new.consent_at, new.partner_category, new.partner_name, new.submitted_at, new.chapter_id)
       is distinct from (old.order_reference, old.order_date, old.product_or_service, old.issue, old.description, old.desired_remedy,
        old.remedy_note, old.affected_value, old.consent_at, old.partner_category, old.partner_name, old.submitted_at, old.chapter_id) then
      raise exception 'partner_complaint: a sent complaint cannot be edited (add a note instead)';
    end if;
  end if;
  if (new.severity, new.assigned_to, new.outcome_note) is distinct from (old.severity, old.assigned_to, old.outcome_note) and not team and old.status <> 'draft' then
    raise exception 'partner_complaint: only the national team sets severity, the person in charge and the outcome';
  end if;
  if (new.partner_response, new.partner_responded_at) is distinct from (old.partner_response, old.partner_responded_at) then
    if not partner then raise exception 'partner_complaint: only the partner writes the partner''s response'; end if;
    if old.status in ('draft', 'closed') or new.partner_response is null then raise exception 'partner_complaint: the response cannot be written now'; end if;
    new.partner_responded_at := now();
  end if;
  -- Severity changes move the due dates (always counted from when the complaint was sent).
  if new.severity <> old.severity and old.status <> 'draft' then
    select * into t from public.complaint_targets where severity = new.severity;
    new.first_response_due_at := old.submitted_at + make_interval(hours => t.first_response_hours);
    new.resolve_due_at := old.submitted_at + make_interval(days => t.resolve_days);
  elsif (new.first_response_due_at, new.resolve_due_at) is distinct from (old.first_response_due_at, old.resolve_due_at) and old.status <> 'draft' then
    raise exception 'partner_complaint: due dates follow the response targets';
  end if;

  if new.status = old.status then return new; end if;
  if not ((old.status, new.status) in (
      ('draft', 'open'),
      ('open', 'investigating'), ('open', 'closed'),
      ('investigating', 'corrective_action'), ('investigating', 'resolved'), ('investigating', 'closed'),
      ('corrective_action', 'investigating'), ('corrective_action', 'resolved'), ('corrective_action', 'closed'),
      ('resolved', 'appealed'), ('resolved', 'closed'),
      ('appealed', 'investigating'), ('appealed', 'closed'))) then
    raise exception 'partner_complaint: cannot move from % to %', old.status, new.status;
  end if;

  if new.status = 'open' then
    -- Sending: the member's consent, then severity and due dates from the targets.
    if not member then raise exception 'partner_complaint: only the member sends the complaint'; end if;
    if new.consent_at is null then raise exception 'partner_complaint: consent is required to send'; end if;
    if not exists (select 1 from public.partner_profiles p where p.user_id = old.partner_user_id) then
      raise exception 'partner_complaint: complaints are only about accredited partners';
    end if;
    new.submitted_at := now();
    new.severity := public.complaint_default_severity(new.issue);
    select * into t from public.complaint_targets where severity = new.severity;
    new.first_response_due_at := new.submitted_at + make_interval(hours => t.first_response_hours);
    new.resolve_due_at := new.submitted_at + make_interval(days => t.resolve_days);
    return new;
  end if;
  if new.status = 'appealed' then
    -- Either side may appeal within 7 days of the resolution, once.
    if not (member or partner) then raise exception 'partner_complaint: only the member or the partner appeals'; end if;
    if old.appealed_at is not null then raise exception 'partner_complaint: a complaint can be appealed once'; end if;
    if old.resolved_at < now() - interval '7 days' then raise exception 'partner_complaint: appeals are allowed within 7 days of the resolution'; end if;
    if new.appeal_reason is null then raise exception 'partner_complaint: write why you appeal'; end if;
    new.appeal_by := case when member then 'member' else 'partner' end;
    new.appealed_at := now();
    return new;
  end if;
  if new.status = 'closed' and member and old.status in ('open', 'investigating') then
    new.close_reason := 'withdrawn';   -- the member withdraws
    new.closed_at := now();
    return new;
  end if;
  -- Every other move is the national team's. Appeals are decided by the founder.
  if not team then raise exception 'partner_complaint: only the national team moves a complaint from % to %', old.status, new.status; end if;
  if old.status = 'appealed' and not exists (select 1 from public.roles x where x.user_id = actor and x.role = 'super_admin') then
    raise exception 'partner_complaint: appeals are decided by the founder';
  end if;
  if old.first_responded_at is null then new.first_responded_at := now(); end if;
  if new.status = 'resolved' then
    if new.outcome_note is null then raise exception 'partner_complaint: write the outcome before resolving'; end if;
    new.resolved_at := now();
  end if;
  if new.status = 'closed' then
    if new.close_reason is null then raise exception 'partner_complaint: choose why it is closed'; end if;
    if old.status = 'appealed' then new.close_reason := 'appeal_decided'; end if;
    if new.close_reason in ('not_valid', 'duplicate', 'other', 'appeal_decided') and new.change_note is null and new.outcome_note is null then
      raise exception 'partner_complaint: write the reason for closing';
    end if;
    new.closed_at := now();
  end if;
  return new;
end $$;
drop trigger if exists partner_complaints_guard on public.partner_complaints;
create trigger partner_complaints_guard before insert or update on public.partner_complaints
  for each row execute function public.partner_complaint_guard();

-- Only unsent drafts can be deleted, except when the member's account is erased.
create or replace function public.partner_complaint_delete_guard() returns trigger
language plpgsql as $$
begin
  if old.status = 'draft' or current_setting('flameph.retention', true) = 'on' then return old; end if;
  raise exception 'partner_complaint: sent complaints cannot be deleted';
end $$;
drop trigger if exists partner_complaints_delete on public.partner_complaints;
create trigger partner_complaints_delete before delete on public.partner_complaints
  for each row execute function public.partner_complaint_delete_guard();

-- ===========================================================================================================
-- E. The case history (append-only). The database writes the status, severity and response rows itself; the server
--    adds notes. Team-only notes are marked internal.
-- ===========================================================================================================
create table if not exists public.partner_complaint_events (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.partner_complaints(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  side text not null check (side in ('member', 'partner', 'team', 'system')),
  action text not null check (action in ('sent', 'status', 'severity', 'assigned', 'partner_response', 'appeal', 'withdrawn', 'note',
    'evidence', 'action_added', 'action_updated', 'penalty', 'sanction', 'alert')),
  from_status text,
  to_status text,
  note text check (char_length(note) <= 3000),
  internal boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists partner_complaint_events_case on public.partner_complaint_events (complaint_id, created_at);

create or replace function public.partner_complaint_events_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if current_setting('flameph.retention', true) = 'on' then return old; end if;
    if not exists (select 1 from public.partner_complaints c where c.id = old.complaint_id) then return old; end if;
    raise exception 'append_only: partner_complaint_events rows cannot be deleted';
  end if;
  if (to_jsonb(new) - 'actor_id') is distinct from (to_jsonb(old) - 'actor_id') or new.actor_id is not null then
    raise exception 'append_only: partner_complaint_events rows cannot be changed';
  end if;
  return new;
end $$;
drop trigger if exists partner_complaint_events_append_only on public.partner_complaint_events;
create trigger partner_complaint_events_append_only before update or delete on public.partner_complaint_events
  for each row execute function public.partner_complaint_events_guard();

create or replace function public.complaint_side(c public.partner_complaints, uid uuid) returns text
language sql stable as $$
  select case when uid is null then 'system' when uid = c.complainant_id then 'member' when uid = c.partner_user_id then 'partner' else 'team' end;
$$;

create or replace function public.partner_complaint_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare s text := public.complaint_side(new, new.changed_by);
begin
  if tg_op = 'UPDATE' and new.status = old.status and new.severity = old.severity and new.assigned_to is not distinct from old.assigned_to
     and new.partner_responded_at is not distinct from old.partner_responded_at then
    return null;
  end if;
  if tg_op = 'INSERT' then return null; end if;
  if new.status <> old.status then
    insert into public.partner_complaint_events (complaint_id, actor_id, side, action, from_status, to_status, note)
    values (new.id, new.changed_by, s,
      case when new.status = 'open' then 'sent' when new.status = 'appealed' then 'appeal' when new.close_reason = 'withdrawn' and new.status = 'closed' then 'withdrawn' else 'status' end,
      old.status, new.status,
      case when new.status = 'appealed' then new.appeal_reason when new.status = 'resolved' then new.outcome_note else new.change_note end);
  end if;
  if new.severity <> old.severity and old.status <> 'draft' then
    insert into public.partner_complaint_events (complaint_id, actor_id, side, action, note)
    values (new.id, new.changed_by, s, 'severity', old.severity || ' -> ' || new.severity || coalesce(': ' || new.change_note, ''));
  end if;
  if new.assigned_to is distinct from old.assigned_to and new.assigned_to is not null then
    insert into public.partner_complaint_events (complaint_id, actor_id, side, action, internal) values (new.id, new.changed_by, s, 'assigned', true);
  end if;
  if new.partner_responded_at is distinct from old.partner_responded_at and new.partner_responded_at is not null then
    insert into public.partner_complaint_events (complaint_id, actor_id, side, action, note) values (new.id, new.changed_by, 'partner', 'partner_response', new.partner_response);
  end if;
  return null;
end $$;
revoke all on function public.partner_complaint_after() from public, anon, authenticated;
drop trigger if exists partner_complaints_after on public.partner_complaints;
create trigger partner_complaints_after after insert or update on public.partner_complaints
  for each row execute function public.partner_complaint_after();

-- Complaints past their due time that the team has not been reminded about in the last 24 hours (the hourly job).
create or replace function public.complaints_overdue()
returns table (id uuid, ref_no text, severity text, status text, partner_name text, kind text, due_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.ref_no, c.severity, c.status, c.partner_name,
    case when c.status = 'open' and c.first_response_due_at < now() then 'first_response' else 'resolution' end,
    case when c.status = 'open' and c.first_response_due_at < now() then c.first_response_due_at else c.resolve_due_at end
  from public.partner_complaints c
  where ((c.status = 'open' and c.first_response_due_at < now())
      or (c.status in ('open', 'investigating', 'corrective_action', 'appealed') and c.resolve_due_at < now()))
    and (c.alerted_at is null or c.alerted_at < now() - interval '24 hours')
  order by case c.severity when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end, 7
  limit 100;
$$;
revoke all on function public.complaints_overdue() from public, anon, authenticated;
grant execute on function public.complaints_overdue() to service_role;

-- ===========================================================================================================
-- F. Corrective actions (the remedy): written by the national team, marked done by the partner, checked by the team
-- ===========================================================================================================
create table if not exists public.partner_corrective_actions (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.partner_complaints(id) on delete cascade,
  kind text not null check (kind in ('replacement', 'credit', 'refund', 're_performance', 'proportionate_refund', 'explanation', 'process_fix', 'other')),
  description text not null check (char_length(description) between 1 and 1000),
  due_on date not null,
  amount numeric(14,2) check (amount > 0 and amount <= 100000000000),   -- credit or refund figure: a record only
  status text not null default 'open' check (status in ('open', 'done_by_partner', 'verified', 'not_done', 'cancelled')),
  partner_note text check (char_length(partner_note) <= 1000),
  partner_done_at timestamptz,
  checked_by uuid references auth.users(id) on delete set null,
  checked_at timestamptz,
  check_note text check (char_length(check_note) <= 1000),
  created_by uuid references auth.users(id) on delete set null,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_corrective_actions_amount check (amount is null or kind in ('credit', 'refund', 'proportionate_refund'))
);
create index if not exists partner_corrective_actions_case on public.partner_corrective_actions (complaint_id, created_at);

create or replace function public.partner_action_guard() returns trigger
language plpgsql as $$
declare c record; actor uuid := new.changed_by;
begin
  new.updated_at := now();
  select * into c from public.partner_complaints where id = new.complaint_id;
  if tg_op = 'INSERT' then
    if new.status <> 'open' then raise exception 'partner_action: new actions start open'; end if;
    if new.created_by is null or not public.partner_is_national(new.created_by) or new.created_by in (c.complainant_id, c.partner_user_id) then
      raise exception 'partner_action: only the national team sets corrective actions';
    end if;
    if c.status not in ('investigating', 'corrective_action', 'appealed') then raise exception 'partner_action: the complaint is not being worked on'; end if;
    if (select count(*) from public.partner_corrective_actions a where a.complaint_id = new.complaint_id) >= 10 then
      raise exception 'partner_action: limit of 10 actions per complaint';
    end if;
    new.changed_by := new.created_by;
    return new;
  end if;
  if public.partner_only_nulled(to_jsonb(new), to_jsonb(old), array['checked_by', 'created_by', 'changed_by']) then return new; end if;
  if new.complaint_id <> old.complaint_id or new.created_by is distinct from old.created_by then raise exception 'partner_action: complaint and author are fixed'; end if;
  new.created_at := old.created_at; new.partner_done_at := old.partner_done_at; new.checked_by := old.checked_by; new.checked_at := old.checked_at;
  if c.status = 'closed' then raise exception 'partner_action: the complaint is closed'; end if;
  if actor is null then raise exception 'partner_action: who made the change is required'; end if;
  if new.status = old.status then
    if not public.partner_is_national(actor) or actor in (c.complainant_id, c.partner_user_id) or old.status <> 'open' then
      raise exception 'partner_action: only the national team edits an open action';
    end if;
    return new;
  end if;
  if (old.status, new.status) = ('open', 'done_by_partner') then
    if actor is distinct from c.partner_user_id then raise exception 'partner_action: only the partner marks an action done'; end if;
    if (to_jsonb(new) - array['status', 'partner_note', 'partner_done_at', 'changed_by', 'updated_at']) is distinct from (to_jsonb(old) - array['status', 'partner_note', 'partner_done_at', 'changed_by', 'updated_at']) then
      raise exception 'partner_action: the partner can only mark it done with a note';
    end if;
    new.partner_done_at := now();
    return new;
  end if;
  if not ((old.status, new.status) in (('done_by_partner', 'verified'), ('done_by_partner', 'open'), ('open', 'not_done'), ('open', 'cancelled'), ('done_by_partner', 'cancelled'))) then
    raise exception 'partner_action: cannot move from % to %', old.status, new.status;
  end if;
  if not public.partner_is_national(actor) or actor in (c.complainant_id, c.partner_user_id) then
    raise exception 'partner_action: only the national team checks actions';
  end if;
  new.checked_by := actor;
  new.checked_at := now();
  return new;
end $$;
drop trigger if exists partner_corrective_actions_guard on public.partner_corrective_actions;
create trigger partner_corrective_actions_guard before insert or update on public.partner_corrective_actions
  for each row execute function public.partner_action_guard();

create or replace function public.partner_action_delete_guard() returns trigger
language plpgsql as $$
begin
  if current_setting('flameph.retention', true) = 'on' or not exists (select 1 from public.partner_complaints c where c.id = old.complaint_id) then return old; end if;
  raise exception 'partner_action: actions cannot be deleted (cancel them instead)';
end $$;
drop trigger if exists partner_corrective_actions_delete on public.partner_corrective_actions;
create trigger partner_corrective_actions_delete before delete on public.partner_corrective_actions
  for each row execute function public.partner_action_delete_guard();

create or replace function public.partner_action_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare c public.partner_complaints;
begin
  select * into c from public.partner_complaints where id = new.complaint_id;
  insert into public.partner_complaint_events (complaint_id, actor_id, side, action, note)
  values (new.complaint_id, new.changed_by, public.complaint_side(c, new.changed_by),
    case when tg_op = 'INSERT' then 'action_added' else 'action_updated' end,
    new.kind || ': ' || left(new.description, 300) || ' [' || new.status || ']'
      || coalesce(' - ' || case when new.status = 'done_by_partner' then new.partner_note else new.check_note end, ''));
  return null;
end $$;
revoke all on function public.partner_action_after() from public, anon, authenticated;
drop trigger if exists partner_corrective_actions_after on public.partner_corrective_actions;
create trigger partner_corrective_actions_after after insert or update of status, description, due_on, amount on public.partner_corrective_actions
  for each row execute function public.partner_action_after();

-- ===========================================================================================================
-- G. Penalty terms (the late-delivery rate and cap): a default, and one per signed agreement
-- ===========================================================================================================
create table if not exists public.partner_penalty_terms (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('default', 'agreement')),
  partner_user_id uuid references auth.users(id) on delete set null,
  partner_name text check (char_length(partner_name) <= 200),
  contract_ref text check (char_length(contract_ref) <= 80),
  signed_on date,
  late_rate_pct_per_day numeric(5,3) not null check (late_rate_pct_per_day > 0 and late_rate_pct_per_day <= 5),
  late_cap_pct numeric(5,2) not null check (late_cap_pct > 0 and late_cap_pct <= 50),
  note text check (char_length(note) <= 1000),
  status text not null default 'draft' check (status in ('draft', 'active', 'retired', 'cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_penalty_terms_scope check (scope = 'default' and contract_ref is null
    or scope = 'agreement' and partner_name is not null and contract_ref is not null and signed_on is not null),
  constraint partner_penalty_terms_cap check (late_cap_pct >= late_rate_pct_per_day)
);
create unique index if not exists partner_penalty_terms_one_default on public.partner_penalty_terms (scope) where scope = 'default' and status = 'active';
create unique index if not exists partner_penalty_terms_one_agreement on public.partner_penalty_terms (partner_user_id) where scope = 'agreement' and status = 'active';
-- The seed default (before the guard exists): 0.5% per day of the affected net value, capped at 5%.
insert into public.partner_penalty_terms (scope, late_rate_pct_per_day, late_cap_pct, note, status, approved_at)
select 'default', 0.5, 5, 'Program default from the Partner Accreditation prompt (Step 5). Subject to legal review and each signed agreement.', 'active', now()
where not exists (select 1 from public.partner_penalty_terms where scope = 'default');

create or replace function public.partner_penalty_terms_guard() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then raise exception 'penalty_terms: new terms start as draft'; end if;
    if new.created_by is null or not public.partner_is_national(new.created_by) or new.created_by = new.partner_user_id then
      raise exception 'penalty_terms: only the national team writes penalty terms';
    end if;
    if new.scope = 'agreement' and not exists (select 1 from public.partner_profiles p where p.user_id = new.partner_user_id) then
      raise exception 'penalty_terms: agreements are only with accredited partners';
    end if;
    if new.signed_on > (now() at time zone 'Asia/Manila')::date then raise exception 'penalty_terms: the signing date is in the future'; end if;
    return new;
  end if;
  if public.partner_only_nulled(to_jsonb(new), to_jsonb(old), array['partner_user_id', 'created_by', 'approved_by']) then return new; end if;
  if old.status <> 'draft' and (to_jsonb(new) - array['status', 'retired_at', 'updated_at']) is distinct from (to_jsonb(old) - array['status', 'retired_at', 'updated_at']) then
    raise exception 'penalty_terms: active or retired terms cannot be edited (write new terms)';
  end if;
  if new.status = old.status then return new; end if;
  if (old.status, new.status) = ('draft', 'active') then
    if new.approved_by is null or not public.partner_is_national(new.approved_by) or new.approved_by = old.created_by or new.approved_by = old.partner_user_id then
      raise exception 'penalty_terms: a second national team member makes the terms active';
    end if;
    new.approved_at := now();
    -- The terms they replace are retired.
    perform set_config('flameph.penalty_replace', 'on', true);
    update public.partner_penalty_terms x set status = 'retired'
     where x.status = 'active' and x.scope = new.scope and x.id <> new.id
       and (new.scope = 'default' or x.partner_user_id = new.partner_user_id);
    perform set_config('flameph.penalty_replace', 'off', true);
    return new;
  end if;
  if (old.status, new.status) = ('draft', 'cancelled') then return new; end if;
  if (old.status, new.status) = ('active', 'retired') then
    -- The default is retired only when new default terms replace it, so there is always one. An agreement can end.
    if old.scope = 'default' and current_setting('flameph.penalty_replace', true) is distinct from 'on' then
      raise exception 'penalty_terms: the default is replaced by new default terms, never just retired';
    end if;
    new.retired_at := now();
    return new;
  end if;
  raise exception 'penalty_terms: cannot move from % to %', old.status, new.status;
end $$;
drop trigger if exists partner_penalty_terms_guard on public.partner_penalty_terms;
create trigger partner_penalty_terms_guard before insert or update on public.partner_penalty_terms
  for each row execute function public.partner_penalty_terms_guard();

-- The late-delivery penalty: affected net value x rate per day x days late, never more than the cap.
create or replace function public.partner_late_penalty(p_value numeric, p_rate numeric, p_days int, p_cap numeric) returns numeric
language sql immutable as $$
  select round(least(p_value * p_rate / 100 * p_days, p_value * p_cap / 100), 2);
$$;

-- ===========================================================================================================
-- H. Penalties: PROPOSED figures only. A record; MarketplacePH Online Store settles any money.
-- ===========================================================================================================
create table if not exists public.partner_penalties (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.partner_complaints(id) on delete cascade,
  partner_user_id uuid references auth.users(id) on delete set null,
  partner_name text not null check (char_length(partner_name) between 1 and 200),
  kind text not null check (kind in ('late_delivery', 'other')),
  terms_id uuid references public.partner_penalty_terms(id) on delete restrict,
  affected_value numeric(14,2) not null check (affected_value > 0 and affected_value <= 100000000000),   -- affected net (delayed) value
  days_late int check (days_late between 1 and 3650),
  rate_pct_per_day numeric(5,3),
  cap_pct numeric(5,2),
  attributable boolean not null default false,       -- the delay was the partner's fault (not force majeure or the buyer)
  amount numeric(14,2) not null check (amount >= 0 and amount <= 100000000000),
  basis_note text not null check (char_length(basis_note) between 1 and 2000),   -- which agreement clause, what happened
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'waived', 'cancelled', 'settled')),
  legal_reviewed boolean not null default false,
  proposed_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  decision_note text check (char_length(decision_note) <= 1000),
  settled_ref text check (char_length(settled_ref) <= 120),         -- MarketplacePH Online Store reference
  settled_on date,
  settled_by uuid references auth.users(id) on delete set null,
  partner_response text check (char_length(partner_response) <= 2000),
  partner_responded_at timestamptz,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_penalties_late check (kind <> 'late_delivery' or (days_late is not null and rate_pct_per_day is not null and cap_pct is not null and terms_id is not null)),
  constraint partner_penalties_settled check (status <> 'settled' or (settled_ref is not null and settled_on is not null)),
  constraint partner_penalties_decided check (status not in ('waived', 'cancelled') or decision_note is not null)
);
create index if not exists partner_penalties_partner on public.partner_penalties (partner_user_id, created_at desc);
create index if not exists partner_penalties_case on public.partner_penalties (complaint_id);

create or replace function public.partner_penalty_guard() returns trigger
language plpgsql as $$
declare c record; t record; actor uuid := new.changed_by;
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    select * into c from public.partner_complaints where id = new.complaint_id;
    if not found or c.status in ('draft', 'closed') then raise exception 'partner_penalty: only for a complaint being worked on'; end if;
    if new.status <> 'proposed' then raise exception 'partner_penalty: new penalties start as proposed'; end if;
    if new.proposed_by is null or not public.partner_is_national(new.proposed_by) or new.proposed_by in (c.complainant_id, c.partner_user_id) then
      raise exception 'partner_penalty: only the national team proposes penalties';
    end if;
    new.partner_user_id := c.partner_user_id;
    new.partner_name := c.partner_name;
    new.changed_by := new.proposed_by;
    new.legal_reviewed := false;
    if new.kind = 'late_delivery' then
      if not new.attributable then raise exception 'partner_penalty: a late-delivery penalty needs the delay to be the partner''s fault'; end if;
      -- The partner's signed agreement if it has one, otherwise the default. Rate and cap are copied (frozen).
      select * into t from public.partner_penalty_terms x
       where x.status = 'active' and (x.scope = 'agreement' and x.partner_user_id = c.partner_user_id or x.scope = 'default')
       order by (x.scope = 'agreement') desc limit 1;
      if not found then raise exception 'partner_penalty: no active penalty terms'; end if;
      new.terms_id := t.id; new.rate_pct_per_day := t.late_rate_pct_per_day; new.cap_pct := t.late_cap_pct;
      if new.days_late is null then raise exception 'partner_penalty: days late are required'; end if;
      new.amount := public.partner_late_penalty(new.affected_value, new.rate_pct_per_day, new.days_late, new.cap_pct);
    else
      new.terms_id := null; new.days_late := null; new.rate_pct_per_day := null; new.cap_pct := null;
      if new.amount > new.affected_value then raise exception 'partner_penalty: the penalty cannot be more than the affected value'; end if;
    end if;
    return new;
  end if;
  if public.partner_only_nulled(to_jsonb(new), to_jsonb(old), array['partner_user_id', 'proposed_by', 'approved_by', 'decided_by', 'settled_by', 'changed_by']) then return new; end if;
  if (new.complaint_id, new.partner_user_id, new.partner_name, new.kind, new.terms_id, new.affected_value, new.days_late, new.rate_pct_per_day, new.cap_pct, new.attributable, new.amount, new.basis_note, new.proposed_by)
     is distinct from (old.complaint_id, old.partner_user_id, old.partner_name, old.kind, old.terms_id, old.affected_value, old.days_late, old.rate_pct_per_day, old.cap_pct, old.attributable, old.amount, old.basis_note, old.proposed_by) then
    raise exception 'partner_penalty: the figures are fixed (cancel and propose again)';
  end if;
  new.created_at := old.created_at; new.approved_by := old.approved_by; new.approved_at := old.approved_at; new.decided_by := old.decided_by;
  new.decided_at := old.decided_at; new.settled_by := old.settled_by;
  if new.partner_response is not distinct from old.partner_response then new.partner_responded_at := old.partner_responded_at; end if;
  if actor is null then raise exception 'partner_penalty: who made the change is required'; end if;
  -- The partner's answer (their right to respond before anything is approved).
  if (new.partner_response, new.partner_responded_at) is distinct from (old.partner_response, old.partner_responded_at) then
    if actor is distinct from old.partner_user_id or old.status <> 'proposed' or new.partner_response is null then
      raise exception 'partner_penalty: only the partner answers, while the penalty is proposed';
    end if;
    new.partner_responded_at := now();
  end if;
  if new.legal_reviewed <> old.legal_reviewed then
    if not public.partner_is_national(actor) or old.status <> 'proposed' then raise exception 'partner_penalty: only the national team records the legal review'; end if;
  end if;
  if new.status = old.status then return new; end if;
  if (old.status, new.status) = ('proposed', 'approved') then
    if not public.partner_is_national(actor) or actor = old.proposed_by or actor = old.partner_user_id then
      raise exception 'partner_penalty: a second national team member approves';
    end if;
    if not new.legal_reviewed then raise exception 'partner_penalty: record the legal review before approving'; end if;
    if old.partner_responded_at is null and old.created_at > now() - interval '7 days' then
      raise exception 'partner_penalty: wait for the partner''s answer or 7 days';
    end if;
    new.approved_by := actor; new.approved_at := now();
    return new;
  end if;
  if (old.status, new.status) in (('proposed', 'waived'), ('proposed', 'cancelled'), ('approved', 'waived')) then
    if not public.partner_is_national(actor) or actor = old.partner_user_id then raise exception 'partner_penalty: only the national team waives or cancels'; end if;
    new.decided_by := actor; new.decided_at := now();
    return new;
  end if;
  if (old.status, new.status) = ('approved', 'settled') then
    if not public.commission_is_finance(actor) or actor = old.partner_user_id then
      raise exception 'partner_penalty: finance records the settlement made by MarketplacePH Online Store';
    end if;
    if new.settled_on > (now() at time zone 'Asia/Manila')::date then raise exception 'partner_penalty: the settlement date is in the future'; end if;
    new.settled_by := actor;
    return new;
  end if;
  raise exception 'partner_penalty: cannot move from % to %', old.status, new.status;
end $$;
drop trigger if exists partner_penalties_guard on public.partner_penalties;
create trigger partner_penalties_guard before insert or update on public.partner_penalties
  for each row execute function public.partner_penalty_guard();

create or replace function public.partner_penalty_delete_guard() returns trigger
language plpgsql as $$
begin
  if current_setting('flameph.retention', true) = 'on' or not exists (select 1 from public.partner_complaints c where c.id = old.complaint_id) then return old; end if;
  raise exception 'partner_penalty: penalties cannot be deleted (cancel them instead)';
end $$;
drop trigger if exists partner_penalties_delete on public.partner_penalties;
create trigger partner_penalties_delete before delete on public.partner_penalties
  for each row execute function public.partner_penalty_delete_guard();

-- The penalty steps go into the complaint's history as team-only lines (the partner sees penalties on its own page).
create or replace function public.partner_penalty_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare c public.partner_complaints; answered boolean := false; legal boolean := false;
begin
  if tg_op = 'UPDATE' then
    if new.status = old.status and new.legal_reviewed = old.legal_reviewed and new.partner_responded_at is not distinct from old.partner_responded_at then return null; end if;
    answered := new.partner_responded_at is distinct from old.partner_responded_at;
    legal := new.legal_reviewed and not old.legal_reviewed;
  end if;
  select * into c from public.partner_complaints where id = new.complaint_id;
  insert into public.partner_complaint_events (complaint_id, actor_id, side, action, note, internal)
  values (new.complaint_id, new.changed_by, public.complaint_side(c, new.changed_by), 'penalty',
    'Penalty ' || new.kind || ' PHP ' || to_char(new.amount, 'FM999,999,999,990.00') || ' [' || new.status || ']'
      || case when legal then ' legal review recorded' else '' end
      || coalesce(': ' || case when answered then new.partner_response else new.decision_note end, ''),
    true);
  return null;
end $$;
revoke all on function public.partner_penalty_after() from public, anon, authenticated;
drop trigger if exists partner_penalties_after on public.partner_penalties;
create trigger partner_penalties_after after insert or update on public.partner_penalties
  for each row execute function public.partner_penalty_after();

-- ===========================================================================================================
-- I. Sanctions: warning, probation, hold, downgrade, termination
-- ===========================================================================================================
create table if not exists public.partner_sanctions (
  id uuid primary key default gen_random_uuid(),
  partner_user_id uuid references auth.users(id) on delete set null,
  partner_name text not null check (char_length(partner_name) between 1 and 200),
  complaint_id uuid references public.partner_complaints(id) on delete set null,
  level text not null check (level in ('warning', 'probation', 'hold', 'downgrade', 'termination')),
  reason text not null check (char_length(reason) between 1 and 2000),
  ends_on date,                                          -- probation and hold end on this date unless lifted earlier
  status text not null default 'proposed' check (status in ('proposed', 'active', 'lifted', 'cancelled')),
  urgent boolean not null default false,                 -- a safety hold on a critical complaint can start at once
  proposed_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  lifted_by uuid references auth.users(id) on delete set null,
  lifted_at timestamptz,
  lift_note text check (char_length(lift_note) <= 1000),
  partner_response text check (char_length(partner_response) <= 2000),
  partner_responded_at timestamptz,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_sanctions_ends check (level not in ('probation', 'hold') or ends_on is not null),
  constraint partner_sanctions_lift check (status not in ('lifted', 'cancelled') or lift_note is not null)
);
create index if not exists partner_sanctions_partner on public.partner_sanctions (partner_user_id, created_at desc);
create index if not exists partner_sanctions_status on public.partner_sanctions (status, level);

create or replace function public.partner_sanction_guard() returns trigger
language plpgsql as $$
declare actor uuid := new.changed_by; crit boolean;
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    if new.status <> 'proposed' then raise exception 'partner_sanction: new sanctions start as proposed'; end if;
    if new.proposed_by is null or not public.partner_is_national(new.proposed_by) or new.proposed_by = new.partner_user_id then
      raise exception 'partner_sanction: only the national team proposes sanctions';
    end if;
    if not exists (select 1 from public.partner_profiles p where p.user_id = new.partner_user_id) then
      raise exception 'partner_sanction: sanctions are only for accredited partners';
    end if;
    if new.complaint_id is not null and not exists (select 1 from public.partner_complaints c where c.id = new.complaint_id and c.partner_user_id = new.partner_user_id) then
      raise exception 'partner_sanction: that complaint is not about this partner';
    end if;
    if new.ends_on is not null and new.ends_on <= (now() at time zone 'Asia/Manila')::date then raise exception 'partner_sanction: the end date must be in the future'; end if;
    if new.urgent then
      select exists (select 1 from public.partner_complaints c where c.id = new.complaint_id and c.severity = 'critical') into crit;
      if new.level <> 'hold' or not crit then raise exception 'partner_sanction: only a hold on a critical complaint can be urgent'; end if;
    end if;
    new.changed_by := new.proposed_by;
    return new;
  end if;
  if public.partner_only_nulled(to_jsonb(new), to_jsonb(old), array['partner_user_id', 'complaint_id', 'proposed_by', 'approved_by', 'lifted_by', 'changed_by']) then return new; end if;
  if (new.partner_user_id, new.partner_name, new.complaint_id, new.level, new.reason, new.ends_on, new.urgent, new.proposed_by)
     is distinct from (old.partner_user_id, old.partner_name, old.complaint_id, old.level, old.reason, old.ends_on, old.urgent, old.proposed_by) then
    raise exception 'partner_sanction: a sanction cannot be edited (cancel it and propose again)';
  end if;
  new.created_at := old.created_at; new.approved_by := old.approved_by; new.approved_at := old.approved_at; new.lifted_by := old.lifted_by; new.lifted_at := old.lifted_at;
  if new.partner_response is not distinct from old.partner_response then new.partner_responded_at := old.partner_responded_at; end if;
  if actor is null then raise exception 'partner_sanction: who made the change is required'; end if;
  if (new.partner_response, new.partner_responded_at) is distinct from (old.partner_response, old.partner_responded_at) then
    if actor is distinct from old.partner_user_id or old.status not in ('proposed', 'active') or new.partner_response is null then
      raise exception 'partner_sanction: only the partner answers';
    end if;
    new.partner_responded_at := now();
  end if;
  if new.status = old.status then return new; end if;
  if (old.status, new.status) = ('proposed', 'active') then
    if not public.partner_is_national(actor) or actor = old.proposed_by or actor = old.partner_user_id then
      raise exception 'partner_sanction: a second national team member makes it active';
    end if;
    if old.level = 'termination' and not exists (select 1 from public.roles x where x.user_id = actor and x.role = 'super_admin') then
      raise exception 'partner_sanction: only the founder approves a termination';
    end if;
    -- The partner's right to answer: 7 days, unless they have answered, it is a warning, or an urgent safety hold.
    if old.level <> 'warning' and not old.urgent and old.partner_responded_at is null and old.created_at > now() - interval '7 days' then
      raise exception 'partner_sanction: wait for the partner''s answer or 7 days';
    end if;
    if old.ends_on is not null and old.ends_on <= (now() at time zone 'Asia/Manila')::date then raise exception 'partner_sanction: the end date has passed'; end if;
    new.approved_by := actor; new.approved_at := now();
    return new;
  end if;
  if (old.status, new.status) in (('proposed', 'cancelled'), ('active', 'lifted')) then
    if not public.partner_is_national(actor) or actor = old.partner_user_id then raise exception 'partner_sanction: only the national team lifts or cancels'; end if;
    if old.level = 'termination' and new.status = 'lifted' then raise exception 'partner_sanction: a termination is final (the partner applies again)'; end if;
    new.lifted_by := actor; new.lifted_at := now();
    return new;
  end if;
  raise exception 'partner_sanction: cannot move from % to %', old.status, new.status;
end $$;
drop trigger if exists partner_sanctions_guard on public.partner_sanctions;
create trigger partner_sanctions_guard before insert or update on public.partner_sanctions
  for each row execute function public.partner_sanction_guard();

create or replace function public.partner_sanction_delete_guard() returns trigger
language plpgsql as $$
begin
  if current_setting('flameph.retention', true) = 'on' then return old; end if;
  raise exception 'partner_sanction: sanctions cannot be deleted (cancel or lift them instead)';
end $$;
drop trigger if exists partner_sanctions_delete on public.partner_sanctions;
create trigger partner_sanctions_delete before delete on public.partner_sanctions
  for each row execute function public.partner_sanction_delete_guard();

-- An active hold or termination suspends the accreditation (no new offers, territories or commission rates; the
-- existing rules already require 'accredited'). Lifting the last hold restores it; a termination stays.
create or replace function public.partner_sanction_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare c public.partner_complaints; blocked boolean; changed boolean := tg_op = 'INSERT'; answered boolean := false;
begin
  if tg_op = 'UPDATE' then
    changed := new.status <> old.status;
    answered := new.partner_responded_at is distinct from old.partner_responded_at;
  end if;
  if new.partner_user_id is not null and changed then
    select exists (select 1 from public.partner_sanctions s where s.partner_user_id = new.partner_user_id and s.status = 'active' and s.level in ('hold', 'termination')) into blocked;
    if blocked then
      update public.partner_profiles set status = 'suspended' where user_id = new.partner_user_id and status = 'accredited';
    elsif new.level = 'hold' and new.status = 'lifted' then
      update public.partner_profiles set status = 'accredited' where user_id = new.partner_user_id and status = 'suspended';
    end if;
  end if;
  if new.complaint_id is not null and (changed or answered) then
    select * into c from public.partner_complaints where id = new.complaint_id;
    insert into public.partner_complaint_events (complaint_id, actor_id, side, action, note, internal)
    values (new.complaint_id, new.changed_by, public.complaint_side(c, new.changed_by), 'sanction',
      'Sanction ' || new.level || ' [' || new.status || ']' || coalesce(': ' || case when answered then new.partner_response else new.lift_note end, ''),
      true);
  end if;
  return null;
end $$;
revoke all on function public.partner_sanction_after() from public, anon, authenticated;
drop trigger if exists partner_sanctions_after on public.partner_sanctions;
create trigger partner_sanctions_after after insert or update on public.partner_sanctions
  for each row execute function public.partner_sanction_after();

-- ===========================================================================================================
-- J. Row level security. No browser role can write: every write goes through the flameph.org server.
-- ===========================================================================================================
-- Is the signed-in member a chapter coordinator of this chapter?
create or replace function public.partner_coordinates(chap uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select chap is not null and exists (select 1 from public.roles r where r.user_id = auth.uid() and r.role = 'chapter_coordinator' and r.chapter_id = chap);
$$;
revoke all on function public.partner_coordinates(uuid) from public, anon;
grant execute on function public.partner_coordinates(uuid) to authenticated, service_role;

-- Is the signed-in member the complainant or the partner of this complaint (and is it sent)?
create or replace function public.complaint_party(c_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.partner_complaints c where c.id = c_id
    and (c.complainant_id = auth.uid() or (c.partner_user_id = auth.uid() and c.status <> 'draft')));
$$;
revoke all on function public.complaint_party(uuid) from public, anon;
grant execute on function public.complaint_party(uuid) to authenticated, service_role;

alter table public.partner_sample_tests enable row level security;
alter table public.complaint_targets enable row level security;
alter table public.partner_complaints enable row level security;
alter table public.partner_complaint_events enable row level security;
alter table public.partner_corrective_actions enable row level security;
alter table public.partner_penalty_terms enable row level security;
alter table public.partner_penalties enable row level security;
alter table public.partner_sanctions enable row level security;
revoke all on public.partner_sample_tests, public.complaint_targets, public.partner_complaints, public.partner_complaint_events,
  public.partner_corrective_actions, public.partner_penalty_terms, public.partner_penalties, public.partner_sanctions from anon, authenticated;
revoke all on sequence public.partner_sample_no, public.partner_complaint_no from anon, authenticated;

grant select on public.partner_sample_tests, public.complaint_targets, public.partner_complaint_events, public.partner_corrective_actions,
  public.partner_penalty_terms, public.partner_penalties, public.partner_sanctions to authenticated;
-- Complaints: every column except the alert stamp and who is in charge (team only, read with the server key).
grant select (id, ref_no, complainant_id, partner_user_id, partner_name, partner_category, chapter_id, order_reference, order_date, product_or_service,
  issue, description, desired_remedy, remedy_note, affected_value, consent_at, consent_version, severity, status, close_reason, outcome_note,
  submitted_at, first_response_due_at, resolve_due_at, first_responded_at, resolved_at, appealed_at, appeal_by, appeal_reason, closed_at,
  partner_response, partner_responded_at, created_at, updated_at) on public.partner_complaints to authenticated;

drop policy if exists partner_sample_tests_read on public.partner_sample_tests;
create policy partner_sample_tests_read on public.partner_sample_tests for select to authenticated
  using (public.is_partner_reviewer() or tester_id = auth.uid() or public.partner_coordinates(chapter_id));
drop policy if exists complaint_targets_read on public.complaint_targets;
create policy complaint_targets_read on public.complaint_targets for select to authenticated using (true);
drop policy if exists partner_complaints_read on public.partner_complaints;
create policy partner_complaints_read on public.partner_complaints for select to authenticated
  using (public.is_partner_reviewer() or complainant_id = auth.uid() or (partner_user_id = auth.uid() and status <> 'draft'));
drop policy if exists partner_complaint_events_read on public.partner_complaint_events;
create policy partner_complaint_events_read on public.partner_complaint_events for select to authenticated
  using (public.is_partner_reviewer() or (not internal and public.complaint_party(complaint_id)));
drop policy if exists partner_corrective_actions_read on public.partner_corrective_actions;
create policy partner_corrective_actions_read on public.partner_corrective_actions for select to authenticated
  using (public.is_partner_reviewer() or public.complaint_party(complaint_id));
drop policy if exists partner_penalty_terms_read on public.partner_penalty_terms;
create policy partner_penalty_terms_read on public.partner_penalty_terms for select to authenticated
  using (public.is_commission_desk() or (status in ('active', 'retired') and (scope = 'default' or partner_user_id = auth.uid())));
drop policy if exists partner_penalties_read on public.partner_penalties;
create policy partner_penalties_read on public.partner_penalties for select to authenticated
  using (public.is_commission_desk() or partner_user_id = auth.uid());
drop policy if exists partner_sanctions_read on public.partner_sanctions;
create policy partner_sanctions_read on public.partner_sanctions for select to authenticated
  using (public.is_partner_reviewer() or partner_user_id = auth.uid());

-- ===========================================================================================================
-- K. Sample photos and complaint evidence reuse the encrypted document store (0022, 0031, 0032)
-- ===========================================================================================================
alter table public.vetting_documents add column if not exists sample_id uuid references public.partner_sample_tests(id) on delete set null;
alter table public.vetting_documents add column if not exists complaint_id uuid references public.partner_complaints(id) on delete set null;
alter table public.vetting_documents drop constraint if exists vetting_documents_purpose_check;
alter table public.vetting_documents add constraint vetting_documents_purpose_check check (purpose in ('vetting', 'partner', 'offer', 'sample', 'complaint'));
alter table public.vetting_documents drop constraint if exists vetting_documents_doc_type_check;
alter table public.vetting_documents add constraint vetting_documents_doc_type_check
  check (doc_type in ('dti_sec', 'mayors_permit', 'bir', 'gov_id', 'fda', 'prc', 'certification', 'other', 'product_photo', 'price_list', 'spec_sheet',
    'sample_photo', 'evidence_photo', 'receipt'));
alter table public.vetting_documents drop constraint if exists vetting_documents_partner_check;
alter table public.vetting_documents add constraint vetting_documents_partner_check
  check (purpose = 'vetting' and doc_type in ('dti_sec', 'mayors_permit', 'bir')
      or purpose = 'partner' and doc_type in ('dti_sec', 'mayors_permit', 'bir', 'gov_id', 'fda', 'prc', 'certification', 'other')
      or purpose = 'offer' and doc_type in ('product_photo', 'price_list', 'spec_sheet', 'certification', 'fda', 'other')
      or purpose = 'sample' and doc_type in ('sample_photo', 'other')
      or purpose = 'complaint' and doc_type in ('evidence_photo', 'receipt', 'other'));
create index if not exists vetting_documents_sample on public.vetting_documents (sample_id) where sample_id is not null;
create index if not exists vetting_documents_complaint on public.vetting_documents (complaint_id) where complaint_id is not null;
grant select (sample_id, complaint_id) on public.vetting_documents to authenticated;
drop policy if exists vetting_documents_sample_read on public.vetting_documents;
create policy vetting_documents_sample_read on public.vetting_documents for select to authenticated
  using (purpose = 'sample' and public.is_partner_reviewer());
drop policy if exists vetting_documents_complaint_read on public.vetting_documents;
create policy vetting_documents_complaint_read on public.vetting_documents for select to authenticated
  using (purpose = 'complaint' and (public.is_partner_reviewer() or public.complaint_party(complaint_id)));

-- Documents due for deletion: as 0032, plus sample photos (3 years after the test was sent, or at once when an
-- unsent test is gone) and complaint evidence (3 years after the complaint was closed, or at once when an unsent
-- complaint is gone). Three years matches the audit log; a lawyer may set a longer period.
create or replace function public.vetting_documents_due() returns table (id uuid, file_path text, reason text)
language sql stable security definer set search_path = public as $$
  select d.id, d.file_path,
    case when not public.has_consent(d.user_id, 'vetting') then 'consent_withdrawn' else 'retention' end
  from public.vetting_documents d
  where d.deleted_at is null and d.purpose = 'vetting'
    and (not public.has_consent(d.user_id, 'vetting')
      or exists (select 1 from public.businesses b where b.owner_id = d.user_id and b.verification_status in ('approved', 'rejected')
                 and b.verification_decided_at < now() - interval '1 year'))
  union all
  select d.id, d.file_path, 'retention'
  from public.vetting_documents d
  left join public.partner_applications a on a.id = d.application_id
  where d.deleted_at is null and d.purpose = 'partner'
    and (a.id is null or (a.status in ('rejected', 'withdrawn') and a.updated_at < now() - interval '1 year'))
  union all
  select d.id, d.file_path, 'retention'
  from public.vetting_documents d
  left join public.supplier_offers o on o.id = d.offer_id
  where d.deleted_at is null and d.purpose = 'offer'
    and (o.id is null or (o.status in ('not_selected', 'withdrawn') and o.updated_at < now() - interval '1 year'))
  union all
  select d.id, d.file_path, 'retention'
  from public.vetting_documents d
  left join public.partner_sample_tests t on t.id = d.sample_id
  where d.deleted_at is null and d.purpose = 'sample'
    and (t.id is null or t.submitted_at < now() - interval '3 years')
  union all
  select d.id, d.file_path, 'retention'
  from public.vetting_documents d
  left join public.partner_complaints c on c.id = d.complaint_id
  where d.deleted_at is null and d.purpose = 'complaint'
    and (c.id is null or (c.status = 'closed' and c.closed_at < now() - interval '3 years'));
$$;
revoke all on function public.vetting_documents_due() from public, anon, authenticated;
grant execute on function public.vetting_documents_due() to service_role;
