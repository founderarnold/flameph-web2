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
import { PARTNER_DOC_MAX_BYTES } from "@/lib/partner";
import {
  ARRIVAL, isFeedbackTag, manilaToday, MAX_SAMPLE_PHOTOS, RECOMMEND, SAMPLE_COLS, SAMPLE_SCORES, sampleMissing, YES_PARTLY_NO, type SampleRow,
} from "@/lib/partner-cases";

// Sample tests by chapter testers (and the national team during the pilot). Every write goes through here with the
// server key after checking the tester; the database checks the roles, the chapter and what can change (0035).

const HOME = "/partner-us/samples";
const go = (path: string): never => redirect(path);
const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
const str = (fd: FormData, k: string, max: number) => String(fd.get(k) ?? "").trim().slice(0, max) || null;
const pick = <T extends object>(v: unknown, list: T) => (typeof v === "string" && v in list ? v : null);
const NATIONAL = ["super_admin", "admin", "national_reviewer"];

async function myTest(id: string | null) {
  const { supabase, user } = await requireUser(HOME);
  if (!id) go(HOME);
  const { data } = await supabase.from("partner_sample_tests").select(`${SAMPLE_COLS}, tester_id`).eq("id", id!).maybeSingle();
  const t = data as unknown as (SampleRow & { tester_id: string | null }) | null;
  if (!t || t.tester_id !== user.id) go(HOME);
  const admin = createAdminClient();
  if (!admin) go(`${HOME}?error=unavailable`);
  return { user, admin: admin!, t: t! };
}

/** Starts a test for one partner, and one product from its offers when the partner is a supplier. */
export async function startSample(fd: FormData) {
  const { supabase, user, roles } = await requireUser(HOME);
  const national = roles.some((r) => NATIONAL.includes(r));
  const admin = createAdminClient();
  if (!admin) go(`${HOME}?error=unavailable`);
  // "partner|offer|item" from the pick list (which never carries prices); a FLAME Signature product (0037) adds
  // "|product name", since it has an offer but no item line.
  const parts = String(fd.get("target") ?? "").split("|");
  const [partner, offer, item] = parts.slice(0, 3).map((v) => uuid(v));
  let sigName: string | null = null;
  try { sigName = parts.length > 3 ? decodeURIComponent(parts.slice(3).join("|")) : null; } catch { sigName = null; }
  if (!partner) go(`${HOME}?error=partner`);
  const { data: targets } = await supabase.rpc("partner_sample_targets");
  type T = { partner_user_id: string; partner_name: string; offer_id: string | null; item_id: string | null; product_name: string | null };
  const list = (targets ?? []) as T[];
  const hit = list.find((t) => t.partner_user_id === partner && (t.offer_id ?? null) === (offer ?? null) && (t.item_id ?? null) === (item ?? null)
      && (!sigName || t.product_name === sigName))
    ?? list.find((t) => t.partner_user_id === partner);
  if (!hit) go(`${HOME}?error=partner`);
  const sameItem = !!item && hit!.item_id === item;
  const sameSignature = !item && !!sigName && !!offer && hit!.offer_id === offer && hit!.product_name === sigName;
  const product = str(fd, "product_name", 150) ?? (sameItem || sameSignature ? hit!.product_name : null);
  if (!product) go(`${HOME}?error=missing`);
  const { data: chap } = await admin!.from("roles").select("chapter_id").eq("user_id", user.id).eq("role", "chapter_tester").limit(1).maybeSingle();
  if (!national && !chap?.chapter_id) go(`${HOME}?error=not_tester`);
  const { data: row, error } = await admin!.from("partner_sample_tests").insert({
    tester_id: user.id, chapter_id: chap?.chapter_id ?? null, partner_user_id: partner, partner_name: hit!.partner_name,
    offer_id: sameItem || sameSignature ? hit!.offer_id : null, item_id: sameItem ? item : null, product_name: product,
  }).select("id").single();
  if (error || !row) go(`${HOME}?error=${error?.message.includes("limit") ? "limit" : "failed"}`);
  await admin!.from("audit_log").insert({ actor_id: user.id, action: "partner_sample_start", table_name: "partner_sample_tests", row_id: row!.id });
  go(`${HOME}/${row!.id}?done=sample_started`);
}

/** Saves the form. "Send" also checks everything is there (and at least one photo). */
export async function saveSample(fd: FormData) {
  const { t, admin, user } = await myTest(uuid(fd.get("id")));
  const send = fd.get("intent") === "send";
  const back = (q: string): never => go(`${HOME}/${t.id}?${q}#form`);
  if (t.status !== "draft") back("error=locked");
  const received = String(fd.get("received_on") ?? "").trim();
  const expiry = String(fd.get("expiry_on") ?? "").trim();
  if (received && (!/^\d{4}-\d{2}-\d{2}$/.test(received) || received > manilaToday())) back("error=date");
  if (expiry && !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) back("error=date");
  const patch: Record<string, unknown> = {
    batch_lot: str(fd, "batch_lot", 60), received_on: received || null, expiry_on: expiry || null,
    arrival_condition: pick(fd.get("arrival_condition"), ARRIVAL), matches_description: pick(fd.get("matches_description"), YES_PARTLY_NO),
    label_complete: pick(fd.get("label_complete"), YES_PARTLY_NO), would_recommend: pick(fd.get("would_recommend"), RECOMMEND),
    feedback_tags: [...new Set(fd.getAll("feedback_tags").filter(isFeedbackTag))].slice(0, 12), feedback: str(fd, "feedback", 2000),
    safety_concern: fd.get("safety_concern") === "yes", safety_note: str(fd, "safety_note", 1000),
  };
  for (const s of SAMPLE_SCORES) {
    const raw = String(fd.get(s.key) ?? "");
    const n = raw ? Number(raw) : null;
    if (n !== null && !(Number.isInteger(n) && n >= 1 && n <= 5)) back("error=scores");
    patch[s.key] = n;
  }
  if (patch.safety_concern && !patch.safety_note) back("error=safety");
  const { error } = await admin.from("partner_sample_tests").update(patch).eq("id", t.id).eq("status", "draft");
  if (error) back("error=failed");
  if (!send) { revalidatePath(`${HOME}/${t.id}`); back("done=saved"); }

  const { count: photos } = await admin.from("vetting_documents").select("id", { count: "exact", head: true }).eq("sample_id", t.id).is("deleted_at", null);
  if (sampleMissing(patch as unknown as SampleRow, photos ?? 0).length) back("error=missing");
  const { error: sErr } = await admin.from("partner_sample_tests").update({ status: "submitted" }).eq("id", t.id).eq("status", "draft");
  if (sErr) back("error=missing");
  await admin.from("audit_log").insert({ actor_id: user.id, action: "partner_sample_send", table_name: "partner_sample_tests", row_id: t.id, detail: { safety: patch.safety_concern } });
  await sendEmail({
    to: NOTIFY_TO, subject: `${patch.safety_concern ? "SAFETY: " : ""}Sample test ${t.ref_no} sent: ${t.product_name} from ${t.partner_name}`,
    text: `${patch.safety_concern ? `The tester flagged a safety concern: ${patch.safety_note}\n\n` : ""}Review it in Admin > Partners > Samples: ${ORG.url}/admin/partners/samples/${t.id}`,
  });
  revalidatePath(HOME); revalidatePath("/admin/partners/samples");
  go(`${HOME}?done=sample_sent`);
}

/** A sample photo: checked, encrypted, private (the national team can open it). */
export async function uploadSamplePhoto(fd: FormData) {
  const { t, admin, user } = await myTest(uuid(fd.get("id")));
  const back = (q: string): never => go(`${HOME}/${t.id}?${q}#photos`);
  if (t.status !== "draft") back("error=locked");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) back("error=empty");
  const f = file as File;
  if (f.size > PARTNER_DOC_MAX_BYTES) back("error=size");
  const k = vettingKey();
  if (!k) back("error=failed");
  const buf = Buffer.from(await f.arrayBuffer());
  const mime = sniffMime(buf);
  if (!mime || !mime.startsWith("image/")) back("error=format");
  const { count } = await admin.from("vetting_documents").select("id", { count: "exact", head: true }).eq("sample_id", t.id).is("deleted_at", null);
  if ((count ?? 0) >= MAX_SAMPLE_PHOTOS) back("error=too_many");
  const path = `sample/${user.id}/${randomUUID()}.bin`;
  const { error: upErr } = await admin.storage.from(VETTING_BUCKET).upload(path, encryptDoc(buf, k!.key), { contentType: "application/octet-stream", upsert: false });
  if (upErr) back("error=failed");
  const { error } = await admin.from("vetting_documents").insert({
    user_id: user.id, purpose: "sample", sample_id: t.id, doc_type: "sample_photo", file_path: path, file_name: safeFileName(f.name), mime, size_bytes: f.size, key_id: k!.id,
  });
  if (error) { await admin.storage.from(VETTING_BUCKET).remove([path]); back("error=failed"); }
  revalidatePath(`${HOME}/${t.id}`);
  back("done=uploaded");
}

export async function deleteSamplePhoto(fd: FormData) {
  const { t, admin, user } = await myTest(uuid(fd.get("id")));
  if (t.status !== "draft") go(`${HOME}/${t.id}?error=locked#photos`);
  const docId = uuid(fd.get("doc_id"));
  const { data: row } = docId ? await admin.from("vetting_documents").select("id, file_path").eq("id", docId).eq("user_id", user.id).eq("sample_id", t.id).is("deleted_at", null).maybeSingle() : { data: null };
  if (!row) go(`${HOME}/${t.id}?error=failed#photos`);
  await purgeDocs(admin, [row as { id: string; file_path: string }], "member_removed");
  revalidatePath(`${HOME}/${t.id}`);
  go(`${HOME}/${t.id}?done=deleted#photos`);
}

export async function deleteSampleDraft(fd: FormData) {
  const { t, admin, user } = await myTest(uuid(fd.get("id")));
  if (t.status !== "draft") go(`${HOME}/${t.id}?error=locked`);
  const { data: files } = await admin.from("vetting_documents").select("id, file_path").eq("sample_id", t.id).is("deleted_at", null);
  if (files?.length) await purgeDocs(admin, files as { id: string; file_path: string }[], "member_removed");
  const { error } = await admin.from("partner_sample_tests").delete().eq("id", t.id).eq("tester_id", user.id).eq("status", "draft");
  if (error) go(`${HOME}/${t.id}?error=failed`);
  go(`${HOME}?done=removed`);
}
