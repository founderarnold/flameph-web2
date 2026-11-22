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
import { isIndustry } from "@/lib/industries";
import { PROVINCES } from "@/content/ph-provinces";
import {
  cleanDetails, COVERAGE, EDITABLE, isCategory, isPartnerDocType, LAST_STEP, MAX_BYTES_PER_PARTNER, MAX_DOCS_PER_APPLICATION,
  missingItems, PARTNER_CATEGORIES, PARTNER_DOC_MAX_BYTES, PARTNER_PRIVACY, REGISTRATION_TYPES, validEmail, validPhone, validTin, validUrl,
  type PartnerCategory, type PartnerStatus,
} from "@/lib/partner";
import { partnerBytes, sealTin, SNAPSHOT_COLUMNS } from "@/lib/partner-server";

// The applicant's side of the partner application. Every write goes through here with the server key, after checking
// that the signed-in member owns the application and that it is still a draft (or was sent back for changes).
// The database checks the same rules again (0031: status moves, required fields, limits).

const HOME = "/partner-us/apply";
const go = (path: string): never => redirect(path);
const formPath = (id: string, step: number, q = "") => `${HOME}/${id}?step=${step}${q ? `&${q}` : ""}`;
const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
const str = (fd: FormData, k: string, max: number) => String(fd.get(k) ?? "").trim().slice(0, max) || null;

/** The member's own application, read as the member (row level security), then the server key for writing. */
async function ownApp(id: string | null) {
  const { supabase, user } = await requireUser(HOME);
  if (!id) go(HOME);
  const { data: app, error } = await supabase.from("partner_applications").select("id, user_id, category, status, details, revision").eq("id", id!).maybeSingle();
  if (error) go(`${HOME}?error=unavailable`);
  if (!app || app.user_id !== user.id) go(HOME);
  const admin = createAdminClient();
  if (!admin) go(`${HOME}?error=unavailable`);
  return { user, supabase, admin: admin!, app: app as { id: string; user_id: string; category: PartnerCategory; status: PartnerStatus; details: Record<string, string>; revision: number } };
}

/** Starts an application for one category, or opens the one the member already has. Prefilled from their business page and profile. */
export async function startApplication(fd: FormData) {
  const { supabase, user } = await requireUser("/partner-us");
  const category = fd.get("category");
  if (!isCategory(category)) go("/partner-us");
  const { data: existing, error } = await supabase.from("partner_applications").select("id").eq("user_id", user.id).eq("category", category as string).maybeSingle();
  if (error) go(`${HOME}?error=unavailable`);
  if (existing) go(formPath(existing.id, 1));
  const admin = createAdminClient();
  if (!admin) go(`${HOME}?error=unavailable`);
  const [{ data: biz }, { data: prof }] = await Promise.all([
    supabase.from("businesses").select("id, name, sector, city, province, contact_phone, contact_email").eq("owner_id", user.id).order("created_at").limit(1).maybeSingle(),
    supabase.from("profiles").select("full_name, chapter_id, city, province").eq("id", user.id).maybeSingle(),
  ]);
  const { data: row, error: insErr } = await admin!.from("partner_applications").insert({
    user_id: user.id, category, business_id: biz?.id ?? null, chapter_id: prof?.chapter_id ?? null,
    legal_name: biz?.name?.slice(0, 200) ?? null, industry: biz?.sector && isIndustry(biz.sector) ? biz.sector : null,
    rep_name: prof?.full_name?.slice(0, 120) ?? null, biz_email: (biz?.contact_email || user.email || "").slice(0, 200) || null,
    biz_phone: biz?.contact_phone?.slice(0, 40) ?? null, city: (biz?.city || prof?.city || "").slice(0, 100) || null,
    province: (biz?.province || prof?.province || "").slice(0, 100) || null,
  }).select("id").single();
  if (insErr || !row) go(`${HOME}?error=failed`);
  await admin!.from("audit_log").insert({ actor_id: user.id, action: "partner_application_start", table_name: "partner_applications", row_id: row!.id, detail: { category } });
  revalidatePath(HOME);
  go(formPath(row!.id, 1));
}

/** Saves one screen. "Save draft" stays on the screen; "Save and continue" goes to the next. Formats are checked;
 *  missing answers are fine until the application is sent. */
export async function saveStep(fd: FormData) {
  const { app, admin, user } = await ownApp(uuid(fd.get("id")));
  const step = Math.min(LAST_STEP, Math.max(1, Number(fd.get("step")) || 1));
  const next = fd.get("intent") === "next";
  if (!EDITABLE.includes(app.status)) go(formPath(app.id, step, "error=locked"));
  const patch: Record<string, unknown> = {};
  const bad = (code: string): never => go(formPath(app.id, step, `error=${code}`));

  if (step === 1) {
    patch.legal_name = str(fd, "legal_name", 200);
    patch.trade_name = str(fd, "trade_name", 200);
    const rt = String(fd.get("registration_type") ?? "");
    patch.registration_type = rt in REGISTRATION_TYPES ? rt : null;
    patch.registration_no = str(fd, "registration_no", 60);
    const ind = String(fd.get("industry") ?? "");
    patch.industry = isIndustry(ind) ? ind : null;
    const web = str(fd, "website", 300);
    if (web && !validUrl(web)) bad("website");
    patch.website = web;
    const tin = String(fd.get("tin") ?? "").trim();
    if (tin) {   // blank keeps the TIN already saved
      if (!validTin(tin)) bad("tin");
      const sealed = sealTin(tin);
      if (!sealed) bad("failed");
      Object.assign(patch, sealed);
    }
  } else if (step === 2) {
    patch.rep_name = str(fd, "rep_name", 120);
    patch.rep_position = str(fd, "rep_position", 120);
    const email = str(fd, "biz_email", 200);
    if (email && !validEmail(email)) bad("email");
    patch.biz_email = email;
    const phone = str(fd, "biz_phone", 40);
    if (phone && !validPhone(phone)) bad("phone");
    patch.biz_phone = phone;
    patch.address_line = str(fd, "address_line", 300);
    patch.city = str(fd, "city", 100);
    const prov = String(fd.get("province") ?? "");
    patch.province = PROVINCES.includes(prov) ? prov : null;
    const cov = String(fd.get("coverage") ?? "");
    patch.coverage = cov in COVERAGE ? cov : null;
    patch.coverage_areas = str(fd, "coverage_areas", 500);
  } else if (step === 3) {
    const input: Record<string, unknown> = {};
    for (const [k, v] of fd.entries()) if (typeof v === "string" && k.startsWith("d_")) input[k.slice(2)] = v;
    patch.details = cleanDetails(app.category, input);
  }
  if (Object.keys(patch).length) {
    const { error } = await admin.from("partner_applications").update(patch).eq("id", app.id).eq("user_id", user.id);
    if (error) bad("failed");
  }
  revalidatePath(`${HOME}/${app.id}`);
  go(next ? formPath(app.id, Math.min(LAST_STEP, step + 1)) : formPath(app.id, step, "done=saved"));
}

/** One document, checked (type, size, real file type), encrypted on the server and kept in the private bucket. */
export async function uploadPartnerDoc(fd: FormData) {
  const { app, admin, user } = await ownApp(uuid(fd.get("id")));
  const back = (q: string): never => go(formPath(app.id, 4, q));
  if (!EDITABLE.includes(app.status)) back("error=locked");
  const type = fd.get("doc_type");
  const file = fd.get("file");
  if (!isPartnerDocType(type)) back("error=doc_type");
  if (!(file instanceof File) || file.size === 0) back("error=empty");
  const f = file as File;
  if (f.size > PARTNER_DOC_MAX_BYTES) back("error=size");
  const k = vettingKey();
  if (!k) back("error=failed");
  const buf = Buffer.from(await f.arrayBuffer());
  const mime = sniffMime(buf);
  if (!mime) back("error=format");
  const { count } = await admin.from("vetting_documents").select("id", { count: "exact", head: true }).eq("application_id", app.id).is("deleted_at", null);
  if ((count ?? 0) >= MAX_DOCS_PER_APPLICATION) back("error=too_many");
  if ((await partnerBytes(admin, user.id)) + f.size > MAX_BYTES_PER_PARTNER) back("error=total");

  const path = `partner/${user.id}/${randomUUID()}.bin`;
  const { error: upErr } = await admin.storage.from(VETTING_BUCKET).upload(path, encryptDoc(buf, k!.key), { contentType: "application/octet-stream", upsert: false });
  if (upErr) back("error=failed");
  const { error } = await admin.from("vetting_documents").insert({
    user_id: user.id, purpose: "partner", application_id: app.id, doc_type: type, file_path: path,
    file_name: safeFileName(f.name), mime, size_bytes: f.size, key_id: k!.id,
  });
  if (error) { await admin.storage.from(VETTING_BUCKET).remove([path]); back("error=failed"); }
  revalidatePath(`${HOME}/${app.id}`);
  back("done=uploaded");
}

export async function deletePartnerDoc(fd: FormData) {
  const { app, admin, user } = await ownApp(uuid(fd.get("id")));
  const back = (q: string): never => go(formPath(app.id, 4, q));
  if (!EDITABLE.includes(app.status)) back("error=locked");
  const docId = uuid(fd.get("doc_id"));
  if (!docId) back("error=failed");
  const { data: row } = await admin.from("vetting_documents").select("id, file_path").eq("id", docId!).eq("user_id", user.id).eq("application_id", app.id).is("deleted_at", null).maybeSingle();
  if (!row) back("error=failed");
  await purgeDocs(admin, [row as { id: string; file_path: string }], "member_removed");
  revalidatePath(`${HOME}/${app.id}`);
  back("done=deleted");
}

/** Sends the application (or sends it again after changes). Everything required must be there, and both boxes ticked. */
export async function submitApplication(fd: FormData) {
  const { app, admin, user } = await ownApp(uuid(fd.get("id")));
  const back = (q: string): never => go(formPath(app.id, LAST_STEP, q));
  if (!EDITABLE.includes(app.status)) back("error=locked");
  if (fd.get("privacy_ack") !== "yes" || fd.get("declaration") !== "yes") back("error=boxes");
  const [{ data: full }, { data: docs }] = await Promise.all([
    admin.from("partner_applications").select(`${SNAPSHOT_COLUMNS}, tin_enc`).eq("id", app.id).single(),
    admin.from("vetting_documents").select("doc_type").eq("application_id", app.id).is("deleted_at", null),
  ]);
  if (!full) back("error=failed");
  const a = full as unknown as Parameters<typeof missingItems>[0] & { tin_enc: string | null; revision: number; legal_name: string | null };
  if (!a.tin_enc) a.tin_last3 = null;
  if (missingItems(a, (docs ?? []).map((d) => d.doc_type)).length) back("error=missing");
  const now = new Date().toISOString();
  const wasChanges = app.status === "needs_changes";
  const { error } = await admin.from("partner_applications").update({
    status: "submitted", submitted_at: now, privacy_ack_at: now, privacy_version: PARTNER_PRIVACY.version, declaration_at: now,
  }).eq("id", app.id).eq("user_id", user.id);
  if (error) back("error=failed");
  const { tin_enc: _omit, ...snapshot } = full as Record<string, unknown>;
  void _omit;
  await admin.from("partner_reviews").insert({ application_id: app.id, actor_id: user.id, action: "submitted", revision: a.revision, snapshot, note: wasChanges ? "Sent again after changes" : null });
  await admin.from("audit_log").insert({ actor_id: user.id, action: "partner_application_submit", table_name: "partner_applications", row_id: app.id, detail: { category: app.category, revision: a.revision } });
  await sendEmail({
    to: NOTIFY_TO, subject: `Partner application ${wasChanges ? "sent again" : "received"}: ${a.legal_name ?? "(no name)"} (${PARTNER_CATEGORIES[app.category].label})`,
    text: `A ${PARTNER_CATEGORIES[app.category].label.toLowerCase()} application is waiting for review.\n\nOpen it in Admin > Partners: ${ORG.url}/admin/partners/${app.id}`,
  });
  revalidatePath(HOME); revalidatePath(`${HOME}/${app.id}`); revalidatePath("/admin/partners");
  go(formPath(app.id, LAST_STEP, "done=submitted"));
}

export async function withdrawApplication(fd: FormData) {
  const { app, admin, user } = await ownApp(uuid(fd.get("id")));
  if (!["draft", "submitted", "needs_changes"].includes(app.status)) go(`${HOME}/${app.id}?error=locked`);
  const { error } = await admin.from("partner_applications").update({ status: "withdrawn" }).eq("id", app.id).eq("user_id", user.id);
  if (error) go(`${HOME}/${app.id}?error=failed`);
  await admin.from("partner_reviews").insert({ application_id: app.id, actor_id: user.id, action: "withdrawn", revision: app.revision });
  revalidatePath(HOME); revalidatePath("/admin/partners");
  go(`${HOME}?done=withdrawn`);
}

/** A rejected or withdrawn application can be fixed and sent again: it opens as a draft with a new revision number. */
export async function reopenApplication(fd: FormData) {
  const { app, admin, user } = await ownApp(uuid(fd.get("id")));
  if (!["rejected", "withdrawn"].includes(app.status)) go(`${HOME}/${app.id}`);
  const { error } = await admin.from("partner_applications").update({ status: "draft", submitted_at: null, privacy_ack_at: null, declaration_at: null }).eq("id", app.id).eq("user_id", user.id);
  if (error) go(`${HOME}/${app.id}?error=failed`);
  await admin.from("partner_reviews").insert({ application_id: app.id, actor_id: user.id, action: "reopened", revision: app.revision + 1 });
  revalidatePath(HOME); revalidatePath("/admin/partners");
  go(formPath(app.id, 1, "done=reopened"));
}
