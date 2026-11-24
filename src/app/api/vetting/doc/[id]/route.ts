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
 * Partner documents (purpose 'partner', 0031) and supplier offer files (purpose 'offer', 0032) can also be opened by
 * national reviewers. Sample photos (purpose 'sample', 0035) and FLAME Signature batch files (purpose 'batch', 0037) open for national reviewers; complaint evidence
 * (purpose 'complaint', 0035) opens for national reviewers and for the two sides of that complaint (the member who
 * complained and the partner), so the partner can see and answer the evidence. Contract files (purpose 'contract', 0038:
 * signed copies and proof of authority) open for the national team and for the partner of that contract once it was sent.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return deny(404);
  const { supabase, user } = await getSession();
  if (!supabase || !user) return deny(401);
  const [{ data: lvl, error: lvlErr }, { data: partnerReviewer }] = await Promise.all([supabase.rpc("mod_level"), supabase.rpc("is_partner_reviewer")]);
  const moderator = !lvlErr && (Number(lvl) || 0) >= 2;
  const admin = createAdminClient();
  const k = vettingKey();
  if (!admin || !k) return deny(503);
  const { data: doc } = await admin.from("vetting_documents").select("*").eq("id", id).maybeSingle();
  if (!doc || doc.deleted_at) return deny(404);
  if (doc.purpose === "contract") {
    // Contract files: the national team (never for their own business) and the contract's partner after it was sent.
    const { data: kc } = doc.contract_id ? await admin.from("partner_contracts").select("partner_user_id, first_sent_at").eq("id", doc.contract_id).maybeSingle() : { data: null };
    if (!kc) return deny(404);
    const party = kc.partner_user_id === user.id && !!kc.first_sent_at;
    if (!party && (partnerReviewer !== true || kc.partner_user_id === user.id)) return deny(403);
  } else if (doc.purpose === "complaint") {
    // Complaint evidence: the national team, the member who complained, and the partner the complaint is about.
    const { data: c } = doc.complaint_id ? await admin.from("partner_complaints").select("complainant_id, partner_user_id, status").eq("id", doc.complaint_id).maybeSingle() : { data: null };
    if (!c) return deny(404);
    const party = c.complainant_id === user.id || (c.partner_user_id === user.id && c.status !== "draft");
    if (!party && partnerReviewer !== true) return deny(403);
    if (!party && c.partner_user_id === user.id) return deny(403);
  } else {
    if (!moderator && partnerReviewer !== true) return deny(403);
    // National reviewers open partner documents, offer files, sample photos and batch files (0037) only.
    if (!moderator && doc.purpose !== "partner" && doc.purpose !== "offer" && doc.purpose !== "sample" && doc.purpose !== "batch") return deny(403);
    if (doc.user_id === user.id) return deny(403);   // reviewers never review their own business
  }
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
