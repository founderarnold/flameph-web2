-- Partner accreditation, Step 3: territories and appointments. The national team appoints an accredited partner to an
-- area (the whole country, regions, provinces, or cities and municipalities, with official PSGC codes) for a named
-- product or service category, with permitted selling channels, the online-sales rule, excluded accounts, dates,
-- targets, performance reviews and exclusive or non-exclusive rights. Two appointments that overlap where at least one
-- is exclusive are refused unless the national team approves the overlap with a written reason. Only the national team
-- (founder, admins, national reviewers) appoints, suspends or ends. A partner can NOMINATE a sub-partner inside their
-- own territory, but can never appoint one.
-- Additive: four new tables for territories, two new geography tables, two new columns on ph_provinces (filled from
-- the official codes), new functions. Nothing is removed or renamed and no existing row changes except the two new
-- province columns being filled in. Take a backup before applying. Safe to run twice.
-- Undo: supabase/rollback/0033_partner_territories_undo.sql (removes only what this file added).
--
--   ph_regions                  the 18 regions with their PSGC code and the region label already used on the site
--   ph_provinces                + psgc_code, region_code (Metro Manila uses the NCR code: it has no province code)
--   ph_cities                   all 1,642 cities and municipalities (PSGC 2nd quarter 2025), each in its province
--   territorial_appointments    one appointment: partner, category, rights, exclusivity, channels, online rule,
--                               excluded accounts, dates, targets, review schedule, status; sub-partners point to a parent
--   territory_areas             the areas of one appointment (national, region, province, city or municipality)
--   territory_reviews           performance reviews by the national team (nobody can change them afterwards)
--   territory_history           created, approved, suspended, resumed, ended, team notes (nobody can change it)
--   territory_nominations       a partner's nomination of a sub-partner inside their own territory
--
-- Money: flameph.org never collects, holds, pays out or moves money. Targets are goals for the performance review, not
-- promised sales, payments or commissions.
--
-- Who sees what (row level security, and the same checks on the server, which is the only writer):
--   partner                    their own approved appointments (never drafts), areas, reviews and the non-internal
--                              history, the sub-partner appointments under them, and their own nominations
--   founder, admin, national reviewer   everything; only they create, approve, suspend, end and review
--   chapter coordinator, chapter tester, finance, other members, visitors   nothing
--   the geography lists        everyone (they are public reference data, like ph_provinces)

-- ===========================================================================================================
-- A. Geography: regions, province codes, cities and municipalities (PSGC, Philippine Statistics Authority)
-- ===========================================================================================================
create table if not exists public.ph_regions (
  code text primary key check (code ~ '^[0-9]{10}$'),
  name text not null check (char_length(name) between 2 and 100),
  label text not null unique check (char_length(label) between 2 and 60)   -- the region text in ph_provinces.region
);
alter table public.ph_provinces add column if not exists psgc_code text unique check (psgc_code ~ '^[0-9]{10}$');
alter table public.ph_provinces add column if not exists region_code text references public.ph_regions(code);
create table if not exists public.ph_cities (
  code text primary key check (code ~ '^[0-9]{10}$'),
  name text not null check (char_length(name) between 2 and 100),
  kind text not null check (kind in ('city', 'municipality')),
  province_code text not null check (province_code ~ '^[0-9]{10}$'),
  province text references public.ph_provinces(name),   -- empty only for the BARMM Special Geographic Area and Isabela City
  region_code text not null references public.ph_regions(code)
);
create index if not exists ph_cities_province on public.ph_cities (province_code, name);

alter table public.ph_regions enable row level security;
alter table public.ph_cities enable row level security;
revoke all on public.ph_regions, public.ph_cities from anon, authenticated;
grant select on public.ph_regions, public.ph_cities to anon, authenticated;
drop policy if exists ph_regions_read on public.ph_regions;
create policy ph_regions_read on public.ph_regions for select to anon, authenticated using (true);
drop policy if exists ph_cities_read on public.ph_cities;
create policy ph_cities_read on public.ph_cities for select to anon, authenticated using (true);

-- The official codes. Regions and cities are inserted; provinces get their code (existing rows, nothing else changes).
insert into public.ph_regions (code, name, label) values
  ('1300000000', 'National Capital Region (NCR)', 'NCR'),
  ('1400000000', 'Cordillera Administrative Region (CAR)', 'CAR'),
  ('0100000000', 'Region I (Ilocos Region)', 'Region I (Ilocos)'),
  ('0200000000', 'Region II (Cagayan Valley)', 'Region II (Cagayan Valley)'),
  ('0300000000', 'Region III (Central Luzon)', 'Region III (Central Luzon)'),
  ('0400000000', 'Region IV-A (CALABARZON)', 'Region IV-A (CALABARZON)'),
  ('1700000000', 'MIMAROPA Region', 'MIMAROPA'),
  ('0500000000', 'Region V (Bicol Region)', 'Region V (Bicol)'),
  ('0600000000', 'Region VI (Western Visayas)', 'Region VI (Western Visayas)'),
  ('1800000000', 'Negros Island Region (NIR)', 'NIR (Negros Island)'),
  ('0700000000', 'Region VII (Central Visayas)', 'Region VII (Central Visayas)'),
  ('0800000000', 'Region VIII (Eastern Visayas)', 'Region VIII (Eastern Visayas)'),
  ('0900000000', 'Region IX (Zamboanga Peninsula)', 'Region IX (Zamboanga Peninsula)'),
  ('1000000000', 'Region X (Northern Mindanao)', 'Region X (Northern Mindanao)'),
  ('1100000000', 'Region XI (Davao Region)', 'Region XI (Davao)'),
  ('1200000000', 'Region XII (SOCCSKSARGEN)', 'Region XII (SOCCSKSARGEN)'),
  ('1600000000', 'Region XIII (Caraga)', 'Region XIII (Caraga)'),
  ('1900000000', 'Bangsamoro Autonomous Region In Muslim Mindanao (BARMM)', 'BARMM')
on conflict (code) do nothing;

update public.ph_provinces p set psgc_code = v.code, region_code = v.region_code from (values
  ('Abra', '1400100000', '1400000000'),
  ('Agusan del Norte', '1600200000', '1600000000'),
  ('Agusan del Sur', '1600300000', '1600000000'),
  ('Aklan', '0600400000', '0600000000'),
  ('Albay', '0500500000', '0500000000'),
  ('Antique', '0600600000', '0600000000'),
  ('Apayao', '1408100000', '1400000000'),
  ('Aurora', '0307700000', '0300000000'),
  ('Basilan', '1900700000', '1900000000'),
  ('Bataan', '0300800000', '0300000000'),
  ('Batanes', '0200900000', '0200000000'),
  ('Batangas', '0401000000', '0400000000'),
  ('Benguet', '1401100000', '1400000000'),
  ('Biliran', '0807800000', '0800000000'),
  ('Bohol', '0701200000', '0700000000'),
  ('Bukidnon', '1001300000', '1000000000'),
  ('Bulacan', '0301400000', '0300000000'),
  ('Cagayan', '0201500000', '0200000000'),
  ('Camarines Norte', '0501600000', '0500000000'),
  ('Camarines Sur', '0501700000', '0500000000'),
  ('Camiguin', '1001800000', '1000000000'),
  ('Capiz', '0601900000', '0600000000'),
  ('Catanduanes', '0502000000', '0500000000'),
  ('Cavite', '0402100000', '0400000000'),
  ('Cebu', '0702200000', '0700000000'),
  ('Cotabato', '1204700000', '1200000000'),
  ('Davao Occidental', '1108600000', '1100000000'),
  ('Davao Oriental', '1102500000', '1100000000'),
  ('Davao de Oro', '1108200000', '1100000000'),
  ('Davao del Norte', '1102300000', '1100000000'),
  ('Davao del Sur', '1102400000', '1100000000'),
  ('Dinagat Islands', '1608500000', '1600000000'),
  ('Eastern Samar', '0802600000', '0800000000'),
  ('Guimaras', '0607900000', '0600000000'),
  ('Ifugao', '1402700000', '1400000000'),
  ('Ilocos Norte', '0102800000', '0100000000'),
  ('Ilocos Sur', '0102900000', '0100000000'),
  ('Iloilo', '0603000000', '0600000000'),
  ('Isabela', '0203100000', '0200000000'),
  ('Kalinga', '1403200000', '1400000000'),
  ('La Union', '0103300000', '0100000000'),
  ('Laguna', '0403400000', '0400000000'),
  ('Lanao del Norte', '1003500000', '1000000000'),
  ('Lanao del Sur', '1903600000', '1900000000'),
  ('Leyte', '0803700000', '0800000000'),
  ('Maguindanao del Norte', '1908700000', '1900000000'),
  ('Maguindanao del Sur', '1908800000', '1900000000'),
  ('Marinduque', '1704000000', '1700000000'),
  ('Masbate', '0504100000', '0500000000'),
  ('Metro Manila', '1300000000', '1300000000'),
  ('Misamis Occidental', '1004200000', '1000000000'),
  ('Misamis Oriental', '1004300000', '1000000000'),
  ('Mountain Province', '1404400000', '1400000000'),
  ('Negros Occidental', '1804500000', '1800000000'),
  ('Negros Oriental', '1804600000', '1800000000'),
  ('Northern Samar', '0804800000', '0800000000'),
  ('Nueva Ecija', '0304900000', '0300000000'),
  ('Nueva Vizcaya', '0205000000', '0200000000'),
  ('Occidental Mindoro', '1705100000', '1700000000'),
  ('Oriental Mindoro', '1705200000', '1700000000'),
  ('Palawan', '1705300000', '1700000000'),
  ('Pampanga', '0305400000', '0300000000'),
  ('Pangasinan', '0105500000', '0100000000'),
  ('Quezon', '0405600000', '0400000000'),
  ('Quirino', '0205700000', '0200000000'),
  ('Rizal', '0405800000', '0400000000'),
  ('Romblon', '1705900000', '1700000000'),
  ('Samar', '0806000000', '0800000000'),
  ('Sarangani', '1208000000', '1200000000'),
  ('Siquijor', '1806100000', '1800000000'),
  ('Sorsogon', '0506200000', '0500000000'),
  ('South Cotabato', '1206300000', '1200000000'),
  ('Southern Leyte', '0806400000', '0800000000'),
  ('Sultan Kudarat', '1206500000', '1200000000'),
  ('Sulu', '1906600000', '1900000000'),
  ('Surigao del Norte', '1606700000', '1600000000'),
  ('Surigao del Sur', '1606800000', '1600000000'),
  ('Tarlac', '0306900000', '0300000000'),
  ('Tawi-Tawi', '1907000000', '1900000000'),
  ('Zambales', '0307100000', '0300000000'),
  ('Zamboanga Sibugay', '0908300000', '0900000000'),
  ('Zamboanga del Norte', '0907200000', '0900000000'),
  ('Zamboanga del Sur', '0907300000', '0900000000')
) v(name, code, region_code) where p.name = v.name and p.psgc_code is null;

insert into public.ph_cities (code, name, kind, province_code, province, region_code) values
  ('0102801000', 'Adams', 'municipality', '0102800000', 'Ilocos Norte', '0100000000'),
  ('0102802000', 'Bacarra', 'municipality', '0102800000', 'Ilocos Norte', '0100000000'),
  ('0102803000', 'Badoc', 'municipality', '0102800000', 'Ilocos Norte', '0100000000'),
  ('0102804000', 'Bangui', 'municipality', '0102800000', 'Ilocos Norte', '0100000000'),
  ('0102811000', 'Banna', 'municipality', '0102800000', 'Ilocos Norte', '0100000000'),
  ('0102806000', 'Burgos', 'municipality', '0102800000', 'Ilocos Norte', '0100000000'),
  ('0102807000', 'Carasi', 'municipality', '0102800000', 'Ilocos Norte', '0100000000'),
  ('0102805000', 'City of Batac', 'city', '0102800000', 'Ilocos Norte', '0100000000'),
  ('0102812000', 'City of Laoag', 'city', '0102800000', 'Ilocos Norte', '0100000000'),
  ('0102808000', 'Currimao', 'municipality', '0102800000', 'Ilocos Norte', '0100000000'),
  ('0102809000', 'Dingras', 'municipality', '0102800000', 'Ilocos Norte', '0100000000'),
  ('0102810000', 'Dumalneg', 'municipality', '0102800000', 'Ilocos Norte', '0100000000'),
  ('0102813000', 'Marcos', 'municipality', '0102800000', 'Ilocos Norte', '0100000000'),
  ('0102814000', 'Nueva Era', 'municipality', '0102800000', 'Ilocos Norte', '0100000000'),
  ('0102815000', 'Pagudpud', 'municipality', '0102800000', 'Ilocos Norte', '0100000000'),
  ('0102816000', 'Paoay', 'municipality', '0102800000', 'Ilocos Norte', '0100000000'),
  ('0102817000', 'Pasuquin', 'municipality', '0102800000', 'Ilocos Norte', '0100000000'),
  ('0102818000', 'Piddig', 'municipality', '0102800000', 'Ilocos Norte', '0100000000'),
  ('0102819000', 'Pinili', 'municipality', '0102800000', 'Ilocos Norte', '0100000000'),
  ('0102820000', 'San Nicolas', 'municipality', '0102800000', 'Ilocos Norte', '0100000000'),
  ('0102821000', 'Sarrat', 'municipality', '0102800000', 'Ilocos Norte', '0100000000'),
  ('0102822000', 'Solsona', 'municipality', '0102800000', 'Ilocos Norte', '0100000000'),
  ('0102823000', 'Vintar', 'municipality', '0102800000', 'Ilocos Norte', '0100000000'),
  ('0102901000', 'Alilem', 'municipality', '0102900000', 'Ilocos Sur', '0100000000'),
  ('0102902000', 'Banayoyo', 'municipality', '0102900000', 'Ilocos Sur', '0100000000'),
  ('0102903000', 'Bantay', 'municipality', '0102900000', 'Ilocos Sur', '0100000000'),
  ('0102904000', 'Burgos', 'municipality', '0102900000', 'Ilocos Sur', '0100000000'),
  ('0102905000', 'Cabugao', 'municipality', '0102900000', 'Ilocos Sur', '0100000000'),
  ('0102907000', 'Caoayan', 'municipality', '0102900000', 'Ilocos Sur', '0100000000'),
  ('0102908000', 'Cervantes', 'municipality', '0102900000', 'Ilocos Sur', '0100000000'),
  ('0102906000', 'City of Candon', 'city', '0102900000', 'Ilocos Sur', '0100000000'),
  ('0102934000', 'City of Vigan', 'city', '0102900000', 'Ilocos Sur', '0100000000'),
  ('0102909000', 'Galimuyod', 'municipality', '0102900000', 'Ilocos Sur', '0100000000'),
  ('0102910000', 'Gregorio del Pilar', 'municipality', '0102900000', 'Ilocos Sur', '0100000000'),
  ('0102911000', 'Lidlidda', 'municipality', '0102900000', 'Ilocos Sur', '0100000000'),
  ('0102912000', 'Magsingal', 'municipality', '0102900000', 'Ilocos Sur', '0100000000'),
  ('0102913000', 'Nagbukel', 'municipality', '0102900000', 'Ilocos Sur', '0100000000'),
  ('0102914000', 'Narvacan', 'municipality', '0102900000', 'Ilocos Sur', '0100000000'),
  ('0102915000', 'Quirino', 'municipality', '0102900000', 'Ilocos Sur', '0100000000'),
  ('0102916000', 'Salcedo', 'municipality', '0102900000', 'Ilocos Sur', '0100000000'),
  ('0102917000', 'San Emilio', 'municipality', '0102900000', 'Ilocos Sur', '0100000000'),
  ('0102918000', 'San Esteban', 'municipality', '0102900000', 'Ilocos Sur', '0100000000'),
  ('0102919000', 'San Ildefonso', 'municipality', '0102900000', 'Ilocos Sur', '0100000000'),
  ('0102920000', 'San Juan', 'municipality', '0102900000', 'Ilocos Sur', '0100000000'),
  ('0102921000', 'San Vicente', 'municipality', '0102900000', 'Ilocos Sur', '0100000000'),
  ('0102922000', 'Santa', 'municipality', '0102900000', 'Ilocos Sur', '0100000000'),
  ('0102923000', 'Santa Catalina', 'municipality', '0102900000', 'Ilocos Sur', '0100000000'),
  ('0102924000', 'Santa Cruz', 'municipality', '0102900000', 'Ilocos Sur', '0100000000'),
  ('0102925000', 'Santa Lucia', 'municipality', '0102900000', 'Ilocos Sur', '0100000000'),
  ('0102926000', 'Santa Maria', 'municipality', '0102900000', 'Ilocos Sur', '0100000000'),
  ('0102927000', 'Santiago', 'municipality', '0102900000', 'Ilocos Sur', '0100000000'),
  ('0102928000', 'Santo Domingo', 'municipality', '0102900000', 'Ilocos Sur', '0100000000'),
  ('0102929000', 'Sigay', 'municipality', '0102900000', 'Ilocos Sur', '0100000000'),
  ('0102930000', 'Sinait', 'municipality', '0102900000', 'Ilocos Sur', '0100000000'),
  ('0102931000', 'Sugpon', 'municipality', '0102900000', 'Ilocos Sur', '0100000000'),
  ('0102932000', 'Suyo', 'municipality', '0102900000', 'Ilocos Sur', '0100000000'),
  ('0102933000', 'Tagudin', 'municipality', '0102900000', 'Ilocos Sur', '0100000000'),
  ('0103301000', 'Agoo', 'municipality', '0103300000', 'La Union', '0100000000'),
  ('0103302000', 'Aringay', 'municipality', '0103300000', 'La Union', '0100000000'),
  ('0103303000', 'Bacnotan', 'municipality', '0103300000', 'La Union', '0100000000'),
  ('0103304000', 'Bagulin', 'municipality', '0103300000', 'La Union', '0100000000'),
  ('0103305000', 'Balaoan', 'municipality', '0103300000', 'La Union', '0100000000'),
  ('0103306000', 'Bangar', 'municipality', '0103300000', 'La Union', '0100000000'),
  ('0103307000', 'Bauang', 'municipality', '0103300000', 'La Union', '0100000000'),
  ('0103308000', 'Burgos', 'municipality', '0103300000', 'La Union', '0100000000'),
  ('0103309000', 'Caba', 'municipality', '0103300000', 'La Union', '0100000000'),
  ('0103314000', 'City of San Fernando', 'city', '0103300000', 'La Union', '0100000000'),
  ('0103310000', 'Luna', 'municipality', '0103300000', 'La Union', '0100000000'),
  ('0103311000', 'Naguilian', 'municipality', '0103300000', 'La Union', '0100000000'),
  ('0103312000', 'Pugo', 'municipality', '0103300000', 'La Union', '0100000000'),
  ('0103313000', 'Rosario', 'municipality', '0103300000', 'La Union', '0100000000'),
  ('0103315000', 'San Gabriel', 'municipality', '0103300000', 'La Union', '0100000000'),
  ('0103316000', 'San Juan', 'municipality', '0103300000', 'La Union', '0100000000'),
  ('0103317000', 'Santo Tomas', 'municipality', '0103300000', 'La Union', '0100000000'),
  ('0103318000', 'Santol', 'municipality', '0103300000', 'La Union', '0100000000'),
  ('0103319000', 'Sudipen', 'municipality', '0103300000', 'La Union', '0100000000'),
  ('0103320000', 'Tubao', 'municipality', '0103300000', 'La Union', '0100000000'),
  ('0105501000', 'Agno', 'municipality', '0105500000', 'Pangasinan', '0100000000'),
  ('0105502000', 'Aguilar', 'municipality', '0105500000', 'Pangasinan', '0100000000'),
  ('0105504000', 'Alcala', 'municipality', '0105500000', 'Pangasinan', '0100000000'),
  ('0105505000', 'Anda', 'municipality', '0105500000', 'Pangasinan', '0100000000'),
  ('0105506000', 'Asingan', 'municipality', '0105500000', 'Pangasinan', '0100000000'),
  ('0105507000', 'Balungao', 'municipality', '0105500000', 'Pangasinan', '0100000000'),
  ('0105508000', 'Bani', 'municipality', '0105500000', 'Pangasinan', '0100000000'),
  ('0105509000', 'Basista', 'municipality', '0105500000', 'Pangasinan', '0100000000'),
  ('0105510000', 'Bautista', 'municipality', '0105500000', 'Pangasinan', '0100000000'),
  ('0105511000', 'Bayambang', 'municipality', '0105500000', 'Pangasinan', '0100000000'),
  ('0105512000', 'Binalonan', 'municipality', '0105500000', 'Pangasinan', '0100000000'),
  ('0105513000', 'Binmaley', 'municipality', '0105500000', 'Pangasinan', '0100000000'),
  ('0105514000', 'Bolinao', 'municipality', '0105500000', 'Pangasinan', '0100000000'),
  ('0105515000', 'Bugallon', 'municipality', '0105500000', 'Pangasinan', '0100000000'),
  ('0105516000', 'Burgos', 'municipality', '0105500000', 'Pangasinan', '0100000000'),
  ('0105517000', 'Calasiao', 'municipality', '0105500000', 'Pangasinan', '0100000000'),
  ('0105503000', 'City of Alaminos', 'city', '0105500000', 'Pangasinan', '0100000000'),
  ('0105518000', 'City of Dagupan', 'city', '0105500000', 'Pangasinan', '0100000000'),
  ('0105532000', 'City of San Carlos', 'city', '0105500000', 'Pangasinan', '0100000000'),
  ('0105546000', 'City of Urdaneta', 'city', '0105500000', 'Pangasinan', '0100000000'),
  ('0105519000', 'Dasol', 'municipality', '0105500000', 'Pangasinan', '0100000000'),
  ('0105520000', 'Infanta', 'municipality', '0105500000', 'Pangasinan', '0100000000'),
  ('0105521000', 'Labrador', 'municipality', '0105500000', 'Pangasinan', '0100000000'),
  ('0105548000', 'Laoac', 'municipality', '0105500000', 'Pangasinan', '0100000000'),
  ('0105522000', 'Lingayen', 'municipality', '0105500000', 'Pangasinan', '0100000000'),
  ('0105523000', 'Mabini', 'municipality', '0105500000', 'Pangasinan', '0100000000'),
  ('0105524000', 'Malasiqui', 'municipality', '0105500000', 'Pangasinan', '0100000000'),
  ('0105525000', 'Manaoag', 'municipality', '0105500000', 'Pangasinan', '0100000000'),
  ('0105526000', 'Mangaldan', 'municipality', '0105500000', 'Pangasinan', '0100000000'),
  ('0105527000', 'Mangatarem', 'municipality', '0105500000', 'Pangasinan', '0100000000'),
  ('0105528000', 'Mapandan', 'municipality', '0105500000', 'Pangasinan', '0100000000'),
  ('0105529000', 'Natividad', 'municipality', '0105500000', 'Pangasinan', '0100000000'),
  ('0105530000', 'Pozorrubio', 'municipality', '0105500000', 'Pangasinan', '0100000000'),
  ('0105531000', 'Rosales', 'municipality', '0105500000', 'Pangasinan', '0100000000'),
  ('0105533000', 'San Fabian', 'municipality', '0105500000', 'Pangasinan', '0100000000'),
  ('0105534000', 'San Jacinto', 'municipality', '0105500000', 'Pangasinan', '0100000000'),
  ('0105535000', 'San Manuel', 'municipality', '0105500000', 'Pangasinan', '0100000000'),
  ('0105536000', 'San Nicolas', 'municipality', '0105500000', 'Pangasinan', '0100000000'),
  ('0105537000', 'San Quintin', 'municipality', '0105500000', 'Pangasinan', '0100000000'),
  ('0105538000', 'Santa Barbara', 'municipality', '0105500000', 'Pangasinan', '0100000000'),
  ('0105539000', 'Santa Maria', 'municipality', '0105500000', 'Pangasinan', '0100000000'),
  ('0105540000', 'Santo Tomas', 'municipality', '0105500000', 'Pangasinan', '0100000000'),
  ('0105541000', 'Sison', 'municipality', '0105500000', 'Pangasinan', '0100000000'),
  ('0105542000', 'Sual', 'municipality', '0105500000', 'Pangasinan', '0100000000'),
  ('0105543000', 'Tayug', 'municipality', '0105500000', 'Pangasinan', '0100000000'),
  ('0105544000', 'Umingan', 'municipality', '0105500000', 'Pangasinan', '0100000000'),
  ('0105545000', 'Urbiztondo', 'municipality', '0105500000', 'Pangasinan', '0100000000'),
  ('0105547000', 'Villasis', 'municipality', '0105500000', 'Pangasinan', '0100000000'),
  ('0200901000', 'Basco', 'municipality', '0200900000', 'Batanes', '0200000000'),
  ('0200902000', 'Itbayat', 'municipality', '0200900000', 'Batanes', '0200000000'),
  ('0200903000', 'Ivana', 'municipality', '0200900000', 'Batanes', '0200000000'),
  ('0200904000', 'Mahatao', 'municipality', '0200900000', 'Batanes', '0200000000'),
  ('0200905000', 'Sabtang', 'municipality', '0200900000', 'Batanes', '0200000000'),
  ('0200906000', 'Uyugan', 'municipality', '0200900000', 'Batanes', '0200000000'),
  ('0201501000', 'Abulug', 'municipality', '0201500000', 'Cagayan', '0200000000'),
  ('0201502000', 'Alcala', 'municipality', '0201500000', 'Cagayan', '0200000000'),
  ('0201503000', 'Allacapan', 'municipality', '0201500000', 'Cagayan', '0200000000'),
  ('0201504000', 'Amulung', 'municipality', '0201500000', 'Cagayan', '0200000000'),
  ('0201505000', 'Aparri', 'municipality', '0201500000', 'Cagayan', '0200000000'),
  ('0201506000', 'Baggao', 'municipality', '0201500000', 'Cagayan', '0200000000'),
  ('0201507000', 'Ballesteros', 'municipality', '0201500000', 'Cagayan', '0200000000'),
  ('0201508000', 'Buguey', 'municipality', '0201500000', 'Cagayan', '0200000000'),
  ('0201509000', 'Calayan', 'municipality', '0201500000', 'Cagayan', '0200000000'),
  ('0201510000', 'Camalaniugan', 'municipality', '0201500000', 'Cagayan', '0200000000'),
  ('0201511000', 'Claveria', 'municipality', '0201500000', 'Cagayan', '0200000000'),
  ('0201512000', 'Enrile', 'municipality', '0201500000', 'Cagayan', '0200000000'),
  ('0201513000', 'Gattaran', 'municipality', '0201500000', 'Cagayan', '0200000000'),
  ('0201514000', 'Gonzaga', 'municipality', '0201500000', 'Cagayan', '0200000000'),
  ('0201515000', 'Iguig', 'municipality', '0201500000', 'Cagayan', '0200000000'),
  ('0201516000', 'Lal-Lo', 'municipality', '0201500000', 'Cagayan', '0200000000'),
  ('0201517000', 'Lasam', 'municipality', '0201500000', 'Cagayan', '0200000000'),
  ('0201518000', 'Pamplona', 'municipality', '0201500000', 'Cagayan', '0200000000'),
  ('0201519000', 'Peñablanca', 'municipality', '0201500000', 'Cagayan', '0200000000'),
  ('0201520000', 'Piat', 'municipality', '0201500000', 'Cagayan', '0200000000'),
  ('0201521000', 'Rizal', 'municipality', '0201500000', 'Cagayan', '0200000000'),
  ('0201522000', 'Sanchez-Mira', 'municipality', '0201500000', 'Cagayan', '0200000000'),
  ('0201523000', 'Santa Ana', 'municipality', '0201500000', 'Cagayan', '0200000000'),
  ('0201524000', 'Santa Praxedes', 'municipality', '0201500000', 'Cagayan', '0200000000'),
  ('0201525000', 'Santa Teresita', 'municipality', '0201500000', 'Cagayan', '0200000000'),
  ('0201526000', 'Santo Niño', 'municipality', '0201500000', 'Cagayan', '0200000000'),
  ('0201527000', 'Solana', 'municipality', '0201500000', 'Cagayan', '0200000000'),
  ('0201528000', 'Tuao', 'municipality', '0201500000', 'Cagayan', '0200000000'),
  ('0201529000', 'Tuguegarao City', 'city', '0201500000', 'Cagayan', '0200000000'),
  ('0203101000', 'Alicia', 'municipality', '0203100000', 'Isabela', '0200000000'),
  ('0203102000', 'Angadanan', 'municipality', '0203100000', 'Isabela', '0200000000'),
  ('0203103000', 'Aurora', 'municipality', '0203100000', 'Isabela', '0200000000'),
  ('0203104000', 'Benito Soliven', 'municipality', '0203100000', 'Isabela', '0200000000'),
  ('0203105000', 'Burgos', 'municipality', '0203100000', 'Isabela', '0200000000'),
  ('0203106000', 'Cabagan', 'municipality', '0203100000', 'Isabela', '0200000000'),
  ('0203107000', 'Cabatuan', 'municipality', '0203100000', 'Isabela', '0200000000'),
  ('0203108000', 'City of Cauayan', 'city', '0203100000', 'Isabela', '0200000000'),
  ('0203114000', 'City of Ilagan', 'city', '0203100000', 'Isabela', '0200000000'),
  ('0203135000', 'City of Santiago', 'city', '0203100000', 'Isabela', '0200000000'),
  ('0203109000', 'Cordon', 'municipality', '0203100000', 'Isabela', '0200000000'),
  ('0203118000', 'Delfin Albano', 'municipality', '0203100000', 'Isabela', '0200000000'),
  ('0203110000', 'Dinapigue', 'municipality', '0203100000', 'Isabela', '0200000000'),
  ('0203111000', 'Divilacan', 'municipality', '0203100000', 'Isabela', '0200000000'),
  ('0203112000', 'Echague', 'municipality', '0203100000', 'Isabela', '0200000000'),
  ('0203113000', 'Gamu', 'municipality', '0203100000', 'Isabela', '0200000000'),
  ('0203115000', 'Jones', 'municipality', '0203100000', 'Isabela', '0200000000'),
  ('0203116000', 'Luna', 'municipality', '0203100000', 'Isabela', '0200000000'),
  ('0203117000', 'Maconacon', 'municipality', '0203100000', 'Isabela', '0200000000'),
  ('0203119000', 'Mallig', 'municipality', '0203100000', 'Isabela', '0200000000'),
  ('0203120000', 'Naguilian', 'municipality', '0203100000', 'Isabela', '0200000000'),
  ('0203121000', 'Palanan', 'municipality', '0203100000', 'Isabela', '0200000000'),
  ('0203122000', 'Quezon', 'municipality', '0203100000', 'Isabela', '0200000000'),
  ('0203123000', 'Quirino', 'municipality', '0203100000', 'Isabela', '0200000000'),
  ('0203124000', 'Ramon', 'municipality', '0203100000', 'Isabela', '0200000000'),
  ('0203125000', 'Reina Mercedes', 'municipality', '0203100000', 'Isabela', '0200000000'),
  ('0203126000', 'Roxas', 'municipality', '0203100000', 'Isabela', '0200000000'),
  ('0203127000', 'San Agustin', 'municipality', '0203100000', 'Isabela', '0200000000'),
  ('0203128000', 'San Guillermo', 'municipality', '0203100000', 'Isabela', '0200000000'),
  ('0203129000', 'San Isidro', 'municipality', '0203100000', 'Isabela', '0200000000'),
  ('0203130000', 'San Manuel', 'municipality', '0203100000', 'Isabela', '0200000000'),
  ('0203131000', 'San Mariano', 'municipality', '0203100000', 'Isabela', '0200000000'),
  ('0203132000', 'San Mateo', 'municipality', '0203100000', 'Isabela', '0200000000'),
  ('0203133000', 'San Pablo', 'municipality', '0203100000', 'Isabela', '0200000000'),
  ('0203134000', 'Santa Maria', 'municipality', '0203100000', 'Isabela', '0200000000'),
  ('0203136000', 'Santo Tomas', 'municipality', '0203100000', 'Isabela', '0200000000'),
  ('0203137000', 'Tumauini', 'municipality', '0203100000', 'Isabela', '0200000000'),
  ('0205015000', 'Alfonso Castaneda', 'municipality', '0205000000', 'Nueva Vizcaya', '0200000000'),
  ('0205001000', 'Ambaguio', 'municipality', '0205000000', 'Nueva Vizcaya', '0200000000'),
  ('0205002000', 'Aritao', 'municipality', '0205000000', 'Nueva Vizcaya', '0200000000'),
  ('0205003000', 'Bagabag', 'municipality', '0205000000', 'Nueva Vizcaya', '0200000000'),
  ('0205004000', 'Bambang', 'municipality', '0205000000', 'Nueva Vizcaya', '0200000000'),
  ('0205005000', 'Bayombong', 'municipality', '0205000000', 'Nueva Vizcaya', '0200000000'),
  ('0205006000', 'Diadi', 'municipality', '0205000000', 'Nueva Vizcaya', '0200000000'),
  ('0205007000', 'Dupax del Norte', 'municipality', '0205000000', 'Nueva Vizcaya', '0200000000'),
  ('0205008000', 'Dupax del Sur', 'municipality', '0205000000', 'Nueva Vizcaya', '0200000000'),
  ('0205009000', 'Kasibu', 'municipality', '0205000000', 'Nueva Vizcaya', '0200000000'),
  ('0205010000', 'Kayapa', 'municipality', '0205000000', 'Nueva Vizcaya', '0200000000'),
  ('0205011000', 'Quezon', 'municipality', '0205000000', 'Nueva Vizcaya', '0200000000'),
  ('0205012000', 'Santa Fe', 'municipality', '0205000000', 'Nueva Vizcaya', '0200000000'),
  ('0205013000', 'Solano', 'municipality', '0205000000', 'Nueva Vizcaya', '0200000000'),
  ('0205014000', 'Villaverde', 'municipality', '0205000000', 'Nueva Vizcaya', '0200000000'),
  ('0205701000', 'Aglipay', 'municipality', '0205700000', 'Quirino', '0200000000'),
  ('0205702000', 'Cabarroguis', 'municipality', '0205700000', 'Quirino', '0200000000'),
  ('0205703000', 'Diffun', 'municipality', '0205700000', 'Quirino', '0200000000'),
  ('0205704000', 'Maddela', 'municipality', '0205700000', 'Quirino', '0200000000'),
  ('0205706000', 'Nagtipunan', 'municipality', '0205700000', 'Quirino', '0200000000'),
  ('0205705000', 'Saguday', 'municipality', '0205700000', 'Quirino', '0200000000'),
  ('0300801000', 'Abucay', 'municipality', '0300800000', 'Bataan', '0300000000'),
  ('0300802000', 'Bagac', 'municipality', '0300800000', 'Bataan', '0300000000'),
  ('0300803000', 'City of Balanga', 'city', '0300800000', 'Bataan', '0300000000'),
  ('0300804000', 'Dinalupihan', 'municipality', '0300800000', 'Bataan', '0300000000'),
  ('0300805000', 'Hermosa', 'municipality', '0300800000', 'Bataan', '0300000000'),
  ('0300806000', 'Limay', 'municipality', '0300800000', 'Bataan', '0300000000'),
  ('0300807000', 'Mariveles', 'municipality', '0300800000', 'Bataan', '0300000000'),
  ('0300808000', 'Morong', 'municipality', '0300800000', 'Bataan', '0300000000'),
  ('0300809000', 'Orani', 'municipality', '0300800000', 'Bataan', '0300000000'),
  ('0300810000', 'Orion', 'municipality', '0300800000', 'Bataan', '0300000000'),
  ('0300811000', 'Pilar', 'municipality', '0300800000', 'Bataan', '0300000000'),
  ('0300812000', 'Samal', 'municipality', '0300800000', 'Bataan', '0300000000'),
  ('0301401000', 'Angat', 'municipality', '0301400000', 'Bulacan', '0300000000'),
  ('0301402000', 'Balagtas', 'municipality', '0301400000', 'Bulacan', '0300000000'),
  ('0301404000', 'Bocaue', 'municipality', '0301400000', 'Bulacan', '0300000000'),
  ('0301405000', 'Bulacan', 'municipality', '0301400000', 'Bulacan', '0300000000'),
  ('0301406000', 'Bustos', 'municipality', '0301400000', 'Bulacan', '0300000000'),
  ('0301407000', 'Calumpit', 'municipality', '0301400000', 'Bulacan', '0300000000'),
  ('0301403000', 'City of Baliwag', 'city', '0301400000', 'Bulacan', '0300000000'),
  ('0301410000', 'City of Malolos', 'city', '0301400000', 'Bulacan', '0300000000'),
  ('0301412000', 'City of Meycauayan', 'city', '0301400000', 'Bulacan', '0300000000'),
  ('0301420000', 'City of San Jose Del Monte', 'city', '0301400000', 'Bulacan', '0300000000'),
  ('0301424000', 'Doña Remedios Trinidad', 'municipality', '0301400000', 'Bulacan', '0300000000'),
  ('0301408000', 'Guiguinto', 'municipality', '0301400000', 'Bulacan', '0300000000'),
  ('0301409000', 'Hagonoy', 'municipality', '0301400000', 'Bulacan', '0300000000'),
  ('0301411000', 'Marilao', 'municipality', '0301400000', 'Bulacan', '0300000000'),
  ('0301413000', 'Norzagaray', 'municipality', '0301400000', 'Bulacan', '0300000000'),
  ('0301414000', 'Obando', 'municipality', '0301400000', 'Bulacan', '0300000000'),
  ('0301415000', 'Pandi', 'municipality', '0301400000', 'Bulacan', '0300000000'),
  ('0301416000', 'Paombong', 'municipality', '0301400000', 'Bulacan', '0300000000'),
  ('0301417000', 'Plaridel', 'municipality', '0301400000', 'Bulacan', '0300000000'),
  ('0301418000', 'Pulilan', 'municipality', '0301400000', 'Bulacan', '0300000000'),
  ('0301419000', 'San Ildefonso', 'municipality', '0301400000', 'Bulacan', '0300000000'),
  ('0301421000', 'San Miguel', 'municipality', '0301400000', 'Bulacan', '0300000000'),
  ('0301422000', 'San Rafael', 'municipality', '0301400000', 'Bulacan', '0300000000'),
  ('0301423000', 'Santa Maria', 'municipality', '0301400000', 'Bulacan', '0300000000'),
  ('0304901000', 'Aliaga', 'municipality', '0304900000', 'Nueva Ecija', '0300000000'),
  ('0304902000', 'Bongabon', 'municipality', '0304900000', 'Nueva Ecija', '0300000000'),
  ('0304904000', 'Cabiao', 'municipality', '0304900000', 'Nueva Ecija', '0300000000'),
  ('0304905000', 'Carranglan', 'municipality', '0304900000', 'Nueva Ecija', '0300000000'),
  ('0304903000', 'City of Cabanatuan', 'city', '0304900000', 'Nueva Ecija', '0300000000'),
  ('0304908000', 'City of Gapan', 'city', '0304900000', 'Nueva Ecija', '0300000000'),
  ('0304919000', 'City of Palayan', 'city', '0304900000', 'Nueva Ecija', '0300000000'),
  ('0304906000', 'Cuyapo', 'municipality', '0304900000', 'Nueva Ecija', '0300000000'),
  ('0304907000', 'Gabaldon', 'municipality', '0304900000', 'Nueva Ecija', '0300000000'),
  ('0304909000', 'General Mamerto Natividad', 'municipality', '0304900000', 'Nueva Ecija', '0300000000'),
  ('0304910000', 'General Tinio', 'municipality', '0304900000', 'Nueva Ecija', '0300000000'),
  ('0304911000', 'Guimba', 'municipality', '0304900000', 'Nueva Ecija', '0300000000'),
  ('0304912000', 'Jaen', 'municipality', '0304900000', 'Nueva Ecija', '0300000000'),
  ('0304913000', 'Laur', 'municipality', '0304900000', 'Nueva Ecija', '0300000000'),
  ('0304914000', 'Licab', 'municipality', '0304900000', 'Nueva Ecija', '0300000000'),
  ('0304915000', 'Llanera', 'municipality', '0304900000', 'Nueva Ecija', '0300000000'),
  ('0304916000', 'Lupao', 'municipality', '0304900000', 'Nueva Ecija', '0300000000'),
  ('0304918000', 'Nampicuan', 'municipality', '0304900000', 'Nueva Ecija', '0300000000'),
  ('0304920000', 'Pantabangan', 'municipality', '0304900000', 'Nueva Ecija', '0300000000'),
  ('0304921000', 'Peñaranda', 'municipality', '0304900000', 'Nueva Ecija', '0300000000'),
  ('0304922000', 'Quezon', 'municipality', '0304900000', 'Nueva Ecija', '0300000000'),
  ('0304923000', 'Rizal', 'municipality', '0304900000', 'Nueva Ecija', '0300000000'),
  ('0304924000', 'San Antonio', 'municipality', '0304900000', 'Nueva Ecija', '0300000000'),
  ('0304925000', 'San Isidro', 'municipality', '0304900000', 'Nueva Ecija', '0300000000'),
  ('0304926000', 'San Jose City', 'city', '0304900000', 'Nueva Ecija', '0300000000'),
  ('0304927000', 'San Leonardo', 'municipality', '0304900000', 'Nueva Ecija', '0300000000'),
  ('0304928000', 'Santa Rosa', 'municipality', '0304900000', 'Nueva Ecija', '0300000000'),
  ('0304929000', 'Santo Domingo', 'municipality', '0304900000', 'Nueva Ecija', '0300000000'),
  ('0304917000', 'Science City of Muñoz', 'city', '0304900000', 'Nueva Ecija', '0300000000'),
  ('0304930000', 'Talavera', 'municipality', '0304900000', 'Nueva Ecija', '0300000000'),
  ('0304931000', 'Talugtug', 'municipality', '0304900000', 'Nueva Ecija', '0300000000'),
  ('0304932000', 'Zaragoza', 'municipality', '0304900000', 'Nueva Ecija', '0300000000'),
  ('0305402000', 'Apalit', 'municipality', '0305400000', 'Pampanga', '0300000000'),
  ('0305403000', 'Arayat', 'municipality', '0305400000', 'Pampanga', '0300000000'),
  ('0305404000', 'Bacolor', 'municipality', '0305400000', 'Pampanga', '0300000000'),
  ('0305405000', 'Candaba', 'municipality', '0305400000', 'Pampanga', '0300000000'),
  ('0330100000', 'City of Angeles', 'city', '0305400000', 'Pampanga', '0300000000'),
  ('0305416000', 'City of San Fernando', 'city', '0305400000', 'Pampanga', '0300000000'),
  ('0305406000', 'Floridablanca', 'municipality', '0305400000', 'Pampanga', '0300000000'),
  ('0305407000', 'Guagua', 'municipality', '0305400000', 'Pampanga', '0300000000'),
  ('0305408000', 'Lubao', 'municipality', '0305400000', 'Pampanga', '0300000000'),
  ('0305409000', 'Mabalacat City', 'city', '0305400000', 'Pampanga', '0300000000'),
  ('0305410000', 'Macabebe', 'municipality', '0305400000', 'Pampanga', '0300000000'),
  ('0305411000', 'Magalang', 'municipality', '0305400000', 'Pampanga', '0300000000'),
  ('0305412000', 'Masantol', 'municipality', '0305400000', 'Pampanga', '0300000000'),
  ('0305413000', 'Mexico', 'municipality', '0305400000', 'Pampanga', '0300000000'),
  ('0305414000', 'Minalin', 'municipality', '0305400000', 'Pampanga', '0300000000'),
  ('0305415000', 'Porac', 'municipality', '0305400000', 'Pampanga', '0300000000'),
  ('0305417000', 'San Luis', 'municipality', '0305400000', 'Pampanga', '0300000000'),
  ('0305418000', 'San Simon', 'municipality', '0305400000', 'Pampanga', '0300000000'),
  ('0305419000', 'Santa Ana', 'municipality', '0305400000', 'Pampanga', '0300000000'),
  ('0305420000', 'Santa Rita', 'municipality', '0305400000', 'Pampanga', '0300000000'),
  ('0305422000', 'Sasmuan', 'municipality', '0305400000', 'Pampanga', '0300000000'),
  ('0305421000', 'Sto. Tomas', 'municipality', '0305400000', 'Pampanga', '0300000000'),
  ('0306901000', 'Anao', 'municipality', '0306900000', 'Tarlac', '0300000000'),
  ('0306902000', 'Bamban', 'municipality', '0306900000', 'Tarlac', '0300000000'),
  ('0306903000', 'Camiling', 'municipality', '0306900000', 'Tarlac', '0300000000'),
  ('0306904000', 'Capas', 'municipality', '0306900000', 'Tarlac', '0300000000'),
  ('0306916000', 'City of Tarlac', 'city', '0306900000', 'Tarlac', '0300000000'),
  ('0306905000', 'Concepcion', 'municipality', '0306900000', 'Tarlac', '0300000000'),
  ('0306906000', 'Gerona', 'municipality', '0306900000', 'Tarlac', '0300000000'),
  ('0306907000', 'La Paz', 'municipality', '0306900000', 'Tarlac', '0300000000'),
  ('0306908000', 'Mayantoc', 'municipality', '0306900000', 'Tarlac', '0300000000'),
  ('0306909000', 'Moncada', 'municipality', '0306900000', 'Tarlac', '0300000000'),
  ('0306910000', 'Paniqui', 'municipality', '0306900000', 'Tarlac', '0300000000'),
  ('0306911000', 'Pura', 'municipality', '0306900000', 'Tarlac', '0300000000'),
  ('0306912000', 'Ramos', 'municipality', '0306900000', 'Tarlac', '0300000000'),
  ('0306913000', 'San Clemente', 'municipality', '0306900000', 'Tarlac', '0300000000'),
  ('0306918000', 'San Jose', 'municipality', '0306900000', 'Tarlac', '0300000000'),
  ('0306914000', 'San Manuel', 'municipality', '0306900000', 'Tarlac', '0300000000'),
  ('0306915000', 'Santa Ignacia', 'municipality', '0306900000', 'Tarlac', '0300000000'),
  ('0306917000', 'Victoria', 'municipality', '0306900000', 'Tarlac', '0300000000'),
  ('0307101000', 'Botolan', 'municipality', '0307100000', 'Zambales', '0300000000'),
  ('0307102000', 'Cabangan', 'municipality', '0307100000', 'Zambales', '0300000000'),
  ('0307103000', 'Candelaria', 'municipality', '0307100000', 'Zambales', '0300000000'),
  ('0307104000', 'Castillejos', 'municipality', '0307100000', 'Zambales', '0300000000'),
  ('0331400000', 'City of Olongapo', 'city', '0307100000', 'Zambales', '0300000000'),
  ('0307105000', 'Iba', 'municipality', '0307100000', 'Zambales', '0300000000'),
  ('0307106000', 'Masinloc', 'municipality', '0307100000', 'Zambales', '0300000000'),
  ('0307108000', 'Palauig', 'municipality', '0307100000', 'Zambales', '0300000000'),
  ('0307109000', 'San Antonio', 'municipality', '0307100000', 'Zambales', '0300000000'),
  ('0307110000', 'San Felipe', 'municipality', '0307100000', 'Zambales', '0300000000'),
  ('0307111000', 'San Marcelino', 'municipality', '0307100000', 'Zambales', '0300000000'),
  ('0307112000', 'San Narciso', 'municipality', '0307100000', 'Zambales', '0300000000'),
  ('0307113000', 'Santa Cruz', 'municipality', '0307100000', 'Zambales', '0300000000'),
  ('0307114000', 'Subic', 'municipality', '0307100000', 'Zambales', '0300000000'),
  ('0307701000', 'Baler', 'municipality', '0307700000', 'Aurora', '0300000000'),
  ('0307702000', 'Casiguran', 'municipality', '0307700000', 'Aurora', '0300000000'),
  ('0307703000', 'Dilasag', 'municipality', '0307700000', 'Aurora', '0300000000'),
  ('0307704000', 'Dinalungan', 'municipality', '0307700000', 'Aurora', '0300000000'),
  ('0307705000', 'Dingalan', 'municipality', '0307700000', 'Aurora', '0300000000'),
  ('0307706000', 'Dipaculao', 'municipality', '0307700000', 'Aurora', '0300000000'),
  ('0307707000', 'Maria Aurora', 'municipality', '0307700000', 'Aurora', '0300000000'),
  ('0307708000', 'San Luis', 'municipality', '0307700000', 'Aurora', '0300000000'),
  ('0401001000', 'Agoncillo', 'municipality', '0401000000', 'Batangas', '0400000000'),
  ('0401002000', 'Alitagtag', 'municipality', '0401000000', 'Batangas', '0400000000'),
  ('0401003000', 'Balayan', 'municipality', '0401000000', 'Batangas', '0400000000'),
  ('0401004000', 'Balete', 'municipality', '0401000000', 'Batangas', '0400000000'),
  ('0401005000', 'Batangas City', 'city', '0401000000', 'Batangas', '0400000000'),
  ('0401006000', 'Bauan', 'municipality', '0401000000', 'Batangas', '0400000000'),
  ('0401008000', 'Calatagan', 'municipality', '0401000000', 'Batangas', '0400000000'),
  ('0401007000', 'City of Calaca', 'city', '0401000000', 'Batangas', '0400000000'),
  ('0401014000', 'City of Lipa', 'city', '0401000000', 'Batangas', '0400000000'),
  ('0401028000', 'City of Sto. Tomas', 'city', '0401000000', 'Batangas', '0400000000'),
  ('0401031000', 'City of Tanauan', 'city', '0401000000', 'Batangas', '0400000000'),
  ('0401009000', 'Cuenca', 'municipality', '0401000000', 'Batangas', '0400000000'),
  ('0401010000', 'Ibaan', 'municipality', '0401000000', 'Batangas', '0400000000'),
  ('0401011000', 'Laurel', 'municipality', '0401000000', 'Batangas', '0400000000'),
  ('0401012000', 'Lemery', 'municipality', '0401000000', 'Batangas', '0400000000'),
  ('0401013000', 'Lian', 'municipality', '0401000000', 'Batangas', '0400000000'),
  ('0401015000', 'Lobo', 'municipality', '0401000000', 'Batangas', '0400000000'),
  ('0401016000', 'Mabini', 'municipality', '0401000000', 'Batangas', '0400000000'),
  ('0401017000', 'Malvar', 'municipality', '0401000000', 'Batangas', '0400000000'),
  ('0401018000', 'Mataasnakahoy', 'municipality', '0401000000', 'Batangas', '0400000000'),
  ('0401019000', 'Nasugbu', 'municipality', '0401000000', 'Batangas', '0400000000'),
  ('0401020000', 'Padre Garcia', 'municipality', '0401000000', 'Batangas', '0400000000'),
  ('0401021000', 'Rosario', 'municipality', '0401000000', 'Batangas', '0400000000'),
  ('0401022000', 'San Jose', 'municipality', '0401000000', 'Batangas', '0400000000'),
  ('0401023000', 'San Juan', 'municipality', '0401000000', 'Batangas', '0400000000'),
  ('0401024000', 'San Luis', 'municipality', '0401000000', 'Batangas', '0400000000'),
  ('0401025000', 'San Nicolas', 'municipality', '0401000000', 'Batangas', '0400000000'),
  ('0401026000', 'San Pascual', 'municipality', '0401000000', 'Batangas', '0400000000'),
  ('0401027000', 'Santa Teresita', 'municipality', '0401000000', 'Batangas', '0400000000'),
  ('0401029000', 'Taal', 'municipality', '0401000000', 'Batangas', '0400000000'),
  ('0401030000', 'Talisay', 'municipality', '0401000000', 'Batangas', '0400000000'),
  ('0401032000', 'Taysan', 'municipality', '0401000000', 'Batangas', '0400000000'),
  ('0401033000', 'Tingloy', 'municipality', '0401000000', 'Batangas', '0400000000'),
  ('0401034000', 'Tuy', 'municipality', '0401000000', 'Batangas', '0400000000'),
  ('0402101000', 'Alfonso', 'municipality', '0402100000', 'Cavite', '0400000000'),
  ('0402102000', 'Amadeo', 'municipality', '0402100000', 'Cavite', '0400000000'),
  ('0402103000', 'City of Bacoor', 'city', '0402100000', 'Cavite', '0400000000'),
  ('0402104000', 'City of Carmona', 'city', '0402100000', 'Cavite', '0400000000'),
  ('0402105000', 'City of Cavite', 'city', '0402100000', 'Cavite', '0400000000'),
  ('0402106000', 'City of Dasmariñas', 'city', '0402100000', 'Cavite', '0400000000'),
  ('0402108000', 'City of General Trias', 'city', '0402100000', 'Cavite', '0400000000'),
  ('0402109000', 'City of Imus', 'city', '0402100000', 'Cavite', '0400000000'),
  ('0402119000', 'City of Tagaytay', 'city', '0402100000', 'Cavite', '0400000000'),
  ('0402122000', 'City of Trece Martires', 'city', '0402100000', 'Cavite', '0400000000'),
  ('0402123000', 'Gen. Mariano Alvarez', 'municipality', '0402100000', 'Cavite', '0400000000'),
  ('0402107000', 'General Emilio Aguinaldo', 'municipality', '0402100000', 'Cavite', '0400000000'),
  ('0402110000', 'Indang', 'municipality', '0402100000', 'Cavite', '0400000000'),
  ('0402111000', 'Kawit', 'municipality', '0402100000', 'Cavite', '0400000000'),
  ('0402112000', 'Magallanes', 'municipality', '0402100000', 'Cavite', '0400000000'),
  ('0402113000', 'Maragondon', 'municipality', '0402100000', 'Cavite', '0400000000'),
  ('0402114000', 'Mendez', 'municipality', '0402100000', 'Cavite', '0400000000'),
  ('0402115000', 'Naic', 'municipality', '0402100000', 'Cavite', '0400000000'),
  ('0402116000', 'Noveleta', 'municipality', '0402100000', 'Cavite', '0400000000'),
  ('0402117000', 'Rosario', 'municipality', '0402100000', 'Cavite', '0400000000'),
  ('0402118000', 'Silang', 'municipality', '0402100000', 'Cavite', '0400000000'),
  ('0402120000', 'Tanza', 'municipality', '0402100000', 'Cavite', '0400000000'),
  ('0402121000', 'Ternate', 'municipality', '0402100000', 'Cavite', '0400000000'),
  ('0403401000', 'Alaminos', 'municipality', '0403400000', 'Laguna', '0400000000'),
  ('0403402000', 'Bay', 'municipality', '0403400000', 'Laguna', '0400000000'),
  ('0403406000', 'Calauan', 'municipality', '0403400000', 'Laguna', '0400000000'),
  ('0403407000', 'Cavinti', 'municipality', '0403400000', 'Laguna', '0400000000'),
  ('0403403000', 'City of Biñan', 'city', '0403400000', 'Laguna', '0400000000'),
  ('0403404000', 'City of Cabuyao', 'city', '0403400000', 'Laguna', '0400000000'),
  ('0403405000', 'City of Calamba', 'city', '0403400000', 'Laguna', '0400000000'),
  ('0403424000', 'City of San Pablo', 'city', '0403400000', 'Laguna', '0400000000'),
  ('0403425000', 'City of San Pedro', 'city', '0403400000', 'Laguna', '0400000000'),
  ('0403428000', 'City of Santa Rosa', 'city', '0403400000', 'Laguna', '0400000000'),
  ('0403408000', 'Famy', 'municipality', '0403400000', 'Laguna', '0400000000'),
  ('0403409000', 'Kalayaan', 'municipality', '0403400000', 'Laguna', '0400000000'),
  ('0403410000', 'Liliw', 'municipality', '0403400000', 'Laguna', '0400000000'),
  ('0403411000', 'Los Baños', 'municipality', '0403400000', 'Laguna', '0400000000'),
  ('0403412000', 'Luisiana', 'municipality', '0403400000', 'Laguna', '0400000000'),
  ('0403413000', 'Lumban', 'municipality', '0403400000', 'Laguna', '0400000000'),
  ('0403414000', 'Mabitac', 'municipality', '0403400000', 'Laguna', '0400000000'),
  ('0403415000', 'Magdalena', 'municipality', '0403400000', 'Laguna', '0400000000'),
  ('0403416000', 'Majayjay', 'municipality', '0403400000', 'Laguna', '0400000000'),
  ('0403417000', 'Nagcarlan', 'municipality', '0403400000', 'Laguna', '0400000000'),
  ('0403418000', 'Paete', 'municipality', '0403400000', 'Laguna', '0400000000'),
  ('0403419000', 'Pagsanjan', 'municipality', '0403400000', 'Laguna', '0400000000'),
  ('0403420000', 'Pakil', 'municipality', '0403400000', 'Laguna', '0400000000'),
  ('0403421000', 'Pangil', 'municipality', '0403400000', 'Laguna', '0400000000'),
  ('0403422000', 'Pila', 'municipality', '0403400000', 'Laguna', '0400000000'),
  ('0403423000', 'Rizal', 'municipality', '0403400000', 'Laguna', '0400000000'),
  ('0403426000', 'Santa Cruz', 'municipality', '0403400000', 'Laguna', '0400000000'),
  ('0403427000', 'Santa Maria', 'municipality', '0403400000', 'Laguna', '0400000000'),
  ('0403429000', 'Siniloan', 'municipality', '0403400000', 'Laguna', '0400000000'),
  ('0403430000', 'Victoria', 'municipality', '0403400000', 'Laguna', '0400000000'),
  ('0405601000', 'Agdangan', 'municipality', '0405600000', 'Quezon', '0400000000'),
  ('0405602000', 'Alabat', 'municipality', '0405600000', 'Quezon', '0400000000'),
  ('0405603000', 'Atimonan', 'municipality', '0405600000', 'Quezon', '0400000000'),
  ('0405605000', 'Buenavista', 'municipality', '0405600000', 'Quezon', '0400000000'),
  ('0405606000', 'Burdeos', 'municipality', '0405600000', 'Quezon', '0400000000'),
  ('0405607000', 'Calauag', 'municipality', '0405600000', 'Quezon', '0400000000'),
  ('0405608000', 'Candelaria', 'municipality', '0405600000', 'Quezon', '0400000000'),
  ('0405610000', 'Catanauan', 'municipality', '0405600000', 'Quezon', '0400000000'),
  ('0431200000', 'City of Lucena', 'city', '0405600000', 'Quezon', '0400000000'),
  ('0405647000', 'City of Tayabas', 'city', '0405600000', 'Quezon', '0400000000'),
  ('0405615000', 'Dolores', 'municipality', '0405600000', 'Quezon', '0400000000'),
  ('0405616000', 'General Luna', 'municipality', '0405600000', 'Quezon', '0400000000'),
  ('0405617000', 'General Nakar', 'municipality', '0405600000', 'Quezon', '0400000000'),
  ('0405618000', 'Guinayangan', 'municipality', '0405600000', 'Quezon', '0400000000'),
  ('0405619000', 'Gumaca', 'municipality', '0405600000', 'Quezon', '0400000000'),
  ('0405620000', 'Infanta', 'municipality', '0405600000', 'Quezon', '0400000000'),
  ('0405621000', 'Jomalig', 'municipality', '0405600000', 'Quezon', '0400000000'),
  ('0405622000', 'Lopez', 'municipality', '0405600000', 'Quezon', '0400000000'),
  ('0405623000', 'Lucban', 'municipality', '0405600000', 'Quezon', '0400000000'),
  ('0405625000', 'Macalelon', 'municipality', '0405600000', 'Quezon', '0400000000'),
  ('0405627000', 'Mauban', 'municipality', '0405600000', 'Quezon', '0400000000'),
  ('0405628000', 'Mulanay', 'municipality', '0405600000', 'Quezon', '0400000000'),
  ('0405629000', 'Padre Burgos', 'municipality', '0405600000', 'Quezon', '0400000000'),
  ('0405630000', 'Pagbilao', 'municipality', '0405600000', 'Quezon', '0400000000'),
  ('0405631000', 'Panukulan', 'municipality', '0405600000', 'Quezon', '0400000000'),
  ('0405632000', 'Patnanungan', 'municipality', '0405600000', 'Quezon', '0400000000'),
  ('0405633000', 'Perez', 'municipality', '0405600000', 'Quezon', '0400000000'),
  ('0405634000', 'Pitogo', 'municipality', '0405600000', 'Quezon', '0400000000'),
  ('0405635000', 'Plaridel', 'municipality', '0405600000', 'Quezon', '0400000000'),
  ('0405636000', 'Polillo', 'municipality', '0405600000', 'Quezon', '0400000000'),
  ('0405637000', 'Quezon', 'municipality', '0405600000', 'Quezon', '0400000000'),
  ('0405638000', 'Real', 'municipality', '0405600000', 'Quezon', '0400000000'),
  ('0405639000', 'Sampaloc', 'municipality', '0405600000', 'Quezon', '0400000000'),
  ('0405640000', 'San Andres', 'municipality', '0405600000', 'Quezon', '0400000000'),
  ('0405641000', 'San Antonio', 'municipality', '0405600000', 'Quezon', '0400000000'),
  ('0405642000', 'San Francisco', 'municipality', '0405600000', 'Quezon', '0400000000'),
  ('0405644000', 'San Narciso', 'municipality', '0405600000', 'Quezon', '0400000000'),
  ('0405645000', 'Sariaya', 'municipality', '0405600000', 'Quezon', '0400000000'),
  ('0405646000', 'Tagkawayan', 'municipality', '0405600000', 'Quezon', '0400000000'),
  ('0405648000', 'Tiaong', 'municipality', '0405600000', 'Quezon', '0400000000'),
  ('0405649000', 'Unisan', 'municipality', '0405600000', 'Quezon', '0400000000'),
  ('0405801000', 'Angono', 'municipality', '0405800000', 'Rizal', '0400000000'),
  ('0405803000', 'Baras', 'municipality', '0405800000', 'Rizal', '0400000000'),
  ('0405804000', 'Binangonan', 'municipality', '0405800000', 'Rizal', '0400000000'),
  ('0405805000', 'Cainta', 'municipality', '0405800000', 'Rizal', '0400000000'),
  ('0405806000', 'Cardona', 'municipality', '0405800000', 'Rizal', '0400000000'),
  ('0405802000', 'City of Antipolo', 'city', '0405800000', 'Rizal', '0400000000'),
  ('0405807000', 'Jala-Jala', 'municipality', '0405800000', 'Rizal', '0400000000'),
  ('0405809000', 'Morong', 'municipality', '0405800000', 'Rizal', '0400000000'),
  ('0405810000', 'Pililla', 'municipality', '0405800000', 'Rizal', '0400000000'),
  ('0405808000', 'Rodriguez', 'municipality', '0405800000', 'Rizal', '0400000000'),
  ('0405811000', 'San Mateo', 'municipality', '0405800000', 'Rizal', '0400000000'),
  ('0405812000', 'Tanay', 'municipality', '0405800000', 'Rizal', '0400000000'),
  ('0405813000', 'Taytay', 'municipality', '0405800000', 'Rizal', '0400000000'),
  ('0405814000', 'Teresa', 'municipality', '0405800000', 'Rizal', '0400000000'),
  ('0500501000', 'Bacacay', 'municipality', '0500500000', 'Albay', '0500000000'),
  ('0500502000', 'Camalig', 'municipality', '0500500000', 'Albay', '0500000000'),
  ('0500506000', 'City of Legazpi', 'city', '0500500000', 'Albay', '0500000000'),
  ('0500508000', 'City of Ligao', 'city', '0500500000', 'Albay', '0500000000'),
  ('0500517000', 'City of Tabaco', 'city', '0500500000', 'Albay', '0500000000'),
  ('0500503000', 'Daraga', 'municipality', '0500500000', 'Albay', '0500000000'),
  ('0500504000', 'Guinobatan', 'municipality', '0500500000', 'Albay', '0500000000'),
  ('0500505000', 'Jovellar', 'municipality', '0500500000', 'Albay', '0500000000'),
  ('0500507000', 'Libon', 'municipality', '0500500000', 'Albay', '0500000000'),
  ('0500509000', 'Malilipot', 'municipality', '0500500000', 'Albay', '0500000000'),
  ('0500510000', 'Malinao', 'municipality', '0500500000', 'Albay', '0500000000'),
  ('0500511000', 'Manito', 'municipality', '0500500000', 'Albay', '0500000000'),
  ('0500512000', 'Oas', 'municipality', '0500500000', 'Albay', '0500000000'),
  ('0500513000', 'Pio Duran', 'municipality', '0500500000', 'Albay', '0500000000'),
  ('0500514000', 'Polangui', 'municipality', '0500500000', 'Albay', '0500000000'),
  ('0500515000', 'Rapu-Rapu', 'municipality', '0500500000', 'Albay', '0500000000'),
  ('0500516000', 'Santo Domingo', 'municipality', '0500500000', 'Albay', '0500000000'),
  ('0500518000', 'Tiwi', 'municipality', '0500500000', 'Albay', '0500000000'),
  ('0501601000', 'Basud', 'municipality', '0501600000', 'Camarines Norte', '0500000000'),
  ('0501602000', 'Capalonga', 'municipality', '0501600000', 'Camarines Norte', '0500000000'),
  ('0501603000', 'Daet', 'municipality', '0501600000', 'Camarines Norte', '0500000000'),
  ('0501605000', 'Jose Panganiban', 'municipality', '0501600000', 'Camarines Norte', '0500000000'),
  ('0501606000', 'Labo', 'municipality', '0501600000', 'Camarines Norte', '0500000000'),
  ('0501607000', 'Mercedes', 'municipality', '0501600000', 'Camarines Norte', '0500000000'),
  ('0501608000', 'Paracale', 'municipality', '0501600000', 'Camarines Norte', '0500000000'),
  ('0501604000', 'San Lorenzo Ruiz', 'municipality', '0501600000', 'Camarines Norte', '0500000000'),
  ('0501609000', 'San Vicente', 'municipality', '0501600000', 'Camarines Norte', '0500000000'),
  ('0501610000', 'Santa Elena', 'municipality', '0501600000', 'Camarines Norte', '0500000000'),
  ('0501611000', 'Talisay', 'municipality', '0501600000', 'Camarines Norte', '0500000000'),
  ('0501612000', 'Vinzons', 'municipality', '0501600000', 'Camarines Norte', '0500000000'),
  ('0501701000', 'Baao', 'municipality', '0501700000', 'Camarines Sur', '0500000000'),
  ('0501702000', 'Balatan', 'municipality', '0501700000', 'Camarines Sur', '0500000000'),
  ('0501703000', 'Bato', 'municipality', '0501700000', 'Camarines Sur', '0500000000'),
  ('0501704000', 'Bombon', 'municipality', '0501700000', 'Camarines Sur', '0500000000'),
  ('0501705000', 'Buhi', 'municipality', '0501700000', 'Camarines Sur', '0500000000'),
  ('0501706000', 'Bula', 'municipality', '0501700000', 'Camarines Sur', '0500000000'),
  ('0501707000', 'Cabusao', 'municipality', '0501700000', 'Camarines Sur', '0500000000'),
  ('0501708000', 'Calabanga', 'municipality', '0501700000', 'Camarines Sur', '0500000000'),
  ('0501709000', 'Camaligan', 'municipality', '0501700000', 'Camarines Sur', '0500000000'),
  ('0501710000', 'Canaman', 'municipality', '0501700000', 'Camarines Sur', '0500000000'),
  ('0501711000', 'Caramoan', 'municipality', '0501700000', 'Camarines Sur', '0500000000'),
  ('0501716000', 'City of Iriga', 'city', '0501700000', 'Camarines Sur', '0500000000'),
  ('0501724000', 'City of Naga', 'city', '0501700000', 'Camarines Sur', '0500000000'),
  ('0501712000', 'Del Gallego', 'municipality', '0501700000', 'Camarines Sur', '0500000000'),
  ('0501713000', 'Gainza', 'municipality', '0501700000', 'Camarines Sur', '0500000000'),
  ('0501714000', 'Garchitorena', 'municipality', '0501700000', 'Camarines Sur', '0500000000'),
  ('0501715000', 'Goa', 'municipality', '0501700000', 'Camarines Sur', '0500000000'),
  ('0501717000', 'Lagonoy', 'municipality', '0501700000', 'Camarines Sur', '0500000000'),
  ('0501718000', 'Libmanan', 'municipality', '0501700000', 'Camarines Sur', '0500000000'),
  ('0501719000', 'Lupi', 'municipality', '0501700000', 'Camarines Sur', '0500000000'),
  ('0501720000', 'Magarao', 'municipality', '0501700000', 'Camarines Sur', '0500000000'),
  ('0501721000', 'Milaor', 'municipality', '0501700000', 'Camarines Sur', '0500000000'),
  ('0501722000', 'Minalabac', 'municipality', '0501700000', 'Camarines Sur', '0500000000'),
  ('0501723000', 'Nabua', 'municipality', '0501700000', 'Camarines Sur', '0500000000'),
  ('0501725000', 'Ocampo', 'municipality', '0501700000', 'Camarines Sur', '0500000000'),
  ('0501726000', 'Pamplona', 'municipality', '0501700000', 'Camarines Sur', '0500000000'),
  ('0501727000', 'Pasacao', 'municipality', '0501700000', 'Camarines Sur', '0500000000'),
  ('0501728000', 'Pili', 'municipality', '0501700000', 'Camarines Sur', '0500000000'),
  ('0501729000', 'Presentacion', 'municipality', '0501700000', 'Camarines Sur', '0500000000'),
  ('0501730000', 'Ragay', 'municipality', '0501700000', 'Camarines Sur', '0500000000'),
  ('0501731000', 'Sagñay', 'municipality', '0501700000', 'Camarines Sur', '0500000000'),
  ('0501732000', 'San Fernando', 'municipality', '0501700000', 'Camarines Sur', '0500000000'),
  ('0501733000', 'San Jose', 'municipality', '0501700000', 'Camarines Sur', '0500000000'),
  ('0501734000', 'Sipocot', 'municipality', '0501700000', 'Camarines Sur', '0500000000'),
  ('0501735000', 'Siruma', 'municipality', '0501700000', 'Camarines Sur', '0500000000'),
  ('0501736000', 'Tigaon', 'municipality', '0501700000', 'Camarines Sur', '0500000000'),
  ('0501737000', 'Tinambac', 'municipality', '0501700000', 'Camarines Sur', '0500000000'),
  ('0502001000', 'Bagamanoc', 'municipality', '0502000000', 'Catanduanes', '0500000000'),
  ('0502002000', 'Baras', 'municipality', '0502000000', 'Catanduanes', '0500000000'),
  ('0502003000', 'Bato', 'municipality', '0502000000', 'Catanduanes', '0500000000'),
  ('0502004000', 'Caramoran', 'municipality', '0502000000', 'Catanduanes', '0500000000'),
  ('0502005000', 'Gigmoto', 'municipality', '0502000000', 'Catanduanes', '0500000000'),
  ('0502006000', 'Pandan', 'municipality', '0502000000', 'Catanduanes', '0500000000'),
  ('0502007000', 'Panganiban', 'municipality', '0502000000', 'Catanduanes', '0500000000'),
  ('0502008000', 'San Andres', 'municipality', '0502000000', 'Catanduanes', '0500000000'),
  ('0502009000', 'San Miguel', 'municipality', '0502000000', 'Catanduanes', '0500000000'),
  ('0502010000', 'Viga', 'municipality', '0502000000', 'Catanduanes', '0500000000'),
  ('0502011000', 'Virac', 'municipality', '0502000000', 'Catanduanes', '0500000000'),
  ('0504101000', 'Aroroy', 'municipality', '0504100000', 'Masbate', '0500000000'),
  ('0504102000', 'Baleno', 'municipality', '0504100000', 'Masbate', '0500000000'),
  ('0504103000', 'Balud', 'municipality', '0504100000', 'Masbate', '0500000000'),
  ('0504104000', 'Batuan', 'municipality', '0504100000', 'Masbate', '0500000000'),
  ('0504105000', 'Cataingan', 'municipality', '0504100000', 'Masbate', '0500000000'),
  ('0504106000', 'Cawayan', 'municipality', '0504100000', 'Masbate', '0500000000'),
  ('0504111000', 'City of Masbate', 'city', '0504100000', 'Masbate', '0500000000'),
  ('0504107000', 'Claveria', 'municipality', '0504100000', 'Masbate', '0500000000'),
  ('0504108000', 'Dimasalang', 'municipality', '0504100000', 'Masbate', '0500000000'),
  ('0504109000', 'Esperanza', 'municipality', '0504100000', 'Masbate', '0500000000'),
  ('0504110000', 'Mandaon', 'municipality', '0504100000', 'Masbate', '0500000000'),
  ('0504112000', 'Milagros', 'municipality', '0504100000', 'Masbate', '0500000000'),
  ('0504113000', 'Mobo', 'municipality', '0504100000', 'Masbate', '0500000000'),
  ('0504114000', 'Monreal', 'municipality', '0504100000', 'Masbate', '0500000000'),
  ('0504115000', 'Palanas', 'municipality', '0504100000', 'Masbate', '0500000000'),
  ('0504116000', 'Pio V. Corpus', 'municipality', '0504100000', 'Masbate', '0500000000'),
  ('0504117000', 'Placer', 'municipality', '0504100000', 'Masbate', '0500000000'),
  ('0504118000', 'San Fernando', 'municipality', '0504100000', 'Masbate', '0500000000'),
  ('0504119000', 'San Jacinto', 'municipality', '0504100000', 'Masbate', '0500000000'),
  ('0504120000', 'San Pascual', 'municipality', '0504100000', 'Masbate', '0500000000'),
  ('0504121000', 'Uson', 'municipality', '0504100000', 'Masbate', '0500000000'),
  ('0506202000', 'Barcelona', 'municipality', '0506200000', 'Sorsogon', '0500000000'),
  ('0506203000', 'Bulan', 'municipality', '0506200000', 'Sorsogon', '0500000000'),
  ('0506204000', 'Bulusan', 'municipality', '0506200000', 'Sorsogon', '0500000000'),
  ('0506205000', 'Casiguran', 'municipality', '0506200000', 'Sorsogon', '0500000000'),
  ('0506206000', 'Castilla', 'municipality', '0506200000', 'Sorsogon', '0500000000'),
  ('0506216000', 'City of Sorsogon', 'city', '0506200000', 'Sorsogon', '0500000000'),
  ('0506207000', 'Donsol', 'municipality', '0506200000', 'Sorsogon', '0500000000'),
  ('0506208000', 'Gubat', 'municipality', '0506200000', 'Sorsogon', '0500000000'),
  ('0506209000', 'Irosin', 'municipality', '0506200000', 'Sorsogon', '0500000000'),
  ('0506210000', 'Juban', 'municipality', '0506200000', 'Sorsogon', '0500000000'),
  ('0506211000', 'Magallanes', 'municipality', '0506200000', 'Sorsogon', '0500000000'),
  ('0506212000', 'Matnog', 'municipality', '0506200000', 'Sorsogon', '0500000000'),
  ('0506213000', 'Pilar', 'municipality', '0506200000', 'Sorsogon', '0500000000'),
  ('0506214000', 'Prieto Diaz', 'municipality', '0506200000', 'Sorsogon', '0500000000'),
  ('0506215000', 'Santa Magdalena', 'municipality', '0506200000', 'Sorsogon', '0500000000'),
  ('0600401000', 'Altavas', 'municipality', '0600400000', 'Aklan', '0600000000'),
  ('0600402000', 'Balete', 'municipality', '0600400000', 'Aklan', '0600000000'),
  ('0600403000', 'Banga', 'municipality', '0600400000', 'Aklan', '0600000000'),
  ('0600404000', 'Batan', 'municipality', '0600400000', 'Aklan', '0600000000'),
  ('0600405000', 'Buruanga', 'municipality', '0600400000', 'Aklan', '0600000000'),
  ('0600406000', 'Ibajay', 'municipality', '0600400000', 'Aklan', '0600000000'),
  ('0600407000', 'Kalibo', 'municipality', '0600400000', 'Aklan', '0600000000'),
  ('0600408000', 'Lezo', 'municipality', '0600400000', 'Aklan', '0600000000'),
  ('0600409000', 'Libacao', 'municipality', '0600400000', 'Aklan', '0600000000'),
  ('0600410000', 'Madalag', 'municipality', '0600400000', 'Aklan', '0600000000'),
  ('0600411000', 'Makato', 'municipality', '0600400000', 'Aklan', '0600000000'),
  ('0600412000', 'Malay', 'municipality', '0600400000', 'Aklan', '0600000000'),
  ('0600413000', 'Malinao', 'municipality', '0600400000', 'Aklan', '0600000000'),
  ('0600414000', 'Nabas', 'municipality', '0600400000', 'Aklan', '0600000000'),
  ('0600415000', 'New Washington', 'municipality', '0600400000', 'Aklan', '0600000000'),
  ('0600416000', 'Numancia', 'municipality', '0600400000', 'Aklan', '0600000000'),
  ('0600417000', 'Tangalan', 'municipality', '0600400000', 'Aklan', '0600000000'),
  ('0600601000', 'Anini-Y', 'municipality', '0600600000', 'Antique', '0600000000'),
  ('0600602000', 'Barbaza', 'municipality', '0600600000', 'Antique', '0600000000'),
  ('0600603000', 'Belison', 'municipality', '0600600000', 'Antique', '0600000000'),
  ('0600604000', 'Bugasong', 'municipality', '0600600000', 'Antique', '0600000000'),
  ('0600605000', 'Caluya', 'municipality', '0600600000', 'Antique', '0600000000'),
  ('0600606000', 'Culasi', 'municipality', '0600600000', 'Antique', '0600000000'),
  ('0600608000', 'Hamtic', 'municipality', '0600600000', 'Antique', '0600000000'),
  ('0600609000', 'Laua-An', 'municipality', '0600600000', 'Antique', '0600000000'),
  ('0600610000', 'Libertad', 'municipality', '0600600000', 'Antique', '0600000000'),
  ('0600611000', 'Pandan', 'municipality', '0600600000', 'Antique', '0600000000'),
  ('0600612000', 'Patnongon', 'municipality', '0600600000', 'Antique', '0600000000'),
  ('0600613000', 'San Jose', 'municipality', '0600600000', 'Antique', '0600000000'),
  ('0600614000', 'San Remigio', 'municipality', '0600600000', 'Antique', '0600000000'),
  ('0600615000', 'Sebaste', 'municipality', '0600600000', 'Antique', '0600000000'),
  ('0600616000', 'Sibalom', 'municipality', '0600600000', 'Antique', '0600000000'),
  ('0600617000', 'Tibiao', 'municipality', '0600600000', 'Antique', '0600000000'),
  ('0600607000', 'Tobias Fornier', 'municipality', '0600600000', 'Antique', '0600000000'),
  ('0600618000', 'Valderrama', 'municipality', '0600600000', 'Antique', '0600000000'),
  ('0601914000', 'City of Roxas', 'city', '0601900000', 'Capiz', '0600000000'),
  ('0601901000', 'Cuartero', 'municipality', '0601900000', 'Capiz', '0600000000'),
  ('0601902000', 'Dao', 'municipality', '0601900000', 'Capiz', '0600000000'),
  ('0601903000', 'Dumalag', 'municipality', '0601900000', 'Capiz', '0600000000'),
  ('0601904000', 'Dumarao', 'municipality', '0601900000', 'Capiz', '0600000000'),
  ('0601905000', 'Ivisan', 'municipality', '0601900000', 'Capiz', '0600000000'),
  ('0601906000', 'Jamindan', 'municipality', '0601900000', 'Capiz', '0600000000'),
  ('0601907000', 'Ma-Ayon', 'municipality', '0601900000', 'Capiz', '0600000000'),
  ('0601908000', 'Mambusao', 'municipality', '0601900000', 'Capiz', '0600000000'),
  ('0601909000', 'Panay', 'municipality', '0601900000', 'Capiz', '0600000000'),
  ('0601910000', 'Panitan', 'municipality', '0601900000', 'Capiz', '0600000000'),
  ('0601911000', 'Pilar', 'municipality', '0601900000', 'Capiz', '0600000000'),
  ('0601912000', 'Pontevedra', 'municipality', '0601900000', 'Capiz', '0600000000'),
  ('0601913000', 'President Roxas', 'municipality', '0601900000', 'Capiz', '0600000000'),
  ('0601915000', 'Sapi-An', 'municipality', '0601900000', 'Capiz', '0600000000'),
  ('0601916000', 'Sigma', 'municipality', '0601900000', 'Capiz', '0600000000'),
  ('0601917000', 'Tapaz', 'municipality', '0601900000', 'Capiz', '0600000000'),
  ('0603001000', 'Ajuy', 'municipality', '0603000000', 'Iloilo', '0600000000'),
  ('0603002000', 'Alimodian', 'municipality', '0603000000', 'Iloilo', '0600000000'),
  ('0603003000', 'Anilao', 'municipality', '0603000000', 'Iloilo', '0600000000'),
  ('0603004000', 'Badiangan', 'municipality', '0603000000', 'Iloilo', '0600000000'),
  ('0603005000', 'Balasan', 'municipality', '0603000000', 'Iloilo', '0600000000'),
  ('0603006000', 'Banate', 'municipality', '0603000000', 'Iloilo', '0600000000'),
  ('0603007000', 'Barotac Nuevo', 'municipality', '0603000000', 'Iloilo', '0600000000'),
  ('0603008000', 'Barotac Viejo', 'municipality', '0603000000', 'Iloilo', '0600000000'),
  ('0603009000', 'Batad', 'municipality', '0603000000', 'Iloilo', '0600000000'),
  ('0603010000', 'Bingawan', 'municipality', '0603000000', 'Iloilo', '0600000000'),
  ('0603012000', 'Cabatuan', 'municipality', '0603000000', 'Iloilo', '0600000000'),
  ('0603013000', 'Calinog', 'municipality', '0603000000', 'Iloilo', '0600000000'),
  ('0603014000', 'Carles', 'municipality', '0603000000', 'Iloilo', '0600000000'),
  ('0631000000', 'City of Iloilo', 'city', '0603000000', 'Iloilo', '0600000000'),
  ('0603035000', 'City of Passi', 'city', '0603000000', 'Iloilo', '0600000000'),
  ('0603015000', 'Concepcion', 'municipality', '0603000000', 'Iloilo', '0600000000'),
  ('0603016000', 'Dingle', 'municipality', '0603000000', 'Iloilo', '0600000000'),
  ('0603017000', 'Dueñas', 'municipality', '0603000000', 'Iloilo', '0600000000'),
  ('0603018000', 'Dumangas', 'municipality', '0603000000', 'Iloilo', '0600000000'),
  ('0603019000', 'Estancia', 'municipality', '0603000000', 'Iloilo', '0600000000'),
  ('0603020000', 'Guimbal', 'municipality', '0603000000', 'Iloilo', '0600000000'),
  ('0603021000', 'Igbaras', 'municipality', '0603000000', 'Iloilo', '0600000000'),
  ('0603023000', 'Janiuay', 'municipality', '0603000000', 'Iloilo', '0600000000'),
  ('0603025000', 'Lambunao', 'municipality', '0603000000', 'Iloilo', '0600000000'),
  ('0603026000', 'Leganes', 'municipality', '0603000000', 'Iloilo', '0600000000'),
  ('0603027000', 'Lemery', 'municipality', '0603000000', 'Iloilo', '0600000000'),
  ('0603028000', 'Leon', 'municipality', '0603000000', 'Iloilo', '0600000000'),
  ('0603029000', 'Maasin', 'municipality', '0603000000', 'Iloilo', '0600000000'),
  ('0603030000', 'Miagao', 'municipality', '0603000000', 'Iloilo', '0600000000'),
  ('0603031000', 'Mina', 'municipality', '0603000000', 'Iloilo', '0600000000'),
  ('0603032000', 'New Lucena', 'municipality', '0603000000', 'Iloilo', '0600000000'),
  ('0603034000', 'Oton', 'municipality', '0603000000', 'Iloilo', '0600000000'),
  ('0603036000', 'Pavia', 'municipality', '0603000000', 'Iloilo', '0600000000'),
  ('0603037000', 'Pototan', 'municipality', '0603000000', 'Iloilo', '0600000000'),
  ('0603038000', 'San Dionisio', 'municipality', '0603000000', 'Iloilo', '0600000000'),
  ('0603039000', 'San Enrique', 'municipality', '0603000000', 'Iloilo', '0600000000'),
  ('0603040000', 'San Joaquin', 'municipality', '0603000000', 'Iloilo', '0600000000'),
  ('0603041000', 'San Miguel', 'municipality', '0603000000', 'Iloilo', '0600000000'),
  ('0603042000', 'San Rafael', 'municipality', '0603000000', 'Iloilo', '0600000000'),
  ('0603043000', 'Santa Barbara', 'municipality', '0603000000', 'Iloilo', '0600000000'),
  ('0603044000', 'Sara', 'municipality', '0603000000', 'Iloilo', '0600000000'),
  ('0603045000', 'Tigbauan', 'municipality', '0603000000', 'Iloilo', '0600000000'),
  ('0603046000', 'Tubungan', 'municipality', '0603000000', 'Iloilo', '0600000000'),
  ('0603047000', 'Zarraga', 'municipality', '0603000000', 'Iloilo', '0600000000'),
  ('0607901000', 'Buenavista', 'municipality', '0607900000', 'Guimaras', '0600000000'),
  ('0607902000', 'Jordan', 'municipality', '0607900000', 'Guimaras', '0600000000'),
  ('0607903000', 'Nueva Valencia', 'municipality', '0607900000', 'Guimaras', '0600000000'),
  ('0607904000', 'San Lorenzo', 'municipality', '0607900000', 'Guimaras', '0600000000'),
  ('0607905000', 'Sibunag', 'municipality', '0607900000', 'Guimaras', '0600000000'),
  ('0701201000', 'Alburquerque', 'municipality', '0701200000', 'Bohol', '0700000000'),
  ('0701202000', 'Alicia', 'municipality', '0701200000', 'Bohol', '0700000000'),
  ('0701203000', 'Anda', 'municipality', '0701200000', 'Bohol', '0700000000'),
  ('0701204000', 'Antequera', 'municipality', '0701200000', 'Bohol', '0700000000'),
  ('0701205000', 'Baclayon', 'municipality', '0701200000', 'Bohol', '0700000000'),
  ('0701206000', 'Balilihan', 'municipality', '0701200000', 'Bohol', '0700000000'),
  ('0701207000', 'Batuan', 'municipality', '0701200000', 'Bohol', '0700000000'),
  ('0701248000', 'Bien Unido', 'municipality', '0701200000', 'Bohol', '0700000000'),
  ('0701208000', 'Bilar', 'municipality', '0701200000', 'Bohol', '0700000000'),
  ('0701209000', 'Buenavista', 'municipality', '0701200000', 'Bohol', '0700000000'),
  ('0701210000', 'Calape', 'municipality', '0701200000', 'Bohol', '0700000000'),
  ('0701211000', 'Candijay', 'municipality', '0701200000', 'Bohol', '0700000000'),
  ('0701212000', 'Carmen', 'municipality', '0701200000', 'Bohol', '0700000000'),
  ('0701213000', 'Catigbian', 'municipality', '0701200000', 'Bohol', '0700000000'),
  ('0701242000', 'City of Tagbilaran', 'city', '0701200000', 'Bohol', '0700000000'),
  ('0701214000', 'Clarin', 'municipality', '0701200000', 'Bohol', '0700000000'),
  ('0701215000', 'Corella', 'municipality', '0701200000', 'Bohol', '0700000000'),
  ('0701216000', 'Cortes', 'municipality', '0701200000', 'Bohol', '0700000000'),
  ('0701217000', 'Dagohoy', 'municipality', '0701200000', 'Bohol', '0700000000'),
  ('0701218000', 'Danao', 'municipality', '0701200000', 'Bohol', '0700000000'),
  ('0701219000', 'Dauis', 'municipality', '0701200000', 'Bohol', '0700000000'),
  ('0701220000', 'Dimiao', 'municipality', '0701200000', 'Bohol', '0700000000'),
  ('0701221000', 'Duero', 'municipality', '0701200000', 'Bohol', '0700000000'),
  ('0701222000', 'Garcia Hernandez', 'municipality', '0701200000', 'Bohol', '0700000000'),
  ('0701226000', 'Getafe', 'municipality', '0701200000', 'Bohol', '0700000000'),
  ('0701223000', 'Guindulman', 'municipality', '0701200000', 'Bohol', '0700000000'),
  ('0701224000', 'Inabanga', 'municipality', '0701200000', 'Bohol', '0700000000'),
  ('0701225000', 'Jagna', 'municipality', '0701200000', 'Bohol', '0700000000'),
  ('0701227000', 'Lila', 'municipality', '0701200000', 'Bohol', '0700000000'),
  ('0701228000', 'Loay', 'municipality', '0701200000', 'Bohol', '0700000000'),
  ('0701229000', 'Loboc', 'municipality', '0701200000', 'Bohol', '0700000000'),
  ('0701230000', 'Loon', 'municipality', '0701200000', 'Bohol', '0700000000'),
  ('0701231000', 'Mabini', 'municipality', '0701200000', 'Bohol', '0700000000'),
  ('0701232000', 'Maribojoc', 'municipality', '0701200000', 'Bohol', '0700000000'),
  ('0701233000', 'Panglao', 'municipality', '0701200000', 'Bohol', '0700000000'),
  ('0701234000', 'Pilar', 'municipality', '0701200000', 'Bohol', '0700000000'),
  ('0701235000', 'President Carlos P. Garcia', 'municipality', '0701200000', 'Bohol', '0700000000'),
  ('0701236000', 'Sagbayan', 'municipality', '0701200000', 'Bohol', '0700000000'),
  ('0701237000', 'San Isidro', 'municipality', '0701200000', 'Bohol', '0700000000'),
  ('0701238000', 'San Miguel', 'municipality', '0701200000', 'Bohol', '0700000000'),
  ('0701239000', 'Sevilla', 'municipality', '0701200000', 'Bohol', '0700000000'),
  ('0701240000', 'Sierra Bullones', 'municipality', '0701200000', 'Bohol', '0700000000'),
  ('0701241000', 'Sikatuna', 'municipality', '0701200000', 'Bohol', '0700000000'),
  ('0701243000', 'Talibon', 'municipality', '0701200000', 'Bohol', '0700000000'),
  ('0701244000', 'Trinidad', 'municipality', '0701200000', 'Bohol', '0700000000'),
  ('0701245000', 'Tubigon', 'municipality', '0701200000', 'Bohol', '0700000000'),
  ('0701246000', 'Ubay', 'municipality', '0701200000', 'Bohol', '0700000000'),
  ('0701247000', 'Valencia', 'municipality', '0701200000', 'Bohol', '0700000000'),
  ('0702201000', 'Alcantara', 'municipality', '0702200000', 'Cebu', '0700000000'),
  ('0702202000', 'Alcoy', 'municipality', '0702200000', 'Cebu', '0700000000'),
  ('0702203000', 'Alegria', 'municipality', '0702200000', 'Cebu', '0700000000'),
  ('0702204000', 'Aloguinsan', 'municipality', '0702200000', 'Cebu', '0700000000'),
  ('0702205000', 'Argao', 'municipality', '0702200000', 'Cebu', '0700000000'),
  ('0702206000', 'Asturias', 'municipality', '0702200000', 'Cebu', '0700000000'),
  ('0702207000', 'Badian', 'municipality', '0702200000', 'Cebu', '0700000000'),
  ('0702208000', 'Balamban', 'municipality', '0702200000', 'Cebu', '0700000000'),
  ('0702209000', 'Bantayan', 'municipality', '0702200000', 'Cebu', '0700000000'),
  ('0702210000', 'Barili', 'municipality', '0702200000', 'Cebu', '0700000000'),
  ('0702212000', 'Boljoon', 'municipality', '0702200000', 'Cebu', '0700000000'),
  ('0702213000', 'Borbon', 'municipality', '0702200000', 'Cebu', '0700000000'),
  ('0702215000', 'Carmen', 'municipality', '0702200000', 'Cebu', '0700000000'),
  ('0702216000', 'Catmon', 'municipality', '0702200000', 'Cebu', '0700000000'),
  ('0702211000', 'City of Bogo', 'city', '0702200000', 'Cebu', '0700000000'),
  ('0702214000', 'City of Carcar', 'city', '0702200000', 'Cebu', '0700000000'),
  ('0730600000', 'City of Cebu', 'city', '0702200000', 'Cebu', '0700000000'),
  ('0731100000', 'City of Lapu-Lapu', 'city', '0702200000', 'Cebu', '0700000000'),
  ('0731300000', 'City of Mandaue', 'city', '0702200000', 'Cebu', '0700000000'),
  ('0702234000', 'City of Naga', 'city', '0702200000', 'Cebu', '0700000000'),
  ('0702250000', 'City of Talisay', 'city', '0702200000', 'Cebu', '0700000000'),
  ('0702251000', 'City of Toledo', 'city', '0702200000', 'Cebu', '0700000000'),
  ('0702218000', 'Compostela', 'municipality', '0702200000', 'Cebu', '0700000000'),
  ('0702219000', 'Consolacion', 'municipality', '0702200000', 'Cebu', '0700000000'),
  ('0702220000', 'Cordova', 'municipality', '0702200000', 'Cebu', '0700000000'),
  ('0702221000', 'Daanbantayan', 'municipality', '0702200000', 'Cebu', '0700000000'),
  ('0702222000', 'Dalaguete', 'municipality', '0702200000', 'Cebu', '0700000000'),
  ('0702223000', 'Danao City', 'city', '0702200000', 'Cebu', '0700000000'),
  ('0702224000', 'Dumanjug', 'municipality', '0702200000', 'Cebu', '0700000000'),
  ('0702225000', 'Ginatilan', 'municipality', '0702200000', 'Cebu', '0700000000'),
  ('0702227000', 'Liloan', 'municipality', '0702200000', 'Cebu', '0700000000'),
  ('0702228000', 'Madridejos', 'municipality', '0702200000', 'Cebu', '0700000000'),
  ('0702229000', 'Malabuyoc', 'municipality', '0702200000', 'Cebu', '0700000000'),
  ('0702231000', 'Medellin', 'municipality', '0702200000', 'Cebu', '0700000000'),
  ('0702232000', 'Minglanilla', 'municipality', '0702200000', 'Cebu', '0700000000'),
  ('0702233000', 'Moalboal', 'municipality', '0702200000', 'Cebu', '0700000000'),
  ('0702235000', 'Oslob', 'municipality', '0702200000', 'Cebu', '0700000000'),
  ('0702236000', 'Pilar', 'municipality', '0702200000', 'Cebu', '0700000000'),
  ('0702237000', 'Pinamungajan', 'municipality', '0702200000', 'Cebu', '0700000000'),
  ('0702238000', 'Poro', 'municipality', '0702200000', 'Cebu', '0700000000'),
  ('0702239000', 'Ronda', 'municipality', '0702200000', 'Cebu', '0700000000'),
  ('0702240000', 'Samboan', 'municipality', '0702200000', 'Cebu', '0700000000'),
  ('0702241000', 'San Fernando', 'municipality', '0702200000', 'Cebu', '0700000000'),
  ('0702242000', 'San Francisco', 'municipality', '0702200000', 'Cebu', '0700000000'),
  ('0702243000', 'San Remigio', 'municipality', '0702200000', 'Cebu', '0700000000'),
  ('0702244000', 'Santa Fe', 'municipality', '0702200000', 'Cebu', '0700000000'),
  ('0702245000', 'Santander', 'municipality', '0702200000', 'Cebu', '0700000000'),
  ('0702246000', 'Sibonga', 'municipality', '0702200000', 'Cebu', '0700000000'),
  ('0702247000', 'Sogod', 'municipality', '0702200000', 'Cebu', '0700000000'),
  ('0702248000', 'Tabogon', 'municipality', '0702200000', 'Cebu', '0700000000'),
  ('0702249000', 'Tabuelan', 'municipality', '0702200000', 'Cebu', '0700000000'),
  ('0702252000', 'Tuburan', 'municipality', '0702200000', 'Cebu', '0700000000'),
  ('0702253000', 'Tudela', 'municipality', '0702200000', 'Cebu', '0700000000'),
  ('0802601000', 'Arteche', 'municipality', '0802600000', 'Eastern Samar', '0800000000'),
  ('0802602000', 'Balangiga', 'municipality', '0802600000', 'Eastern Samar', '0800000000'),
  ('0802603000', 'Balangkayan', 'municipality', '0802600000', 'Eastern Samar', '0800000000'),
  ('0802605000', 'Can-Avid', 'municipality', '0802600000', 'Eastern Samar', '0800000000'),
  ('0802604000', 'City of Borongan', 'city', '0802600000', 'Eastern Samar', '0800000000'),
  ('0802606000', 'Dolores', 'municipality', '0802600000', 'Eastern Samar', '0800000000'),
  ('0802607000', 'General Macarthur', 'municipality', '0802600000', 'Eastern Samar', '0800000000'),
  ('0802608000', 'Giporlos', 'municipality', '0802600000', 'Eastern Samar', '0800000000'),
  ('0802609000', 'Guiuan', 'municipality', '0802600000', 'Eastern Samar', '0800000000'),
  ('0802610000', 'Hernani', 'municipality', '0802600000', 'Eastern Samar', '0800000000'),
  ('0802611000', 'Jipapad', 'municipality', '0802600000', 'Eastern Samar', '0800000000'),
  ('0802612000', 'Lawaan', 'municipality', '0802600000', 'Eastern Samar', '0800000000'),
  ('0802613000', 'Llorente', 'municipality', '0802600000', 'Eastern Samar', '0800000000'),
  ('0802614000', 'Maslog', 'municipality', '0802600000', 'Eastern Samar', '0800000000'),
  ('0802615000', 'Maydolong', 'municipality', '0802600000', 'Eastern Samar', '0800000000'),
  ('0802616000', 'Mercedes', 'municipality', '0802600000', 'Eastern Samar', '0800000000'),
  ('0802617000', 'Oras', 'municipality', '0802600000', 'Eastern Samar', '0800000000'),
  ('0802618000', 'Quinapondan', 'municipality', '0802600000', 'Eastern Samar', '0800000000'),
  ('0802619000', 'Salcedo', 'municipality', '0802600000', 'Eastern Samar', '0800000000'),
  ('0802620000', 'San Julian', 'municipality', '0802600000', 'Eastern Samar', '0800000000'),
  ('0802621000', 'San Policarpo', 'municipality', '0802600000', 'Eastern Samar', '0800000000'),
  ('0802622000', 'Sulat', 'municipality', '0802600000', 'Eastern Samar', '0800000000'),
  ('0802623000', 'Taft', 'municipality', '0802600000', 'Eastern Samar', '0800000000'),
  ('0803701000', 'Abuyog', 'municipality', '0803700000', 'Leyte', '0800000000'),
  ('0803702000', 'Alangalang', 'municipality', '0803700000', 'Leyte', '0800000000'),
  ('0803703000', 'Albuera', 'municipality', '0803700000', 'Leyte', '0800000000'),
  ('0803705000', 'Babatngon', 'municipality', '0803700000', 'Leyte', '0800000000'),
  ('0803706000', 'Barugo', 'municipality', '0803700000', 'Leyte', '0800000000'),
  ('0803707000', 'Bato', 'municipality', '0803700000', 'Leyte', '0800000000'),
  ('0803710000', 'Burauen', 'municipality', '0803700000', 'Leyte', '0800000000'),
  ('0803713000', 'Calubian', 'municipality', '0803700000', 'Leyte', '0800000000'),
  ('0803714000', 'Capoocan', 'municipality', '0803700000', 'Leyte', '0800000000'),
  ('0803715000', 'Carigara', 'municipality', '0803700000', 'Leyte', '0800000000'),
  ('0803708000', 'City of Baybay', 'city', '0803700000', 'Leyte', '0800000000'),
  ('0831600000', 'City of Tacloban', 'city', '0803700000', 'Leyte', '0800000000'),
  ('0803717000', 'Dagami', 'municipality', '0803700000', 'Leyte', '0800000000'),
  ('0803718000', 'Dulag', 'municipality', '0803700000', 'Leyte', '0800000000'),
  ('0803719000', 'Hilongos', 'municipality', '0803700000', 'Leyte', '0800000000'),
  ('0803720000', 'Hindang', 'municipality', '0803700000', 'Leyte', '0800000000'),
  ('0803721000', 'Inopacan', 'municipality', '0803700000', 'Leyte', '0800000000'),
  ('0803722000', 'Isabel', 'municipality', '0803700000', 'Leyte', '0800000000'),
  ('0803723000', 'Jaro', 'municipality', '0803700000', 'Leyte', '0800000000'),
  ('0803724000', 'Javier', 'municipality', '0803700000', 'Leyte', '0800000000'),
  ('0803725000', 'Julita', 'municipality', '0803700000', 'Leyte', '0800000000'),
  ('0803726000', 'Kananga', 'municipality', '0803700000', 'Leyte', '0800000000'),
  ('0803728000', 'La Paz', 'municipality', '0803700000', 'Leyte', '0800000000'),
  ('0803729000', 'Leyte', 'municipality', '0803700000', 'Leyte', '0800000000'),
  ('0803730000', 'Macarthur', 'municipality', '0803700000', 'Leyte', '0800000000'),
  ('0803731000', 'Mahaplag', 'municipality', '0803700000', 'Leyte', '0800000000'),
  ('0803733000', 'Matag-Ob', 'municipality', '0803700000', 'Leyte', '0800000000'),
  ('0803734000', 'Matalom', 'municipality', '0803700000', 'Leyte', '0800000000'),
  ('0803735000', 'Mayorga', 'municipality', '0803700000', 'Leyte', '0800000000'),
  ('0803736000', 'Merida', 'municipality', '0803700000', 'Leyte', '0800000000'),
  ('0803738000', 'Ormoc City', 'city', '0803700000', 'Leyte', '0800000000'),
  ('0803739000', 'Palo', 'municipality', '0803700000', 'Leyte', '0800000000'),
  ('0803740000', 'Palompon', 'municipality', '0803700000', 'Leyte', '0800000000'),
  ('0803741000', 'Pastrana', 'municipality', '0803700000', 'Leyte', '0800000000'),
  ('0803742000', 'San Isidro', 'municipality', '0803700000', 'Leyte', '0800000000'),
  ('0803743000', 'San Miguel', 'municipality', '0803700000', 'Leyte', '0800000000'),
  ('0803744000', 'Santa Fe', 'municipality', '0803700000', 'Leyte', '0800000000'),
  ('0803745000', 'Tabango', 'municipality', '0803700000', 'Leyte', '0800000000'),
  ('0803746000', 'Tabontabon', 'municipality', '0803700000', 'Leyte', '0800000000'),
  ('0803748000', 'Tanauan', 'municipality', '0803700000', 'Leyte', '0800000000'),
  ('0803749000', 'Tolosa', 'municipality', '0803700000', 'Leyte', '0800000000'),
  ('0803750000', 'Tunga', 'municipality', '0803700000', 'Leyte', '0800000000'),
  ('0803751000', 'Villaba', 'municipality', '0803700000', 'Leyte', '0800000000'),
  ('0804801000', 'Allen', 'municipality', '0804800000', 'Northern Samar', '0800000000'),
  ('0804802000', 'Biri', 'municipality', '0804800000', 'Northern Samar', '0800000000'),
  ('0804803000', 'Bobon', 'municipality', '0804800000', 'Northern Samar', '0800000000'),
  ('0804804000', 'Capul', 'municipality', '0804800000', 'Northern Samar', '0800000000'),
  ('0804805000', 'Catarman', 'municipality', '0804800000', 'Northern Samar', '0800000000'),
  ('0804806000', 'Catubig', 'municipality', '0804800000', 'Northern Samar', '0800000000'),
  ('0804807000', 'Gamay', 'municipality', '0804800000', 'Northern Samar', '0800000000'),
  ('0804808000', 'Laoang', 'municipality', '0804800000', 'Northern Samar', '0800000000'),
  ('0804809000', 'Lapinig', 'municipality', '0804800000', 'Northern Samar', '0800000000'),
  ('0804810000', 'Las Navas', 'municipality', '0804800000', 'Northern Samar', '0800000000'),
  ('0804811000', 'Lavezares', 'municipality', '0804800000', 'Northern Samar', '0800000000'),
  ('0804824000', 'Lope De Vega', 'municipality', '0804800000', 'Northern Samar', '0800000000'),
  ('0804812000', 'Mapanas', 'municipality', '0804800000', 'Northern Samar', '0800000000'),
  ('0804813000', 'Mondragon', 'municipality', '0804800000', 'Northern Samar', '0800000000'),
  ('0804814000', 'Palapag', 'municipality', '0804800000', 'Northern Samar', '0800000000'),
  ('0804815000', 'Pambujan', 'municipality', '0804800000', 'Northern Samar', '0800000000'),
  ('0804816000', 'Rosario', 'municipality', '0804800000', 'Northern Samar', '0800000000'),
  ('0804817000', 'San Antonio', 'municipality', '0804800000', 'Northern Samar', '0800000000'),
  ('0804818000', 'San Isidro', 'municipality', '0804800000', 'Northern Samar', '0800000000'),
  ('0804819000', 'San Jose', 'municipality', '0804800000', 'Northern Samar', '0800000000'),
  ('0804820000', 'San Roque', 'municipality', '0804800000', 'Northern Samar', '0800000000'),
  ('0804821000', 'San Vicente', 'municipality', '0804800000', 'Northern Samar', '0800000000'),
  ('0804822000', 'Silvino Lobos', 'municipality', '0804800000', 'Northern Samar', '0800000000'),
  ('0804823000', 'Victoria', 'municipality', '0804800000', 'Northern Samar', '0800000000'),
  ('0806001000', 'Almagro', 'municipality', '0806000000', 'Samar', '0800000000'),
  ('0806002000', 'Basey', 'municipality', '0806000000', 'Samar', '0800000000'),
  ('0806004000', 'Calbiga', 'municipality', '0806000000', 'Samar', '0800000000'),
  ('0806003000', 'City of Calbayog', 'city', '0806000000', 'Samar', '0800000000'),
  ('0806005000', 'City of Catbalogan', 'city', '0806000000', 'Samar', '0800000000'),
  ('0806006000', 'Daram', 'municipality', '0806000000', 'Samar', '0800000000'),
  ('0806007000', 'Gandara', 'municipality', '0806000000', 'Samar', '0800000000'),
  ('0806008000', 'Hinabangan', 'municipality', '0806000000', 'Samar', '0800000000'),
  ('0806009000', 'Jiabong', 'municipality', '0806000000', 'Samar', '0800000000'),
  ('0806010000', 'Marabut', 'municipality', '0806000000', 'Samar', '0800000000'),
  ('0806011000', 'Matuguinao', 'municipality', '0806000000', 'Samar', '0800000000'),
  ('0806012000', 'Motiong', 'municipality', '0806000000', 'Samar', '0800000000'),
  ('0806026000', 'Pagsanghan', 'municipality', '0806000000', 'Samar', '0800000000'),
  ('0806022000', 'Paranas', 'municipality', '0806000000', 'Samar', '0800000000'),
  ('0806013000', 'Pinabacdao', 'municipality', '0806000000', 'Samar', '0800000000'),
  ('0806025000', 'San Jorge', 'municipality', '0806000000', 'Samar', '0800000000'),
  ('0806014000', 'San Jose De Buan', 'municipality', '0806000000', 'Samar', '0800000000'),
  ('0806015000', 'San Sebastian', 'municipality', '0806000000', 'Samar', '0800000000'),
  ('0806016000', 'Santa Margarita', 'municipality', '0806000000', 'Samar', '0800000000'),
  ('0806017000', 'Santa Rita', 'municipality', '0806000000', 'Samar', '0800000000'),
  ('0806018000', 'Santo Niño', 'municipality', '0806000000', 'Samar', '0800000000'),
  ('0806024000', 'Tagapul-An', 'municipality', '0806000000', 'Samar', '0800000000'),
  ('0806019000', 'Talalora', 'municipality', '0806000000', 'Samar', '0800000000'),
  ('0806020000', 'Tarangnan', 'municipality', '0806000000', 'Samar', '0800000000'),
  ('0806021000', 'Villareal', 'municipality', '0806000000', 'Samar', '0800000000'),
  ('0806023000', 'Zumarraga', 'municipality', '0806000000', 'Samar', '0800000000'),
  ('0806401000', 'Anahawan', 'municipality', '0806400000', 'Southern Leyte', '0800000000'),
  ('0806402000', 'Bontoc', 'municipality', '0806400000', 'Southern Leyte', '0800000000'),
  ('0806407000', 'City of Maasin', 'city', '0806400000', 'Southern Leyte', '0800000000'),
  ('0806403000', 'Hinunangan', 'municipality', '0806400000', 'Southern Leyte', '0800000000'),
  ('0806404000', 'Hinundayan', 'municipality', '0806400000', 'Southern Leyte', '0800000000'),
  ('0806405000', 'Libagon', 'municipality', '0806400000', 'Southern Leyte', '0800000000'),
  ('0806406000', 'Liloan', 'municipality', '0806400000', 'Southern Leyte', '0800000000'),
  ('0806419000', 'Limasawa', 'municipality', '0806400000', 'Southern Leyte', '0800000000'),
  ('0806408000', 'Macrohon', 'municipality', '0806400000', 'Southern Leyte', '0800000000'),
  ('0806409000', 'Malitbog', 'municipality', '0806400000', 'Southern Leyte', '0800000000'),
  ('0806410000', 'Padre Burgos', 'municipality', '0806400000', 'Southern Leyte', '0800000000'),
  ('0806411000', 'Pintuyan', 'municipality', '0806400000', 'Southern Leyte', '0800000000'),
  ('0806412000', 'Saint Bernard', 'municipality', '0806400000', 'Southern Leyte', '0800000000'),
  ('0806413000', 'San Francisco', 'municipality', '0806400000', 'Southern Leyte', '0800000000'),
  ('0806414000', 'San Juan', 'municipality', '0806400000', 'Southern Leyte', '0800000000'),
  ('0806415000', 'San Ricardo', 'municipality', '0806400000', 'Southern Leyte', '0800000000'),
  ('0806416000', 'Silago', 'municipality', '0806400000', 'Southern Leyte', '0800000000'),
  ('0806417000', 'Sogod', 'municipality', '0806400000', 'Southern Leyte', '0800000000'),
  ('0806418000', 'Tomas Oppus', 'municipality', '0806400000', 'Southern Leyte', '0800000000'),
  ('0807801000', 'Almeria', 'municipality', '0807800000', 'Biliran', '0800000000'),
  ('0807802000', 'Biliran', 'municipality', '0807800000', 'Biliran', '0800000000'),
  ('0807803000', 'Cabucgayan', 'municipality', '0807800000', 'Biliran', '0800000000'),
  ('0807804000', 'Caibiran', 'municipality', '0807800000', 'Biliran', '0800000000'),
  ('0807805000', 'Culaba', 'municipality', '0807800000', 'Biliran', '0800000000'),
  ('0807806000', 'Kawayan', 'municipality', '0807800000', 'Biliran', '0800000000'),
  ('0807807000', 'Maripipi', 'municipality', '0807800000', 'Biliran', '0800000000'),
  ('0807808000', 'Naval', 'municipality', '0807800000', 'Biliran', '0800000000'),
  ('0907224000', 'Baliguian', 'municipality', '0907200000', 'Zamboanga del Norte', '0900000000'),
  ('0907201000', 'City of Dapitan', 'city', '0907200000', 'Zamboanga del Norte', '0900000000'),
  ('0907202000', 'City of Dipolog', 'city', '0907200000', 'Zamboanga del Norte', '0900000000'),
  ('0907225000', 'Godod', 'municipality', '0907200000', 'Zamboanga del Norte', '0900000000'),
  ('0907223000', 'Gutalac', 'municipality', '0907200000', 'Zamboanga del Norte', '0900000000'),
  ('0907222000', 'Jose Dalman', 'municipality', '0907200000', 'Zamboanga del Norte', '0900000000'),
  ('0907227000', 'Kalawit', 'municipality', '0907200000', 'Zamboanga del Norte', '0900000000'),
  ('0907203000', 'Katipunan', 'municipality', '0907200000', 'Zamboanga del Norte', '0900000000'),
  ('0907204000', 'La Libertad', 'municipality', '0907200000', 'Zamboanga del Norte', '0900000000'),
  ('0907205000', 'Labason', 'municipality', '0907200000', 'Zamboanga del Norte', '0900000000'),
  ('0907226000', 'Leon T. Postigo', 'municipality', '0907200000', 'Zamboanga del Norte', '0900000000'),
  ('0907206000', 'Liloy', 'municipality', '0907200000', 'Zamboanga del Norte', '0900000000'),
  ('0907207000', 'Manukan', 'municipality', '0907200000', 'Zamboanga del Norte', '0900000000'),
  ('0907208000', 'Mutia', 'municipality', '0907200000', 'Zamboanga del Norte', '0900000000'),
  ('0907209000', 'Piñan', 'municipality', '0907200000', 'Zamboanga del Norte', '0900000000'),
  ('0907210000', 'Polanco', 'municipality', '0907200000', 'Zamboanga del Norte', '0900000000'),
  ('0907211000', 'Pres. Manuel A. Roxas', 'municipality', '0907200000', 'Zamboanga del Norte', '0900000000'),
  ('0907212000', 'Rizal', 'municipality', '0907200000', 'Zamboanga del Norte', '0900000000'),
  ('0907213000', 'Salug', 'municipality', '0907200000', 'Zamboanga del Norte', '0900000000'),
  ('0907214000', 'Sergio Osmeña Sr.', 'municipality', '0907200000', 'Zamboanga del Norte', '0900000000'),
  ('0907215000', 'Siayan', 'municipality', '0907200000', 'Zamboanga del Norte', '0900000000'),
  ('0907216000', 'Sibuco', 'municipality', '0907200000', 'Zamboanga del Norte', '0900000000'),
  ('0907217000', 'Sibutad', 'municipality', '0907200000', 'Zamboanga del Norte', '0900000000'),
  ('0907218000', 'Sindangan', 'municipality', '0907200000', 'Zamboanga del Norte', '0900000000'),
  ('0907219000', 'Siocon', 'municipality', '0907200000', 'Zamboanga del Norte', '0900000000'),
  ('0907220000', 'Sirawai', 'municipality', '0907200000', 'Zamboanga del Norte', '0900000000'),
  ('0907221000', 'Tampilisan', 'municipality', '0907200000', 'Zamboanga del Norte', '0900000000'),
  ('0907302000', 'Aurora', 'municipality', '0907300000', 'Zamboanga del Sur', '0900000000'),
  ('0907303000', 'Bayog', 'municipality', '0907300000', 'Zamboanga del Sur', '0900000000'),
  ('0907322000', 'City of Pagadian', 'city', '0907300000', 'Zamboanga del Sur', '0900000000'),
  ('0931700000', 'City of Zamboanga', 'city', '0907300000', 'Zamboanga del Sur', '0900000000'),
  ('0907305000', 'Dimataling', 'municipality', '0907300000', 'Zamboanga del Sur', '0900000000'),
  ('0907306000', 'Dinas', 'municipality', '0907300000', 'Zamboanga del Sur', '0900000000'),
  ('0907307000', 'Dumalinao', 'municipality', '0907300000', 'Zamboanga del Sur', '0900000000'),
  ('0907308000', 'Dumingag', 'municipality', '0907300000', 'Zamboanga del Sur', '0900000000'),
  ('0907343000', 'Guipos', 'municipality', '0907300000', 'Zamboanga del Sur', '0900000000'),
  ('0907337000', 'Josefina', 'municipality', '0907300000', 'Zamboanga del Sur', '0900000000'),
  ('0907311000', 'Kumalarang', 'municipality', '0907300000', 'Zamboanga del Sur', '0900000000'),
  ('0907312000', 'Labangan', 'municipality', '0907300000', 'Zamboanga del Sur', '0900000000'),
  ('0907333000', 'Lakewood', 'municipality', '0907300000', 'Zamboanga del Sur', '0900000000'),
  ('0907313000', 'Lapuyan', 'municipality', '0907300000', 'Zamboanga del Sur', '0900000000'),
  ('0907315000', 'Mahayag', 'municipality', '0907300000', 'Zamboanga del Sur', '0900000000'),
  ('0907317000', 'Margosatubig', 'municipality', '0907300000', 'Zamboanga del Sur', '0900000000'),
  ('0907318000', 'Midsalip', 'municipality', '0907300000', 'Zamboanga del Sur', '0900000000'),
  ('0907319000', 'Molave', 'municipality', '0907300000', 'Zamboanga del Sur', '0900000000'),
  ('0907338000', 'Pitogo', 'municipality', '0907300000', 'Zamboanga del Sur', '0900000000'),
  ('0907323000', 'Ramon Magsaysay', 'municipality', '0907300000', 'Zamboanga del Sur', '0900000000'),
  ('0907324000', 'San Miguel', 'municipality', '0907300000', 'Zamboanga del Sur', '0900000000'),
  ('0907325000', 'San Pablo', 'municipality', '0907300000', 'Zamboanga del Sur', '0900000000'),
  ('0907340000', 'Sominot', 'municipality', '0907300000', 'Zamboanga del Sur', '0900000000'),
  ('0907327000', 'Tabina', 'municipality', '0907300000', 'Zamboanga del Sur', '0900000000'),
  ('0907328000', 'Tambulig', 'municipality', '0907300000', 'Zamboanga del Sur', '0900000000'),
  ('0907344000', 'Tigbao', 'municipality', '0907300000', 'Zamboanga del Sur', '0900000000'),
  ('0907330000', 'Tukuran', 'municipality', '0907300000', 'Zamboanga del Sur', '0900000000'),
  ('0907341000', 'Vincenzo A. Sagun', 'municipality', '0907300000', 'Zamboanga del Sur', '0900000000'),
  ('0908301000', 'Alicia', 'municipality', '0908300000', 'Zamboanga Sibugay', '0900000000'),
  ('0908302000', 'Buug', 'municipality', '0908300000', 'Zamboanga Sibugay', '0900000000'),
  ('0908303000', 'Diplahan', 'municipality', '0908300000', 'Zamboanga Sibugay', '0900000000'),
  ('0908304000', 'Imelda', 'municipality', '0908300000', 'Zamboanga Sibugay', '0900000000'),
  ('0908305000', 'Ipil', 'municipality', '0908300000', 'Zamboanga Sibugay', '0900000000'),
  ('0908306000', 'Kabasalan', 'municipality', '0908300000', 'Zamboanga Sibugay', '0900000000'),
  ('0908307000', 'Mabuhay', 'municipality', '0908300000', 'Zamboanga Sibugay', '0900000000'),
  ('0908308000', 'Malangas', 'municipality', '0908300000', 'Zamboanga Sibugay', '0900000000'),
  ('0908309000', 'Naga', 'municipality', '0908300000', 'Zamboanga Sibugay', '0900000000'),
  ('0908310000', 'Olutanga', 'municipality', '0908300000', 'Zamboanga Sibugay', '0900000000'),
  ('0908311000', 'Payao', 'municipality', '0908300000', 'Zamboanga Sibugay', '0900000000'),
  ('0908312000', 'Roseller Lim', 'municipality', '0908300000', 'Zamboanga Sibugay', '0900000000'),
  ('0908313000', 'Siay', 'municipality', '0908300000', 'Zamboanga Sibugay', '0900000000'),
  ('0908314000', 'Talusan', 'municipality', '0908300000', 'Zamboanga Sibugay', '0900000000'),
  ('0908315000', 'Titay', 'municipality', '0908300000', 'Zamboanga Sibugay', '0900000000'),
  ('0908316000', 'Tungawan', 'municipality', '0908300000', 'Zamboanga Sibugay', '0900000000'),
  ('0990101000', 'City of Isabela', 'city', '0990100000', null, '0900000000'),
  ('1001301000', 'Baungon', 'municipality', '1001300000', 'Bukidnon', '1000000000'),
  ('1001322000', 'Cabanglasan', 'municipality', '1001300000', 'Bukidnon', '1000000000'),
  ('1001312000', 'City of Malaybalay', 'city', '1001300000', 'Bukidnon', '1000000000'),
  ('1001321000', 'City of Valencia', 'city', '1001300000', 'Bukidnon', '1000000000'),
  ('1001302000', 'Damulog', 'municipality', '1001300000', 'Bukidnon', '1000000000'),
  ('1001303000', 'Dangcagan', 'municipality', '1001300000', 'Bukidnon', '1000000000'),
  ('1001304000', 'Don Carlos', 'municipality', '1001300000', 'Bukidnon', '1000000000'),
  ('1001305000', 'Impasug-ong', 'municipality', '1001300000', 'Bukidnon', '1000000000'),
  ('1001306000', 'Kadingilan', 'municipality', '1001300000', 'Bukidnon', '1000000000'),
  ('1001307000', 'Kalilangan', 'municipality', '1001300000', 'Bukidnon', '1000000000'),
  ('1001308000', 'Kibawe', 'municipality', '1001300000', 'Bukidnon', '1000000000'),
  ('1001309000', 'Kitaotao', 'municipality', '1001300000', 'Bukidnon', '1000000000'),
  ('1001310000', 'Lantapan', 'municipality', '1001300000', 'Bukidnon', '1000000000'),
  ('1001311000', 'Libona', 'municipality', '1001300000', 'Bukidnon', '1000000000'),
  ('1001313000', 'Malitbog', 'municipality', '1001300000', 'Bukidnon', '1000000000'),
  ('1001314000', 'Manolo Fortich', 'municipality', '1001300000', 'Bukidnon', '1000000000'),
  ('1001315000', 'Maramag', 'municipality', '1001300000', 'Bukidnon', '1000000000'),
  ('1001316000', 'Pangantucan', 'municipality', '1001300000', 'Bukidnon', '1000000000'),
  ('1001317000', 'Quezon', 'municipality', '1001300000', 'Bukidnon', '1000000000'),
  ('1001318000', 'San Fernando', 'municipality', '1001300000', 'Bukidnon', '1000000000'),
  ('1001319000', 'Sumilao', 'municipality', '1001300000', 'Bukidnon', '1000000000'),
  ('1001320000', 'Talakag', 'municipality', '1001300000', 'Bukidnon', '1000000000'),
  ('1001801000', 'Catarman', 'municipality', '1001800000', 'Camiguin', '1000000000'),
  ('1001802000', 'Guinsiliban', 'municipality', '1001800000', 'Camiguin', '1000000000'),
  ('1001803000', 'Mahinog', 'municipality', '1001800000', 'Camiguin', '1000000000'),
  ('1001804000', 'Mambajao', 'municipality', '1001800000', 'Camiguin', '1000000000'),
  ('1001805000', 'Sagay', 'municipality', '1001800000', 'Camiguin', '1000000000'),
  ('1003501000', 'Bacolod', 'municipality', '1003500000', 'Lanao del Norte', '1000000000'),
  ('1003502000', 'Baloi', 'municipality', '1003500000', 'Lanao del Norte', '1000000000'),
  ('1003503000', 'Baroy', 'municipality', '1003500000', 'Lanao del Norte', '1000000000'),
  ('1030900000', 'City of Iligan', 'city', '1003500000', 'Lanao del Norte', '1000000000'),
  ('1003505000', 'Kapatagan', 'municipality', '1003500000', 'Lanao del Norte', '1000000000'),
  ('1003507000', 'Kauswagan', 'municipality', '1003500000', 'Lanao del Norte', '1000000000'),
  ('1003508000', 'Kolambugan', 'municipality', '1003500000', 'Lanao del Norte', '1000000000'),
  ('1003509000', 'Lala', 'municipality', '1003500000', 'Lanao del Norte', '1000000000'),
  ('1003510000', 'Linamon', 'municipality', '1003500000', 'Lanao del Norte', '1000000000'),
  ('1003511000', 'Magsaysay', 'municipality', '1003500000', 'Lanao del Norte', '1000000000'),
  ('1003512000', 'Maigo', 'municipality', '1003500000', 'Lanao del Norte', '1000000000'),
  ('1003513000', 'Matungao', 'municipality', '1003500000', 'Lanao del Norte', '1000000000'),
  ('1003514000', 'Munai', 'municipality', '1003500000', 'Lanao del Norte', '1000000000'),
  ('1003515000', 'Nunungan', 'municipality', '1003500000', 'Lanao del Norte', '1000000000'),
  ('1003516000', 'Pantao Ragat', 'municipality', '1003500000', 'Lanao del Norte', '1000000000'),
  ('1003523000', 'Pantar', 'municipality', '1003500000', 'Lanao del Norte', '1000000000'),
  ('1003517000', 'Poona Piagapo', 'municipality', '1003500000', 'Lanao del Norte', '1000000000'),
  ('1003518000', 'Salvador', 'municipality', '1003500000', 'Lanao del Norte', '1000000000'),
  ('1003519000', 'Sapad', 'municipality', '1003500000', 'Lanao del Norte', '1000000000'),
  ('1003506000', 'Sultan Naga Dimaporo', 'municipality', '1003500000', 'Lanao del Norte', '1000000000'),
  ('1003520000', 'Tagoloan', 'municipality', '1003500000', 'Lanao del Norte', '1000000000'),
  ('1003521000', 'Tangcal', 'municipality', '1003500000', 'Lanao del Norte', '1000000000'),
  ('1003522000', 'Tubod', 'municipality', '1003500000', 'Lanao del Norte', '1000000000'),
  ('1004201000', 'Aloran', 'municipality', '1004200000', 'Misamis Occidental', '1000000000'),
  ('1004202000', 'Baliangao', 'municipality', '1004200000', 'Misamis Occidental', '1000000000'),
  ('1004203000', 'Bonifacio', 'municipality', '1004200000', 'Misamis Occidental', '1000000000'),
  ('1004204000', 'Calamba', 'municipality', '1004200000', 'Misamis Occidental', '1000000000'),
  ('1004209000', 'City of Oroquieta', 'city', '1004200000', 'Misamis Occidental', '1000000000'),
  ('1004210000', 'City of Ozamiz', 'city', '1004200000', 'Misamis Occidental', '1000000000'),
  ('1004215000', 'City of Tangub', 'city', '1004200000', 'Misamis Occidental', '1000000000'),
  ('1004205000', 'Clarin', 'municipality', '1004200000', 'Misamis Occidental', '1000000000'),
  ('1004206000', 'Concepcion', 'municipality', '1004200000', 'Misamis Occidental', '1000000000'),
  ('1004217000', 'Don Victoriano Chiongbian', 'municipality', '1004200000', 'Misamis Occidental', '1000000000'),
  ('1004207000', 'Jimenez', 'municipality', '1004200000', 'Misamis Occidental', '1000000000'),
  ('1004208000', 'Lopez Jaena', 'municipality', '1004200000', 'Misamis Occidental', '1000000000'),
  ('1004211000', 'Panaon', 'municipality', '1004200000', 'Misamis Occidental', '1000000000'),
  ('1004212000', 'Plaridel', 'municipality', '1004200000', 'Misamis Occidental', '1000000000'),
  ('1004213000', 'Sapang Dalaga', 'municipality', '1004200000', 'Misamis Occidental', '1000000000'),
  ('1004214000', 'Sinacaban', 'municipality', '1004200000', 'Misamis Occidental', '1000000000'),
  ('1004216000', 'Tudela', 'municipality', '1004200000', 'Misamis Occidental', '1000000000'),
  ('1004301000', 'Alubijid', 'municipality', '1004300000', 'Misamis Oriental', '1000000000'),
  ('1004302000', 'Balingasag', 'municipality', '1004300000', 'Misamis Oriental', '1000000000'),
  ('1004303000', 'Balingoan', 'municipality', '1004300000', 'Misamis Oriental', '1000000000'),
  ('1004304000', 'Binuangan', 'municipality', '1004300000', 'Misamis Oriental', '1000000000'),
  ('1030500000', 'City of Cagayan De Oro', 'city', '1004300000', 'Misamis Oriental', '1000000000'),
  ('1004307000', 'City of El Salvador', 'city', '1004300000', 'Misamis Oriental', '1000000000'),
  ('1004308000', 'City of Gingoog', 'city', '1004300000', 'Misamis Oriental', '1000000000'),
  ('1004306000', 'Claveria', 'municipality', '1004300000', 'Misamis Oriental', '1000000000'),
  ('1004309000', 'Gitagum', 'municipality', '1004300000', 'Misamis Oriental', '1000000000'),
  ('1004310000', 'Initao', 'municipality', '1004300000', 'Misamis Oriental', '1000000000'),
  ('1004311000', 'Jasaan', 'municipality', '1004300000', 'Misamis Oriental', '1000000000'),
  ('1004312000', 'Kinoguitan', 'municipality', '1004300000', 'Misamis Oriental', '1000000000'),
  ('1004313000', 'Lagonglong', 'municipality', '1004300000', 'Misamis Oriental', '1000000000'),
  ('1004314000', 'Laguindingan', 'municipality', '1004300000', 'Misamis Oriental', '1000000000'),
  ('1004315000', 'Libertad', 'municipality', '1004300000', 'Misamis Oriental', '1000000000'),
  ('1004316000', 'Lugait', 'municipality', '1004300000', 'Misamis Oriental', '1000000000'),
  ('1004317000', 'Magsaysay', 'municipality', '1004300000', 'Misamis Oriental', '1000000000'),
  ('1004318000', 'Manticao', 'municipality', '1004300000', 'Misamis Oriental', '1000000000'),
  ('1004319000', 'Medina', 'municipality', '1004300000', 'Misamis Oriental', '1000000000'),
  ('1004320000', 'Naawan', 'municipality', '1004300000', 'Misamis Oriental', '1000000000'),
  ('1004321000', 'Opol', 'municipality', '1004300000', 'Misamis Oriental', '1000000000'),
  ('1004322000', 'Salay', 'municipality', '1004300000', 'Misamis Oriental', '1000000000'),
  ('1004323000', 'Sugbongcogon', 'municipality', '1004300000', 'Misamis Oriental', '1000000000'),
  ('1004324000', 'Tagoloan', 'municipality', '1004300000', 'Misamis Oriental', '1000000000'),
  ('1004325000', 'Talisayan', 'municipality', '1004300000', 'Misamis Oriental', '1000000000'),
  ('1004326000', 'Villanueva', 'municipality', '1004300000', 'Misamis Oriental', '1000000000'),
  ('1102301000', 'Asuncion', 'municipality', '1102300000', 'Davao del Norte', '1100000000'),
  ('1102323000', 'Braulio E. Dujali', 'municipality', '1102300000', 'Davao del Norte', '1100000000'),
  ('1102303000', 'Carmen', 'municipality', '1102300000', 'Davao del Norte', '1100000000'),
  ('1102315000', 'City of Panabo', 'city', '1102300000', 'Davao del Norte', '1100000000'),
  ('1102319000', 'City of Tagum', 'city', '1102300000', 'Davao del Norte', '1100000000'),
  ('1102317000', 'Island Garden City of Samal', 'city', '1102300000', 'Davao del Norte', '1100000000'),
  ('1102305000', 'Kapalong', 'municipality', '1102300000', 'Davao del Norte', '1100000000'),
  ('1102314000', 'New Corella', 'municipality', '1102300000', 'Davao del Norte', '1100000000'),
  ('1102324000', 'San Isidro', 'municipality', '1102300000', 'Davao del Norte', '1100000000'),
  ('1102318000', 'Santo Tomas', 'municipality', '1102300000', 'Davao del Norte', '1100000000'),
  ('1102322000', 'Talaingod', 'municipality', '1102300000', 'Davao del Norte', '1100000000'),
  ('1102401000', 'Bansalan', 'municipality', '1102400000', 'Davao del Sur', '1100000000'),
  ('1130700000', 'City of Davao', 'city', '1102400000', 'Davao del Sur', '1100000000'),
  ('1102403000', 'City of Digos', 'city', '1102400000', 'Davao del Sur', '1100000000'),
  ('1102404000', 'Hagonoy', 'municipality', '1102400000', 'Davao del Sur', '1100000000'),
  ('1102406000', 'Kiblawan', 'municipality', '1102400000', 'Davao del Sur', '1100000000'),
  ('1102407000', 'Magsaysay', 'municipality', '1102400000', 'Davao del Sur', '1100000000'),
  ('1102408000', 'Malalag', 'municipality', '1102400000', 'Davao del Sur', '1100000000'),
  ('1102410000', 'Matanao', 'municipality', '1102400000', 'Davao del Sur', '1100000000'),
  ('1102411000', 'Padada', 'municipality', '1102400000', 'Davao del Sur', '1100000000'),
  ('1102412000', 'Santa Cruz', 'municipality', '1102400000', 'Davao del Sur', '1100000000'),
  ('1102414000', 'Sulop', 'municipality', '1102400000', 'Davao del Sur', '1100000000'),
  ('1102501000', 'Baganga', 'municipality', '1102500000', 'Davao Oriental', '1100000000'),
  ('1102502000', 'Banaybanay', 'municipality', '1102500000', 'Davao Oriental', '1100000000'),
  ('1102503000', 'Boston', 'municipality', '1102500000', 'Davao Oriental', '1100000000'),
  ('1102504000', 'Caraga', 'municipality', '1102500000', 'Davao Oriental', '1100000000'),
  ('1102505000', 'Cateel', 'municipality', '1102500000', 'Davao Oriental', '1100000000'),
  ('1102509000', 'City of Mati', 'city', '1102500000', 'Davao Oriental', '1100000000'),
  ('1102506000', 'Governor Generoso', 'municipality', '1102500000', 'Davao Oriental', '1100000000'),
  ('1102507000', 'Lupon', 'municipality', '1102500000', 'Davao Oriental', '1100000000'),
  ('1102508000', 'Manay', 'municipality', '1102500000', 'Davao Oriental', '1100000000'),
  ('1102510000', 'San Isidro', 'municipality', '1102500000', 'Davao Oriental', '1100000000'),
  ('1102511000', 'Tarragona', 'municipality', '1102500000', 'Davao Oriental', '1100000000'),
  ('1108201000', 'Compostela', 'municipality', '1108200000', 'Davao de Oro', '1100000000'),
  ('1108202000', 'Laak', 'municipality', '1108200000', 'Davao de Oro', '1100000000'),
  ('1108203000', 'Mabini', 'municipality', '1108200000', 'Davao de Oro', '1100000000'),
  ('1108204000', 'Maco', 'municipality', '1108200000', 'Davao de Oro', '1100000000'),
  ('1108205000', 'Maragusan', 'municipality', '1108200000', 'Davao de Oro', '1100000000'),
  ('1108206000', 'Mawab', 'municipality', '1108200000', 'Davao de Oro', '1100000000'),
  ('1108207000', 'Monkayo', 'municipality', '1108200000', 'Davao de Oro', '1100000000'),
  ('1108208000', 'Montevista', 'municipality', '1108200000', 'Davao de Oro', '1100000000'),
  ('1108209000', 'Nabunturan', 'municipality', '1108200000', 'Davao de Oro', '1100000000'),
  ('1108210000', 'New Bataan', 'municipality', '1108200000', 'Davao de Oro', '1100000000'),
  ('1108211000', 'Pantukan', 'municipality', '1108200000', 'Davao de Oro', '1100000000'),
  ('1108601000', 'Don Marcelino', 'municipality', '1108600000', 'Davao Occidental', '1100000000'),
  ('1108602000', 'Jose Abad Santos', 'municipality', '1108600000', 'Davao Occidental', '1100000000'),
  ('1108603000', 'Malita', 'municipality', '1108600000', 'Davao Occidental', '1100000000'),
  ('1108604000', 'Santa Maria', 'municipality', '1108600000', 'Davao Occidental', '1100000000'),
  ('1108605000', 'Sarangani', 'municipality', '1108600000', 'Davao Occidental', '1100000000'),
  ('1204701000', 'Alamada', 'municipality', '1204700000', 'Cotabato', '1200000000'),
  ('1204717000', 'Aleosan', 'municipality', '1204700000', 'Cotabato', '1200000000'),
  ('1204715000', 'Antipas', 'municipality', '1204700000', 'Cotabato', '1200000000'),
  ('1204718000', 'Arakan', 'municipality', '1204700000', 'Cotabato', '1200000000'),
  ('1204716000', 'Banisilan', 'municipality', '1204700000', 'Cotabato', '1200000000'),
  ('1204702000', 'Carmen', 'municipality', '1204700000', 'Cotabato', '1200000000'),
  ('1204704000', 'City of Kidapawan', 'city', '1204700000', 'Cotabato', '1200000000'),
  ('1204703000', 'Kabacan', 'municipality', '1204700000', 'Cotabato', '1200000000'),
  ('1204705000', 'Libungan', 'municipality', '1204700000', 'Cotabato', '1200000000'),
  ('1204710000', 'M''Lang', 'municipality', '1204700000', 'Cotabato', '1200000000'),
  ('1204706000', 'Magpet', 'municipality', '1204700000', 'Cotabato', '1200000000'),
  ('1204707000', 'Makilala', 'municipality', '1204700000', 'Cotabato', '1200000000'),
  ('1204708000', 'Matalam', 'municipality', '1204700000', 'Cotabato', '1200000000'),
  ('1204709000', 'Midsayap', 'municipality', '1204700000', 'Cotabato', '1200000000'),
  ('1204711000', 'Pigkawayan', 'municipality', '1204700000', 'Cotabato', '1200000000'),
  ('1204712000', 'Pikit', 'municipality', '1204700000', 'Cotabato', '1200000000'),
  ('1204713000', 'President Roxas', 'municipality', '1204700000', 'Cotabato', '1200000000'),
  ('1204714000', 'Tulunan', 'municipality', '1204700000', 'Cotabato', '1200000000'),
  ('1206302000', 'Banga', 'municipality', '1206300000', 'South Cotabato', '1200000000'),
  ('1230800000', 'City of General Santos', 'city', '1206300000', 'South Cotabato', '1200000000'),
  ('1206306000', 'City of Koronadal', 'city', '1206300000', 'South Cotabato', '1200000000'),
  ('1206319000', 'Lake Sebu', 'municipality', '1206300000', 'South Cotabato', '1200000000'),
  ('1206311000', 'Norala', 'municipality', '1206300000', 'South Cotabato', '1200000000'),
  ('1206312000', 'Polomolok', 'municipality', '1206300000', 'South Cotabato', '1200000000'),
  ('1206318000', 'Santo Niño', 'municipality', '1206300000', 'South Cotabato', '1200000000'),
  ('1206313000', 'Surallah', 'municipality', '1206300000', 'South Cotabato', '1200000000'),
  ('1206316000', 'T''Boli', 'municipality', '1206300000', 'South Cotabato', '1200000000'),
  ('1206314000', 'Tampakan', 'municipality', '1206300000', 'South Cotabato', '1200000000'),
  ('1206315000', 'Tantangan', 'municipality', '1206300000', 'South Cotabato', '1200000000'),
  ('1206317000', 'Tupi', 'municipality', '1206300000', 'South Cotabato', '1200000000'),
  ('1206501000', 'Bagumbayan', 'municipality', '1206500000', 'Sultan Kudarat', '1200000000'),
  ('1206511000', 'City of Tacurong', 'city', '1206500000', 'Sultan Kudarat', '1200000000'),
  ('1206502000', 'Columbio', 'municipality', '1206500000', 'Sultan Kudarat', '1200000000'),
  ('1206503000', 'Esperanza', 'municipality', '1206500000', 'Sultan Kudarat', '1200000000'),
  ('1206504000', 'Isulan', 'municipality', '1206500000', 'Sultan Kudarat', '1200000000'),
  ('1206505000', 'Kalamansig', 'municipality', '1206500000', 'Sultan Kudarat', '1200000000'),
  ('1206508000', 'Lambayong', 'municipality', '1206500000', 'Sultan Kudarat', '1200000000'),
  ('1206506000', 'Lebak', 'municipality', '1206500000', 'Sultan Kudarat', '1200000000'),
  ('1206507000', 'Lutayan', 'municipality', '1206500000', 'Sultan Kudarat', '1200000000'),
  ('1206509000', 'Palimbang', 'municipality', '1206500000', 'Sultan Kudarat', '1200000000'),
  ('1206510000', 'President Quirino', 'municipality', '1206500000', 'Sultan Kudarat', '1200000000'),
  ('1206512000', 'Sen. Ninoy Aquino', 'municipality', '1206500000', 'Sultan Kudarat', '1200000000'),
  ('1208001000', 'Alabel', 'municipality', '1208000000', 'Sarangani', '1200000000'),
  ('1208002000', 'Glan', 'municipality', '1208000000', 'Sarangani', '1200000000'),
  ('1208003000', 'Kiamba', 'municipality', '1208000000', 'Sarangani', '1200000000'),
  ('1208004000', 'Maasim', 'municipality', '1208000000', 'Sarangani', '1200000000'),
  ('1208005000', 'Maitum', 'municipality', '1208000000', 'Sarangani', '1200000000'),
  ('1208006000', 'Malapatan', 'municipality', '1208000000', 'Sarangani', '1200000000'),
  ('1208007000', 'Malungon', 'municipality', '1208000000', 'Sarangani', '1200000000'),
  ('1380100000', 'City of Caloocan', 'city', '1300000000', 'Metro Manila', '1300000000'),
  ('1380200000', 'City of Las Piñas', 'city', '1300000000', 'Metro Manila', '1300000000'),
  ('1380300000', 'City of Makati', 'city', '1300000000', 'Metro Manila', '1300000000'),
  ('1380400000', 'City of Malabon', 'city', '1300000000', 'Metro Manila', '1300000000'),
  ('1380500000', 'City of Mandaluyong', 'city', '1300000000', 'Metro Manila', '1300000000'),
  ('1380600000', 'City of Manila', 'city', '1300000000', 'Metro Manila', '1300000000'),
  ('1380700000', 'City of Marikina', 'city', '1300000000', 'Metro Manila', '1300000000'),
  ('1380800000', 'City of Muntinlupa', 'city', '1300000000', 'Metro Manila', '1300000000'),
  ('1380900000', 'City of Navotas', 'city', '1300000000', 'Metro Manila', '1300000000'),
  ('1381000000', 'City of Parañaque', 'city', '1300000000', 'Metro Manila', '1300000000'),
  ('1381200000', 'City of Pasig', 'city', '1300000000', 'Metro Manila', '1300000000'),
  ('1381400000', 'City of San Juan', 'city', '1300000000', 'Metro Manila', '1300000000'),
  ('1381500000', 'City of Taguig', 'city', '1300000000', 'Metro Manila', '1300000000'),
  ('1381600000', 'City of Valenzuela', 'city', '1300000000', 'Metro Manila', '1300000000'),
  ('1381100000', 'Pasay City', 'city', '1300000000', 'Metro Manila', '1300000000'),
  ('1381701000', 'Pateros', 'municipality', '1300000000', 'Metro Manila', '1300000000'),
  ('1381300000', 'Quezon City', 'city', '1300000000', 'Metro Manila', '1300000000'),
  ('1400101000', 'Bangued', 'municipality', '1400100000', 'Abra', '1400000000'),
  ('1400102000', 'Boliney', 'municipality', '1400100000', 'Abra', '1400000000'),
  ('1400103000', 'Bucay', 'municipality', '1400100000', 'Abra', '1400000000'),
  ('1400104000', 'Bucloc', 'municipality', '1400100000', 'Abra', '1400000000'),
  ('1400105000', 'Daguioman', 'municipality', '1400100000', 'Abra', '1400000000'),
  ('1400106000', 'Danglas', 'municipality', '1400100000', 'Abra', '1400000000'),
  ('1400107000', 'Dolores', 'municipality', '1400100000', 'Abra', '1400000000'),
  ('1400108000', 'La Paz', 'municipality', '1400100000', 'Abra', '1400000000'),
  ('1400109000', 'Lacub', 'municipality', '1400100000', 'Abra', '1400000000'),
  ('1400110000', 'Lagangilang', 'municipality', '1400100000', 'Abra', '1400000000'),
  ('1400111000', 'Lagayan', 'municipality', '1400100000', 'Abra', '1400000000'),
  ('1400112000', 'Langiden', 'municipality', '1400100000', 'Abra', '1400000000'),
  ('1400113000', 'Licuan-Baay', 'municipality', '1400100000', 'Abra', '1400000000'),
  ('1400114000', 'Luba', 'municipality', '1400100000', 'Abra', '1400000000'),
  ('1400115000', 'Malibcong', 'municipality', '1400100000', 'Abra', '1400000000'),
  ('1400116000', 'Manabo', 'municipality', '1400100000', 'Abra', '1400000000'),
  ('1400117000', 'Peñarrubia', 'municipality', '1400100000', 'Abra', '1400000000'),
  ('1400118000', 'Pidigan', 'municipality', '1400100000', 'Abra', '1400000000'),
  ('1400119000', 'Pilar', 'municipality', '1400100000', 'Abra', '1400000000'),
  ('1400120000', 'Sallapadan', 'municipality', '1400100000', 'Abra', '1400000000'),
  ('1400121000', 'San Isidro', 'municipality', '1400100000', 'Abra', '1400000000'),
  ('1400122000', 'San Juan', 'municipality', '1400100000', 'Abra', '1400000000'),
  ('1400123000', 'San Quintin', 'municipality', '1400100000', 'Abra', '1400000000'),
  ('1400124000', 'Tayum', 'municipality', '1400100000', 'Abra', '1400000000'),
  ('1400125000', 'Tineg', 'municipality', '1400100000', 'Abra', '1400000000'),
  ('1400126000', 'Tubo', 'municipality', '1400100000', 'Abra', '1400000000'),
  ('1400127000', 'Villaviciosa', 'municipality', '1400100000', 'Abra', '1400000000'),
  ('1401101000', 'Atok', 'municipality', '1401100000', 'Benguet', '1400000000'),
  ('1401103000', 'Bakun', 'municipality', '1401100000', 'Benguet', '1400000000'),
  ('1401104000', 'Bokod', 'municipality', '1401100000', 'Benguet', '1400000000'),
  ('1401105000', 'Buguias', 'municipality', '1401100000', 'Benguet', '1400000000'),
  ('1430300000', 'City of Baguio', 'city', '1401100000', 'Benguet', '1400000000'),
  ('1401106000', 'Itogon', 'municipality', '1401100000', 'Benguet', '1400000000'),
  ('1401107000', 'Kabayan', 'municipality', '1401100000', 'Benguet', '1400000000'),
  ('1401108000', 'Kapangan', 'municipality', '1401100000', 'Benguet', '1400000000'),
  ('1401109000', 'Kibungan', 'municipality', '1401100000', 'Benguet', '1400000000'),
  ('1401110000', 'La Trinidad', 'municipality', '1401100000', 'Benguet', '1400000000'),
  ('1401111000', 'Mankayan', 'municipality', '1401100000', 'Benguet', '1400000000'),
  ('1401112000', 'Sablan', 'municipality', '1401100000', 'Benguet', '1400000000'),
  ('1401113000', 'Tuba', 'municipality', '1401100000', 'Benguet', '1400000000'),
  ('1401114000', 'Tublay', 'municipality', '1401100000', 'Benguet', '1400000000'),
  ('1402708000', 'Aguinaldo', 'municipality', '1402700000', 'Ifugao', '1400000000'),
  ('1402707000', 'Alfonso Lista', 'municipality', '1402700000', 'Ifugao', '1400000000'),
  ('1402711000', 'Asipulo', 'municipality', '1402700000', 'Ifugao', '1400000000'),
  ('1402701000', 'Banaue', 'municipality', '1402700000', 'Ifugao', '1400000000'),
  ('1402709000', 'Hingyon', 'municipality', '1402700000', 'Ifugao', '1400000000'),
  ('1402702000', 'Hungduan', 'municipality', '1402700000', 'Ifugao', '1400000000'),
  ('1402703000', 'Kiangan', 'municipality', '1402700000', 'Ifugao', '1400000000'),
  ('1402704000', 'Lagawe', 'municipality', '1402700000', 'Ifugao', '1400000000'),
  ('1402705000', 'Lamut', 'municipality', '1402700000', 'Ifugao', '1400000000'),
  ('1402706000', 'Mayoyao', 'municipality', '1402700000', 'Ifugao', '1400000000'),
  ('1402710000', 'Tinoc', 'municipality', '1402700000', 'Ifugao', '1400000000'),
  ('1403201000', 'Balbalan', 'municipality', '1403200000', 'Kalinga', '1400000000'),
  ('1403213000', 'City of Tabuk', 'city', '1403200000', 'Kalinga', '1400000000'),
  ('1403206000', 'Lubuagan', 'municipality', '1403200000', 'Kalinga', '1400000000'),
  ('1403208000', 'Pasil', 'municipality', '1403200000', 'Kalinga', '1400000000'),
  ('1403209000', 'Pinukpuk', 'municipality', '1403200000', 'Kalinga', '1400000000'),
  ('1403211000', 'Rizal', 'municipality', '1403200000', 'Kalinga', '1400000000'),
  ('1403214000', 'Tanudan', 'municipality', '1403200000', 'Kalinga', '1400000000'),
  ('1403215000', 'Tinglayan', 'municipality', '1403200000', 'Kalinga', '1400000000'),
  ('1404401000', 'Barlig', 'municipality', '1404400000', 'Mountain Province', '1400000000'),
  ('1404402000', 'Bauko', 'municipality', '1404400000', 'Mountain Province', '1400000000'),
  ('1404403000', 'Besao', 'municipality', '1404400000', 'Mountain Province', '1400000000'),
  ('1404404000', 'Bontoc', 'municipality', '1404400000', 'Mountain Province', '1400000000'),
  ('1404405000', 'Natonin', 'municipality', '1404400000', 'Mountain Province', '1400000000'),
  ('1404406000', 'Paracelis', 'municipality', '1404400000', 'Mountain Province', '1400000000'),
  ('1404407000', 'Sabangan', 'municipality', '1404400000', 'Mountain Province', '1400000000'),
  ('1404408000', 'Sadanga', 'municipality', '1404400000', 'Mountain Province', '1400000000'),
  ('1404409000', 'Sagada', 'municipality', '1404400000', 'Mountain Province', '1400000000'),
  ('1404410000', 'Tadian', 'municipality', '1404400000', 'Mountain Province', '1400000000'),
  ('1408101000', 'Calanasan', 'municipality', '1408100000', 'Apayao', '1400000000'),
  ('1408102000', 'Conner', 'municipality', '1408100000', 'Apayao', '1400000000'),
  ('1408103000', 'Flora', 'municipality', '1408100000', 'Apayao', '1400000000'),
  ('1408104000', 'Kabugao', 'municipality', '1408100000', 'Apayao', '1400000000'),
  ('1408105000', 'Luna', 'municipality', '1408100000', 'Apayao', '1400000000'),
  ('1408106000', 'Pudtol', 'municipality', '1408100000', 'Apayao', '1400000000'),
  ('1408107000', 'Santa Marcela', 'municipality', '1408100000', 'Apayao', '1400000000'),
  ('1600201000', 'Buenavista', 'municipality', '1600200000', 'Agusan del Norte', '1600000000'),
  ('1600204000', 'Carmen', 'municipality', '1600200000', 'Agusan del Norte', '1600000000'),
  ('1630400000', 'City of Butuan', 'city', '1600200000', 'Agusan del Norte', '1600000000'),
  ('1600203000', 'City of Cabadbaran', 'city', '1600200000', 'Agusan del Norte', '1600000000'),
  ('1600205000', 'Jabonga', 'municipality', '1600200000', 'Agusan del Norte', '1600000000'),
  ('1600206000', 'Kitcharao', 'municipality', '1600200000', 'Agusan del Norte', '1600000000'),
  ('1600207000', 'Las Nieves', 'municipality', '1600200000', 'Agusan del Norte', '1600000000'),
  ('1600208000', 'Magallanes', 'municipality', '1600200000', 'Agusan del Norte', '1600000000'),
  ('1600209000', 'Nasipit', 'municipality', '1600200000', 'Agusan del Norte', '1600000000'),
  ('1600212000', 'Remedios T. Romualdez', 'municipality', '1600200000', 'Agusan del Norte', '1600000000'),
  ('1600210000', 'Santiago', 'municipality', '1600200000', 'Agusan del Norte', '1600000000'),
  ('1600211000', 'Tubay', 'municipality', '1600200000', 'Agusan del Norte', '1600000000'),
  ('1600302000', 'Bunawan', 'municipality', '1600300000', 'Agusan del Sur', '1600000000'),
  ('1600301000', 'City of Bayugan', 'city', '1600300000', 'Agusan del Sur', '1600000000'),
  ('1600303000', 'Esperanza', 'municipality', '1600300000', 'Agusan del Sur', '1600000000'),
  ('1600304000', 'La Paz', 'municipality', '1600300000', 'Agusan del Sur', '1600000000'),
  ('1600305000', 'Loreto', 'municipality', '1600300000', 'Agusan del Sur', '1600000000'),
  ('1600306000', 'Prosperidad', 'municipality', '1600300000', 'Agusan del Sur', '1600000000'),
  ('1600307000', 'Rosario', 'municipality', '1600300000', 'Agusan del Sur', '1600000000'),
  ('1600308000', 'San Francisco', 'municipality', '1600300000', 'Agusan del Sur', '1600000000'),
  ('1600309000', 'San Luis', 'municipality', '1600300000', 'Agusan del Sur', '1600000000'),
  ('1600310000', 'Santa Josefa', 'municipality', '1600300000', 'Agusan del Sur', '1600000000'),
  ('1600314000', 'Sibagat', 'municipality', '1600300000', 'Agusan del Sur', '1600000000'),
  ('1600311000', 'Talacogon', 'municipality', '1600300000', 'Agusan del Sur', '1600000000'),
  ('1600312000', 'Trento', 'municipality', '1600300000', 'Agusan del Sur', '1600000000'),
  ('1600313000', 'Veruela', 'municipality', '1600300000', 'Agusan del Sur', '1600000000'),
  ('1606701000', 'Alegria', 'municipality', '1606700000', 'Surigao del Norte', '1600000000'),
  ('1606702000', 'Bacuag', 'municipality', '1606700000', 'Surigao del Norte', '1600000000'),
  ('1606704000', 'Burgos', 'municipality', '1606700000', 'Surigao del Norte', '1600000000'),
  ('1606724000', 'City of Surigao', 'city', '1606700000', 'Surigao del Norte', '1600000000'),
  ('1606706000', 'Claver', 'municipality', '1606700000', 'Surigao del Norte', '1600000000'),
  ('1606707000', 'Dapa', 'municipality', '1606700000', 'Surigao del Norte', '1600000000'),
  ('1606708000', 'Del Carmen', 'municipality', '1606700000', 'Surigao del Norte', '1600000000'),
  ('1606710000', 'General Luna', 'municipality', '1606700000', 'Surigao del Norte', '1600000000'),
  ('1606711000', 'Gigaquit', 'municipality', '1606700000', 'Surigao del Norte', '1600000000'),
  ('1606714000', 'Mainit', 'municipality', '1606700000', 'Surigao del Norte', '1600000000'),
  ('1606715000', 'Malimono', 'municipality', '1606700000', 'Surigao del Norte', '1600000000'),
  ('1606716000', 'Pilar', 'municipality', '1606700000', 'Surigao del Norte', '1600000000'),
  ('1606717000', 'Placer', 'municipality', '1606700000', 'Surigao del Norte', '1600000000'),
  ('1606718000', 'San Benito', 'municipality', '1606700000', 'Surigao del Norte', '1600000000'),
  ('1606719000', 'San Francisco', 'municipality', '1606700000', 'Surigao del Norte', '1600000000'),
  ('1606720000', 'San Isidro', 'municipality', '1606700000', 'Surigao del Norte', '1600000000'),
  ('1606721000', 'Santa Monica', 'municipality', '1606700000', 'Surigao del Norte', '1600000000'),
  ('1606722000', 'Sison', 'municipality', '1606700000', 'Surigao del Norte', '1600000000'),
  ('1606723000', 'Socorro', 'municipality', '1606700000', 'Surigao del Norte', '1600000000'),
  ('1606725000', 'Tagana-An', 'municipality', '1606700000', 'Surigao del Norte', '1600000000'),
  ('1606727000', 'Tubod', 'municipality', '1606700000', 'Surigao del Norte', '1600000000'),
  ('1606801000', 'Barobo', 'municipality', '1606800000', 'Surigao del Sur', '1600000000'),
  ('1606802000', 'Bayabas', 'municipality', '1606800000', 'Surigao del Sur', '1600000000'),
  ('1606804000', 'Cagwait', 'municipality', '1606800000', 'Surigao del Sur', '1600000000'),
  ('1606805000', 'Cantilan', 'municipality', '1606800000', 'Surigao del Sur', '1600000000'),
  ('1606806000', 'Carmen', 'municipality', '1606800000', 'Surigao del Sur', '1600000000'),
  ('1606807000', 'Carrascal', 'municipality', '1606800000', 'Surigao del Sur', '1600000000'),
  ('1606803000', 'City of Bislig', 'city', '1606800000', 'Surigao del Sur', '1600000000'),
  ('1606819000', 'City of Tandag', 'city', '1606800000', 'Surigao del Sur', '1600000000'),
  ('1606808000', 'Cortes', 'municipality', '1606800000', 'Surigao del Sur', '1600000000'),
  ('1606809000', 'Hinatuan', 'municipality', '1606800000', 'Surigao del Sur', '1600000000'),
  ('1606810000', 'Lanuza', 'municipality', '1606800000', 'Surigao del Sur', '1600000000'),
  ('1606811000', 'Lianga', 'municipality', '1606800000', 'Surigao del Sur', '1600000000'),
  ('1606812000', 'Lingig', 'municipality', '1606800000', 'Surigao del Sur', '1600000000'),
  ('1606813000', 'Madrid', 'municipality', '1606800000', 'Surigao del Sur', '1600000000'),
  ('1606814000', 'Marihatag', 'municipality', '1606800000', 'Surigao del Sur', '1600000000'),
  ('1606815000', 'San Agustin', 'municipality', '1606800000', 'Surigao del Sur', '1600000000'),
  ('1606816000', 'San Miguel', 'municipality', '1606800000', 'Surigao del Sur', '1600000000'),
  ('1606817000', 'Tagbina', 'municipality', '1606800000', 'Surigao del Sur', '1600000000'),
  ('1606818000', 'Tago', 'municipality', '1606800000', 'Surigao del Sur', '1600000000'),
  ('1608501000', 'Basilisa', 'municipality', '1608500000', 'Dinagat Islands', '1600000000'),
  ('1608502000', 'Cagdianao', 'municipality', '1608500000', 'Dinagat Islands', '1600000000'),
  ('1608503000', 'Dinagat', 'municipality', '1608500000', 'Dinagat Islands', '1600000000'),
  ('1608504000', 'Libjo', 'municipality', '1608500000', 'Dinagat Islands', '1600000000'),
  ('1608505000', 'Loreto', 'municipality', '1608500000', 'Dinagat Islands', '1600000000'),
  ('1608506000', 'San Jose', 'municipality', '1608500000', 'Dinagat Islands', '1600000000'),
  ('1608507000', 'Tubajon', 'municipality', '1608500000', 'Dinagat Islands', '1600000000'),
  ('1704001000', 'Boac', 'municipality', '1704000000', 'Marinduque', '1700000000'),
  ('1704002000', 'Buenavista', 'municipality', '1704000000', 'Marinduque', '1700000000'),
  ('1704003000', 'Gasan', 'municipality', '1704000000', 'Marinduque', '1700000000'),
  ('1704004000', 'Mogpog', 'municipality', '1704000000', 'Marinduque', '1700000000'),
  ('1704005000', 'Santa Cruz', 'municipality', '1704000000', 'Marinduque', '1700000000'),
  ('1704006000', 'Torrijos', 'municipality', '1704000000', 'Marinduque', '1700000000'),
  ('1705101000', 'Abra De Ilog', 'municipality', '1705100000', 'Occidental Mindoro', '1700000000'),
  ('1705102000', 'Calintaan', 'municipality', '1705100000', 'Occidental Mindoro', '1700000000'),
  ('1705103000', 'Looc', 'municipality', '1705100000', 'Occidental Mindoro', '1700000000'),
  ('1705104000', 'Lubang', 'municipality', '1705100000', 'Occidental Mindoro', '1700000000'),
  ('1705105000', 'Magsaysay', 'municipality', '1705100000', 'Occidental Mindoro', '1700000000'),
  ('1705106000', 'Mamburao', 'municipality', '1705100000', 'Occidental Mindoro', '1700000000'),
  ('1705107000', 'Paluan', 'municipality', '1705100000', 'Occidental Mindoro', '1700000000'),
  ('1705108000', 'Rizal', 'municipality', '1705100000', 'Occidental Mindoro', '1700000000'),
  ('1705109000', 'Sablayan', 'municipality', '1705100000', 'Occidental Mindoro', '1700000000'),
  ('1705110000', 'San Jose', 'municipality', '1705100000', 'Occidental Mindoro', '1700000000'),
  ('1705111000', 'Santa Cruz', 'municipality', '1705100000', 'Occidental Mindoro', '1700000000'),
  ('1705201000', 'Baco', 'municipality', '1705200000', 'Oriental Mindoro', '1700000000'),
  ('1705202000', 'Bansud', 'municipality', '1705200000', 'Oriental Mindoro', '1700000000'),
  ('1705203000', 'Bongabong', 'municipality', '1705200000', 'Oriental Mindoro', '1700000000'),
  ('1705204000', 'Bulalacao', 'municipality', '1705200000', 'Oriental Mindoro', '1700000000'),
  ('1705205000', 'City of Calapan', 'city', '1705200000', 'Oriental Mindoro', '1700000000'),
  ('1705206000', 'Gloria', 'municipality', '1705200000', 'Oriental Mindoro', '1700000000'),
  ('1705207000', 'Mansalay', 'municipality', '1705200000', 'Oriental Mindoro', '1700000000'),
  ('1705208000', 'Naujan', 'municipality', '1705200000', 'Oriental Mindoro', '1700000000'),
  ('1705209000', 'Pinamalayan', 'municipality', '1705200000', 'Oriental Mindoro', '1700000000'),
  ('1705210000', 'Pola', 'municipality', '1705200000', 'Oriental Mindoro', '1700000000'),
  ('1705211000', 'Puerto Galera', 'municipality', '1705200000', 'Oriental Mindoro', '1700000000'),
  ('1705212000', 'Roxas', 'municipality', '1705200000', 'Oriental Mindoro', '1700000000'),
  ('1705213000', 'San Teodoro', 'municipality', '1705200000', 'Oriental Mindoro', '1700000000'),
  ('1705214000', 'Socorro', 'municipality', '1705200000', 'Oriental Mindoro', '1700000000'),
  ('1705215000', 'Victoria', 'municipality', '1705200000', 'Oriental Mindoro', '1700000000'),
  ('1705301000', 'Aborlan', 'municipality', '1705300000', 'Palawan', '1700000000'),
  ('1705302000', 'Agutaya', 'municipality', '1705300000', 'Palawan', '1700000000'),
  ('1705303000', 'Araceli', 'municipality', '1705300000', 'Palawan', '1700000000'),
  ('1705304000', 'Balabac', 'municipality', '1705300000', 'Palawan', '1700000000'),
  ('1705305000', 'Bataraza', 'municipality', '1705300000', 'Palawan', '1700000000'),
  ('1705306000', 'Brooke''s Point', 'municipality', '1705300000', 'Palawan', '1700000000'),
  ('1705307000', 'Busuanga', 'municipality', '1705300000', 'Palawan', '1700000000'),
  ('1705308000', 'Cagayancillo', 'municipality', '1705300000', 'Palawan', '1700000000'),
  ('1731500000', 'City of Puerto Princesa', 'city', '1705300000', 'Palawan', '1700000000'),
  ('1705309000', 'Coron', 'municipality', '1705300000', 'Palawan', '1700000000'),
  ('1705322000', 'Culion', 'municipality', '1705300000', 'Palawan', '1700000000'),
  ('1705310000', 'Cuyo', 'municipality', '1705300000', 'Palawan', '1700000000'),
  ('1705323000', 'Dr. Jose P. Rizal', 'municipality', '1705300000', 'Palawan', '1700000000'),
  ('1705311000', 'Dumaran', 'municipality', '1705300000', 'Palawan', '1700000000'),
  ('1705312000', 'El Nido', 'municipality', '1705300000', 'Palawan', '1700000000'),
  ('1705321000', 'Kalayaan', 'municipality', '1705300000', 'Palawan', '1700000000'),
  ('1705313000', 'Linapacan', 'municipality', '1705300000', 'Palawan', '1700000000'),
  ('1705314000', 'Magsaysay', 'municipality', '1705300000', 'Palawan', '1700000000'),
  ('1705315000', 'Narra', 'municipality', '1705300000', 'Palawan', '1700000000'),
  ('1705317000', 'Quezon', 'municipality', '1705300000', 'Palawan', '1700000000'),
  ('1705318000', 'Roxas', 'municipality', '1705300000', 'Palawan', '1700000000'),
  ('1705319000', 'San Vicente', 'municipality', '1705300000', 'Palawan', '1700000000'),
  ('1705324000', 'Sofronio Española', 'municipality', '1705300000', 'Palawan', '1700000000'),
  ('1705320000', 'Taytay', 'municipality', '1705300000', 'Palawan', '1700000000'),
  ('1705901000', 'Alcantara', 'municipality', '1705900000', 'Romblon', '1700000000'),
  ('1705902000', 'Banton', 'municipality', '1705900000', 'Romblon', '1700000000'),
  ('1705903000', 'Cajidiocan', 'municipality', '1705900000', 'Romblon', '1700000000'),
  ('1705904000', 'Calatrava', 'municipality', '1705900000', 'Romblon', '1700000000'),
  ('1705905000', 'Concepcion', 'municipality', '1705900000', 'Romblon', '1700000000'),
  ('1705906000', 'Corcuera', 'municipality', '1705900000', 'Romblon', '1700000000'),
  ('1705916000', 'Ferrol', 'municipality', '1705900000', 'Romblon', '1700000000'),
  ('1705907000', 'Looc', 'municipality', '1705900000', 'Romblon', '1700000000'),
  ('1705908000', 'Magdiwang', 'municipality', '1705900000', 'Romblon', '1700000000'),
  ('1705909000', 'Odiongan', 'municipality', '1705900000', 'Romblon', '1700000000'),
  ('1705910000', 'Romblon', 'municipality', '1705900000', 'Romblon', '1700000000'),
  ('1705911000', 'San Agustin', 'municipality', '1705900000', 'Romblon', '1700000000'),
  ('1705912000', 'San Andres', 'municipality', '1705900000', 'Romblon', '1700000000'),
  ('1705913000', 'San Fernando', 'municipality', '1705900000', 'Romblon', '1700000000'),
  ('1705914000', 'San Jose', 'municipality', '1705900000', 'Romblon', '1700000000'),
  ('1705915000', 'Santa Fe', 'municipality', '1705900000', 'Romblon', '1700000000'),
  ('1705917000', 'Santa Maria', 'municipality', '1705900000', 'Romblon', '1700000000'),
  ('1804503000', 'Binalbagan', 'municipality', '1804500000', 'Negros Occidental', '1800000000'),
  ('1804505000', 'Calatrava', 'municipality', '1804500000', 'Negros Occidental', '1800000000'),
  ('1804506000', 'Candoni', 'municipality', '1804500000', 'Negros Occidental', '1800000000'),
  ('1804507000', 'Cauayan', 'municipality', '1804500000', 'Negros Occidental', '1800000000'),
  ('1830200000', 'City of Bacolod', 'city', '1804500000', 'Negros Occidental', '1800000000'),
  ('1804502000', 'City of Bago', 'city', '1804500000', 'Negros Occidental', '1800000000'),
  ('1804504000', 'City of Cadiz', 'city', '1804500000', 'Negros Occidental', '1800000000'),
  ('1804509000', 'City of Escalante', 'city', '1804500000', 'Negros Occidental', '1800000000'),
  ('1804510000', 'City of Himamaylan', 'city', '1804500000', 'Negros Occidental', '1800000000'),
  ('1804515000', 'City of Kabankalan', 'city', '1804500000', 'Negros Occidental', '1800000000'),
  ('1804516000', 'City of La Carlota', 'city', '1804500000', 'Negros Occidental', '1800000000'),
  ('1804523000', 'City of Sagay', 'city', '1804500000', 'Negros Occidental', '1800000000'),
  ('1804524000', 'City of San Carlos', 'city', '1804500000', 'Negros Occidental', '1800000000'),
  ('1804526000', 'City of Silay', 'city', '1804500000', 'Negros Occidental', '1800000000'),
  ('1804527000', 'City of Sipalay', 'city', '1804500000', 'Negros Occidental', '1800000000'),
  ('1804528000', 'City of Talisay', 'city', '1804500000', 'Negros Occidental', '1800000000'),
  ('1804531000', 'City of Victorias', 'city', '1804500000', 'Negros Occidental', '1800000000'),
  ('1804508000', 'Enrique B. Magalona', 'municipality', '1804500000', 'Negros Occidental', '1800000000'),
  ('1804511000', 'Hinigaran', 'municipality', '1804500000', 'Negros Occidental', '1800000000'),
  ('1804512000', 'Hinoba-an', 'municipality', '1804500000', 'Negros Occidental', '1800000000'),
  ('1804513000', 'Ilog', 'municipality', '1804500000', 'Negros Occidental', '1800000000'),
  ('1804514000', 'Isabela', 'municipality', '1804500000', 'Negros Occidental', '1800000000'),
  ('1804517000', 'La Castellana', 'municipality', '1804500000', 'Negros Occidental', '1800000000'),
  ('1804518000', 'Manapla', 'municipality', '1804500000', 'Negros Occidental', '1800000000'),
  ('1804519000', 'Moises Padilla', 'municipality', '1804500000', 'Negros Occidental', '1800000000'),
  ('1804520000', 'Murcia', 'municipality', '1804500000', 'Negros Occidental', '1800000000'),
  ('1804521000', 'Pontevedra', 'municipality', '1804500000', 'Negros Occidental', '1800000000'),
  ('1804522000', 'Pulupandan', 'municipality', '1804500000', 'Negros Occidental', '1800000000'),
  ('1804532000', 'Salvador Benedicto', 'municipality', '1804500000', 'Negros Occidental', '1800000000'),
  ('1804525000', 'San Enrique', 'municipality', '1804500000', 'Negros Occidental', '1800000000'),
  ('1804529000', 'Toboso', 'municipality', '1804500000', 'Negros Occidental', '1800000000'),
  ('1804530000', 'Valladolid', 'municipality', '1804500000', 'Negros Occidental', '1800000000'),
  ('1804601000', 'Amlan', 'municipality', '1804600000', 'Negros Oriental', '1800000000'),
  ('1804602000', 'Ayungon', 'municipality', '1804600000', 'Negros Oriental', '1800000000'),
  ('1804603000', 'Bacong', 'municipality', '1804600000', 'Negros Oriental', '1800000000'),
  ('1804605000', 'Basay', 'municipality', '1804600000', 'Negros Oriental', '1800000000'),
  ('1804607000', 'Bindoy', 'municipality', '1804600000', 'Negros Oriental', '1800000000'),
  ('1804604000', 'City of Bais', 'city', '1804600000', 'Negros Oriental', '1800000000'),
  ('1804606000', 'City of Bayawan', 'city', '1804600000', 'Negros Oriental', '1800000000'),
  ('1804608000', 'City of Canlaon', 'city', '1804600000', 'Negros Oriental', '1800000000'),
  ('1804610000', 'City of Dumaguete', 'city', '1804600000', 'Negros Oriental', '1800000000'),
  ('1804611000', 'City of Guihulngan', 'city', '1804600000', 'Negros Oriental', '1800000000'),
  ('1804621000', 'City of Tanjay', 'city', '1804600000', 'Negros Oriental', '1800000000'),
  ('1804609000', 'Dauin', 'municipality', '1804600000', 'Negros Oriental', '1800000000'),
  ('1804612000', 'Jimalalud', 'municipality', '1804600000', 'Negros Oriental', '1800000000'),
  ('1804613000', 'La Libertad', 'municipality', '1804600000', 'Negros Oriental', '1800000000'),
  ('1804614000', 'Mabinay', 'municipality', '1804600000', 'Negros Oriental', '1800000000'),
  ('1804615000', 'Manjuyod', 'municipality', '1804600000', 'Negros Oriental', '1800000000'),
  ('1804616000', 'Pamplona', 'municipality', '1804600000', 'Negros Oriental', '1800000000'),
  ('1804617000', 'San Jose', 'municipality', '1804600000', 'Negros Oriental', '1800000000'),
  ('1804618000', 'Santa Catalina', 'municipality', '1804600000', 'Negros Oriental', '1800000000'),
  ('1804619000', 'Siaton', 'municipality', '1804600000', 'Negros Oriental', '1800000000'),
  ('1804620000', 'Sibulan', 'municipality', '1804600000', 'Negros Oriental', '1800000000'),
  ('1804622000', 'Tayasan', 'municipality', '1804600000', 'Negros Oriental', '1800000000'),
  ('1804623000', 'Valencia', 'municipality', '1804600000', 'Negros Oriental', '1800000000'),
  ('1804624000', 'Vallehermoso', 'municipality', '1804600000', 'Negros Oriental', '1800000000'),
  ('1804625000', 'Zamboanguita', 'municipality', '1804600000', 'Negros Oriental', '1800000000'),
  ('1806101000', 'Enrique Villanueva', 'municipality', '1806100000', 'Siquijor', '1800000000'),
  ('1806102000', 'Larena', 'municipality', '1806100000', 'Siquijor', '1800000000'),
  ('1806103000', 'Lazi', 'municipality', '1806100000', 'Siquijor', '1800000000'),
  ('1806104000', 'Maria', 'municipality', '1806100000', 'Siquijor', '1800000000'),
  ('1806105000', 'San Juan', 'municipality', '1806100000', 'Siquijor', '1800000000'),
  ('1806106000', 'Siquijor', 'municipality', '1806100000', 'Siquijor', '1800000000'),
  ('1900708000', 'Akbar', 'municipality', '1900700000', 'Basilan', '1900000000'),
  ('1900709000', 'Al-Barka', 'municipality', '1900700000', 'Basilan', '1900000000'),
  ('1900702000', 'City of Lamitan', 'city', '1900700000', 'Basilan', '1900000000'),
  ('1900710000', 'Hadji Mohammad Ajul', 'municipality', '1900700000', 'Basilan', '1900000000'),
  ('1900712000', 'Hadji Muhtamad', 'municipality', '1900700000', 'Basilan', '1900000000'),
  ('1900703000', 'Lantawan', 'municipality', '1900700000', 'Basilan', '1900000000'),
  ('1900704000', 'Maluso', 'municipality', '1900700000', 'Basilan', '1900000000'),
  ('1900705000', 'Sumisip', 'municipality', '1900700000', 'Basilan', '1900000000'),
  ('1900713000', 'Tabuan-Lasa', 'municipality', '1900700000', 'Basilan', '1900000000'),
  ('1900706000', 'Tipo-Tipo', 'municipality', '1900700000', 'Basilan', '1900000000'),
  ('1900707000', 'Tuburan', 'municipality', '1900700000', 'Basilan', '1900000000'),
  ('1900711000', 'Ungkaya Pukan', 'municipality', '1900700000', 'Basilan', '1900000000'),
  ('1903637000', 'Amai Manabilang', 'municipality', '1903600000', 'Lanao del Sur', '1900000000'),
  ('1903601000', 'Bacolod-Kalawi', 'municipality', '1903600000', 'Lanao del Sur', '1900000000'),
  ('1903602000', 'Balabagan', 'municipality', '1903600000', 'Lanao del Sur', '1900000000'),
  ('1903603000', 'Balindong', 'municipality', '1903600000', 'Lanao del Sur', '1900000000'),
  ('1903604000', 'Bayang', 'municipality', '1903600000', 'Lanao del Sur', '1900000000'),
  ('1903605000', 'Binidayan', 'municipality', '1903600000', 'Lanao del Sur', '1900000000'),
  ('1903633000', 'Buadiposo-Buntong', 'municipality', '1903600000', 'Lanao del Sur', '1900000000'),
  ('1903606000', 'Bubong', 'municipality', '1903600000', 'Lanao del Sur', '1900000000'),
  ('1903607000', 'Butig', 'municipality', '1903600000', 'Lanao del Sur', '1900000000'),
  ('1903632000', 'Calanogas', 'municipality', '1903600000', 'Lanao del Sur', '1900000000'),
  ('1903617000', 'City of Marawi', 'city', '1903600000', 'Lanao del Sur', '1900000000'),
  ('1903624000', 'Ditsaan-Ramain', 'municipality', '1903600000', 'Lanao del Sur', '1900000000'),
  ('1903609000', 'Ganassi', 'municipality', '1903600000', 'Lanao del Sur', '1900000000'),
  ('1903610000', 'Kapai', 'municipality', '1903600000', 'Lanao del Sur', '1900000000'),
  ('1903639000', 'Kapatagan', 'municipality', '1903600000', 'Lanao del Sur', '1900000000'),
  ('1903611000', 'Lumba-Bayabao', 'municipality', '1903600000', 'Lanao del Sur', '1900000000'),
  ('1903641000', 'Lumbaca-Unayan', 'municipality', '1903600000', 'Lanao del Sur', '1900000000'),
  ('1903612000', 'Lumbatan', 'municipality', '1903600000', 'Lanao del Sur', '1900000000'),
  ('1903636000', 'Lumbayanague', 'municipality', '1903600000', 'Lanao del Sur', '1900000000'),
  ('1903613000', 'Madalum', 'municipality', '1903600000', 'Lanao del Sur', '1900000000'),
  ('1903614000', 'Madamba', 'municipality', '1903600000', 'Lanao del Sur', '1900000000'),
  ('1903634000', 'Maguing', 'municipality', '1903600000', 'Lanao del Sur', '1900000000'),
  ('1903615000', 'Malabang', 'municipality', '1903600000', 'Lanao del Sur', '1900000000'),
  ('1903616000', 'Marantao', 'municipality', '1903600000', 'Lanao del Sur', '1900000000'),
  ('1903631000', 'Marogong', 'municipality', '1903600000', 'Lanao del Sur', '1900000000'),
  ('1903618000', 'Masiu', 'municipality', '1903600000', 'Lanao del Sur', '1900000000'),
  ('1903619000', 'Mulondo', 'municipality', '1903600000', 'Lanao del Sur', '1900000000'),
  ('1903620000', 'Pagayawan', 'municipality', '1903600000', 'Lanao del Sur', '1900000000'),
  ('1903621000', 'Piagapo', 'municipality', '1903600000', 'Lanao del Sur', '1900000000'),
  ('1903635000', 'Picong', 'municipality', '1903600000', 'Lanao del Sur', '1900000000'),
  ('1903622000', 'Poona Bayabao', 'municipality', '1903600000', 'Lanao del Sur', '1900000000'),
  ('1903623000', 'Pualas', 'municipality', '1903600000', 'Lanao del Sur', '1900000000'),
  ('1903625000', 'Saguiaran', 'municipality', '1903600000', 'Lanao del Sur', '1900000000'),
  ('1903640000', 'Sultan Dumalondong', 'municipality', '1903600000', 'Lanao del Sur', '1900000000'),
  ('1903638000', 'Tagoloan Ii', 'municipality', '1903600000', 'Lanao del Sur', '1900000000'),
  ('1903626000', 'Tamparan', 'municipality', '1903600000', 'Lanao del Sur', '1900000000'),
  ('1903627000', 'Taraka', 'municipality', '1903600000', 'Lanao del Sur', '1900000000'),
  ('1903628000', 'Tubaran', 'municipality', '1903600000', 'Lanao del Sur', '1900000000'),
  ('1903629000', 'Tugaya', 'municipality', '1903600000', 'Lanao del Sur', '1900000000'),
  ('1903630000', 'Wao', 'municipality', '1903600000', 'Lanao del Sur', '1900000000'),
  ('1906606000', 'Hadji Panglima Tahil', 'municipality', '1906600000', 'Sulu', '1900000000'),
  ('1906601000', 'Indanan', 'municipality', '1906600000', 'Sulu', '1900000000'),
  ('1906602000', 'Jolo', 'municipality', '1906600000', 'Sulu', '1900000000'),
  ('1906603000', 'Kalingalan Caluang', 'municipality', '1906600000', 'Sulu', '1900000000'),
  ('1906617000', 'Lugus', 'municipality', '1906600000', 'Sulu', '1900000000'),
  ('1906604000', 'Luuk', 'municipality', '1906600000', 'Sulu', '1900000000'),
  ('1906605000', 'Maimbung', 'municipality', '1906600000', 'Sulu', '1900000000'),
  ('1906607000', 'Old Panamao', 'municipality', '1906600000', 'Sulu', '1900000000'),
  ('1906619000', 'Omar', 'municipality', '1906600000', 'Sulu', '1900000000'),
  ('1906618000', 'Pandami', 'municipality', '1906600000', 'Sulu', '1900000000'),
  ('1906616000', 'Panglima Estino', 'municipality', '1906600000', 'Sulu', '1900000000'),
  ('1906608000', 'Pangutaran', 'municipality', '1906600000', 'Sulu', '1900000000'),
  ('1906609000', 'Parang', 'municipality', '1906600000', 'Sulu', '1900000000'),
  ('1906610000', 'Pata', 'municipality', '1906600000', 'Sulu', '1900000000'),
  ('1906611000', 'Patikul', 'municipality', '1906600000', 'Sulu', '1900000000'),
  ('1906612000', 'Siasi', 'municipality', '1906600000', 'Sulu', '1900000000'),
  ('1906613000', 'Talipao', 'municipality', '1906600000', 'Sulu', '1900000000'),
  ('1906614000', 'Tapul', 'municipality', '1906600000', 'Sulu', '1900000000'),
  ('1906615000', 'Tongkil', 'municipality', '1906600000', 'Sulu', '1900000000'),
  ('1907002000', 'Bongao', 'municipality', '1907000000', 'Tawi-Tawi', '1900000000'),
  ('1907009000', 'Languyan', 'municipality', '1907000000', 'Tawi-Tawi', '1900000000'),
  ('1907003000', 'Mapun', 'municipality', '1907000000', 'Tawi-Tawi', '1900000000'),
  ('1907001000', 'Panglima Sugala', 'municipality', '1907000000', 'Tawi-Tawi', '1900000000'),
  ('1907010000', 'Sapa-Sapa', 'municipality', '1907000000', 'Tawi-Tawi', '1900000000'),
  ('1907011000', 'Sibutu', 'municipality', '1907000000', 'Tawi-Tawi', '1900000000'),
  ('1907004000', 'Simunul', 'municipality', '1907000000', 'Tawi-Tawi', '1900000000'),
  ('1907005000', 'Sitangkai', 'municipality', '1907000000', 'Tawi-Tawi', '1900000000'),
  ('1907006000', 'South Ubian', 'municipality', '1907000000', 'Tawi-Tawi', '1900000000'),
  ('1907007000', 'Tandubas', 'municipality', '1907000000', 'Tawi-Tawi', '1900000000'),
  ('1907008000', 'Turtle Islands', 'municipality', '1907000000', 'Tawi-Tawi', '1900000000'),
  ('1908701000', 'Barira', 'municipality', '1908700000', 'Maguindanao del Norte', '1900000000'),
  ('1908702000', 'Buldon', 'municipality', '1908700000', 'Maguindanao del Norte', '1900000000'),
  ('1908703000', 'City of Cotabato', 'city', '1908700000', 'Maguindanao del Norte', '1900000000'),
  ('1908704000', 'Datu Blah T. Sinsuat', 'municipality', '1908700000', 'Maguindanao del Norte', '1900000000'),
  ('1908705000', 'Datu Odin Sinsuat', 'municipality', '1908700000', 'Maguindanao del Norte', '1900000000'),
  ('1908706000', 'Kabuntalan', 'municipality', '1908700000', 'Maguindanao del Norte', '1900000000'),
  ('1908707000', 'Matanog', 'municipality', '1908700000', 'Maguindanao del Norte', '1900000000'),
  ('1908708000', 'Northern Kabuntalan', 'municipality', '1908700000', 'Maguindanao del Norte', '1900000000'),
  ('1908709000', 'Parang', 'municipality', '1908700000', 'Maguindanao del Norte', '1900000000'),
  ('1908710000', 'Sultan Kudarat', 'municipality', '1908700000', 'Maguindanao del Norte', '1900000000'),
  ('1908711000', 'Sultan Mastura', 'municipality', '1908700000', 'Maguindanao del Norte', '1900000000'),
  ('1908712000', 'Talitay', 'municipality', '1908700000', 'Maguindanao del Norte', '1900000000'),
  ('1908713000', 'Upi', 'municipality', '1908700000', 'Maguindanao del Norte', '1900000000'),
  ('1908801000', 'Ampatuan', 'municipality', '1908800000', 'Maguindanao del Sur', '1900000000'),
  ('1908802000', 'Buluan', 'municipality', '1908800000', 'Maguindanao del Sur', '1900000000'),
  ('1908803000', 'Datu Abdullah Sangki', 'municipality', '1908800000', 'Maguindanao del Sur', '1900000000'),
  ('1908804000', 'Datu Anggal Midtimbang', 'municipality', '1908800000', 'Maguindanao del Sur', '1900000000'),
  ('1908805000', 'Datu Hoffer Ampatuan', 'municipality', '1908800000', 'Maguindanao del Sur', '1900000000'),
  ('1908806000', 'Datu Paglas', 'municipality', '1908800000', 'Maguindanao del Sur', '1900000000'),
  ('1908807000', 'Datu Piang', 'municipality', '1908800000', 'Maguindanao del Sur', '1900000000'),
  ('1908808000', 'Datu Salibo', 'municipality', '1908800000', 'Maguindanao del Sur', '1900000000'),
  ('1908809000', 'Datu Saudi Ampatuan', 'municipality', '1908800000', 'Maguindanao del Sur', '1900000000'),
  ('1908810000', 'Datu Unsay', 'municipality', '1908800000', 'Maguindanao del Sur', '1900000000'),
  ('1908811000', 'Gen. S.K. Pendatun', 'municipality', '1908800000', 'Maguindanao del Sur', '1900000000'),
  ('1908812000', 'Guindulungan', 'municipality', '1908800000', 'Maguindanao del Sur', '1900000000'),
  ('1908813000', 'Mamasapano', 'municipality', '1908800000', 'Maguindanao del Sur', '1900000000'),
  ('1908814000', 'Mangudadatu', 'municipality', '1908800000', 'Maguindanao del Sur', '1900000000'),
  ('1908815000', 'Pagagawan', 'municipality', '1908800000', 'Maguindanao del Sur', '1900000000'),
  ('1908816000', 'Pagalungan', 'municipality', '1908800000', 'Maguindanao del Sur', '1900000000'),
  ('1908817000', 'Paglat', 'municipality', '1908800000', 'Maguindanao del Sur', '1900000000'),
  ('1908818000', 'Pandag', 'municipality', '1908800000', 'Maguindanao del Sur', '1900000000'),
  ('1908819000', 'Rajah Buayan', 'municipality', '1908800000', 'Maguindanao del Sur', '1900000000'),
  ('1908820000', 'Shariff Aguak', 'municipality', '1908800000', 'Maguindanao del Sur', '1900000000'),
  ('1908821000', 'Shariff Saydona Mustapha', 'municipality', '1908800000', 'Maguindanao del Sur', '1900000000'),
  ('1908822000', 'South Upi', 'municipality', '1908800000', 'Maguindanao del Sur', '1900000000'),
  ('1908823000', 'Sultan Sa Barongis', 'municipality', '1908800000', 'Maguindanao del Sur', '1900000000'),
  ('1908824000', 'Talayan', 'municipality', '1908800000', 'Maguindanao del Sur', '1900000000'),
  ('1999903000', 'Kadayangan', 'municipality', '1999900000', null, '1900000000'),
  ('1999901000', 'Kapalawan', 'municipality', '1999900000', null, '1900000000'),
  ('1999907000', 'Ligawasan', 'municipality', '1999900000', null, '1900000000'),
  ('1999906000', 'Malidegao', 'municipality', '1999900000', null, '1900000000'),
  ('1999904000', 'Nabalawag', 'municipality', '1999900000', null, '1900000000'),
  ('1999902000', 'Old Kaabakan', 'municipality', '1999900000', null, '1900000000'),
  ('1999905000', 'Pahamuddin', 'municipality', '1999900000', null, '1900000000'),
  ('1999908000', 'Tugunan', 'municipality', '1999900000', null, '1900000000')
on conflict (code) do nothing;

-- ===========================================================================================================
-- B. Appointments
-- ===========================================================================================================
-- The national team: founder (super_admin), admins and national reviewers (the same people as is_partner_reviewer()).
create or replace function public.partner_is_national(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select uid is not null and exists (select 1 from public.roles x where x.user_id = uid and x.role in ('super_admin', 'admin', 'national_reviewer'));
$$;
revoke all on function public.partner_is_national(uuid) from public, anon, authenticated;
grant execute on function public.partner_is_national(uuid) to service_role;

create table if not exists public.territorial_appointments (
  id uuid primary key default gen_random_uuid(),
  partner_user_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid references public.territorial_appointments(id) on delete set null,   -- set for a sub-partner
  nomination_id uuid,                                                                   -- the nomination it came from
  partner_category text not null check (partner_category in ('supplier', 'service_provider', 'toll_manufacturer')),
  rights text not null default 'distribution' check (rights in ('distribution', 'manufacturing')),
  category_key text not null check (category_key ~ '^[a-z0-9][a-z0-9_:-]{1,79}$'),       -- compared for overlaps
  category_label text not null check (char_length(category_label) between 2 and 150),   -- shown to people
  offer_id uuid references public.supplier_offers(id) on delete set null,                -- the Best Offer behind it
  exclusivity text not null default 'non_exclusive' check (exclusivity in ('non_exclusive', 'exclusive')),
  channels text[] not null default '{}' check (channels <@ array['group_order', 'chapter_events', 'direct_members', 'marketplaceph',
    'negosyodepot', 'own_online', 'own_store', 'resellers'] and cardinality(channels) <= 8),
  online_sales text check (online_sales in ('delivery_address', 'national_online', 'open')),
  online_note text check (char_length(online_note) <= 500),
  excluded_accounts text[] not null default '{}' check (cardinality(excluded_accounts) <= 30),
  start_date date,
  end_date date,
  target_period text check (target_period in ('monthly', 'quarterly', 'yearly')),
  target_net_sales numeric(14,2) check (target_net_sales >= 0 and target_net_sales <= 100000000000),
  target_members int check (target_members between 0 and 1000000),
  target_note text check (char_length(target_note) <= 1000),
  review_every text check (review_every in ('monthly', 'quarterly', 'semiannual', 'yearly')),
  next_review_date date,
  terms_note text check (char_length(terms_note) <= 2000),          -- shown to the partner
  internal_note text check (char_length(internal_note) <= 2000),    -- national team only
  overlap_approved boolean not null default false,
  overlap_reason text check (char_length(overlap_reason) <= 1000),
  overlap_with uuid[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'active', 'suspended', 'ended', 'cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  approver_declared_at timestamptz,   -- the approver declared no conflict of interest
  changed_by uuid references auth.users(id) on delete set null,   -- who made the last status change
  changed_at timestamptz,
  status_reason text check (char_length(status_reason) <= 1000),  -- why it was suspended, ended or cancelled
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint territorial_appointments_not_own_parent check (parent_id is null or parent_id <> id),
  constraint territorial_appointments_dates check (start_date is null or end_date is null or end_date > start_date),
  constraint territorial_appointments_length check (start_date is null or end_date is null or end_date <= start_date + 3653),
  -- Nothing is approved without the basics.
  constraint territorial_appointments_complete check (
    status in ('draft', 'cancelled')
    or (start_date is not null and end_date is not null and online_sales is not null and review_every is not null
        and cardinality(channels) >= 1 and approved_at is not null and approver_declared_at is not null)
  ),
  constraint territorial_appointments_overlap_reason check (not overlap_approved or overlap_reason is not null),
  constraint territorial_appointments_reason check (status not in ('suspended', 'ended') or status_reason is not null)
);
create index if not exists territorial_appointments_partner on public.territorial_appointments (partner_user_id, created_at desc);
create index if not exists territorial_appointments_scope on public.territorial_appointments (category_key, rights, status);
create index if not exists territorial_appointments_parent on public.territorial_appointments (parent_id) where parent_id is not null;

-- ===========================================================================================================
-- C. Areas of an appointment. The trigger fills in the region, province and city codes and a readable label, so two
--    areas overlap exactly when one contains the other (the whole country contains everything).
-- ===========================================================================================================
create table if not exists public.territory_areas (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.territorial_appointments(id) on delete cascade,
  level text not null check (level in ('national', 'region', 'province', 'city')),
  code text check (code ~ '^[0-9]{10}$'),
  region_code text,
  province_code text,
  city_code text,
  label text not null default '' check (char_length(label) <= 200),
  created_at timestamptz not null default now(),
  constraint territory_areas_code check ((level = 'national') = (code is null))
);
create unique index if not exists territory_areas_unique on public.territory_areas (appointment_id, level, coalesce(code, ''));

-- True when area a contains area b (same or wider).
create or replace function public.territory_area_covers(ar text, ap text, ac text, br text, bp text, bc text) returns boolean
language sql immutable as $$
  select (ar is null or ar = br) is true and (ap is null or ap = bp) is true and (ac is null or ac = bc) is true;
$$;
create or replace function public.territory_area_overlap(ar text, ap text, ac text, br text, bp text, bc text) returns boolean
language sql immutable as $$
  select public.territory_area_covers(ar, ap, ac, br, bp, bc) or public.territory_area_covers(br, bp, bc, ar, ap, ac);
$$;

create or replace function public.territory_area_fill() returns trigger
language plpgsql as $$
declare st text; r record;
begin
  select a.status into st from public.territorial_appointments a where a.id = coalesce(new.appointment_id, old.appointment_id);
  if not found then return coalesce(new, old); end if;   -- the appointment is being erased with its account
  if tg_op = 'UPDATE' then raise exception 'territory_area: remove the area and add it again instead of changing it'; end if;
  if st <> 'draft' then raise exception 'territory_area: areas change only while the appointment is a draft'; end if;
  if tg_op = 'DELETE' then return old; end if;
  if (select count(*) from public.territory_areas t where t.appointment_id = new.appointment_id) >= 60 then
    raise exception 'territory_area: limit of 60 areas per appointment';
  end if;
  new.region_code := null; new.province_code := null; new.city_code := null;
  if new.level = 'national' then
    new.label := 'Whole Philippines';
  elsif new.level = 'region' then
    select g.code, g.label into r from public.ph_regions g where g.code = new.code;
    if not found then raise exception 'territory_area: % is not a region code', new.code; end if;
    new.region_code := r.code; new.label := r.label;
  elsif new.level = 'province' then
    select p.psgc_code, p.region_code, p.name into r from public.ph_provinces p where p.psgc_code = new.code;
    if not found then raise exception 'territory_area: % is not a province code', new.code; end if;
    new.region_code := r.region_code; new.province_code := r.psgc_code;
    new.label := case when r.name = 'Metro Manila' then 'Metro Manila (all of NCR)' else r.name || ' (province)' end;
  else
    select c.code, c.name, c.province_code, c.province, c.region_code into r from public.ph_cities c where c.code = new.code;
    if not found then raise exception 'territory_area: % is not a city or municipality code', new.code; end if;
    new.region_code := r.region_code; new.province_code := r.province_code; new.city_code := r.code;
    new.label := r.name || coalesce(', ' || r.province, '');
  end if;
  return new;
end $$;
drop trigger if exists territory_areas_fill on public.territory_areas;
create trigger territory_areas_fill before insert or update or delete on public.territory_areas
  for each row execute function public.territory_area_fill();

-- ===========================================================================================================
-- D. Overlap check: other live appointments (active or suspended) of ANOTHER partner, for the same rights and
--    category, with overlapping dates, a shared selling channel and an overlapping area, where at least one of the two
--    is exclusive. A sub-partner never conflicts with its own main appointment. Used by the approval rule below and by
--    the admin page (server only).
-- ===========================================================================================================
create or replace function public.territory_conflicts(p_id uuid)
returns table (other_id uuid, other_partner uuid, other_status text, other_exclusivity text, area text, other_area text)
language sql stable security definer set search_path = public as $$
  select distinct b.id, b.partner_user_id, b.status, b.exclusivity, aa.label, ba.label
  from public.territorial_appointments a
  join public.territory_areas aa on aa.appointment_id = a.id
  join public.territorial_appointments b
    on b.id <> a.id
   and b.status in ('active', 'suspended')
   and b.partner_user_id <> a.partner_user_id
   and b.rights = a.rights and b.category_key = a.category_key
   and (a.exclusivity = 'exclusive' or b.exclusivity = 'exclusive')
   and daterange(a.start_date, a.end_date, '[]') && daterange(b.start_date, b.end_date, '[]')
   and (cardinality(a.channels) = 0 or a.channels && b.channels)
   and b.id is distinct from a.parent_id and b.parent_id is distinct from a.id
  join public.territory_areas ba
    on ba.appointment_id = b.id
   and public.territory_area_overlap(aa.region_code, aa.province_code, aa.city_code, ba.region_code, ba.province_code, ba.city_code)
  where a.id = p_id
  order by b.id;
$$;
revoke all on function public.territory_conflicts(uuid) from public, anon, authenticated;
grant execute on function public.territory_conflicts(uuid) to service_role;

-- ===========================================================================================================
-- E. Rules the database enforces, whoever writes
-- ===========================================================================================================
create or replace function public.territorial_appointment_guard() returns trigger
language plpgsql as $$
declare
  p record; n int; ids uuid[];
  free text[] := array['updated_at', 'next_review_date', 'internal_note'];
  fks text[] := array['parent_id', 'nomination_id', 'offer_id', 'created_by', 'approved_by', 'changed_by'];
  moves text[] := array['status', 'approved_by', 'approved_at', 'approver_declared_at', 'overlap_approved', 'overlap_reason', 'overlap_with',
                        'changed_by', 'changed_at', 'status_reason', 'ended_at'];
begin
  new.updated_at := now();
  if new.excluded_accounts is not null and exists (select 1 from unnest(new.excluded_accounts) x where char_length(btrim(x)) not between 1 and 150) then
    raise exception 'territory: each excluded account is 1 to 150 characters';
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then raise exception 'territory: new appointments start as draft'; end if;
    if not public.partner_is_national(new.created_by) or new.created_by = new.partner_user_id then
      raise exception 'territory: only the national team appoints, and never for itself';
    end if;
    if not exists (select 1 from public.partner_profiles pp where pp.user_id = new.partner_user_id and pp.status = 'accredited'
                   and new.partner_category = any(pp.categories)) then
      raise exception 'territory: only an accredited partner in this category can be appointed';
    end if;
    if (select count(*) from public.territorial_appointments t where t.partner_user_id = new.partner_user_id) >= 200 then
      raise exception 'territory: limit of 200 appointments per partner';
    end if;
    if new.parent_id is not null then
      select t.partner_user_id, t.parent_id into p from public.territorial_appointments t where t.id = new.parent_id;
      if not found then raise exception 'territory: the main appointment does not exist'; end if;
      if p.parent_id is not null then raise exception 'territory: a sub-partner cannot have sub-partners of its own'; end if;
      if p.partner_user_id = new.partner_user_id then raise exception 'territory: a partner cannot be its own sub-partner'; end if;
    end if;
    return new;
  end if;

  if new.partner_user_id <> old.partner_user_id or new.created_at <> old.created_at
     or new.created_by is distinct from old.created_by and new.created_by is not null then
    raise exception 'territory: partner and creator are fixed';
  end if;
  -- Erasing an account only empties the links to it.
  if (new.parent_id is distinct from old.parent_id and new.parent_id is not null and old.status <> 'draft')
     or (new.offer_id is distinct from old.offer_id and new.offer_id is not null and old.status <> 'draft')
     or (new.nomination_id is distinct from old.nomination_id and new.nomination_id is not null and old.status <> 'draft')
     or (new.approved_by is distinct from old.approved_by and new.approved_by is not null and not (old.status = 'draft' and new.status = 'active'))
     or (new.changed_by is distinct from old.changed_by and new.changed_by is not null and new.status = old.status) then
    raise exception 'territory: approved appointments cannot be changed';
  end if;

  if new.status = old.status then
    if old.status <> 'draft'
       and (to_jsonb(new) - (free || fks)) is distinct from (to_jsonb(old) - (free || fks)) then
      raise exception 'territory: % appointments cannot be changed (end it and start a new one)', old.status;
    end if;
    return new;
  end if;

  if not ((old.status, new.status) in (('draft', 'active'), ('draft', 'cancelled'), ('active', 'suspended'), ('suspended', 'active'),
                                       ('active', 'ended'), ('suspended', 'ended'))) then
    raise exception 'territory: cannot move from % to %', old.status, new.status;
  end if;
  if (to_jsonb(new) - (free || fks || moves)) is distinct from (to_jsonb(old) - (free || fks || moves)) then
    raise exception 'territory: change the status on its own, without other changes';
  end if;
  if not public.partner_is_national(new.changed_by) or new.changed_by = new.partner_user_id then
    raise exception 'territory: only the national team approves, suspends or ends, and never for itself';
  end if;
  new.changed_at := now();
  if new.status in ('suspended', 'ended', 'cancelled') and nullif(btrim(coalesce(new.status_reason, '')), '') is null then
    raise exception 'territory: write the reason';
  end if;
  if new.status = 'ended' then new.ended_at := now(); end if;

  if new.status = 'active' then
    perform pg_advisory_xact_lock(hashtext('territory:' || new.category_key));   -- two approvals at once cannot both pass
    if new.end_date < current_date then raise exception 'territory: the end date has passed'; end if;
    if not exists (select 1 from public.territory_areas t where t.appointment_id = new.id) then
      raise exception 'territory: add at least one area';
    end if;
    if old.status = 'draft' then
      new.approved_by := new.changed_by; new.approved_at := now();
      if new.approver_declared_at is null then raise exception 'territory: the approver must declare no conflict of interest'; end if;
      if not exists (select 1 from public.partner_profiles pp where pp.user_id = new.partner_user_id and pp.status = 'accredited'
                     and new.partner_category = any(pp.categories)) then
        raise exception 'territory: the partner is no longer accredited in this category';
      end if;
    end if;
    if new.parent_id is not null then
      select t.* into p from public.territorial_appointments t where t.id = new.parent_id;
      if p.status <> 'active' then raise exception 'territory: the main appointment is not active'; end if;
      if p.rights <> new.rights or p.category_key <> new.category_key then
        raise exception 'territory: a sub-partner gets the same category and rights as the main appointment';
      end if;
      if new.start_date < p.start_date or new.end_date > p.end_date then
        raise exception 'territory: a sub-partner''s dates must be inside the main appointment''s dates';
      end if;
      if new.exclusivity = 'exclusive' and p.exclusivity <> 'exclusive' then
        raise exception 'territory: a sub-partner can be exclusive only inside an exclusive main appointment';
      end if;
      if not (new.channels <@ p.channels) then raise exception 'territory: a sub-partner can use only the main appointment''s channels'; end if;
      if exists (select 1 from public.territory_areas c where c.appointment_id = new.id
                 and not exists (select 1 from public.territory_areas q where q.appointment_id = p.id
                                 and public.territory_area_covers(q.region_code, q.province_code, q.city_code, c.region_code, c.province_code, c.city_code))) then
        raise exception 'territory: a sub-partner''s areas must be inside the main appointment''s areas';
      end if;
    end if;
    select array_agg(distinct c.other_id) into ids from public.territory_conflicts(new.id) c;
    if ids is not null then
      if not new.overlap_approved then
        raise exception 'territory: overlaps an exclusive appointment for the same category (% found); approve the overlap with a reason, or change the area, dates or channels', cardinality(ids);
      end if;
      new.overlap_with := (select array_agg(distinct x) from unnest(coalesce(old.overlap_with, '{}') || ids) x);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists territorial_appointments_guard on public.territorial_appointments;
create trigger territorial_appointments_guard before insert or update on public.territorial_appointments
  for each row execute function public.territorial_appointment_guard();

-- When a main appointment ends, its sub-partners end with it (drafts under it are cancelled).
create or replace function public.territorial_appointment_after() returns trigger
language plpgsql as $$
declare c record;
begin
  if new.status = 'ended' and old.status <> 'ended' then
    for c in select t.id, t.status from public.territorial_appointments t where t.parent_id = new.id and t.status in ('draft', 'active', 'suspended') loop
      update public.territorial_appointments
         set status = case when c.status = 'draft' then 'cancelled' else 'ended' end, changed_by = new.changed_by,
             status_reason = left('The main partner''s appointment ended. ' || new.status_reason, 1000)
       where id = c.id;
      insert into public.territory_history (appointment_id, actor_id, action, note)
      values (c.id, new.changed_by, case when c.status = 'draft' then 'cancelled' else 'ended' end, left('The main partner''s appointment ended. ' || new.status_reason, 2000));
    end loop;
  end if;
  return null;
end $$;

-- ===========================================================================================================
-- F. Performance reviews and history (nobody can change or quietly delete them; rows go only with their appointment)
-- ===========================================================================================================
create table if not exists public.territory_reviews (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.territorial_appointments(id) on delete cascade,
  reviewer_id uuid references auth.users(id) on delete set null,
  period_start date not null,
  period_end date not null,
  actual_net_sales numeric(14,2) check (actual_net_sales >= 0 and actual_net_sales <= 100000000000),
  actual_members int check (actual_members between 0 and 1000000),
  rating text not null check (rating in ('exceeds', 'meets', 'below', 'far_below')),
  outcome text not null check (outcome in ('continue', 'improvement_plan', 'reduce_area', 'remove_exclusivity', 'end')),
  note text check (char_length(note) <= 2000),            -- shown to the partner
  internal_note text check (char_length(internal_note) <= 2000),   -- national team only
  created_at timestamptz not null default now(),
  constraint territory_reviews_period check (period_end >= period_start)
);
create index if not exists territory_reviews_appointment on public.territory_reviews (appointment_id, period_end desc);

create table if not exists public.territory_history (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.territorial_appointments(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('created', 'approved', 'suspended', 'resumed', 'ended', 'cancelled', 'reviewed', 'team_note', 'renewal_started')),
  note text check (char_length(note) <= 2000),
  internal boolean not null default false,
  snapshot jsonb check (snapshot is null or pg_column_size(snapshot) <= 60000),   -- the appointment and its areas as approved
  created_at timestamptz not null default now()
);
create index if not exists territory_history_appointment on public.territory_history (appointment_id, created_at);

create or replace function public.territory_review_guard() returns trigger
language plpgsql as $$
declare a record;
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.territorial_appointments t where t.id = old.appointment_id) then return old; end if;
    raise exception 'append_only: territory_reviews rows cannot be deleted';
  end if;
  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - 'reviewer_id') is distinct from (to_jsonb(old) - 'reviewer_id') or new.reviewer_id is not null then
      raise exception 'append_only: territory_reviews rows cannot be changed';
    end if;
    return new;   -- only reviewer_id may become empty, when that account is erased
  end if;
  select t.status, t.partner_user_id into a from public.territorial_appointments t where t.id = new.appointment_id;
  if a.status not in ('active', 'suspended', 'ended') then raise exception 'territory_review: only approved appointments are reviewed'; end if;
  if not public.partner_is_national(new.reviewer_id) or new.reviewer_id = a.partner_user_id then
    raise exception 'territory_review: only the national team reviews, and never its own appointment';
  end if;
  return new;
end $$;
drop trigger if exists territory_reviews_guard on public.territory_reviews;
create trigger territory_reviews_guard before insert or update or delete on public.territory_reviews
  for each row execute function public.territory_review_guard();

create or replace function public.territory_history_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.territorial_appointments t where t.id = old.appointment_id) then return old; end if;
    raise exception 'append_only: territory_history rows cannot be deleted';
  end if;
  if (to_jsonb(new) - 'actor_id') is distinct from (to_jsonb(old) - 'actor_id') or new.actor_id is not null then
    raise exception 'append_only: territory_history rows cannot be changed';
  end if;
  return new;
end $$;
drop trigger if exists territory_history_append_only on public.territory_history;
create trigger territory_history_append_only before update or delete on public.territory_history
  for each row execute function public.territory_history_guard();

drop trigger if exists territorial_appointments_after on public.territorial_appointments;
create trigger territorial_appointments_after after update on public.territorial_appointments
  for each row execute function public.territorial_appointment_after();

-- ===========================================================================================================
-- G. Sub-partner nominations: a partner suggests a business inside their own active territory. Only the national
--    team decides, and an accepted nomination only starts a draft appointment; the partner never appoints anyone.
-- ===========================================================================================================
create table if not exists public.territory_nominations (
  id uuid primary key default gen_random_uuid(),
  nominator_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid not null references public.territorial_appointments(id) on delete cascade,
  nominee_name text not null check (char_length(nominee_name) between 2 and 200),
  nominee_contact text not null check (char_length(nominee_contact) between 2 and 120),
  nominee_phone text check (char_length(nominee_phone) <= 40),
  nominee_email text check (char_length(nominee_email) <= 200),
  proposed_area text not null check (char_length(proposed_area) between 2 and 500),
  reason text not null check (char_length(reason) between 10 and 1000),
  nominee_agreed boolean not null check (nominee_agreed),   -- the nominee agreed to be contacted by FLAME PH
  status text not null default 'submitted' check (status in ('submitted', 'accepted', 'declined', 'withdrawn')),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  decision_note text check (char_length(decision_note) <= 1000),
  appointment_id uuid references public.territorial_appointments(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint territory_nominations_contact check (nominee_phone is not null or nominee_email is not null),
  constraint territory_nominations_declined check (status <> 'declined' or decision_note is not null)
);
create index if not exists territory_nominations_status on public.territory_nominations (status, created_at desc);
create index if not exists territory_nominations_nominator on public.territory_nominations (nominator_id, created_at desc);
alter table public.territorial_appointments drop constraint if exists territorial_appointments_nomination_fk;
alter table public.territorial_appointments add constraint territorial_appointments_nomination_fk
  foreign key (nomination_id) references public.territory_nominations(id) on delete set null;

create or replace function public.territory_nomination_guard() returns trigger
language plpgsql as $$
declare p record;
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    if new.status <> 'submitted' then raise exception 'territory_nomination: new nominations start as submitted'; end if;
    select t.partner_user_id, t.status, t.parent_id into p from public.territorial_appointments t where t.id = new.parent_id;
    if not found or p.status <> 'active' or p.partner_user_id <> new.nominator_id then
      raise exception 'territory_nomination: only the partner of an active appointment can nominate inside it';
    end if;
    if p.parent_id is not null then raise exception 'territory_nomination: sub-partners cannot nominate sub-partners'; end if;
    if (select count(*) from public.territory_nominations x where x.nominator_id = new.nominator_id and x.status = 'submitted') >= 10 then
      raise exception 'territory_nomination: limit of 10 open nominations';
    end if;
    return new;
  end if;
  if new.nominator_id <> old.nominator_id or new.parent_id <> old.parent_id or new.created_at <> old.created_at
     or (new.nominee_name, new.nominee_contact, new.nominee_phone, new.nominee_email, new.proposed_area, new.reason, new.nominee_agreed)
        is distinct from (old.nominee_name, old.nominee_contact, old.nominee_phone, old.nominee_email, old.proposed_area, old.reason, old.nominee_agreed) then
    raise exception 'territory_nomination: a sent nomination cannot be changed (withdraw it and send a new one)';
  end if;
  if new.status = old.status then
    -- Only linking the draft appointment it started, or an erased account / appointment, may change afterwards.
    if (new.decided_by is distinct from old.decided_by and new.decided_by is not null)
       or (new.decision_note, new.decided_at) is distinct from (old.decision_note, old.decided_at)
       or (new.appointment_id is distinct from old.appointment_id and (old.status <> 'accepted' or old.appointment_id is not null and new.appointment_id is not null)) then
      raise exception 'territory_nomination: a decided nomination cannot be changed';
    end if;
    return new;
  end if;
  if not ((old.status, new.status) in (('submitted', 'accepted'), ('submitted', 'declined'), ('submitted', 'withdrawn'))) then
    raise exception 'territory_nomination: cannot move from % to %', old.status, new.status;
  end if;
  if new.status in ('accepted', 'declined') then
    if not public.partner_is_national(new.decided_by) or new.decided_by = new.nominator_id then
      raise exception 'territory_nomination: only the national team decides';
    end if;
    new.decided_at := now();
  end if;
  return new;
end $$;
drop trigger if exists territory_nominations_guard on public.territory_nominations;
create trigger territory_nominations_guard before insert or update on public.territory_nominations
  for each row execute function public.territory_nomination_guard();

-- ===========================================================================================================
-- H. Row level security. The partner sees their own approved appointments (never drafts or cancelled ones), never
--    the team-only notes or the overlap details; the national team sees everything. No browser role can write.
-- ===========================================================================================================
create or replace function public.territory_mine(a_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.territorial_appointments a where a.id = a_id and a.partner_user_id = auth.uid()
                 and a.status in ('active', 'suspended', 'ended'));
$$;
revoke all on function public.territory_mine(uuid) from public, anon;
grant execute on function public.territory_mine(uuid) to authenticated, service_role;

alter table public.territorial_appointments enable row level security;
alter table public.territory_areas enable row level security;
alter table public.territory_reviews enable row level security;
alter table public.territory_history enable row level security;
alter table public.territory_nominations enable row level security;
revoke all on public.territorial_appointments from anon, authenticated;
revoke all on public.territory_areas from anon, authenticated;
revoke all on public.territory_reviews from anon, authenticated;
revoke all on public.territory_history from anon, authenticated;
revoke all on public.territory_nominations from anon, authenticated;
-- Every column except the team-only note and the overlap details.
grant select (id, partner_user_id, parent_id, nomination_id, partner_category, rights, category_key, category_label, offer_id, exclusivity,
  channels, online_sales, online_note, excluded_accounts, start_date, end_date, target_period, target_net_sales, target_members,
  target_note, review_every, next_review_date, terms_note, overlap_approved, status, approved_at, changed_at, status_reason, ended_at,
  created_at, updated_at) on public.territorial_appointments to authenticated;
grant select on public.territory_areas to authenticated;
grant select (id, appointment_id, period_start, period_end, actual_net_sales, actual_members, rating, outcome, note, created_at)
  on public.territory_reviews to authenticated;
grant select (id, appointment_id, action, note, internal, created_at) on public.territory_history to authenticated;
grant select on public.territory_nominations to authenticated;

drop policy if exists territorial_appointments_read on public.territorial_appointments;
create policy territorial_appointments_read on public.territorial_appointments for select to authenticated
  using (public.is_partner_reviewer() or (partner_user_id = auth.uid() and status in ('active', 'suspended', 'ended')));
drop policy if exists territory_areas_read on public.territory_areas;
create policy territory_areas_read on public.territory_areas for select to authenticated
  using (public.is_partner_reviewer() or public.territory_mine(appointment_id));
drop policy if exists territory_reviews_read on public.territory_reviews;
create policy territory_reviews_read on public.territory_reviews for select to authenticated
  using (public.is_partner_reviewer() or public.territory_mine(appointment_id));
drop policy if exists territory_history_read on public.territory_history;
create policy territory_history_read on public.territory_history for select to authenticated
  using (public.is_partner_reviewer() or (not internal and public.territory_mine(appointment_id)));
drop policy if exists territory_nominations_read on public.territory_nominations;
create policy territory_nominations_read on public.territory_nominations for select to authenticated
  using (public.is_partner_reviewer() or nominator_id = auth.uid());

-- The sub-partners appointed under the partner's own appointments: name, category, areas, dates and status only
-- (never their targets, reviews or notes).
create or replace function public.my_sub_partners()
returns table (id uuid, parent_id uuid, legal_name text, category_label text, exclusivity text, status text, start_date date, end_date date, areas text)
language sql stable security definer set search_path = public as $$
  select c.id, c.parent_id, pp.legal_name, c.category_label, c.exclusivity, c.status, c.start_date, c.end_date,
         (select string_agg(a.label, '; ' order by a.label) from public.territory_areas a where a.appointment_id = c.id)
  from public.territorial_appointments c
  join public.territorial_appointments p on p.id = c.parent_id and p.partner_user_id = auth.uid() and p.status in ('active', 'suspended', 'ended')
  left join public.partner_profiles pp on pp.user_id = c.partner_user_id
  where c.status in ('active', 'suspended', 'ended')
  order by c.start_date desc
  limit 200;
$$;
revoke all on function public.my_sub_partners() from public, anon;
grant execute on function public.my_sub_partners() to authenticated;
