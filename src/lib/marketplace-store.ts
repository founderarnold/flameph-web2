import "server-only";
import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { CLIENTS, signHubMessage } from "@/lib/sso";
import type { StoreSummary } from "@/lib/listing-sections";

/**
 * The member's MarketplacePH store, for the Sync button on My business listing (owner, 25 Nov 2026).
 *
 * Only for members who have signed in to MarketplacePH with their FLAME PH account (an ecosystem_links row exists):
 * that is what "activated" means here. The question goes server-to-server, signed with MarketplacePH's own key, and
 * names the member by their verified email, the same way the two sites already match accounts at sign-in.
 * MarketplacePH answers with the store's public link and which setup parts are done; nothing else is shared.
 */

const CLIENT = "marketplaceph";

/** True once the member has used their FLAME PH account on marketplaceph.com. */
export async function marketplaceLinked(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin) return false;
  const { data } = await admin.from("ecosystem_links").select("user_id").eq("client", CLIENT).eq("user_id", userId).maybeSingle();
  return Boolean(data);
}

const bool = (v: unknown) => v === true;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.min(Math.floor(v), 100000) : 0);

/** Asks marketplaceph.com about this member's store. Null when it can't answer right now. */
export async function storeSummary(email: string | null | undefined, waitMs = 5000): Promise<StoreSummary | null> {
  if (!email) return null;
  const token = signHubMessage(CLIENT, "store-summary", { email: email.toLowerCase(), jti: randomBytes(16).toString("base64url") });
  if (!token) return null;
  try {
    const url = new URL("/api/flame/store-summary", CLIENTS[CLIENT].callback).toString();
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }), cache: "no-store", signal: AbortSignal.timeout(waitMs) });
    if (!r.ok) return null;
    const j = (await r.json()) as Record<string, unknown>;
    const s = j.store as { name?: unknown; url?: unknown } | null | undefined;
    const storeUrl = typeof s?.url === "string" && /^https:\/\/(www\.)?marketplaceph\.com\/store\/[a-z0-9-]+$/.test(s.url) ? s.url : null;
    return {
      activated: bool(j.activated),
      store: storeUrl ? { name: typeof s?.name === "string" ? s.name.slice(0, 80) : "My store", url: storeUrl } : null,
      profile: bool(j.profile), firstListing: bool(j.firstListing), payShip: bool(j.payShip), verified: bool(j.verified),
      listingCount: num(j.listingCount),
    };
  } catch {
    return null;
  }
}
