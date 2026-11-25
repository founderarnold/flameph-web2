-- Undo for 0040: removes the two new functions and the profile photo column (photos stay in storage).
drop function if exists public.find_members(text, text, uuid, int);
drop function if exists public.member_cards_v2(uuid[]);
alter table public.profiles drop constraint if exists profiles_avatar_url_shape;
alter table public.profiles drop column if exists avatar_url;
