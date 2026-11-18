"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getConsents } from "@/lib/consents";
import { createAdminClient } from "@/lib/supabase/server";
import { encryptDoc, sniffMime, vettingKey } from "@/lib/vetting-crypto";
import { purgeDocs, purgeMemberDocs, VETTING_BUCKET } from "@/lib/vetting-server";
import { isDocType, MAX_DOC_BYTES, MAX_DOCS_PER_TYPE, safeFileName } from "@/lib/vetting";
import { POLICY_VERSION } from "@/lib/policy";

// Business vetting. Optional. Needs switch 4 ("Business vetting"), recorded in the consent log like Settings does.
// Files are checked, encrypted on the server and stored in the private bucket; members never get a link to them.

const BACK = "/account/vetting";
const back = (q: string): never => redirect(`${BACK}?${q}`);

async function setVettingConsent(on: boolean) {
  const { supabase, user } = await requireUser(BACK);
  const { ready, state } = await getConsents(supabase, user.id);
  if (!ready) back("error=unavailable");
  // One row in the consent log, for switch 4 only, the same as changing it in Settings.
  if (Boolean(state.vetting?.granted) !== on) {
    const { error } = await supabase.from("member_consents").insert({ user_id: user.id, consent_key: "vetting", granted: on, policy_version: POLICY_VERSION, source: "settings" });
    if (error) back("error=failed");
  }
  return { user };
}

export async function giveVettingConsent() {
  await setVettingConsent(true);
  revalidatePath(BACK);
  back("done=consent");
}

/** Turning switch 4 off deletes the documents right away (Privacy Notice, section 5). */
export async function withdrawVettingConsent() {
  const { user } = await setVettingConsent(false);
  const admin = createAdminClient();
  if (admin) await purgeMemberDocs(admin, user.id, "consent_withdrawn");
  revalidatePath(BACK);
  back("done=withdrawn");
}

export async function uploadVettingDoc(fd: FormData) {
  const { supabase, user } = await requireUser(BACK);
  const type = fd.get("doc_type");
  const file = fd.get("file");
  if (!isDocType(type)) back("error=type");
  if (!(file instanceof File) || file.size === 0) back("error=empty");
  const f = file as File;
  if (f.size > MAX_DOC_BYTES) back("error=size");
  const { ready, state } = await getConsents(supabase, user.id);
  if (!ready) back("error=unavailable");
  if (!state.vetting?.granted) back("error=consent");
  const admin = createAdminClient();
  const k = vettingKey();
  if (!admin || !k) back("error=failed");
  const buf = Buffer.from(await f.arrayBuffer());
  const mime = sniffMime(buf);
  if (!mime) back("error=format");
  const { data: biz } = await supabase.from("businesses").select("id, verified, verification_status").eq("owner_id", user.id).order("created_at").limit(1).maybeSingle();
  if (!biz) back("error=no_business");
  const { count, error: cErr } = await supabase.from("vetting_documents").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("doc_type", type as string).is("deleted_at", null);
  if (cErr) back("error=unavailable");
  if ((count ?? 0) >= MAX_DOCS_PER_TYPE) back("error=too_many");

  const path = `vetting/${user.id}/${randomUUID()}.bin`;
  const { error: upErr } = await admin!.storage.from(VETTING_BUCKET).upload(path, encryptDoc(buf, k!.key), { contentType: "application/octet-stream", upsert: false });
  if (upErr) back("error=failed");
  const { error } = await admin!.from("vetting_documents").insert({
    user_id: user.id, business_id: biz!.id, doc_type: type, file_path: path, file_name: safeFileName(f.name), mime, size_bytes: f.size, key_id: k!.id,
  });
  if (error) { await admin!.storage.from(VETTING_BUCKET).remove([path]); back("error=failed"); }
  // Ask for review (the same "Pending review" the directory verification already uses). Members may set only none/pending.
  if (!biz!.verified && biz!.verification_status !== "pending") await supabase.from("businesses").update({ verification_status: "pending" }).eq("id", biz!.id);
  revalidatePath(BACK);
  back("done=uploaded");
}

export async function deleteVettingDoc(fd: FormData) {
  const { supabase, user } = await requireUser(BACK);
  const id = String(fd.get("doc_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) back("error=failed");
  const admin = createAdminClient();
  if (!admin) back("error=failed");
  // Look it up as the member first (row level security: only their own), then delete with the server key.
  const { data: mine } = await supabase.from("vetting_documents").select("id").eq("id", id).eq("user_id", user.id).is("deleted_at", null).maybeSingle();
  if (!mine) back("error=failed");
  const { data: row } = await admin!.from("vetting_documents").select("id, file_path").eq("id", id).maybeSingle();
  await purgeDocs(admin!, row ? [row as { id: string; file_path: string }] : [], "member_removed");
  revalidatePath(BACK);
  back("done=deleted");
}
