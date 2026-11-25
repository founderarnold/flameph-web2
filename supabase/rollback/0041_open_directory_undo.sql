-- Undo 0041. Restores admin approval for new submissions and removes find_members.
-- Listings published by 0041 stay published (unpublish them in Admin > Directory if needed; audit_log action
-- 'business_auto_published' lists them).
drop function if exists public.find_members(text, text, text, text[], text, uuid, boolean, boolean, boolean, int, int);
-- Re-run the submit_business_for_review definition from 0012_automatic_content_validation.sql to restore review.
