import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { buildMemberExport } from "@/lib/data-rights-server";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Phase 12, "Download my data": everything FLAME PH holds about the signed-in member, as one JSON file (rights to
 * access and to data portability). Only ever the caller's own data. 3 a day. Each download goes to the audit log.
 */
export async function GET(req: Request) {
  const supabase = await createClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user) return NextResponse.redirect(new URL("/login?next=/account/privacy", req.url));
  const admin = createAdminClient();
  if (!admin) return NextResponse.redirect(new URL("/account/privacy?error=unavailable", req.url));
  const limit = await checkRateLimit(req, "data_export", { identifier: user.id });
  if (limit && !limit.allowed) return NextResponse.redirect(new URL("/account/privacy?error=rate", req.url));
  const data = await buildMemberExport(admin, user.id);
  await admin.from("audit_log").insert({ actor_id: user.id, action: "privacy_export_self", table_name: "auth.users", row_id: user.id, detail: null });
  const name = `flameph-my-data-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex",
    },
  });
}
