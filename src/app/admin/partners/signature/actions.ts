"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminContext } from "@/lib/admin/guard";
import { tellApplicant } from "@/lib/partner-server";
import { sendEmail, NOTIFY_TO } from "@/lib/email";
import { ORG } from "@/lib/site";
import { BATCH_MOVES, RECALL_SCOPE, type BatchStatus } from "@/lib/signature";

// Admin > Partners > FLAME Signature (Step 7). Only the national team (founder, admins, national reviewers) writes
// licences and moves batches; never for their own business, and only after declaring no conflict on the proposal. Every
// step is in signature_history and the audit log, and the database checks the same rules again (0037), including that
// the proposal was chosen with both reviews cleared, every product approved, every plant inside the manufacturing
// rights and every FDA licence current.

const NATIONAL = ["super_admin", "admin", "national_reviewer"] as const;
const HOME = "/admin/partners/signature";
const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
const uuids = (fd: FormData, k: string, max: number) => [...new Set(fd.getAll(k).map((v) => uuid(v)).filter(Boolean) as string[])].slice(0, max);
const str = (fd: FormData, k: string, max: number) => String(fd.get(k) ?? "").trim().slice(0, max) || null;
const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));
/** The plain-words reason from a database refusal ("signature_licence: <reason>"). */
const why = (m: string | undefined) => { const x = String(m ?? "").match(/signature_(?:licence|batch): (.{3,300})/); return x ? x[1].replace(/\s+/g, " ").trim() : null; };
const fail = (path: string, m: string | undefined, hash = ""): never => {
  const r = why(m);
  redirect(`${path}?${r ? `error=db&m=${encodeURIComponent(r)}` : "error=failed"}${hash}`);
};

async function noConflict(ctx: Awaited<ReturnType<typeof adminContext>>, offerId: string | null) {
  if (!offerId) return false;
  const { data } = await ctx.db.from("supplier_offer_conflicts").select("has_conflict").eq("offer_id", offerId).eq("reviewer_id", ctx.user.id).maybeSingle();
  return !!data && !data.has_conflict;
}

type Lic = { id: string; ref_no: string; partner_user_id: string | null; offer_id: string | null; status: string };
async function loadLicence(id: string | null) {
  const ctx = await adminContext([...NATIONAL]);
  if (!id) redirect(HOME);
  const { data } = await ctx.db.from("signature_licences").select("id, ref_no, partner_user_id, offer_id, status").eq("id", id!).maybeSingle();
  if (!data) redirect(`${HOME}?error=missing`);
  const page = `${HOME}/licences/${id}`;
  if (data!.partner_user_id === ctx.user.id) redirect(`${page}?error=own`);
  return { ctx, l: data as Lic, page };
}
const licDone = (l: Lic, q: string, hash = ""): never => {
  revalidatePath(HOME); revalidatePath(`${HOME}/licences/${l.id}`); revalidatePath("/partner-us/signature");
  redirect(`${HOME}/licences/${l.id}?${q}${hash}`);
};

/** Starts a draft licence from a chosen (selected) FLAME Signature proposal. */
export async function createLicence(fd: FormData) {
  const ctx = await adminContext([...NATIONAL]);
  const offerId = uuid(fd.get("offer_id"));
  const back = (q: string): never => redirect(`${HOME}/licences/new?${q}`);
  if (!offerId) back("error=offer");
  const { data: o } = await ctx.db.from("supplier_offers").select("id, user_id, kind, status").eq("id", offerId!).maybeSingle();
  if (!o || o.kind !== "manufacturer" || o.status !== "selected") back("error=offer");
  if (o!.user_id === ctx.user.id) back("error=own");
  if (!(await noConflict(ctx, o!.id))) back("error=conflict");
  const { data: prof } = await ctx.db.from("partner_profiles").select("legal_name").eq("user_id", o!.user_id).maybeSingle();
  const { data: row, error } = await ctx.db.from("signature_licences").insert({
    partner_user_id: o!.user_id, partner_name: prof?.legal_name ?? "Toll manufacturer", offer_id: o!.id, created_by: ctx.user.id,
  }).select("id, ref_no").single();
  if (error || !row) back("error=failed");
  await ctx.db.from("signature_history").insert({ licence_id: row!.id, actor_id: ctx.user.id, action: "created" });
  await ctx.audit("signature_licence_created", "signature_licences", row!.id, { offer_id: o!.id });
  revalidatePath(HOME);
  redirect(`${HOME}/licences/${row!.id}?done=licence_saved`);
}

/** Saves a draft licence: approved products, plants, manufacturing rights, distribution rights, dates and notes. After
 *  it is active, only the team-only note can change. */
export async function saveLicence(fd: FormData) {
  const { ctx, l, page } = await loadLicence(uuid(fd.get("id")));
  const internal_note = str(fd, "internal_note", 2000);
  if (l.status !== "draft") {
    const { error } = await ctx.db.from("signature_licences").update({ internal_note }).eq("id", l.id);
    if (error) fail(page, error.message);
    licDone(l, "done=licence_saved");
  }
  const start = String(fd.get("start_date") ?? "").trim();
  const end = String(fd.get("end_date") ?? "").trim();
  if ((start && !isDate(start)) || (end && !isDate(end)) || (start && end && end <= start)) redirect(`${page}?error=licence`);
  const patch = {
    product_ids: uuids(fd, "product_ids", 15), site_ids: uuids(fd, "site_ids", 5), mfg_appointment_ids: uuids(fd, "mfg_appointment_ids", 10),
    dist_appointment_ids: uuids(fd, "dist_appointment_ids", 30), start_date: start || null, end_date: end || null,
    terms_note: str(fd, "terms_note", 2000), internal_note,
  };
  const { error } = await ctx.db.from("signature_licences").update(patch).eq("id", l.id).eq("status", "draft");
  if (error) fail(page, error.message);
  await ctx.db.from("signature_history").insert({ licence_id: l.id, actor_id: ctx.user.id, action: "changed", internal: true });
  await ctx.audit("signature_licence_saved", "signature_licences", l.id, { products: patch.product_ids.length, dist: patch.dist_appointment_ids.length });
  licDone(l, "done=licence_saved");
}

const LICENCE_MOVES: Record<string, string[]> = { draft: ["active", "cancelled"], active: ["suspended", "ended"], suspended: ["active", "ended"], ended: [], cancelled: [] };
const LICENCE_ACTION: Record<string, string> = { active: "activated", suspended: "suspended", ended: "ended", cancelled: "cancelled" };

/** Activates (or reactivates), suspends, ends or cancels a licence. Activation is checked in full by the database. */
export async function licenceStatus(fd: FormData) {
  const { ctx, l, page } = await loadLicence(uuid(fd.get("id")));
  const to = String(fd.get("to") ?? "");
  if (!LICENCE_MOVES[l.status]?.includes(to)) redirect(`${page}?error=move`);
  if (!(await noConflict(ctx, l.offer_id))) redirect(`${page}?error=conflict`);
  const reason = str(fd, "reason", 1000);
  if (to !== "active" && !reason) redirect(`${page}?error=licence_reason#status`);
  const patch = to === "active" ? { status: to, approved_by: ctx.user.id, status_reason: l.status === "suspended" ? reason : null } : { status: to, changed_by: ctx.user.id, status_reason: reason };
  const { error } = await ctx.db.from("signature_licences").update(patch).eq("id", l.id).eq("status", l.status);
  if (error) fail(page, error.message, "#status");
  const action = to === "active" && l.status === "suspended" ? "reactivated" : LICENCE_ACTION[to];
  await ctx.db.from("signature_history").insert({ licence_id: l.id, actor_id: ctx.user.id, action, note: reason });
  await ctx.audit(`signature_licence_${action}`, "signature_licences", l.id, { from: l.status, to });
  if (l.partner_user_id && to !== "cancelled") {
    const title = to === "active" ? `FLAME Signature licence ${l.ref_no} is active` : `FLAME Signature licence ${l.ref_no} was ${to === "ended" ? "ended" : "suspended"}`;
    const body = to === "active" ? "You may now make the licensed products under the FLAME Signature mark at the licensed plants, for sale in the licensed areas only." : `Stop using the FLAME Signature mark on new batches under this licence. Reason: ${reason}`;
    await tellApplicant(l.partner_user_id, title, body, "/partner-us/signature", "FLAME Signature");
  }
  licDone(l, "done=licence_status");
}

/** A note on a licence or a batch for the national team only. */
export async function signatureNote(fd: FormData) {
  const ctx = await adminContext([...NATIONAL]);
  const licenceId = uuid(fd.get("licence_id"));
  const batchId = uuid(fd.get("batch_id"));
  const page = licenceId ? `${HOME}/licences/${licenceId}` : batchId ? `${HOME}/batches/${batchId}` : HOME;
  const note = str(fd, "note", 2000);
  if (!note || (!licenceId === !batchId)) redirect(`${page}?error=empty_note#history`);
  const { error } = await ctx.db.from("signature_history").insert({ licence_id: licenceId, batch_id: batchId, actor_id: ctx.user.id, action: "team_note", note, internal: true });
  if (error) redirect(`${page}?error=failed#history`);
  await ctx.audit("signature_team_note", licenceId ? "signature_licences" : "signature_batches", (licenceId ?? batchId)!);
  revalidatePath(page);
  redirect(`${page}?done=note#history`);
}

/** Releases a production batch for sale under the mark, puts a batch on hold, rejects it or recalls it (with a reason;
 *  a recall also needs its level). The manufacturer is told; a recall also emails the national team. */
export async function batchStatus(fd: FormData) {
  const ctx = await adminContext([...NATIONAL]);
  const id = uuid(fd.get("id"));
  if (!id) redirect(`${HOME}/batches`);
  const page = `${HOME}/batches/${id}`;
  const { data: b } = await ctx.db.from("signature_batches").select("id, ref_no, partner_user_id, offer_id, status, product_name, lot_no").eq("id", id!).maybeSingle();
  if (!b) redirect(`${HOME}/batches?error=missing`);
  if (b!.partner_user_id === ctx.user.id) redirect(`${page}?error=own`);
  const to = String(fd.get("to") ?? "") as BatchStatus;
  if (!BATCH_MOVES[b!.status as BatchStatus]?.includes(to)) redirect(`${page}?error=move`);
  if (!(await noConflict(ctx, b!.offer_id))) redirect(`${page}?error=conflict`);
  const reason = str(fd, "reason", 1000);
  if (to !== "released" && !reason) redirect(`${page}?error=licence_reason#status`);
  const scope = to === "recalled" ? (String(fd.get("recall_scope") ?? "") in RECALL_SCOPE ? String(fd.get("recall_scope")) : null) : null;
  if (to === "recalled" && !scope) redirect(`${page}?error=recall_scope#status`);
  const { error } = await ctx.db.from("signature_batches").update({ status: to, status_by: ctx.user.id, status_reason: reason, recall_scope: scope }).eq("id", b!.id).eq("status", b!.status);
  if (error) fail(page, error.message, "#status");
  await ctx.db.from("signature_history").insert({ batch_id: b!.id, actor_id: ctx.user.id, action: to, note: reason });
  await ctx.audit(`signature_batch_${to}`, "signature_batches", b!.id, { from: b!.status, recall_scope: scope });
  const what = `${b!.product_name} lot ${b!.lot_no} (${b!.ref_no})`;
  if (b!.partner_user_id) {
    const title = { released: `Batch released for sale: ${what}`, on_hold: `Batch on hold: ${what}`, rejected: `Batch rejected: ${what}`, recalled: `RECALL: ${what}`, recorded: "" }[to];
    const body = to === "released" ? "The national team released this batch for sale under the FLAME Signature mark, in the licensed areas only." : to === "recalled" ? `Start your recall plan now (${RECALL_SCOPE[scope as keyof typeof RECALL_SCOPE]}). Reason: ${reason}` : `Reason: ${reason}`;
    await tellApplicant(b!.partner_user_id, title, body, `/partner-us/signature/batches/${b!.id}`, "FLAME Signature");
  }
  if (to === "recalled") {
    await sendEmail({ to: NOTIFY_TO, subject: `RECALL started: FLAME Signature ${what}`, text: `Level: ${RECALL_SCOPE[scope as keyof typeof RECALL_SCOPE]}\nReason: ${reason}\n\n${ORG.url}${page}` });
  }
  revalidatePath(`${HOME}/batches`); revalidatePath(page); revalidatePath("/partner-us/signature"); revalidatePath(`/partner-us/signature/batches/${b!.id}`);
  redirect(`${page}?done=status`);
}
