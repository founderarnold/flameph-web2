import { NextResponse } from "next/server";
import { publicBusinesses } from "@/lib/directory";
import { mediaUrl } from "@/lib/content";
import { isApprovedListing, toFeedItem, type DirectoryFeedItem } from "@/lib/directory-feed";

export const dynamic = "force-dynamic";

// Public profiles live on the www address (flameph.org without www forwards there).
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.flameph.org").replace(/\/+$/, "").replace("://flameph.org", "://www.flameph.org");

/**
 * The approved flameph.org business listings for the shared business directory at pages.flameph.org/directory.
 * GET only, read only, public data only (name, industry, city and province, logo or first photo, profile link).
 * Same rule as the listing pages: published, approved, low risk, and the owner's account is active.
 * Cached for a minute; an admin approval or hide clears the cache (tag "directory").
 */
export async function GET() {
  type Row = Parameters<typeof toFeedItem>[0] & { id: string; owner_id: string };
  const rows = await publicBusinesses<Row>().catch(() => [] as Row[]);
  const items: DirectoryFeedItem[] = rows.filter(isApprovedListing).map((b) => toFeedItem(b, SITE, (p) => mediaUrl(p)));
  return NextResponse.json(
    { items, count: items.length },
    { headers: { "cache-control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300" } },
  );
}
