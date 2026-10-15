-- Richer business listings: logo, cover photo, opening hours, a map landmark and online shop/social links.
-- Safe to run more than once.
alter table public.businesses
  add column if not exists logo_url text,
  add column if not exists cover_url text,
  add column if not exists hours text check (char_length(hours) <= 200),
  add column if not exists map_landmark text check (char_length(map_landmark) <= 200),
  add column if not exists facebook_url text,
  add column if not exists tiktok_url text,
  add column if not exists instagram_url text,
  add column if not exists shopee_url text,
  add column if not exists lazada_url text,
  add column if not exists website_url text;
