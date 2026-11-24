"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { sendEmail, NOTIFY_TO } from "@/lib/email";
import { ORG } from "@/lib/site";
import { encryptDoc, sniffMime, vettingKey } from "@/lib/vetting-crypto";
import { purgeDocs, VETTING_BUCKET } from "@/lib/vetting-server";
import { safeFileName } from "@/lib/vetting";
import { MAX_BYTES_PER_PARTNER, PARTNER_DOC_MAX_BYTES } from "@/lib/partner";
import { partnerBytes } from "@/lib/partner-server";
import { parseCount } from "@/lib/offers";
import { BATCH_TYPES, isBatchFileType, LOT_RE, MAX_BATCH_FILES, maxExpiry, QC_RESULT } from "@/lib/signature";

// The toll manufacturer's batch records (Step 7): sample, pilot and production lots of their own FLAME Signature
// products, with the quality check result, ingredient lots for traceability and the certificate of analysis. Every
// write goes through here with the server key after checking the signed-in member owns the batch; the database
// checks the same rules again (0037), including that a production batch has an active licence.

const HOME = "/partner-us/signature";
const go = (path: string): never => redirect(path);
const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
const str = (fd: FormData, k: string, max: number) => String(fd.get(k) ?? "").trim().slice(0, max) || null;
const pick = <T extends object>(v: unknown, list: T) => (typeof v === "string" && v in list ? v : null);
const today = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));

/** Maps a database refusal to a plain-words message code. */
function code(msg: string | undefined) {
  const m = msg ?? "";
  if (m.includes("needs an active licence")) return "batch_licence";
  if (m.includes("shelf life") || m.includes("production date") || m.includes("signature_batches_dates")) return "batch_dates";
  if (m.includes("signature_batches_lot") || m.includes("duplicate key")) return "duplicate_lot";
  if (m.includes("still \"recorded\"")) return "batch_locked";
  if (m.includes("signature_batches_qc")) return "qc_note";
  if (m.includes("limit of 50")) return "batch_limit";
  return "failed";
}

async function myBatch(id: string | null) {
  const { user } = await requireUser(HOME);
  if (!id) go(HOME);
  const admin = createAdminClient();
  if (!admin) go(`${HOME}?error=unavailable`);
  const { data: b } = await admin!.from("signature_batches").select("id, ref_no, status, partner_user_id, product_name, lot_no, batch_type").eq("id", id!).maybeSingle();
  if (!b || b.partner_user_id !== user.id) go(HOME);
  return { user, admin: admin!, b: b! as { id: string; ref_no: string; status: string; partner_user_id: string; product_name: string; lot_no: string; batch_type: string } };
}

/** Records a new batch, or changes one that is still only "recorded". */
export async function saveBatch(fd: FormData) {
  const { user } = await requireUser(HOME);
  const admin = createAdminClient();
  if (!admin) go(`${HOME}?error=unavailable`);
  const id = uuid(fd.get("id"));
  const back = (q: string): never => go(id ? `${HOME}/batches/${id}?${q}#form` : `${HOME}?${q}#record`);
  if (id) {
    const { data: b } = await admin!.from("signature_batches").select("partner_user_id, status").eq("id", id).maybeSingle();
    if (!b || b.partner_user_id !== user.id) go(HOME);
    if (b!.status !== "recorded") back("error=batch_locked");
  }
  const productId = uuid(fd.get("product_id"));
  if (!productId) back("error=batch");
  // The product must be one of the member's own FLAME Signature products; its proposal and site come from it.
  const { data: prod } = await admin!.from("signature_products").select("id, offer_id, site_id, shelf_life_months, supplier_offers!inner(user_id, kind, status)").eq("id", productId!).maybeSingle();
  const o = (prod as unknown as { supplier_offers: { user_id: string; kind: string; status: string } } | null)?.supplier_offers;
  if (!prod || !o || o.user_id !== user.id || o.kind !== "manufacturer" || o.status === "withdrawn") back("error=batch");
  const siteId = uuid(fd.get("site_id")) ?? prod!.site_id;
  const batchType = pick(fd.get("batch_type"), BATCH_TYPES);
  const lot = String(fd.get("lot_no") ?? "").trim();
  const produced = String(fd.get("produced_on") ?? "").trim();
  const expiry = String(fd.get("expiry_on") ?? "").trim();
  const qty = parseCount(fd.get("quantity"), 100_000_000);
  if (!siteId || !batchType || !LOT_RE.test(lot) || !isDate(produced) || !isDate(expiry) || Number.isNaN(qty) || !qty) back("error=batch");
  if (produced > today() || expiry <= produced || expiry > maxExpiry(produced, Number(prod!.shelf_life_months))) back("error=batch_dates");
  const qc = pick(fd.get("qc_result"), QC_RESULT) ?? "pending";
  const qcNote = str(fd, "qc_note", 1000);
  if (qc === "fail" && !qcNote) back("error=qc_note");
  const row = {
    product_id: productId, offer_id: prod!.offer_id, site_id: siteId, batch_type: batchType, lot_no: lot, produced_on: produced, expiry_on: expiry,
    quantity: qty, unit: str(fd, "unit", 30) ?? "pieces", raw_material_lots: str(fd, "raw_material_lots", 1000), qc_result: qc, qc_note: qcNote,
  };
  if (id) {
    const { error } = await admin!.from("signature_batches").update(row).eq("id", id).eq("partner_user_id", user.id).eq("status", "recorded");
    if (error) back(`error=${code(error.message)}`);
    await admin!.from("signature_history").insert({ batch_id: id, actor_id: user.id, action: "changed" });
    revalidatePath(`${HOME}/batches/${id}`); revalidatePath(HOME);
    back("done=batch_saved");
  }
  const { data: made, error } = await admin!.from("signature_batches").insert({ ...row, partner_user_id: user.id, product_name: "-" }).select("id, ref_no, product_name, lot_no").single();
  if (error || !made) back(`error=${code(error?.message)}`);
  await admin!.from("signature_history").insert({ batch_id: made!.id, actor_id: user.id, action: "recorded" });
  await admin!.from("audit_log").insert({ actor_id: user.id, action: "signature_batch_record", table_name: "signature_batches", row_id: made!.id, detail: { batch_type: batchType, qc } });
  if (batchType === "production" || qc === "fail") {
    await sendEmail({
      to: NOTIFY_TO, subject: `${qc === "fail" ? "QC FAILED: " : ""}FLAME Signature batch ${made!.ref_no} recorded: ${made!.product_name} lot ${made!.lot_no}`,
      text: `${batchType === "production" ? "A production batch is waiting for release. " : ""}Review it in Admin > Partners > FLAME Signature: ${ORG.url}/admin/partners/signature/batches/${made!.id}`,
    });
  }
  revalidatePath(HOME); revalidatePath("/admin/partners/signature/batches");
  go(`${HOME}/batches/${made!.id}?done=batch_saved`);
}

/** Deletes a batch that is still only "recorded" (with its files). */
export async function deleteBatch(fd: FormData) {
  const { b, admin, user } = await myBatch(uuid(fd.get("id")));
  if (b.status !== "recorded") go(`${HOME}/batches/${b.id}?error=batch_locked`);
  const { data: files } = await admin.from("vetting_documents").select("id, file_path").eq("batch_id", b.id).is("deleted_at", null);
  if (files?.length) await purgeDocs(admin, files as { id: string; file_path: string }[], "member_removed");
  const { error } = await admin.from("signature_batches").delete().eq("id", b.id).eq("partner_user_id", user.id).eq("status", "recorded");
  if (error) go(`${HOME}/batches/${b.id}?error=${code(error.message)}`);
  await admin.from("audit_log").insert({ actor_id: user.id, action: "signature_batch_delete", table_name: "signature_batches", row_id: b.id, detail: { ref_no: b.ref_no } });
  revalidatePath(HOME);
  go(`${HOME}?done=batch_deleted`);
}

/** A batch file (certificate of analysis, lab report, label photo): checked, encrypted, private to the national team.
 *  Files can be added while the batch is recorded or on hold (the team may ask for a lab report). */
export async function uploadBatchFile(fd: FormData) {
  const { b, admin, user } = await myBatch(uuid(fd.get("id")));
  const back = (q: string): never => go(`${HOME}/batches/${b.id}?${q}#files`);
  if (b.status !== "recorded" && b.status !== "on_hold") back("error=batch_locked");
  const type = fd.get("doc_type");
  if (!isBatchFileType(type)) back("error=doc_type");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) back("error=empty");
  const f = file as File;
  if (f.size > PARTNER_DOC_MAX_BYTES) back("error=size");
  const k = vettingKey();
  if (!k) back("error=failed");
  const buf = Buffer.from(await f.arrayBuffer());
  const mime = sniffMime(buf);
  if (!mime) back("error=format");
  if (type === "batch_photo" && !mime!.startsWith("image/")) back("error=format");
  const { count } = await admin.from("vetting_documents").select("id", { count: "exact", head: true }).eq("batch_id", b.id).is("deleted_at", null);
  if ((count ?? 0) >= MAX_BATCH_FILES) back("error=too_many_batch");
  if ((await partnerBytes(admin, user.id)) + f.size > MAX_BYTES_PER_PARTNER) back("error=total");
  const path = `batch/${user.id}/${randomUUID()}.bin`;
  const { error: upErr } = await admin.storage.from(VETTING_BUCKET).upload(path, encryptDoc(buf, k!.key), { contentType: "application/octet-stream", upsert: false });
  if (upErr) back("error=failed");
  const { error } = await admin.from("vetting_documents").insert({
    user_id: user.id, purpose: "batch", batch_id: b.id, doc_type: type, file_path: path, file_name: safeFileName(f.name), mime, size_bytes: f.size, key_id: k!.id,
  });
  if (error) { await admin.storage.from(VETTING_BUCKET).remove([path]); back("error=failed"); }
  revalidatePath(`${HOME}/batches/${b.id}`);
  back("done=uploaded");
}

export async function deleteBatchFile(fd: FormData) {
  const { b, admin, user } = await myBatch(uuid(fd.get("id")));
  if (b.status !== "recorded") go(`${HOME}/batches/${b.id}?error=batch_locked#files`);
  const docId = uuid(fd.get("doc_id"));
  const { data: row } = docId ? await admin.from("vetting_documents").select("id, file_path").eq("id", docId).eq("user_id", user.id).eq("batch_id", b.id).is("deleted_at", null).maybeSingle() : { data: null };
  if (!row) go(`${HOME}/batches/${b.id}?error=failed#files`);
  await purgeDocs(admin, [row as { id: string; file_path: string }], "member_removed");
  revalidatePath(`${HOME}/batches/${b.id}`);
  go(`${HOME}/batches/${b.id}?done=deleted#files`);
}
