import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { decryptDoc, vettingKey } from "@/lib/vetting-crypto";
import { VETTING_BUCKET } from "@/lib/vetting-server";

export const dynamic = "force-dynamic";

const deny = (status: number) => new NextResponse(status === 404 ? "Not found" : "Not allowed", { status, headers: { "Cache-Control": "no-store" } });

/**
 * Opens one vetting document for a reviewer (admins and founders only), never for other members and never for the
 * reviewer's own business. The file is decrypted on the server, sent with no-store, and every view is logged.
 * Partner documents (purpose 'partner', 0031) can also be opened by national reviewers.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return deny(404);
  const { supabase, user } = await getSession();
  if (!supabase || !user) return deny(401);
  const [{ data: lvl, error: lvlErr }, { data: partnerReviewer }] = await Promise.all([supabase.rpc("mod_level"), supabase.rpc("is_partner_reviewer")]);
  const moderator = !lvlErr && (Number(lvl) || 0) >= 2;
  if (!moderator && partnerReviewer !== true) return deny(403);
  const admin = createAdminClient();
  const k = vettingKey();
  if (!admin || !k) return deny(503);
  const { data: doc } = await admin.from("vetting_documents").select("*").eq("id", id).maybeSingle();
  if (!doc || doc.deleted_at) return deny(404);
  if (!moderator && doc.purpose !== "partner") return deny(403);   // national reviewers open partner documents only
  if (doc.user_id === user.id) return deny(403);   // reviewers never review their own business
  if (doc.key_id !== k.id) return new NextResponse("This file was encrypted with an older key. Ask the member to upload it again.", { status: 409, headers: { "Cache-Control": "no-store" } });
  const { data: blob, error } = await admin.storage.from(VETTING_BUCKET).download(doc.file_path);
  if (error || !blob) return deny(404);
  let plain: Buffer;
  try { plain = decryptDoc(Buffer.from(await blob.arrayBuffer()), k.key); } catch { return deny(404); }
  await admin.from("vetting_access_log").insert({ document_id: doc.id, viewer_id: user.id });
  return new NextResponse(new Uint8Array(plain), {
    headers: {
      "Content-Type": doc.mime,
      "Content-Disposition": `inline; filename="${doc.file_name.replace(/["\\\r\n]/g, "_")}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
      "Referrer-Policy": "no-referrer",
    },
  });
}
