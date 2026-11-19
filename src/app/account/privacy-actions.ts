"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { sendEmail, NOTIFY_TO } from "@/lib/email";
import { ORG } from "@/lib/site";
import { REQUEST_KINDS, privacyError, isRequestKind, ERASURE_COOL_OFF_DAYS } from "@/lib/data-rights";

// Phase 12: the member's side of their data rights. The database does the checks and the closing (0028); these pass
// the member's choice along and tell the Data Protection Officer.

const BACK = "/account/privacy";
const s = (v: FormDataEntryValue | null, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const go = (q: string, hash = ""): never => redirect(`${BACK}?${q}${hash}`);

async function tellDpo(kind: string, memberId: string, details?: string) {
  await sendEmail({
    to: NOTIFY_TO,
    subject: `Privacy request: ${REQUEST_KINDS[kind as keyof typeof REQUEST_KINDS]?.label ?? kind}`,
    text: `A member sent a privacy request.\n\nKind: ${kind}\nMember ID: ${memberId}\nTime: ${new Date().toISOString()}${details ? `\n\nWhat they wrote:\n${details}` : ""}\n\nHandle it in Admin → Privacy and security: ${ORG.url}/admin/privacy\nThe answer is due within 15 working days.`,
  });
}

/** Correction, objection, or a written access or portability request (the download covers most of those). */
export async function sendPrivacyRequest(fd: FormData) {
  const { supabase, user } = await requireUser(BACK);
  const kind = s(fd.get("kind"), 20);
  if (!isRequestKind(kind) || kind === "erasure" || kind === "closure") go("error=failed");
  const details = s(fd.get("details"));
  const { error } = await supabase.rpc("privacy_request_submit", { p_kind: kind, p_details: details || null });
  if (error) go(`error=${privacyError(error.message)}`, "#requests");
  await tellDpo(kind, user.id, details);
  revalidatePath(BACK);
  go("done=request", "#requests");
}

export async function closeAccount(fd: FormData) {
  const { supabase, user } = await requireUser(BACK);
  if (fd.get("confirm") !== "on") go("error=confirm", "#close");
  const { error } = await supabase.rpc("privacy_request_submit", { p_kind: "closure", p_details: null });
  if (error) go(`error=${privacyError(error.message)}`, "#close");
  await tellDpo("closure", user.id);
  if (user.email) await sendEmail({ to: user.email, subject: "Your FLAME PH account is closed", text: `Your FLAME PH account is now closed. Your profile, posts and listings are hidden.\n\nWe erase your data 1 year after closing. Changed your mind? Sign in and press "Reopen my account" at ${ORG.url}${BACK}\n\nQuestions: ${ORG.emailPrimary}` });
  revalidatePath("/", "layout");
  go("done=closed");
}

export async function eraseAccount(fd: FormData) {
  const { supabase, user } = await requireUser(BACK);
  if (fd.get("confirm") !== "on") go("error=confirm", "#erase");
  const { error } = await supabase.rpc("privacy_request_submit", { p_kind: "erasure", p_details: s(fd.get("details")) || null });
  if (error) go(`error=${privacyError(error.message)}`, "#erase");
  await tellDpo("erasure", user.id);
  if (user.email) await sendEmail({ to: user.email, subject: "We received your request to delete your FLAME PH account", text: `Your FLAME PH account is closed now, and everything is hidden.\n\nWe will erase your account and data in ${ERASURE_COOL_OFF_DAYS} days. Until then you can change your mind: sign in and press "Reopen my account" at ${ORG.url}${BACK}\n\nWant a copy of your data first? Use "Download my data" on the same page.\n\nQuestions: ${ORG.emailPrimary}` });
  revalidatePath("/", "layout");
  go("done=erasure");
}

export async function reopenAccount() {
  const { supabase } = await requireUser(BACK);
  const { error } = await supabase.rpc("privacy_reopen_account");
  if (error) go(`error=${privacyError(error.message)}`);
  revalidatePath("/", "layout");
  go("done=reopened");
}

export async function withdrawRequest(fd: FormData) {
  const { supabase } = await requireUser(BACK);
  const { error } = await supabase.rpc("privacy_request_withdraw", { p_id: s(fd.get("id"), 40) });
  if (error) go(`error=${privacyError(error.message)}`, "#requests");
  revalidatePath(BACK);
  go("done=withdrawn", "#requests");
}

/** Objection: leave me out of "People you may know". */
export async function saveSuggestionChoice(fd: FormData) {
  const { supabase, user } = await requireUser(BACK);
  const hide = fd.get("hide") === "on";
  const { error } = await supabase.from("profiles").update({ hide_from_suggestions: hide }).eq("id", user.id);
  if (error) go(`error=${privacyError(error.message)}`, "#object");
  revalidatePath(BACK);
  go("done=suggestions", "#object");
}
