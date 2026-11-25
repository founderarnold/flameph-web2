import { NextResponse } from "next/server";
import { mediaUrl } from "@/lib/content";
import { checkRateLimit, retryAfterHeaders } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/server";
import { log, readSiteCall, switchOn, userForSub } from "@/lib/ecosystem-sso";

/**
 * "Bring my FLAME PH business" (MarketplacePH): the business listings OWNED BY ONE MEMBER, for that member only.
 * Server-to-server only (POST, no CORS), signed with the calling site's own key, single use, at most 5 minutes old
 * (readSiteCall). The member is identified by the site's pairwise `sub`, which exists only after that member signed
 * in to the site with their FLAME PH account, so a site can never ask about anyone else.
 *   POST { client, token }   token purpose "business-share", claims { sub, jti }
 * Returns only the owner's own non-suspended, non-rejected listings and a fixed set of fields (no verification
 * documents, notes or internal status). Every call is written to ecosystem_access_log.
 * Read only: nothing on flameph.org changes. The sign-in flow itself is not touched.
 */
const FIELDS = ["name", "slug", "sector", "subsector", "description", "products", "city", "province", "region", "contact_phone", "contact_email",
  "contact_messenger", "contact_viber", "logo_url", "cover_url", "photos", "hours", "facebook_url"] as const;
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.flameph.org").replace(/\/+$/, "").replace("://flameph.org", "://www.flameph.org");

type Row = Record<string, unknown> & { id: string; slug: string; lifecycle_status: string | null; risk_level: string | null; photos: string[] | null; updated_at: string };

const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export async function POST(req: Request) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const call = await readSiteCall(admin, req, "business-share");
  if (!call) return NextResponse.json({ error: "bad_request" }, { status: 401 });
  const limit = await checkRateLimit(req, "ecosystem_api", { identifier: `site:${call.client}` });
  if (limit && !limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: retryAfterHeaders(limit.retryAfter) });
  if (!(await switchOn(admin, "sso"))) return NextResponse.json({ businesses: [] }, { headers: { "Cache-Control": "no-store" } });

  const userId = await userForSub(admin, call.client, String(call.claims.sub ?? ""));
  if (!userId) {
    await log(admin, call.client, null, "business_share", [], "refused", "unknown_member");
    return NextResponse.json({ businesses: [] }, { headers: { "Cache-Control": "no-store" } });
  }
  const { data, error } = await admin.from("businesses").select("*").eq("owner_id", userId).order("created_at", { ascending: true }).limit(20);
  if (error) return NextResponse.json({ error: "server_error" }, { status: 500 });
  const rows = ((data ?? []) as Row[]).filter((b) => b.lifecycle_status !== "suspended" && b.lifecycle_status !== "rejected" && b.risk_level !== "high");

  // Rebuilt field by field, so nothing beyond the allowed fields can ever leave even if the table grows.
  const businesses = rows.map((b) => ({
    id: b.id,
    name: text(b.name, 80),
    slug: b.slug,
    sector: text(b.sector, 80),
    subsector: text(b.subsector, 80),
    description: text(b.description, 2000),
    products: text(b.products, 1000),
    city: text(b.city, 80),
    province: text(b.province, 80),
    region: text(b.region, 80),
    phone: text(b.contact_phone, 30),
    email: text(b.contact_email, 120),
    messenger: text(b.contact_messenger, 200),
    viber: text(b.contact_viber, 30),
    hours: text(b.hours, 200),
    facebookUrl: text(b.facebook_url, 300),
    logoUrl: mediaUrl(text(b.logo_url, 500)),
    coverUrl: mediaUrl(text(b.cover_url, 500)),
    photoUrls: (b.photos ?? []).slice(0, 6).map((p) => mediaUrl(p)).filter(Boolean),
    profileUrl: `${SITE}/members/${b.slug}`,
    updatedAt: b.updated_at,
  }));
  await log(admin, call.client, userId, "business_share", [...FIELDS], businesses.length ? "shown" : "ok", `${businesses.length} listing(s)`);
  return NextResponse.json({ businesses }, { headers: { "Cache-Control": "no-store" } });
}
