-- "Bring my FLAME PH business" to MarketplacePH: the read-only /api/ecosystem/my-businesses endpoint logs each call.
-- Additive: only widens the allowed purposes of ecosystem_access_log with 'business_share'. No data is changed.
-- Rollback: supabase/rollback/0039_ecosystem_business_share_undo.sql
alter table public.ecosystem_access_log drop constraint if exists ecosystem_access_log_purpose_check;
alter table public.ecosystem_access_log add constraint ecosystem_access_log_purpose_check
  check (purpose in ('sign_in', 'sign_in_to_hub', 'badge_check', 'session_check', 'logout_notice', 'consent_off_notice', 'switch_change', 'business_share'));
