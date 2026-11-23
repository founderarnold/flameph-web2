-- Undo for 0034_partner_commissions.sql. Run only with the owner's written approval, after a backup, in one transaction.
-- It removes only what 0034 added: the commission rates, ledger, lines, payouts and history, and their functions.
-- Everything from earlier migrations stays as it was.
-- It stops (and changes nothing) while any sale, refund or payout is recorded, or any rate other than the three seeded
-- defaults exists, so no record is lost by accident.
do $$ begin
  if exists (select 1 from public.commission_entries) or exists (select 1 from public.commission_payouts)
     or exists (select 1 from public.commission_rules where scope <> 'default' or status <> 'active' or created_by is not null) then
    raise exception 'undo 0034: commission records exist; keep 0034, or export and remove them first';
  end if;
end $$;

drop table if exists public.commission_lines;
drop table if exists public.commission_payouts;
drop table if exists public.commission_entries;
drop table if exists public.commission_history;
drop table if exists public.commission_rules;
drop function if exists public.commission_balances(date, date);
drop function if exists public.commission_reconcile(date, date);
drop function if exists public.commission_entry_mine(uuid);
drop function if exists public.commission_payout_after();
drop function if exists public.commission_payout_guard();
drop function if exists public.commission_line_guard();
drop function if exists public.commission_entry_after();
drop function if exists public.commission_entry_guard();
drop function if exists public.commission_chapter_for(text, text, text, text);
drop function if exists public.commission_rule_after();
drop function if exists public.commission_rule_guard();
drop function if exists public.commission_history_guard();
drop function if exists public.commission_rule_for(uuid, text, uuid, date);
drop function if exists public.is_commission_desk();
drop function if exists public.commission_is_finance(uuid);
