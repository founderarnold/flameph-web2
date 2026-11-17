import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getConsents } from "@/lib/consents";
import type { Reputation } from "@/lib/records";

/** True when the member has switch 2 ("Transaction records") on. If the consent log isn't ready, don't block anyone. */
export async function recordsConsentOn(supabase: SupabaseClient, userId: string) {
  const { ready, state } = await getConsents(supabase, userId);
  return !ready || Boolean(state.records?.granted);
}

/** A member's public reputation (counted records only). Null when they keep switch 2 off, or before the 0022 update. */
export async function reputation(supabase: SupabaseClient, userId: string): Promise<Reputation | null> {
  const { data, error } = await supabase.rpc("member_reputation", { uid: userId });
  const row = (Array.isArray(data) ? data[0] : data) as Reputation | undefined;
  if (error || !row) return null;
  return { ...row, rating_avg: row.rating_avg === null ? null : Number(row.rating_avg), tags: row.tags ?? {}, categories: row.categories ?? {} };
}

/** Records waiting for this member to confirm, plus requests sent to them that they haven't quoted yet (Inbox count). */
export async function recordsWaiting(supabase: SupabaseClient, userId: string): Promise<number> {
  const [recs, reqs] = await Promise.all([
    supabase.from("transaction_records").select("id, requester_id, requester_confirmed_at, provider_confirmed_at")
      .eq("status", "pending").or(`requester_id.eq.${userId},provider_id.eq.${userId}`).limit(100),
    supabase.from("service_requests").select("id").eq("provider_id", userId).eq("status", "open").limit(50),
  ]);
  if (recs.error) return 0;
  const waiting = (recs.data ?? []).filter((r) => (r.requester_id === userId ? !r.requester_confirmed_at : !r.provider_confirmed_at)).length;
  const ids = (reqs.data ?? []).map((r) => r.id as string);
  let unanswered = 0;
  if (ids.length) {
    const { data: q } = await supabase.from("service_quotes").select("request_id").eq("provider_id", userId).in("request_id", ids);
    const quoted = new Set((q ?? []).map((x) => x.request_id as string));
    unanswered = ids.filter((id) => !quoted.has(id)).length;
  }
  return waiting + unanswered;
}
