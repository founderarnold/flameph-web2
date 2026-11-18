"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { safeNext } from "@/lib/safe-next";
import { isModAction, isReason, isReportTarget, modErrorCode } from "@/lib/moderation";
import { notify } from "@/lib/notify";

// Reports, moderation actions, appeals and the keyword policy. Every rule (who may act, where, never on their own
// business, the audit log) is enforced by the database (0019); these only ask and send the person back.

const s = (v: FormDataEntryValue | null, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const uuid = (v: string) => (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v : null);
const qs = (o: Record<string, string | null | undefined>) => new URLSearchParams(Object.entries(o).filter(([, v]) => v) as [string, string][]).toString();

/** Report a post, comment, member or listing. */
export async function fileReport(fd: FormData) {
  const { supabase } = await requireUser("/home");
  const type = s(fd.get("type"), 20);
  const id = uuid(s(fd.get("id"), 40));
  const reason = s(fd.get("reason"), 20);
  const back = safeNext(s(fd.get("back")), "/home");
  if (!isReportTarget(type) || !id) redirect(back);
  if (!isReason(reason)) redirect(`/report?${qs({ type, id, back, error: "reason" })}`);
  const { error } = await supabase.from("moderation_reports").insert({ target_type: type, target_id: id, reason, details: s(fd.get("details"), 1000) || null });
  if (error) redirect(`/report?${qs({ type, id, back, error: modErrorCode(error.message) })}`);
  if (type === "record") {
    // A dispute: the other member of the record is told it is on hold (not who filed it; they can see that on the record).
    const { data: r } = await supabase.from("transaction_records").select("requester_id, provider_id, disputed_by, description").eq("id", id).maybeSingle();
    const other = r ? (r.disputed_by === r.requester_id ? r.provider_id : r.requester_id) : null;
    if (other) await notify(other, "records", { title: "A transaction record is on hold", body: r!.description.slice(0, 120), url: `/records/${id}`,
      email: { subject: "A FLAME PH transaction record is on hold for review", text: `The record "${r!.description}" was disputed and is on hold. It doesn't count until a moderator reviews it, usually within 24 hours.` } });
    redirect(`/report?${qs({ sent: "record", back })}`);
  }
  redirect(`/report?${qs({ sent: "1", back })}`);
}

/** A moderator acts on a report. */
export async function moderateReport(fd: FormData) {
  const { supabase } = await requireUser("/admin/moderation");
  const id = uuid(s(fd.get("report_id"), 40));
  const action = s(fd.get("action"), 30);
  if (!id || !isModAction(action)) redirect("/admin/moderation");
  const days = Number(s(fd.get("days"), 3)) || null;
  const { error } = await supabase.rpc("moderate", { p_report: id, p_action: action, p_note: s(fd.get("note"), 500) || null, p_days: days });
  revalidatePath("/admin/moderation", "layout");
  redirect(`/admin/moderation/${id}?${error ? `error=${modErrorCode(error.message)}` : `done=${action}`}`);
}

/** Founder: undo an earlier action. */
export async function overrideAction(fd: FormData) {
  const { supabase } = await requireUser("/admin/moderation/log");
  const actionId = Number(s(fd.get("action_id"), 20));
  const back = safeNext(s(fd.get("back")), "/admin/moderation/log");
  const { error } = Number.isInteger(actionId) && actionId > 0
    ? await supabase.rpc("override_action", { p_action: actionId, p_note: s(fd.get("note"), 500) || null, p_reason: "override" })
    : { error: { message: "not_found" } };
  revalidatePath("/admin/moderation", "layout");
  redirect(`${back}${back.includes("?") ? "&" : "?"}${error ? `error=${modErrorCode(error.message)}` : "done=override"}`);
}

/** Founder: decide an appeal. */
export async function decideAppeal(fd: FormData) {
  const { supabase } = await requireUser("/admin/moderation/appeals");
  const id = uuid(s(fd.get("appeal_id"), 40));
  const decision = s(fd.get("decision"), 20);
  const { error } = id && (decision === "upheld" || decision === "overturned")
    ? await supabase.rpc("decide_appeal", { p_appeal: id, p_decision: decision, p_note: s(fd.get("note"), 500) || null })
    : { error: { message: "not_found" } };
  revalidatePath("/admin/moderation", "layout");
  redirect(`/admin/moderation/appeals?${error ? `error=${modErrorCode(error.message)}` : `done=${decision}`}`);
}

/** Member: appeal an action taken on their account or content. */
export async function fileAppeal(fd: FormData) {
  const { supabase } = await requireUser("/account/notices");
  const actionId = Number(s(fd.get("action_id"), 20));
  const body = s(fd.get("body"), 1000);
  if (body.length < 10) redirect(`/account/notices?error=short#notice-${actionId}`);
  const { error } = await supabase.rpc("file_appeal", { p_action: actionId, p_body: body });
  revalidatePath("/account/notices");
  redirect(`/account/notices?${error ? `error=${modErrorCode(error.message)}` : "done=appeal"}#notice-${actionId}`);
}

/** Founder: the keyword filter. */
export async function setKeyword(fd: FormData) {
  const { supabase } = await requireUser("/admin/moderation/policy");
  const phrase = s(fd.get("phrase"), 60).toLowerCase();
  const op = s(fd.get("op"), 10);
  let error: { message: string } | null = null;
  if (op === "remove") ({ error } = await supabase.from("moderation_keywords").delete().eq("phrase", phrase));
  else if (phrase.length >= 3) ({ error } = await supabase.from("moderation_keywords").insert({ phrase, action: fd.get("action") === "block" ? "block" : "hold" }));
  revalidatePath("/admin/moderation/policy");
  redirect(`/admin/moderation/policy?${error ? `error=${modErrorCode(error.message)}` : `done=${op === "remove" ? "removed" : "added"}`}`);
}

/** Admins and founders: void a transaction record directly (Admin -> Records). What it earned is taken back. */
export async function voidRecordAdmin(fd: FormData) {
  const { supabase } = await requireUser("/admin/records");
  const id = uuid(s(fd.get("record_id"), 40));
  const note = s(fd.get("note"), 500);
  if (!id) redirect("/admin/records");
  if (note.length < 3) redirect(`/admin/records?error=note#rec-${id}`);
  const { error } = await supabase.rpc("void_record", { p_record: id, p_note: note });
  revalidatePath("/admin/records");
  redirect(`/admin/records?${error ? `error=${modErrorCode(error.message)}` : "done=void"}#rec-${id}`);
}
