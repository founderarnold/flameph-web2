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
import { tellApplicant } from "@/lib/partner-server";
import {
  canAppeal, COMPLAINT_COLS, complaintMissing, CONSENT_VERSION, ISSUES, isEvidenceType, manilaToday, MAX_EVIDENCE_FILES, parseAmount, REMEDIES,
  type ComplaintRow,
} from "@/lib/partner-cases";

// The member's and the partner's side of a complaint. Every write goes through here with the server key, after checking
// who the signed-in member is in this case (the member who complained, or the partner). The database checks the same
// rules again (0035: who may move a case, what can be edited, appeals within 7 days, append-only history).

const HOME = "/partner-us/complaints";
const go = (path: string): never => redirect(path);
const casePath = (id: string, q = "", hash = "") => `${HOME}/${id}${q ? `?${q}` : ""}${hash}`;
const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
const str = (fd: FormData, k: string, max: number) => String(fd.get(k) ?? "").trim().slice(0, max) || null;
const pick = <T extends object>(v: unknown, list: T) => (typeof v === "string" && v in list ? v : null);
const MAX_SENT_PER_DAY = 5;

/** The case, read as the member (row level security), and which side they are on. */
async function myCase(id: string | null) {
  const { supabase, user } = await requireUser(HOME);
  if (!id) go(HOME);
  const { data, error } = await supabase.from("partner_complaints").select(COMPLAINT_COLS).eq("id", id!).maybeSingle();
  if (error) go(`${HOME}?error=unavailable`);
  const c = data as unknown as ComplaintRow | null;
  if (!c) go(HOME);
  const side = c!.complainant_id === user.id ? "member" : c!.partner_user_id === user.id ? "partner" : null;
  if (!side) go(HOME);
  const admin = createAdminClient();
  if (!admin) go(`${HOME}?error=unavailable`);
  return { user, admin: admin!, c: c!, side: side as "member" | "partner" };
}

/** Starts a complaint about one accredited partner. */
export async function startComplaint(fd: FormData) {
  const { supabase, user } = await requireUser(HOME);
  const partner = uuid(fd.get("partner_user_id"));
  if (!partner) go(`${HOME}/new?error=partner`);
  if (partner === user.id) go(`${HOME}/new?error=self`);
  const admin = createAdminClient();
  if (!admin) go(`${HOME}?error=unavailable`);
  const [{ data: prof }, { data: me }, { count }] = await Promise.all([
    admin!.from("partner_profiles").select("user_id, legal_name, categories").eq("user_id", partner!).maybeSingle(),
    supabase.from("profiles").select("chapter_id").eq("id", user.id).maybeSingle(),
    admin!.from("partner_complaints").select("id", { count: "exact", head: true }).eq("complainant_id", user.id).eq("status", "draft"),
  ]);
  if (!prof) go(`${HOME}/new?error=partner`);
  if ((count ?? 0) >= 10) go(`${HOME}?error=limit`);
  const cats = (prof!.categories as string[]) ?? [];
  const { data: row, error } = await admin!.from("partner_complaints").insert({
    complainant_id: user.id, partner_user_id: partner, partner_name: prof!.legal_name, partner_category: cats.length === 1 ? cats[0] : null,
    chapter_id: me?.chapter_id ?? null, changed_by: user.id,
  }).select("id").single();
  if (error || !row) go(`${HOME}/new?error=failed`);
  await admin!.from("audit_log").insert({ actor_id: user.id, action: "partner_complaint_start", table_name: "partner_complaints", row_id: row!.id });
  go(casePath(row!.id, "done=started"));
}

/** Saves the draft (the member only). Blanks are fine until sending. */
export async function saveComplaint(fd: FormData) {
  const { c, admin, user, side } = await myCase(uuid(fd.get("complaint_id")));
  const send = fd.get("intent") === "send";
  if (side !== "member" || c.status !== "draft") go(casePath(c.id, "error=locked"));
  const bad = (code: string): never => go(casePath(c.id, `error=${code}`, "#form"));
  const ref = str(fd, "order_reference", 120);
  if (ref && ref.length < 2) bad("ref");
  const d = String(fd.get("order_date") ?? "").trim();
  if (d && (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d > manilaToday())) bad("date");
  const value = parseAmount(fd.get("affected_value"));
  if (Number.isNaN(value)) bad("amount");
  const patch = {
    order_reference: ref, order_date: d || null, product_or_service: str(fd, "product_or_service", 200),
    issue: pick(fd.get("issue"), ISSUES), description: str(fd, "description", 3000), desired_remedy: pick(fd.get("desired_remedy"), REMEDIES),
    remedy_note: str(fd, "remedy_note", 500), affected_value: value, changed_by: user.id,
  };
  const { error } = await admin.from("partner_complaints").update(patch).eq("id", c.id).eq("status", "draft");
  if (error) bad("failed");
  if (!send) { revalidatePath(casePath(c.id)); go(casePath(c.id, "done=saved")); }

  // Sending: everything required, the consent box, and at most 5 complaints a day.
  if (complaintMissing(patch as unknown as ComplaintRow).length) bad("missing");
  if (fd.get("consent") !== "yes") bad("consent");
  const since = new Date(Date.now() - 86400_000).toISOString();
  const { count } = await admin.from("partner_complaints").select("id", { count: "exact", head: true }).eq("complainant_id", user.id).gte("submitted_at", since);
  if ((count ?? 0) >= MAX_SENT_PER_DAY) bad("rate");
  const { data: sent, error: sErr } = await admin.from("partner_complaints")
    .update({ status: "open", consent_at: new Date().toISOString(), consent_version: CONSENT_VERSION, changed_by: user.id, change_note: null })
    .eq("id", c.id).eq("status", "draft").select("ref_no, severity, partner_user_id, first_response_due_at").single();
  if (sErr || !sent) bad("failed");
  await admin.from("audit_log").insert({ actor_id: user.id, action: "partner_complaint_send", table_name: "partner_complaints", row_id: c.id, detail: { severity: sent!.severity } });
  const { data: target } = await admin.from("complaint_targets").select("alert_now").eq("severity", sent!.severity).maybeSingle();
  const urgent = sent!.severity === "critical";
  await sendEmail({
    to: NOTIFY_TO,
    subject: `${urgent ? "URGENT: " : ""}Partner complaint ${sent!.ref_no} (${sent!.severity}) about ${c.partner_name}`,
    text: [
      `${target?.alert_now ? "This complaint needs attention now." : "A member sent a complaint about an accredited partner."}`,
      `Issue: ${patch.issue ? ISSUES[patch.issue as keyof typeof ISSUES].label : "—"}. First reply due: ${new Date(sent!.first_response_due_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })} (Manila).`,
      "", `Open it in Admin > Partners > Complaints: ${ORG.url}/admin/partners/complaints/${c.id}`,
    ].join("\n"),
  });
  if (sent!.partner_user_id) {
    await tellApplicant(sent!.partner_user_id, `A member sent a complaint (${sent!.ref_no})`,
      "A member sent a complaint about an order or service. Open it to read it and give your side. You can add photos and documents.",
      casePath(c.id), "FLAME PH partner complaint");
  }
  revalidatePath(HOME); revalidatePath("/admin/partners/complaints");
  go(casePath(c.id, "done=sent"));
}

/** A draft that was never sent can be deleted, with its files. */
export async function deleteDraftComplaint(fd: FormData) {
  const { c, admin, user, side } = await myCase(uuid(fd.get("id")));
  if (side !== "member" || c.status !== "draft") go(casePath(c.id, "error=locked"));
  const { data: files } = await admin.from("vetting_documents").select("id, file_path").eq("complaint_id", c.id).is("deleted_at", null);
  if (files?.length) await purgeDocs(admin, files as { id: string; file_path: string }[], "member_removed");
  const { error } = await admin.from("partner_complaints").delete().eq("id", c.id).eq("complainant_id", user.id).eq("status", "draft");
  if (error) go(casePath(c.id, "error=failed"));
  go(`${HOME}?done=removed`);
}

/** Evidence from either side: checked (type, size, real file type), encrypted on the server, kept private. Once the
 *  complaint is sent, evidence stays (it can't be removed by either side). */
export async function uploadEvidence(fd: FormData) {
  const { c, admin, user } = await myCase(uuid(fd.get("id")));
  const back = (q: string): never => go(casePath(c.id, q, "#evidence"));
  if (c.status === "closed") back("error=locked");
  const type = fd.get("doc_type");
  const file = fd.get("file");
  if (!isEvidenceType(type)) back("error=doc_type");
  if (!(file instanceof File) || file.size === 0) back("error=empty");
  const f = file as File;
  if (f.size > PARTNER_DOC_MAX_BYTES) back("error=size");
  const k = vettingKey();
  if (!k) back("error=failed");
  const buf = Buffer.from(await f.arrayBuffer());
  const mime = sniffMime(buf);
  if (!mime) back("error=format");
  const { count } = await admin.from("vetting_documents").select("id", { count: "exact", head: true }).eq("complaint_id", c.id).eq("user_id", user.id).is("deleted_at", null);
  if ((count ?? 0) >= MAX_EVIDENCE_FILES) back("error=too_many");
  const { data: mine } = await admin.from("vetting_documents").select("size_bytes").eq("user_id", user.id).is("deleted_at", null).limit(1000);
  if ((mine ?? []).reduce((n, r) => n + (Number(r.size_bytes) || 0), 0) + f.size > MAX_BYTES_PER_PARTNER) back("error=total");
  const path = `complaint/${user.id}/${randomUUID()}.bin`;
  const { error: upErr } = await admin.storage.from(VETTING_BUCKET).upload(path, encryptDoc(buf, k!.key), { contentType: "application/octet-stream", upsert: false });
  if (upErr) back("error=failed");
  const { data: doc, error } = await admin.from("vetting_documents").insert({
    user_id: user.id, purpose: "complaint", complaint_id: c.id, doc_type: type, file_path: path, file_name: safeFileName(f.name), mime, size_bytes: f.size, key_id: k!.id,
  }).select("id").single();
  if (error || !doc) { await admin.storage.from(VETTING_BUCKET).remove([path]); back("error=failed"); }
  if (c.status !== "draft") {
    await admin.from("partner_complaint_events").insert({ complaint_id: c.id, actor_id: user.id, side: c.complainant_id === user.id ? "member" : "partner", action: "evidence", note: safeFileName(f.name) });
  }
  revalidatePath(casePath(c.id));
  back("done=uploaded");
}

/** Only while the complaint is a draft can the member remove a file (afterwards it is evidence). */
export async function deleteEvidence(fd: FormData) {
  const { c, admin, user, side } = await myCase(uuid(fd.get("id")));
  if (side !== "member" || c.status !== "draft") go(casePath(c.id, "error=locked", "#evidence"));
  const docId = uuid(fd.get("doc_id"));
  const { data: row } = docId ? await admin.from("vetting_documents").select("id, file_path").eq("id", docId).eq("user_id", user.id).eq("complaint_id", c.id).is("deleted_at", null).maybeSingle() : { data: null };
  if (!row) go(casePath(c.id, "error=failed", "#evidence"));
  await purgeDocs(admin, [row as { id: string; file_path: string }], "member_removed");
  revalidatePath(casePath(c.id));
  go(casePath(c.id, "done=deleted", "#evidence"));
}

/** A note in the case conversation (both sides and the team read it). */
export async function addCaseNote(fd: FormData) {
  const { c, admin, user, side } = await myCase(uuid(fd.get("id")));
  const note = str(fd, "note", 2000);
  if (c.status === "draft" || c.status === "closed") go(casePath(c.id, "error=locked", "#history"));
  if (!note) go(casePath(c.id, "error=note", "#history"));
  const { error } = await admin.from("partner_complaint_events").insert({ complaint_id: c.id, actor_id: user.id, side, action: "note", note });
  if (error) go(casePath(c.id, "error=failed", "#history"));
  await notifyOtherSide(c, side, "New note on the complaint", `There is a new note on complaint ${c.ref_no}.`);
  revalidatePath(casePath(c.id));
  go(casePath(c.id, "done=note", "#history"));
}

/** The partner's answer to the complaint (its right to respond). It can be updated while the case is open. */
export async function partnerRespond(fd: FormData) {
  const { c, admin, user, side } = await myCase(uuid(fd.get("id")));
  const text = str(fd, "partner_response", 3000);
  if (side !== "partner" || ["draft", "closed"].includes(c.status)) go(casePath(c.id, "error=locked", "#respond"));
  if (!text) go(casePath(c.id, "error=note", "#respond"));
  const { error } = await admin.from("partner_complaints").update({ partner_response: text, changed_by: user.id, change_note: null }).eq("id", c.id);
  if (error) go(casePath(c.id, "error=failed", "#respond"));
  await notifyOtherSide(c, "partner", "The partner answered your complaint", `The partner gave its side on complaint ${c.ref_no}.`);
  revalidatePath(casePath(c.id)); revalidatePath(`/admin/partners/complaints/${c.id}`);
  go(casePath(c.id, "done=response", "#respond"));
}

/** The partner says a corrective action is done (the national team checks it). */
export async function markActionDone(fd: FormData) {
  const { c, admin, user, side } = await myCase(uuid(fd.get("id")));
  const actionId = uuid(fd.get("action_id"));
  if (side !== "partner" || !actionId) go(casePath(c.id, "error=locked", "#actions"));
  const note = str(fd, "partner_note", 1000);
  if (!note) go(casePath(c.id, "error=note", "#actions"));
  const { error } = await admin.from("partner_corrective_actions").update({ status: "done_by_partner", partner_note: note, changed_by: user.id })
    .eq("id", actionId!).eq("complaint_id", c.id).eq("status", "open");
  if (error) go(casePath(c.id, "error=failed", "#actions"));
  await sendEmail({ to: NOTIFY_TO, subject: `Partner says a corrective action is done (${c.ref_no})`, text: `Check it in Admin > Partners > Complaints: ${ORG.url}/admin/partners/complaints/${c.id}` });
  revalidatePath(casePath(c.id));
  go(casePath(c.id, "done=action_done", "#actions"));
}

/** Either side may appeal once, within 7 days of the resolution, with a reason. The founder decides. */
export async function appealComplaint(fd: FormData) {
  const { c, admin, user } = await myCase(uuid(fd.get("id")));
  const reason = str(fd, "appeal_reason", 2000);
  if (!canAppeal(c) || !reason) go(casePath(c.id, "error=appeal", "#appeal"));
  const { error } = await admin.from("partner_complaints").update({ status: "appealed", appeal_reason: reason, changed_by: user.id, change_note: null }).eq("id", c.id).eq("status", "resolved");
  if (error) go(casePath(c.id, "error=appeal", "#appeal"));
  await admin.from("audit_log").insert({ actor_id: user.id, action: "partner_complaint_appeal", table_name: "partner_complaints", row_id: c.id });
  await sendEmail({ to: NOTIFY_TO, subject: `Appeal on partner complaint ${c.ref_no} (for the founder)`, text: `An appeal was filed. The founder decides it.\n\n${ORG.url}/admin/partners/complaints/${c.id}` });
  revalidatePath(casePath(c.id)); revalidatePath("/admin/partners/complaints");
  go(casePath(c.id, "done=appealed"));
}

/** The member withdraws a complaint that is open or being looked into. */
export async function withdrawComplaint(fd: FormData) {
  const { c, admin, user, side } = await myCase(uuid(fd.get("id")));
  if (side !== "member" || !["open", "investigating"].includes(c.status)) go(casePath(c.id, "error=locked"));
  const { error } = await admin.from("partner_complaints").update({ status: "closed", changed_by: user.id, change_note: str(fd, "why", 500) }).eq("id", c.id);
  if (error) go(casePath(c.id, "error=failed"));
  await notifyOtherSide(c, "member", "A complaint was withdrawn", `The member withdrew complaint ${c.ref_no}.`);
  revalidatePath(HOME); revalidatePath("/admin/partners/complaints");
  go(casePath(c.id, "done=withdrawn"));
}

/** The partner's answer to a proposed penalty or sanction (its right to respond before anything is approved). */
export async function answerPenaltyOrSanction(fd: FormData) {
  const { supabase, user } = await requireUser(HOME);
  const kind = fd.get("kind") === "sanction" ? "sanction" : "penalty";
  const id = uuid(fd.get("item_id"));
  const text = str(fd, "partner_response", 2000);
  if (!id || !text) go(`${HOME}?error=note#standing`);
  const table = kind === "sanction" ? "partner_sanctions" : "partner_penalties";
  const { data: row } = await supabase.from(table).select("id, partner_user_id, status").eq("id", id!).maybeSingle();
  if (!row || row.partner_user_id !== user.id) go(`${HOME}?error=locked#standing`);
  const admin = createAdminClient();
  if (!admin) go(`${HOME}?error=unavailable`);
  const { error } = await admin!.from(table).update({ partner_response: text, changed_by: user.id }).eq("id", id!);
  if (error) go(`${HOME}?error=locked#standing`);
  await sendEmail({ to: NOTIFY_TO, subject: `Partner answered a proposed ${kind}`, text: `Read it in Admin > Partners > ${kind === "sanction" ? "Sanctions" : "Penalties"}: ${ORG.url}/admin/partners/${kind === "sanction" ? "sanctions" : "penalties"}` });
  revalidatePath(HOME);
  go(`${HOME}?done=answered#standing`);
}

/** One line in the other side's Inbox and an email. The member's contact details are never given to the partner. */
async function notifyOtherSide(c: ComplaintRow, from: "member" | "partner", title: string, body: string) {
  const to = from === "member" ? c.partner_user_id : c.complainant_id;
  if (to) await tellApplicant(to, title, body, casePath(c.id), "FLAME PH partner complaint");
}
