-- Rollback for 0039: remove 'business_share' from the allowed log purposes (its log rows are removed first).
delete from public.ecosystem_access_log where purpose = 'business_share';
alter table public.ecosystem_access_log drop constraint if exists ecosystem_access_log_purpose_check;
alter table public.ecosystem_access_log add constraint ecosystem_access_log_purpose_check
  check (purpose in ('sign_in', 'sign_in_to_hub', 'badge_check', 'session_check', 'logout_notice', 'consent_off_notice', 'switch_change'));
