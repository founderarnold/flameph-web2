"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminContext } from "@/lib/admin/guard";
import { createClient } from "@/lib/supabase/server";
import { isReason, PARTNER_CATEGORIES, type PartnerCategory } from "@/lib/partner";
import { tellApplicant } from "@/lib/partner-server";

// Admin > Partners. Only the national team (founder, admin, national reviewer) decides. Chapter coordinators may add a
// note on applications from their own chapter, never decide. Every step is in partner_reviews and the audit log.

const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
const NATIONAL = ["super_admin", "admin", "national_reviewer"] as const;

const DECISION_TEXT = {
  approved: { title: "You are now an accredited partner", body: "The FLAME PH national team approved your application." },
  needs_changes: { title: "Your application needs changes", body: "The review team asks you to fix a few things, then send it again. Open your application to see the list." },
  rejected: { title: "Your application was not approved", body: "Open your application to see the reasons. You can fix them and apply again." },
} as const;

export async function decideApplication(fd: FormData) {
  const ctx = await adminContext([...NATIONAL]);
  const id = uuid(fd.get("id"));
  if (!id) redirect("/admin/partners");
  const back = (q: string): never => redirect(`/admin/partners/${id}?${q}`);
  const decision = String(fd.get("decision") ?? "");
  if (!(decision in DECISION_TEXT)) back("error=decision");
  const reasons = [...new Set(fd.getAll("reasons").map(String).filter(isReason))].slice(0, 12);
  const note = String(fd.get("note") ?? "").trim().slice(0, 2000) || null;
  if (decision !== "approved" && reasons.length === 0) back("error=reasons");
  if (reasons.includes("other") && !note) back("error=note");

  const { data: app } = await ctx.db.from("partner_applications").select("id, user_id, business_id, category, status, revision, legal_name").eq("id", id!).maybeSingle();
  if (!app) back("error=missing");
  if (app!.user_id === ctx.user.id) back("error=own");   // nobody reviews their own business
  if (app!.status !== "submitted") back("error=status");

  const now = new Date().toISOString();
  const { error } = await ctx.db.from("partner_applications").update({
    status: decision, decided_at: now, decided_by: ctx.user.id, decision_reasons: decision === "approved" ? [] : reasons, decision_note: note,
  }).eq("id", id!).eq("status", "submitted");
  if (error) back("error=failed");
  await ctx.db.from("partner_reviews").insert({ application_id: id, actor_id: ctx.user.id, action: decision, revision: app!.revision, reasons: decision === "approved" ? [] : reasons, note });

  if (decision === "approved") {
    const { data: prof } = await ctx.db.from("partner_profiles").select("id, categories").eq("user_id", app!.user_id).maybeSingle();
    const categories = [...new Set([...((prof?.categories as string[] | undefined) ?? []), app!.category])];
    await ctx.db.from("partner_profiles").upsert({
      user_id: app!.user_id, business_id: app!.business_id, legal_name: app!.legal_name ?? "", categories, status: "accredited", accredited_at: now, accredited_by: ctx.user.id,
    }, { onConflict: "user_id" });
  }
  await ctx.audit(`partner_${decision}`, "partner_applications", id!, { category: app!.category, revision: app!.revision, reasons });
  const t = DECISION_TEXT[decision as keyof typeof DECISION_TEXT];
  await tellApplicant(app!.user_id, t.title, `${t.body} (${PARTNER_CATEGORIES[app!.category as PartnerCategory].label})`, `/partner-us/apply/${id}`);
  revalidatePath("/admin/partners"); revalidatePath(`/admin/partners/${id}`);
  back("done=decided");
}

/** The reviewer's mark on one document: OK, or a problem the applicant must fix (they see "Please replace"). */
export async function markDocument(fd: FormData) {
  const ctx = await adminContext([...NATIONAL]);
  const id = uuid(fd.get("id"));
  const docId = uuid(fd.get("doc_id"));
  const mark = String(fd.get("mark") ?? "");
  if (!id || !docId || !["ok", "problem"].includes(mark)) redirect("/admin/partners");
  const back = (q: string): never => redirect(`/admin/partners/${id}?${q}#docs`);
  const { data: doc } = await ctx.db.from("vetting_documents").select("id, user_id, doc_type").eq("id", docId!).eq("application_id", id!).eq("purpose", "partner").maybeSingle();
  if (!doc) back("error=missing");
  if (doc!.user_id === ctx.user.id) back("error=own");
  const { error } = await ctx.db.from("vetting_documents").update({ review_status: mark, reviewed_at: new Date().toISOString(), reviewed_by: ctx.user.id }).eq("id", docId!);
  if (error) back("error=failed");
  const { data: app } = await ctx.db.from("partner_applications").select("revision").eq("id", id!).single();
  await ctx.db.from("partner_reviews").insert({ application_id: id, actor_id: ctx.user.id, action: "doc_checked", revision: app?.revision ?? 1, note: `${doc!.doc_type}: ${mark}`, internal: true });
  await ctx.audit("partner_doc_checked", "vetting_documents", docId!, { mark });
  revalidatePath(`/admin/partners/${id}`);
  back("done=marked");
}

/** A chapter coordinator's recommendation on an application from their chapter. Internal: only the national team reads it. */
export async function chapterNote(fd: FormData) {
  const ctx = await adminContext(["super_admin", "admin", "national_reviewer", "chapter_coordinator"]);
  const id = uuid(fd.get("id"));
  const note = String(fd.get("note") ?? "").trim().slice(0, 2000);
  if (!id || !note) redirect("/admin/partners?error=note");
  // The coordinator's own list, read as them (partner_chapter_applications checks their chapter).
  const supabase = await createClient();
  const { data: mine } = supabase ? await supabase.rpc("partner_chapter_applications") : { data: null };
  const app = ((mine ?? []) as { id: string }[]).find((r) => r.id === id);
  if (!app) redirect("/admin/partners?error=scope");
  const { data: row } = await ctx.db.from("partner_applications").select("revision, user_id").eq("id", id!).single();
  if (row?.user_id === ctx.user.id) redirect("/admin/partners?error=own");
  await ctx.db.from("partner_reviews").insert({ application_id: id, actor_id: ctx.user.id, action: "chapter_note", revision: row?.revision ?? 1, note, internal: true });
  await ctx.audit("partner_chapter_note", "partner_applications", id!);
  revalidatePath("/admin/partners");
  redirect("/admin/partners?done=note");
}
