import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { NEWS_SOURCES, parseFeed } from "@/lib/news-feeds";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Daily (6 AM Manila): business news headlines (title, source, link) from public Philippine news feeds into
 * news_headlines, keeps 30 days of them, and removes post photos and videos that never made it into a post.
 * Runs from Vercel Cron (vercel.json), which sends `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  const results = await Promise.all(NEWS_SOURCES.map(async (s) => {
    try {
      const res = await fetch(s.url, {
        headers: { "user-agent": "FLAME PH news reader (+https://www.flameph.org)", accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" },
        signal: AbortSignal.timeout(10000), cache: "no-store",
      });
      if (!res.ok) return { source: s.name, ok: false, items: [] };
      const xml = (await res.text()).slice(0, 2_000_000);
      return { source: s.name, ok: true, items: parseFeed(xml, s.name, { max: 12, filter: s.filter }) };
    } catch {
      return { source: s.name, ok: false, items: [] };
    }
  }));
  const rows = results.flatMap((r) => r.items);
  let added = 0;
  if (rows.length) {
    const { data, error } = await admin.from("news_headlines").upsert(rows, { onConflict: "url", ignoreDuplicates: true }).select("id");
    if (error) return NextResponse.json({ error: "Headlines table not ready" }, { status: 503 });
    added = data?.length ?? 0;
  }
  await admin.from("news_headlines").delete().lt("published_at", new Date(Date.now() - 30 * 86400000).toISOString());

  // Post files left behind (uploaded, then removed or never posted) for more than 2 days.
  let cleaned = 0;
  const { data: orphans } = await admin.rpc("orphan_post_media", { max_rows: 200 });
  const paths = ((orphans ?? []) as { name: string }[]).map((o) => o.name);
  if (paths.length) {
    const { error } = await admin.storage.from("media").remove(paths);
    if (!error) cleaned = paths.length;
  }
  return NextResponse.json({ ok: true, added, cleaned, sources: results.map((r) => ({ source: r.source, ok: r.ok, found: r.items.length })) });
}
