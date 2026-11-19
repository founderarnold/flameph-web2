-- Phase 11: performance and cost. Additive only: new indexes and two read-only summary functions. No table, column or
-- row is changed. Take a backup before applying.
--
-- Indexes: every column a page or job filters on now has an index that starts with it (query audit, Phase 11 report).
-- The tables are small today (hundreds of rows), so each index builds in well under a second.
create index if not exists businesses_owner on public.businesses (owner_id);
create index if not exists ai_messages_created on public.ai_messages (created_at desc);
create index if not exists ai_conversations_user on public.ai_conversations (user_id, created_at desc);
create index if not exists ai_feedback_unreviewed on public.ai_feedback (created_at desc) where helpful = false and reviewed = false;
create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);
create index if not exists deal_participants_user on public.deal_participants (user_id);
create index if not exists event_registrations_user on public.event_registrations (user_id, created_at desc);
create index if not exists event_registrations_event on public.event_registrations (event_id);
create index if not exists transaction_records_request on public.transaction_records (request_id) where request_id is not null;
create index if not exists transaction_records_status on public.transaction_records (status, created_at desc);
create index if not exists business_reviews_user on public.business_reviews (user_id);
create index if not exists reward_redemptions_user on public.reward_redemptions (user_id, created_at desc);
create index if not exists moderation_appeals_status on public.moderation_appeals (status, due_at);
create index if not exists submissions_created on public.submissions (created_at desc);
create index if not exists posts_published on public.posts (published_at desc) where published;
create index if not exists opportunities_published on public.opportunities (created_at desc) where published;
create index if not exists events_published on public.events (starts_at) where published;
create index if not exists business_stats_day on public.business_stats (day);

-- Ka-FLAME spending caps (Phase 7) added up every message of the month in the app. The database returns at most 1,000
-- rows per request, so past 1,000 messages a month the cap would under-count. The database now adds them up itself.
-- Server only (service role): members and visitors can't call it.
create or replace function public.ai_month_spend(p_user uuid default null) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(m.cost_usd), 0) from public.ai_messages m
  where m.created_at >= date_trunc('month', now() at time zone 'Asia/Manila') at time zone 'Asia/Manila'
    and (p_user is null or m.user_id = p_user);
$$;
revoke all on function public.ai_month_spend(uuid) from public, anon, authenticated;
grant execute on function public.ai_month_spend(uuid) to service_role;

-- Admin → Ka-FLAME AI review: one row per day (Manila time) instead of every message.
create or replace function public.ai_usage_daily(p_days int default 30)
returns table (day date, questions int, input_tokens bigint, output_tokens bigint, cost_usd numeric)
language sql stable security definer set search_path = public as $$
  select (m.created_at at time zone 'Asia/Manila')::date, count(*)::int, coalesce(sum(m.input_tokens), 0), coalesce(sum(m.output_tokens), 0), coalesce(sum(m.cost_usd), 0)
  from public.ai_messages m
  where m.created_at >= now() - make_interval(days => least(greatest(p_days, 1), 366))
  group by 1 order by 1 desc;
$$;
revoke all on function public.ai_usage_daily(int) from public, anon, authenticated;
grant execute on function public.ai_usage_daily(int) to service_role;
