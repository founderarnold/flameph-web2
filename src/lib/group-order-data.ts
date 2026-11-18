import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { memberCards } from "@/lib/people";
import type { MemberCard } from "@/lib/people";
import type { GroupOrder, Progress } from "@/lib/group-order";

const NEW_COLS = "created_by, min_quantity, category, supplier_id, request_id, sent_at";
const BASE_COLS = "id, title, supplier, description, unit, deal_price, target_members, deadline, status, created_at";

/**
 * Group orders the member can see: FLAME PH's buy-together deals and member group orders (0024).
 * Before the 0024 update only FLAME PH's deals exist, and starting one is not offered (`ready` is false).
 */
export async function loadGroupOrders(supabase: SupabaseClient, me: string, opts: { id?: string; limit?: number } = {}) {
  const query = (cols: string) => {
    let q = supabase.from("deals").select(cols).eq("published", true);
    if (opts.id) q = q.eq("id", opts.id);
    else q = q.neq("status", "closed").order("deadline", { ascending: true, nullsFirst: false });
    return q.limit(opts.limit ?? 60);
  };
  let ready = true;
  let res = await query(`${BASE_COLS}, ${NEW_COLS}`);
  if (res.error) { ready = false; res = await query(BASE_COLS); }
  const orders = ((res.data ?? []) as unknown as Partial<GroupOrder>[]).map((d) => ({
    created_by: null, min_quantity: null, category: null, supplier_id: null, request_id: null, sent_at: null, ...d,
  })) as GroupOrder[];
  const ids = orders.map((o) => o.id);
  const [prog, counts, mine] = await Promise.all([
    ready && ids.length ? supabase.rpc("group_order_progress", { ids }) : Promise.resolve({ data: null, error: null }),
    !ready && ids.length ? supabase.rpc("deal_counts") : Promise.resolve({ data: null, error: null }),
    supabase.from("deal_participants").select("deal_id, quantity").eq("user_id", me).limit(200),
  ]);
  const progress = new Map<string, Progress>();
  for (const p of (prog.data ?? []) as Progress[]) progress.set(p.deal_id, { ...p, members: Number(p.members ?? 0), quantity: Number(p.quantity ?? 0), quotes: Number(p.quotes ?? 0) });
  for (const c of (counts.data ?? []) as { deal_id: string; members: number; quantity: number }[]) {
    if (!progress.has(c.deal_id)) progress.set(c.deal_id, { deal_id: c.deal_id, members: Number(c.members ?? 0), quantity: Number(c.quantity ?? 0), request_status: null, quotes: 0, record_id: null, record_status: null });
  }
  const joined = new Map(((mine.data ?? []) as { deal_id: string; quantity: number }[]).map((m) => [m.deal_id, m.quantity]));
  const people: Map<string, MemberCard> = await memberCards(supabase, orders.flatMap((o) => [o.created_by, o.supplier_id]).filter(Boolean) as string[]);
  return { ready, orders, progress, joined, people };
}

/** Who joined one group order, with names (no contact details). */
export async function groupOrderMembers(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase.rpc("group_order_members", { p_deal: id });
  const rows = (error ? [] : (data ?? [])) as { user_id: string; quantity: number; joined_at: string; is_organizer: boolean }[];
  const cards = await memberCards(supabase, rows.map((r) => r.user_id));
  return { available: !error, rows: rows.map((r) => ({ ...r, name: cards.get(r.user_id)?.name ?? "FLAME PH member", slug: cards.get(r.user_id)?.slug ?? null })) };
}
