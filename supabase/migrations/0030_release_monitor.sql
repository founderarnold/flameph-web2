-- Phase 13: staged release and 7-day post-release monitoring. Additive only: two new tables, five new functions and one
-- settings row. Nothing existing is changed or removed. Take a backup before applying. Safe to run twice.
--
--   site_errors          one row per distinct error per day (browser or server) with a counter; no member id, no IP
--   web_vitals           sampled page-speed readings (LCP, INP, CLS, FCP, TTFB) by page pattern and phone/desktop
--   settings 'rollout'   the release stage (internal, ncr, calabarzon, central_luzon, all) and the monitoring window
--   release_health()     the numbers on Admin -> Release and in the daily release email
-- Everything is reachable only by the flameph.org server (service role).

-- ---------------------------------------------------------------------------
-- Errors and page speed. Anonymous: a page pattern (ids removed), a short message, phone or desktop.
-- ---------------------------------------------------------------------------
create table if not exists public.site_errors (
  id bigint generated always as identity primary key,
  day date not null default ((now() at time zone 'Asia/Manila')::date),
  kind text not null check (kind in ('browser', 'server')),
  path text not null check (char_length(path) between 1 and 200),
  message text not null check (char_length(message) between 1 and 300),
  count integer not null default 1 check (count >= 1),
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  unique (day, kind, path, message)
);
alter table public.site_errors enable row level security;
revoke all on public.site_errors from anon, authenticated;

create table if not exists public.web_vitals (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  metric text not null check (metric in ('LCP', 'INP', 'CLS', 'FCP', 'TTFB')),
  value double precision not null check (value >= 0 and value < 600000),
  path text not null check (char_length(path) between 1 and 200),
  device text not null check (device in ('mobile', 'desktop'))
);
create index if not exists web_vitals_at on public.web_vitals (at);
alter table public.web_vitals enable row level security;
revoke all on public.web_vitals from anon, authenticated;

-- Counts one error. At most 1,000 distinct errors a day are kept, so a flood can't fill the database (Free plan: 500 MB).
create or replace function public.site_error_log(p_kind text, p_path text, p_message text) returns void
language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Manila')::date;
begin
  if p_kind not in ('browser', 'server') then return; end if;
  update public.site_errors set count = least(count + 1, 1000000), last_at = now()
   where day = d and kind = p_kind and path = left(coalesce(nullif(p_path, ''), '/'), 200) and message = left(coalesce(nullif(p_message, ''), 'unknown'), 300);
  if found then return; end if;
  if (select count(*) from public.site_errors where day = d) >= 1000 then return; end if;
  insert into public.site_errors (day, kind, path, message)
  values (d, p_kind, left(coalesce(nullif(p_path, ''), '/'), 200), left(coalesce(nullif(p_message, ''), 'unknown'), 300))
  on conflict (day, kind, path, message) do update set count = least(public.site_errors.count + 1, 1000000), last_at = now();
end $$;

-- Stores one speed reading. At most 20,000 a day.
create or replace function public.web_vitals_log(p_metric text, p_value double precision, p_path text, p_device text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_metric not in ('LCP', 'INP', 'CLS', 'FCP', 'TTFB') or p_device not in ('mobile', 'desktop') or p_value is null or p_value < 0 or p_value >= 600000 then return; end if;
  if (select count(*) from public.web_vitals where at >= date_trunc('day', now())) >= 20000 then return; end if;
  insert into public.web_vitals (metric, value, path, device) values (p_metric, p_value, left(coalesce(nullif(p_path, ''), '/'), 200), p_device);
end $$;

-- Retention (Privacy Notice, section 5): error reports 90 days, speed readings 30 days. Run by the daily privacy job.
create or replace function public.release_monitor_cleanup() returns jsonb
language plpgsql security definer set search_path = public as $$
declare e int; v int;
begin
  delete from public.site_errors where day < (now() at time zone 'Asia/Manila')::date - 90; get diagnostics e = row_count;
  delete from public.web_vitals where at < now() - interval '30 days'; get diagnostics v = row_count;
  return jsonb_build_object('site_errors', e, 'web_vitals', v);
end $$;

-- ---------------------------------------------------------------------------
-- Release stage. Starts at "internal" (the FLAME PH team); Admin -> Release moves it on and records who and when.
-- ---------------------------------------------------------------------------
insert into public.settings (key, value, is_public)
values ('rollout', jsonb_build_object('stage', 'internal', 'started_at', now(), 'monitor_until', now() + interval '7 days', 'history', '[]'::jsonb), false)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- The 7-day health numbers: one row per day (Manila) plus "right now" figures and the most frequent errors.
-- ---------------------------------------------------------------------------
create or replace function public.release_health(p_days integer default 7) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  n int := least(greatest(coalesce(p_days, 7), 1), 31);
  today date := (now() at time zone 'Asia/Manila')::date;
  days_ jsonb; now_ jsonb; top_ jsonb; sso_ jsonb; regions_ jsonb;
  storage_bytes bigint := 0;
begin
  select coalesce(jsonb_agg(row_to_json(t) order by t.day desc), '[]'::jsonb) into days_ from (
    select d.day,
      (select coalesce(sum(count), 0) from public.site_errors e where e.day = d.day and e.kind = 'browser') as errors_browser,
      (select coalesce(sum(count), 0) from public.site_errors e where e.day = d.day and e.kind = 'server') as errors_server,
      (select count(*) from public.site_errors e where e.day = d.day) as distinct_errors,
      (select round(percentile_cont(0.75) within group (order by v.value)::numeric) from public.web_vitals v where (v.at at time zone 'Asia/Manila')::date = d.day and v.metric = 'LCP' and v.device = 'mobile') as lcp_p75_mobile,
      (select round(percentile_cont(0.75) within group (order by v.value)::numeric) from public.web_vitals v where (v.at at time zone 'Asia/Manila')::date = d.day and v.metric = 'LCP' and v.device = 'desktop') as lcp_p75_desktop,
      (select round(percentile_cont(0.75) within group (order by v.value)::numeric) from public.web_vitals v where (v.at at time zone 'Asia/Manila')::date = d.day and v.metric = 'INP') as inp_p75,
      (select round(percentile_cont(0.75) within group (order by v.value)::numeric, 3) from public.web_vitals v where (v.at at time zone 'Asia/Manila')::date = d.day and v.metric = 'CLS') as cls_p75,
      (select count(*) from public.web_vitals v where (v.at at time zone 'Asia/Manila')::date = d.day) as speed_samples,
      (select coalesce(round(sum(m.cost_usd)::numeric, 2), 0) from public.ai_messages m where (m.created_at at time zone 'Asia/Manila')::date = d.day) as ai_cost_usd,
      (select count(*) from public.ai_messages m where (m.created_at at time zone 'Asia/Manila')::date = d.day) as ai_questions,
      (select count(*) from public.profiles p where (p.created_at at time zone 'Asia/Manila')::date = d.day) as new_members,
      (select count(*) from public.moderation_reports r where (r.created_at at time zone 'Asia/Manila')::date = d.day) as reports_new,
      (select count(*) from public.moderation_reports r where (r.created_at at time zone 'Asia/Manila')::date = d.day and r.resolved_at is not null and r.resolved_at <= r.created_at + interval '24 hours') as reports_in_24h,
      (select count(*) from public.moderation_reports r where (r.created_at at time zone 'Asia/Manila')::date = d.day and (r.resolved_at > r.created_at + interval '24 hours' or (r.resolved_at is null and now() > r.created_at + interval '24 hours'))) as reports_late,
      (select count(*) from public.ecosystem_access_log l where (l.at at time zone 'Asia/Manila')::date = d.day) as cross_site_events,
      (select count(*) from public.ecosystem_access_log l where (l.at at time zone 'Asia/Manila')::date = d.day and l.result = 'refused') as cross_site_refused
    from generate_series(today - (n - 1), today, interval '1 day') as g(x), lateral (select g.x::date as day) d
  ) t;

  select coalesce(jsonb_agg(row_to_json(s)), '[]'::jsonb) into sso_ from (
    select l.client, l.purpose, l.result, count(*) as n from public.ecosystem_access_log l
    where l.at >= now() - make_interval(days => n) group by 1, 2, 3 order by 4 desc limit 30
  ) s;

  select coalesce(jsonb_agg(row_to_json(e)), '[]'::jsonb) into top_ from (
    select kind, path, message, sum(count) as count, max(last_at) as last_at from public.site_errors
    where day > today - n group by 1, 2, 3 order by 4 desc limit 10
  ) e;

  select coalesce(jsonb_agg(row_to_json(r)), '[]'::jsonb) into regions_ from (
    select initcap(trim(coalesce(nullif(p.province, ''), '(not set)'))) as province, count(*) as members,
           count(*) filter (where p.created_at >= now() - make_interval(days => n)) as new_members
    from public.profiles p group by 1 order by 2 desc limit 60
  ) r;

  begin
    select coalesce(sum((o.metadata ->> 'size')::bigint), 0) into storage_bytes from storage.objects o;
  exception when others then storage_bytes := null;
  end;

  now_ := jsonb_build_object(
    'members', (select count(*) from public.profiles),
    'reports_open', (select count(*) from public.moderation_reports where status = 'open'),
    'reports_overdue', (select count(*) from public.moderation_reports where status = 'open' and due_at < now()),
    'oldest_open_report_hours', (select round(extract(epoch from now() - min(created_at)) / 3600) from public.moderation_reports where status = 'open'),
    'appeals_open', (select count(*) from public.moderation_appeals where status = 'open'),
    'privacy_open', (select count(*) from public.privacy_requests where status in ('open', 'in_progress')),
    'privacy_overdue', (select count(*) from public.privacy_requests where status in ('open', 'in_progress') and due_at < now()),
    'alerts_critical', (select count(*) from public.security_signals where dismissed_at is null and severity = 'critical'),
    'alerts_warning', (select count(*) from public.security_signals where dismissed_at is null and severity = 'warning'),
    'incidents_open', (select count(*) from public.security_incidents where status <> 'closed'),
    'ai_month_usd', (select coalesce(round(public.ai_month_spend(null)::numeric, 2), 0)),
    'db_bytes', pg_database_size(current_database()),
    'storage_bytes', storage_bytes,
    'last_security_scan', (select max(last_seen) from public.security_signals),
    'last_retention_run', (select max(ran_at) from public.retention_runs where not dry_run)
  );
  return jsonb_build_object('days', days_, 'now', now_, 'top_errors', top_, 'cross_site', sso_, 'provinces', regions_, 'at', now());
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.site_error_log(text, text, text)', 'public.web_vitals_log(text, double precision, text, text)',
                           'public.release_monitor_cleanup()', 'public.release_health(integer)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
