import { adminContext } from "@/lib/admin/guard";
import { csvCell, isDay, manilaDay, monthStart } from "@/lib/commission";

/** CSV of approved commission lines for a period (finance and the national team only). Figures are records only. */
export async function GET(req: Request) {
  const ctx = await adminContext(["super_admin", "admin", "national_reviewer", "finance"]);
  const url = new URL(req.url);
  const from = isDay(url.searchParams.get("from")) ? url.searchParams.get("from")! : monthStart();
  const to = isDay(url.searchParams.get("to")) ? url.searchParams.get("to")! : manilaDay();
  const { data, error } = await ctx.db.from("commission_lines")
    .select("level, recipient_key, recipient_label, pct, amount, payout_id, commission_entries!inner(kind, status, partner_name, partner_category, reference, sale_date, collected_on, place_label, net_amount, total_pct), commission_payouts(status, paid_on, mph_reference)")
    .eq("commission_entries.status", "approved").gte("commission_entries.sale_date", from).lte("commission_entries.sale_date", to).limit(50000);
  if (error) return new Response("Not available", { status: 500 });
  type Row = { level: string; recipient_key: string; recipient_label: string; pct: number; amount: number; payout_id: string | null;
    commission_entries: { kind: string; partner_name: string; partner_category: string; reference: string; sale_date: string; collected_on: string | null; place_label: string; net_amount: number; total_pct: number };
    commission_payouts: { status: string; paid_on: string | null; mph_reference: string | null } | null };
  const head = ["sale_date", "kind", "partner", "category", "order_reference", "collected_on", "place", "net_amount", "total_rate_pct", "level", "recipient", "recipient_key", "level_rate_pct", "amount", "payout_status", "paid_on", "mph_payment_reference"];
  const rows = ((data ?? []) as unknown as Row[]).sort((a, b) => a.commission_entries.sale_date.localeCompare(b.commission_entries.sale_date)).map((r) => [
    r.commission_entries.sale_date, r.commission_entries.kind, r.commission_entries.partner_name, r.commission_entries.partner_category, r.commission_entries.reference,
    r.commission_entries.collected_on, r.commission_entries.place_label, r.commission_entries.net_amount, r.commission_entries.total_pct, r.level, r.recipient_label, r.recipient_key,
    r.pct, r.amount, r.payout_id ? r.commission_payouts?.status ?? "draft" : "open", r.commission_payouts?.paid_on ?? "", r.commission_payouts?.mph_reference ?? "",
  ]);
  const note = "Record only. No money passes through flameph.org. Commissions, penalties and refunds are paid and collected by MarketplacePH Online Store.";
  const body = [csvCell(note), head.join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\r\n");
  await ctx.audit("commission_export", "commission_lines", undefined, { from, to, rows: rows.length });
  return new Response(`﻿${body}\r\n`, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="flameph-commissions-${from}-to-${to}.csv"`, "cache-control": "no-store" } });
}
