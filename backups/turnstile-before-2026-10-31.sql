-- Logical pre-change backup for Turnstile migration.
-- Supabase Free plan does not provide a downloadable native backup.
-- Captured from project ltkvrqaihkmpsdmcwhtg on 2026-10-31.

-- Query used to capture the affected function definition:
select n.nspname as schema_name,
       p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as identity_arguments,
       pg_get_functiondef(p.oid) as function_definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'submit_business_for_review'
order by identity_arguments;

-- Result: 0 rows returned. No existing submit_business_for_review function
-- was present in the production database before migration 0009.

-- The exact migration to be applied is retained at:
-- supabase/migrations/0009_turnstile_business_submission.sql
