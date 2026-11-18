import { NextResponse } from "next/server";
import { checkRateLimit, retryAfterHeaders } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/server";
import { BADGE_CACHE_SECONDS, readSiteCall, validSub } from "@/lib/ecosystem-sso";

/**
 * Badges for MarketplacePH and NegosyoDepot. Server-to-server only (no CORS headers, POST only, signed with the
 * site's own key, single use). At most 50 members per call, and only members who signed in to that site.
 *   POST { client, token }   token purpose "badges", claims { subs: string[], jti }
 * The database function ecosystem_badges() decides everything (switch, consent 3, consent 2, active, 3 months,
 * counted records), returns only the allowed fields, and writes the audit log in the same step.
 */
export async function POST(req: Request) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const call = await readSiteCall(admin, req, "badges");
  if (!call) return NextResponse.json({ error: "bad_request" }, { status: 401 });
  const limit = await checkRateLimit(req, "ecosystem_api", { identifier: `site:${call.client}` });
  if (limit && !limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: retryAfterHeaders(limit.retryAfter) });
  const subs = Array.isArray(call.claims.subs) ? [...new Set(call.claims.subs.filter(validSub))] : [];
  if (!subs.length || subs.length > 50) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const { data, error } = await admin.rpc("ecosystem_badges", { p_client: call.client, p_subs: subs });
  if (error) return NextResponse.json({ error: "server_error" }, { status: 500 });
  type Row = { sub: string; shown: boolean; verified: boolean | null; badge_level: string | null; counted: number | null; categories: Record<string, number> | null; member_since: string | null };
  // Rebuilt field by field, so nothing beyond the allowed fields can ever leave even if the function changed.
  const badges = ((data ?? []) as Row[]).map((r) => r.shown
    ? { sub: r.sub, shown: true, verified: !!r.verified, level: r.badge_level, counted: r.counted ?? 0, categories: r.categories ?? {}, memberSince: r.member_since }
    : { sub: r.sub, shown: false });
  return NextResponse.json({ badges, maxAgeSeconds: BADGE_CACHE_SECONDS }, { headers: { "Cache-Control": "no-store" } });
}
