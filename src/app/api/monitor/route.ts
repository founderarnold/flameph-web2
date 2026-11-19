import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { cleanMessage, pagePattern, VITALS } from "@/lib/release";

export const dynamic = "force-dynamic";

/**
 * Phase 13: anonymous error and page-speed reports from browsers (src/components/SiteMonitor.tsx).
 * Stores only a page pattern (ids removed), a cleaned message or a number, and phone/desktop. No member id, no IP.
 * The database caps how much it keeps per day (supabase/migrations/0030_release_monitor.sql).
 */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host && new URL(origin).host !== host) return new NextResponse(null, { status: 204 });
  const text = await req.text().catch(() => "");
  if (!text || text.length > 4000) return new NextResponse(null, { status: 204 });
  let body: { t?: string; p?: string; m?: string; n?: string; v?: number; d?: string };
  try { body = JSON.parse(text); } catch { return new NextResponse(null, { status: 204 }); }
  const admin = createAdminClient();
  if (!admin) return new NextResponse(null, { status: 204 });
  const path = pagePattern(String(body.p ?? "/"));
  if (body.t === "error") {
    await admin.rpc("site_error_log", { p_kind: "browser", p_path: path, p_message: cleanMessage(body.m) });
  } else if (body.t === "vital" && VITALS.includes(body.n as (typeof VITALS)[number]) && Number.isFinite(body.v)) {
    await admin.rpc("web_vitals_log", { p_metric: body.n, p_value: Number(body.v), p_path: path, p_device: body.d === "desktop" ? "desktop" : "mobile" });
  }
  return new NextResponse(null, { status: 204 });
}
