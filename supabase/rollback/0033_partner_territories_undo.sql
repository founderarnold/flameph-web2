-- Undo for 0033_partner_territories.sql. Run only with the owner's written approval, after a backup, in one transaction.
-- It removes only what 0033 added: the territory tables and functions, the two geography tables and the two new
-- columns on ph_provinces. Provinces, chapters and everything from earlier migrations stay as they were.
-- It stops (and changes nothing) while any appointment or nomination exists, so nothing is lost by accident.
do $$ begin
  if exists (select 1 from public.territorial_appointments) or exists (select 1 from public.territory_nominations) then
    raise exception 'undo 0033: territory appointments or nominations exist; keep 0033 or delete them first';
  end if;
end $$;

drop function if exists public.my_sub_partners();
drop table if exists public.territory_history;
drop table if exists public.territory_reviews;
drop table if exists public.territory_areas;
alter table if exists public.territorial_appointments drop constraint if exists territorial_appointments_nomination_fk;
drop table if exists public.territory_nominations;
drop table if exists public.territorial_appointments;
drop function if exists public.territory_mine(uuid);
drop function if exists public.territory_conflicts(uuid);
drop function if exists public.territorial_appointment_guard();
drop function if exists public.territorial_appointment_after();
drop function if exists public.territory_area_fill();
drop function if exists public.territory_area_overlap(text, text, text, text, text, text);
drop function if exists public.territory_area_covers(text, text, text, text, text, text);
drop function if exists public.territory_review_guard();
drop function if exists public.territory_history_guard();
drop function if exists public.territory_nomination_guard();
drop function if exists public.partner_is_national(uuid);
drop table if exists public.ph_cities;
alter table public.ph_provinces drop column if exists region_code;
alter table public.ph_provinces drop column if exists psgc_code;
drop table if exists public.ph_regions;
