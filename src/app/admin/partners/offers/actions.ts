"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminContext } from "@/lib/admin/guard";
import { tellApplicant } from "@/lib/partner-server";
import { cleanScore, isOfferReason, offerResult, SCORE_PARTS, type ScoreRow } from "@/lib/offers";

// Admin > Partners > Supplier offers. Only the national team (founder, admin, national reviewer) declares conflicts,
// scores and decides. Chapter coordinators, testers and finance have no access to commercial offers. Every step is in
// supplier_offer_history and the audit log, and the database checks the same rules again (0032).

const NATIONAL = ["super_admin", "admin", "national_reviewer"] as const;
const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
const page = (id: string, q: string, hash = "") => `/admin/partners/offers/${id}?${q}${hash}`;

async function loadOffer(id: string | null) {
  const ctx = await adminContext([...NATIONAL]);
  if (!id) redirect("/admin/partners/offers");
  const { data: offer } = await ctx.db.from("supplier_offers").select("id, user_id, status, revision, title").eq("id", id!).maybeSingle();
  if (!offer) redirect("/admin/partners/offers?error=missing");
  if (offer!.user_id === ctx.user.id) redirect(page(id!, "error=own"));   // nobody reviews their own offer
  return { ctx, offer: offer as { id: string; user_id: string; status: string; revision: number; title: string | null } };
}

async function myDeclaration(ctx: Awaited<ReturnType<typeof adminContext>>, offerId: string) {
  const { data } = await ctx.db.from("supplier_offer_conflicts").select("has_conflict").eq("offer_id", offerId).eq("reviewer_id", ctx.user.id).maybeSingle();
  return data as { has_conflict: boolean } | null;
}

/** The reviewer's conflict-of-interest declaration for this offer. A conflict means they step aside: no score, no vote. */
export async function declareConflict(fd: FormData) {
  const { ctx, offer } = await loadOffer(uuid(fd.get("id")));
  const answer = String(fd.get("conflict") ?? "");
  const details = String(fd.get("details") ?? "").trim().slice(0, 1000) || null;
  if (!["yes", "no"].includes(answer)) redirect(page(offer.id, "error=coi", "#coi"));
  if (answer === "yes" && !details) redirect(page(offer.id, "error=coi_details", "#coi"));
  const mine = await myDeclaration(ctx, offer.id);
  if (mine?.has_conflict) redirect(page(offer.id, "error=coi_locked", "#coi"));
  if (mine && answer === "no") redirect(page(offer.id, "done=coi", "#coi"));
  const { error } = mine
    ? await ctx.db.from("supplier_offer_conflicts").update({ has_conflict: true, details, declared_at: new Date().toISOString() }).eq("offer_id", offer.id).eq("reviewer_id", ctx.user.id)
    : await ctx.db.from("supplier_offer_conflicts").insert({ offer_id: offer.id, reviewer_id: ctx.user.id, has_conflict: answer === "yes", details: answer === "yes" ? details : null });
  if (error) redirect(page(offer.id, "error=failed", "#coi"));
  await ctx.audit("supplier_offer_conflict_declared", "supplier_offers", offer.id, { has_conflict: answer === "yes" });
  revalidatePath(`/admin/partners/offers/${offer.id}`);
  redirect(page(offer.id, "done=coi", "#coi"));
}

/** One reviewer's score for the current version: five parts with their maximums, and the compliance gate. */
export async function saveScore(fd: FormData) {
  const { ctx, offer } = await loadOffer(uuid(fd.get("id")));
  const back = (q: string): never => redirect(page(offer.id, q, "#score"));
  if (offer.status !== "submitted") back("error=status");
  const mine = await myDeclaration(ctx, offer.id);
  if (!mine || mine.has_conflict) back("error=coi_first");
  const parts: Record<string, number> = {};
  for (const p of SCORE_PARTS) {
    const n = cleanScore(fd.get(p.key), p.max);
    if (n === null) back("error=score");
    parts[p.key] = n!;
  }
  const gate = String(fd.get("compliance") ?? "");
  if (!["pass", "fail"].includes(gate)) back("error=gate_choice");
  const compliance_note = String(fd.get("compliance_note") ?? "").trim().slice(0, 1000) || null;
  if (gate === "fail" && !compliance_note) back("error=gate_note");
  const note = String(fd.get("note") ?? "").trim().slice(0, 2000) || null;
  const { error } = await ctx.db.from("supplier_offer_scores").upsert({
    offer_id: offer.id, revision: offer.revision, reviewer_id: ctx.user.id, ...parts, compliance_pass: gate === "pass", compliance_note, note,
  }, { onConflict: "offer_id,revision,reviewer_id" });
  if (error) back("error=failed");
  const total = Object.values(parts).reduce((a, b) => a + b, 0);
  await ctx.audit("supplier_offer_scored", "supplier_offers", offer.id, { revision: offer.revision, total, compliance_pass: gate === "pass" });
  revalidatePath(`/admin/partners/offers/${offer.id}`); revalidatePath("/admin/partners/offers");
  back("done=scored");
}

const DECISION_TEXT = {
  selected: { title: "Your offer was chosen as a Best Offer", body: "The FLAME PH national team chose your offer. Open it to read why, and wait for our message about the next steps." },
  needs_changes: { title: "Your offer needs changes", body: "The review team asks you to change a few things, then send it again. Open your offer to see the list." },
  not_selected: { title: "Your offer was not chosen this time", body: "Open your offer to see the reasons. You can change it and send it again." },
} as const;

/** The national team's decision. A Best Offer needs a no-conflict declaration, the compliance gate passed, an average
 *  score of 80 or more for this version, and a written reason for the final selection. */
export async function decideOffer(fd: FormData) {
  const { ctx, offer } = await loadOffer(uuid(fd.get("id")));
  const back = (q: string): never => redirect(page(offer.id, q, "#decide"));
  const decision = String(fd.get("decision") ?? "");
  if (!(decision in DECISION_TEXT)) back("error=decision");
  if (offer.status !== "submitted") back("error=status");
  const mine = await myDeclaration(ctx, offer.id);
  if (!mine || mine.has_conflict) back("error=coi_first");
  const reasons = [...new Set(fd.getAll("reasons").map(String).filter(isOfferReason))].slice(0, 12);
  const note = String(fd.get("note") ?? "").trim().slice(0, 2000) || null;
  const selection_reason = String(fd.get("selection_reason") ?? "").trim().slice(0, 2000) || null;
  if (decision === "selected") {
    if (!selection_reason) back("error=selection_reason");
    const { data: scores } = await ctx.db.from("supplier_offer_scores").select("reviewer_id, revision, total, compliance_pass").eq("offer_id", offer.id).eq("revision", offer.revision);
    if (!offerResult((scores ?? []) as ScoreRow[], offer.revision).canSelect) back("error=gate");
  } else {
    if (reasons.length === 0) back("error=reasons");
    if (reasons.includes("other") && !note) back("error=note");
  }
  const now = new Date().toISOString();
  const { error } = await ctx.db.from("supplier_offers").update({
    status: decision, decided_at: now, decided_by: ctx.user.id,
    decision_reasons: decision === "selected" ? [] : reasons, decision_note: note, selection_reason: decision === "selected" ? selection_reason : null,
  }).eq("id", offer.id).eq("status", "submitted");
  if (error) back(decision === "selected" ? "error=gate" : "error=failed");
  await ctx.db.from("supplier_offer_history").insert({
    offer_id: offer.id, actor_id: ctx.user.id, action: decision, revision: offer.revision,
    reasons: decision === "selected" ? [] : reasons, note: decision === "selected" ? selection_reason : note,
  });
  await ctx.audit(`supplier_offer_${decision}`, "supplier_offers", offer.id, { revision: offer.revision, reasons });
  const t = DECISION_TEXT[decision as keyof typeof DECISION_TEXT];
  await tellApplicant(offer.user_id, t.title, `${t.body} (${offer.title ?? "your offer"})`, `/partner-us/offers/${offer.id}`, "FLAME PH Best Offer");
  revalidatePath("/admin/partners/offers"); revalidatePath(`/admin/partners/offers/${offer.id}`);
  back("done=decided");
}

/** A note for the national team only (the supplier never sees it). */
export async function teamNote(fd: FormData) {
  const { ctx, offer } = await loadOffer(uuid(fd.get("id")));
  const note = String(fd.get("note") ?? "").trim().slice(0, 2000);
  if (!note) redirect(page(offer.id, "error=empty_note", "#history"));
  await ctx.db.from("supplier_offer_history").insert({ offer_id: offer.id, actor_id: ctx.user.id, action: "team_note", revision: offer.revision, note, internal: true });
  await ctx.audit("supplier_offer_team_note", "supplier_offers", offer.id);
  revalidatePath(`/admin/partners/offers/${offer.id}`);
  redirect(page(offer.id, "done=note", "#history"));
}
