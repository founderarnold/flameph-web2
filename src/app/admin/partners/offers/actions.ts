"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminContext } from "@/lib/admin/guard";
import { tellApplicant } from "@/lib/partner-server";
import { cleanScore, isOfferReason, offerResult, SCORE_PARTS, type ScoreRow } from "@/lib/offers";
import { isServiceReason } from "@/lib/service-offers";
import { canClear, isReviewType, isSignatureReason, REVIEW_ITEMS, reviewState, type ReviewRow } from "@/lib/signature";

// Admin > Partners > Supplier offers, Service offers and FLAME Signature proposals (Steps 6 and 7 reuse every action
// here; service offers add reference checks; FLAME Signature proposals add the regulatory and legal reviews and the
// approval of each product). Only the national team (founder, admin, national reviewer) declares conflicts,
// scores and decides. Chapter coordinators, testers and finance have no access to commercial offers. Every step is in
// supplier_offer_history and the audit log, and the database checks the same rules again (0032).

const NATIONAL = ["super_admin", "admin", "national_reviewer"] as const;
const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
const page = (id: string, q: string, hash = "") => `/admin/partners/offers/${id}?${q}${hash}`;

async function loadOffer(id: string | null) {
  const ctx = await adminContext([...NATIONAL]);
  if (!id) redirect("/admin/partners/offers");
  const { data: offer } = await ctx.db.from("supplier_offers").select("id, user_id, status, revision, title, kind").eq("id", id!).maybeSingle();
  if (!offer) redirect("/admin/partners/offers?error=missing");
  if (offer!.user_id === ctx.user.id) redirect(page(id!, "error=own"));   // nobody reviews their own offer
  return { ctx, offer: offer as { id: string; user_id: string; status: string; revision: number; title: string | null; kind: "supplier" | "service" | "manufacturer" } };
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
  const reasons = [...new Set(fd.getAll("reasons").map(String).filter(offer.kind === "manufacturer" ? isSignatureReason : offer.kind === "service" ? isServiceReason : isOfferReason))].slice(0, 14);
  const note = String(fd.get("note") ?? "").trim().slice(0, 2000) || null;
  const selection_reason = String(fd.get("selection_reason") ?? "").trim().slice(0, 2000) || null;
  if (decision === "selected") {
    if (!selection_reason) back("error=selection_reason");
    const { data: scores } = await ctx.db.from("supplier_offer_scores").select("reviewer_id, revision, total, compliance_pass").eq("offer_id", offer.id).eq("revision", offer.revision);
    if (!offerResult((scores ?? []) as ScoreRow[], offer.revision).canSelect) back("error=gate");
    if (offer.kind === "manufacturer") {
      const { data: rv } = await ctx.db.from("signature_reviews").select("revision, review_type, outcome, created_at").eq("offer_id", offer.id).eq("revision", offer.revision);
      if (!reviewState((rv ?? []) as ReviewRow[], offer.revision).cleared) back("error=reviews");
    }
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
  await ctx.audit(`${offer.kind === "service" ? "service_offer" : offer.kind === "manufacturer" ? "signature_offer" : "supplier_offer"}_${decision}`, "supplier_offers", offer.id, { revision: offer.revision, reasons });
  const t = DECISION_TEXT[decision as keyof typeof DECISION_TEXT];
  await tellApplicant(offer.user_id, offer.kind === "service" ? t.title.replace("Your offer", "Your service offer") : offer.kind === "manufacturer" ? t.title.replace("Your offer", "Your FLAME Signature proposal") : t.title, `${t.body} (${offer.title ?? "your offer"})`, `/partner-us/offers/${offer.id}`, "FLAME PH Best Offer");
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

/** Service offers (Step 6): the result of calling one of the provider's past clients. Only a reviewer who declared no
 *  conflict of interest; "could not verify" needs a note. The database checks the same (0036). */
export async function checkReference(fd: FormData) {
  const { ctx, offer } = await loadOffer(uuid(fd.get("id")));
  const back = (q: string): never => redirect(page(offer.id, q, "#references"));
  if (offer.kind !== "service") back("error=failed");
  if (!["submitted", "needs_changes", "selected", "not_selected"].includes(offer.status)) back("error=status");
  const mine = await myDeclaration(ctx, offer.id);
  if (!mine || mine.has_conflict) back("error=coi_first");
  const refId = uuid(fd.get("reference_id"));
  const result = String(fd.get("verification") ?? "");
  if (!refId || !["verified", "not_verified"].includes(result)) back("error=ref_choice");
  const note = String(fd.get("verification_note") ?? "").trim().slice(0, 1000) || null;
  if (!note) back("error=ref_note");
  const r = Number(fd.get("client_rating"));
  const client_rating = result === "verified" && Number.isInteger(r) && r >= 1 && r <= 5 ? r : null;
  const { error } = await ctx.db.from("service_offer_references").update({
    verification: result, client_rating, verification_note: note, verified_by: ctx.user.id, verified_at: new Date().toISOString(),
  }).eq("id", refId!).eq("offer_id", offer.id);
  if (error) back("error=failed");
  await ctx.audit("service_offer_reference_checked", "service_offer_references", refId!, { offer_id: offer.id, result, client_rating });
  revalidatePath(`/admin/partners/offers/${offer.id}`);
  back("done=reference");
}

/** FLAME Signature proposals (Step 7): a regulatory or legal review of the current version. Append-only: a new review
 *  replaces the earlier one of the same kind. "Cleared" needs every item ticked; "not cleared" needs a note saying what
 *  is missing. Only a reviewer who declared no conflict; the database checks the same (0037). */
export async function saveSignatureReview(fd: FormData) {
  const { ctx, offer } = await loadOffer(uuid(fd.get("id")));
  const back = (q: string): never => redirect(page(offer.id, q, "#reviews"));
  if (offer.kind !== "manufacturer") back("error=failed");
  if (offer.status !== "submitted") back("error=status");
  const mine = await myDeclaration(ctx, offer.id);
  if (!mine || mine.has_conflict) back("error=coi_first");
  const type = fd.get("review_type");
  if (!isReviewType(type)) back("error=failed");
  const t = type as keyof typeof REVIEW_ITEMS;
  const ticked = [...new Set(fd.getAll("checklist").map(String).filter((k) => k in REVIEW_ITEMS[t]))];
  const outcome = String(fd.get("outcome") ?? "");
  if (!["cleared", "not_cleared"].includes(outcome)) back("error=review_outcome");
  if (outcome === "cleared" && !canClear(t, ticked)) back("error=review");
  const note = String(fd.get("note") ?? "").trim().slice(0, 2000);
  if (note.length < 5) back("error=review_note");
  const { error } = await ctx.db.from("signature_reviews").insert({ offer_id: offer.id, revision: offer.revision, review_type: t, outcome, checklist: ticked, note, reviewer_id: ctx.user.id });
  if (error) back("error=failed");
  await ctx.audit(`signature_${t}_review`, "supplier_offers", offer.id, { revision: offer.revision, outcome, ticked: ticked.length });
  revalidatePath(`/admin/partners/offers/${offer.id}`);
  back("done=review");
}

/** FLAME Signature proposals (Step 7): approves one product for the FLAME Signature mark, or marks it not approved.
 *  Approval needs the regulatory review of this version cleared and the proposal under review or chosen. Only approved
 *  products can go into a licence. */
export async function decideProduct(fd: FormData) {
  const { ctx, offer } = await loadOffer(uuid(fd.get("id")));
  const back = (q: string): never => redirect(page(offer.id, q, "#sig-products"));
  if (offer.kind !== "manufacturer") back("error=failed");
  if (!["submitted", "selected"].includes(offer.status)) back("error=status");
  const mine = await myDeclaration(ctx, offer.id);
  if (!mine || mine.has_conflict) back("error=coi_first");
  const productId = uuid(fd.get("product_id"));
  const approval = String(fd.get("approval") ?? "");
  if (!productId || !["approved", "not_approved"].includes(approval)) back("error=decision");
  const note = String(fd.get("approval_note") ?? "").trim().slice(0, 1000) || null;
  if (approval === "not_approved" && !note) back("error=product_note");
  if (approval === "approved") {
    const { data: rv } = await ctx.db.from("signature_reviews").select("revision, review_type, outcome, created_at").eq("offer_id", offer.id).eq("revision", offer.revision);
    if (reviewState((rv ?? []) as ReviewRow[], offer.revision).regulatory !== "cleared") back("error=regulatory_first");
  }
  const { error } = await ctx.db.from("signature_products").update({ approval, approval_note: note, approved_by: ctx.user.id, approved_at: new Date().toISOString() })
    .eq("id", productId!).eq("offer_id", offer.id);
  if (error) back("error=failed");
  await ctx.audit(`signature_product_${approval}`, "signature_products", productId!, { offer_id: offer.id });
  revalidatePath(`/admin/partners/offers/${offer.id}`);
  back("done=product");
}
