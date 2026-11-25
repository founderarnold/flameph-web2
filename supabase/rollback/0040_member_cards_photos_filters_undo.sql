-- Undo 0040. Removes the two functions and the profile photo column (uploaded photo files stay in storage).
drop function if exists public.browse_members(text, text, text, text, boolean, text, int);
drop function if exists public.member_cards_v2(uuid[]);
alter table public.profiles drop constraint if exists profiles_avatar_path_own_folder;
alter table public.profiles drop column if exists avatar_path;
