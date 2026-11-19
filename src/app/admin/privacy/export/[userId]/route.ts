import { NextResponse } from "next/server";
import { adminContext } from "@/lib/admin/guard";
import { buildMemberExport } from "@/lib/data-rights-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Phase 12: the DPO downloads one member's data to answer a request. Admins and founders only; always logged. */
export async function GET(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return new NextResponse("Not found", { status: 404 });
  const c = await adminContext(["super_admin", "admin"]);
  const data = await buildMemberExport(c.db, userId);
  await c.audit("privacy_export_member", "auth.users", userId);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="flameph-member-data-${new Date().toISOString().slice(0, 10)}.json"`, "cache-control": "private, no-store" },
  });
}
