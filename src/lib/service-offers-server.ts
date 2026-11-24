import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { referenceSummary, type ReferenceRow, type TrackRecord } from "@/lib/service-offers";

/**
 * Customer results for service providers, for the national team only (called with the server key from Admin pages).
 * REUSES what already exists: member_reputation() (0022: confirmed deals, the ratings and endorsements members gave,
 * only when the provider keeps consent 2 on), complaints about the partner and chapter trials (0035), and the past
 * clients the team called (0036).
 */
export async function trackRecords(db: SupabaseClient, users: string[], refsByUser: Map<string, Pick<ReferenceRow, "verification" | "client_rating">[]>) {
  const ids = [...new Set(users)];
  if (!ids.length) return new Map<string, TrackRecord>();
  const [{ data: complaints }, { data: trials }, reps] = await Promise.all([
    db.from("partner_complaints").select("partner_user_id, status").in("partner_user_id", ids).neq("status", "draft").limit(5000),
    db.from("partner_sample_tests").select("partner_user_id, total, safety_concern").in("partner_user_id", ids).in("status", ["submitted", "reviewed"]).limit(5000),
    Promise.all(ids.map((uid) => db.rpc("member_reputation", { uid }))),
  ]);
  const out = new Map<string, TrackRecord>();
  ids.forEach((uid, i) => {
    const rep = ((reps[i]?.data ?? []) as { counted: number; confirmed: number; rating_avg: number | null; rating_count: number; tags: Record<string, number> }[])[0];
    const c = ((complaints ?? []) as { partner_user_id: string; status: string }[]).filter((x) => x.partner_user_id === uid);
    const t = ((trials ?? []) as { partner_user_id: string; total: number | null; safety_concern: boolean }[]).filter((x) => x.partner_user_id === uid);
    const scored = t.filter((x) => x.total !== null);
    const refs = referenceSummary(refsByUser.get(uid) ?? []);
    out.set(uid, {
      deals: rep?.confirmed ?? 0, ratingAvg: rep?.rating_avg === null || rep?.rating_avg === undefined ? null : Number(rep.rating_avg), ratingCount: rep?.rating_count ?? 0,
      tags: rep?.tags ?? {}, shared: !!rep,
      complaints: c.length, complaintsOpen: c.filter((x) => !["resolved", "closed"].includes(x.status)).length,
      trials: scored.length, trialAvg: scored.length ? Math.round((scored.reduce((n, x) => n + Number(x.total), 0) / scored.length) * 10) / 10 : null,
      safety: t.filter((x) => x.safety_concern).length,
      referencesVerified: refs.verified, referencesTotal: refs.total, referenceRating: refs.rating,
    });
  });
  return out;
}
