"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { adminContext } from "@/lib/admin/guard";
import { tellApplicant } from "@/lib/partner-server";
import { encryptDoc, sniffMime, vettingKey } from "@/lib/vetting-crypto";
import { purgeDocs, VETTING_BUCKET } from "@/lib/vetting-server";
import { safeFileName } from "@/lib/vetting";
import { PARTNER_DOC_MAX_BYTES } from "@/lib/partner";
import { DEFAULT_TARGETS } from "@/lib/commission";
import { buildContract } from "@/lib/contracts-server";
import { STANDARD_TEXTS, STANDARD_VERSION } from "@/lib/contract-texts";
import {
  CHECK_KEYS, CONTRACT_COLS, MAX_CONTRACT_FILES, PART_KEYS, canClear, contractMissing, isAuthority, isContractCategory, isContractFileType, isPart,
  isRegType, nameMatches, renewalDates, unknownPlaceholders, type ContractRow,
} from "@/lib/contracts";

// Admin > Partners > Contracts (Step 8). Only the national team (founder, admins, national reviewers) prepares, checks,
// sends, ends or renews contracts and keeps templates; never for their own business. FLAME's own signature is the
// founder's. Every step goes into partner_contract_history and the audit log, and the database checks the same rules
// again (0038): a lawyer-reviewed approved template for every part, a cleared legal check of this exact version,
// signing in order on the frozen text, electronic signing only after the lawyer's review is recorded.

const NATIONAL = ["super_admin", "admin", "national_reviewer"] as const;
const HOME = "/admin/partners/contracts";
const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
const uuids = (fd: FormData, k: string, max: number) => [...new Set(fd.getAll(k).map((v) => uuid(v)).filter(Boolean) as string[])].slice(0, max);
const str = (fd: FormData, k: string, max: number) => String(fd.get(k) ?? "").trim().replace(/\r\n?/g, "\n").slice(0, max) || null;
const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));
const manila = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
const num = (fd: FormData, k: string) => { const s = String(fd.get(k) ?? "").trim().replace(/%/g, ""); if (!s) return null; const n = Number(s); return Number.isFinite(n) ? n : NaN; };
/** The plain-words reason from a database refusal ("partner_contract: <reason>"). */
const why = (m: string | undefined) => { const x = String(m ?? "").match(/(?:partner_contract(?:_check|_signature)?|contract_template|contract_esign|contract_link): (.{3,300})/); return x ? x[1].replace(/\s+/g, " ").trim() : null; };
const fail = (path: string, m: string | undefined, hash = ""): never => {
  const r = why(m);
  redirect(`${path}?${r ? `error=db&m=${encodeURIComponent(r)}` : "error=failed"}${hash}`);
};
const refresh = (id?: string) => { revalidatePath(HOME); if (id) revalidatePath(`${HOME}/${id}`); revalidatePath("/partner-us/contracts"); if (id) revalidatePath(`/partner-us/contracts/${id}`); };

async function loadContract(id: string | null) {
  const ctx = await adminContext([...NATIONAL]);
  if (!id) redirect(HOME);
  const { data } = await ctx.db.from("partner_contracts").select(CONTRACT_COLS).eq("id", id!).maybeSingle();
  if (!data) redirect(`${HOME}?error=missing`);
  const c = data as unknown as ContractRow;
  const page = `${HOME}/${c.id}`;
  if (c.partner_user_id === ctx.user.id) redirect(`${page}?error=own`);
  return { ctx, c, page };
}
const history = (ctx: Awaited<ReturnType<typeof adminContext>>, contract_id: string, action: string, note: string | null = null, internal = false) =>
  ctx.db.from("partner_contract_history").insert({ contract_id, actor_id: ctx.user.id, action, note, internal });

/** Starts a draft contract for an accredited partner, prefilled from their approved application, chosen offer,
 *  FLAME Signature licence and territories. A renewal copies the old contract with new dates. */
export async function createContract(fd: FormData) {
  const ctx = await adminContext([...NATIONAL]);
  const back = (q: string): never => redirect(`${HOME}/new?${q}`);
  const renews = uuid(fd.get("renews_id"));
  const [pickUser, pickCat] = String(fd.get("pick") ?? "").split(":");
  let partner = uuid(fd.get("partner_user_id") ?? pickUser);
  let category = String(fd.get("category") ?? pickCat ?? "");
  let old: ContractRow | null = null;
  if (renews) {
    const { data } = await ctx.db.from("partner_contracts").select(CONTRACT_COLS).eq("id", renews).maybeSingle();
    old = data as unknown as ContractRow | null;
    if (!old || !["signed", "ended"].includes(old.status) || !old.partner_user_id) redirect(`${HOME}/${renews}?error=renewal`);
    partner = old!.partner_user_id; category = old!.category;
  }
  if (!partner || !isContractCategory(category)) back("error=partner");
  if (partner === ctx.user.id) back("error=own");
  const { data: prof } = await ctx.db.from("partner_profiles").select("legal_name, categories, status").eq("user_id", partner!).maybeSingle();
  if (!prof || prof.status !== "accredited" || !(prof.categories as string[]).includes(category)) back("error=partner");
  const kind = category === "service_provider" ? "service" : category === "toll_manufacturer" ? "manufacturer" : "supplier";
  const [{ data: app }, { data: offer }, { data: lic }, { data: appts }, { data: founder }] = await Promise.all([
    ctx.db.from("partner_applications").select("legal_name, registration_type, registration_no, rep_name, rep_position, biz_email, address_line, city, province").eq("user_id", partner!).eq("category", category).eq("status", "approved").maybeSingle(),
    ctx.db.from("supplier_offers").select("id").eq("user_id", partner!).eq("kind", kind).eq("status", "selected").order("decided_at", { ascending: false }).limit(1).maybeSingle(),
    category === "toll_manufacturer" ? ctx.db.from("signature_licences").select("id").eq("partner_user_id", partner!).in("status", ["active", "draft", "suspended"]).order("created_at", { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null }),
    ctx.db.from("territorial_appointments").select("id").eq("partner_user_id", partner!).eq("partner_category", category).in("status", ["active", "draft"]).limit(30),
    ctx.db.from("roles").select("user_id").eq("role", "super_admin").limit(1).maybeSingle(),
  ]);
  const { data: fp } = founder?.user_id ? await ctx.db.from("profiles").select("full_name").eq("id", founder.user_id).maybeSingle() : { data: null };
  const founderName = (fp?.full_name as string | undefined) ?? null;
  const reg = app?.registration_type && isRegType(app.registration_type) ? app.registration_type : null;
  const address = [app?.address_line, app?.city, app?.province].filter(Boolean).join(", ") || null;
  const today = manila();
  const nextYear = new Date(Date.parse(`${today}T00:00:00Z`) + 365 * 86_400_000).toISOString().slice(0, 10);
  const row = old ? {
    party_reg_type: old.party_reg_type, party_reg_no: old.party_reg_no, party_address: old.party_address, signatory_name: old.signatory_name,
    signatory_position: old.signatory_position, signatory_authority: old.signatory_authority, authority_ref: old.authority_ref, signatory_email: old.signatory_email,
    flame_signatory_name: old.flame_signatory_name, flame_signatory_position: old.flame_signatory_position, renewal_notice_days: old.renewal_notice_days,
    national_pct: old.national_pct, regional_pct: old.regional_pct, provincial_pct: old.provincial_pct, city_pct: old.city_pct,
    late_rate_pct_per_day: old.late_rate_pct_per_day, late_cap_pct: old.late_cap_pct, special_terms: old.special_terms, renews_id: old.id,
    ...renewalDates(old.effective_date, old.end_date!),
  } : {
    party_reg_type: reg, party_reg_no: app?.registration_no && app.registration_no.length >= 2 ? app.registration_no : null, party_address: address && address.length >= 5 ? address.slice(0, 300) : null,
    signatory_name: app?.rep_name && app.rep_name.length >= 3 ? app.rep_name : null, signatory_position: app?.rep_position && app.rep_position.length >= 2 ? app.rep_position : null,
    signatory_authority: reg === "dti" ? "sole_proprietor" : null, signatory_email: app?.biz_email ?? null,
    flame_signatory_name: founderName && founderName.length >= 3 ? founderName.slice(0, 120) : null, flame_signatory_position: "Authorized signatory, MarketplacePH Online Store",
    effective_date: today, end_date: nextYear,
    ...DEFAULT_TARGETS[category as keyof typeof DEFAULT_TARGETS],
  };
  const { data: made, error } = await ctx.db.from("partner_contracts").insert({
    ...row, partner_user_id: partner, partner_name: (app?.legal_name || prof!.legal_name).slice(0, 200), category,
    offer_id: offer?.id ?? null, licence_id: (lic as { id?: string } | null)?.id ?? null, appointment_ids: (appts ?? []).map((a) => a.id), created_by: ctx.user.id,
  }).select("id").single();
  if (error || !made) {
    const r = why(error?.message);
    redirect(`${HOME}/new?${r ? `error=db&m=${encodeURIComponent(r)}` : "error=failed"}`);
  }
  await history(ctx, made!.id, old ? "renewal_started" : "created", old ? `Renewal of ${old.ref_no}` : null);
  if (old) await history(ctx, old.id, "renewal_started", "A renewal draft was made.");
  await ctx.audit(old ? "partner_contract_renewal" : "partner_contract_created", "partner_contracts", made!.id, { partner, category });
  refresh(made!.id);
  redirect(`${HOME}/${made!.id}?done=${old ? "renewal" : "created"}`);
}

/** Saves a draft: the parties, signatories, what it points at, dates, commission split, penalty figures and special
 *  terms. After sending, only the team note can change. */
export async function saveContract(fd: FormData) {
  const { ctx, c, page } = await loadContract(uuid(fd.get("id")));
  const internal_note = str(fd, "internal_note", 2000);
  if (c.status !== "draft") {
    const { error } = await ctx.db.from("partner_contracts").update({ internal_note }).eq("id", c.id);
    if (error) fail(page, error.message);
    refresh(c.id); redirect(`${page}?done=saved`);
  }
  const start = String(fd.get("effective_date") ?? "").trim();
  const end = String(fd.get("end_date") ?? "").trim();
  if ((start && !isDate(start)) || (end && !isDate(end)) || (start && end && (end <= start || Date.parse(end) - Date.parse(start) > 1827 * 86_400_000))) redirect(`${page}?error=dates#details`);
  const split = ["national_pct", "regional_pct", "provincial_pct", "city_pct"].map((k) => num(fd, k));
  const filled = split.filter((n) => n !== null).length;
  if ((filled !== 0 && filled !== 4) || split.some((n) => Number.isNaN(n) || (n !== null && (n < 0 || n > 30)))
      || (filled === 4 && ((split as number[]).reduce((a, b) => a + b, 0) <= 0 || (split as number[]).reduce((a, b) => a + b, 0) > 50))) redirect(`${page}?error=split#terms`);
  const rate = num(fd, "late_rate_pct_per_day"), cap = num(fd, "late_cap_pct");
  if ((rate === null) !== (cap === null) || Number.isNaN(rate) || Number.isNaN(cap) || (rate !== null && cap !== null && (rate <= 0 || rate > 5 || cap <= 0 || cap > 50 || cap < rate))) redirect(`${page}?error=penalty#terms`);
  const reg = String(fd.get("party_reg_type") ?? ""); const auth = String(fd.get("signatory_authority") ?? "");
  const notice = Math.min(180, Math.max(30, Number(fd.get("renewal_notice_days")) || 60));
  const patch = {
    partner_name: str(fd, "partner_name", 200) ?? c.partner_name,
    party_reg_type: isRegType(reg) ? reg : null, party_reg_no: str(fd, "party_reg_no", 60), party_address: str(fd, "party_address", 300),
    signatory_name: str(fd, "signatory_name", 120), signatory_position: str(fd, "signatory_position", 120),
    signatory_authority: isAuthority(auth) ? auth : null, authority_ref: str(fd, "authority_ref", 200), signatory_email: str(fd, "signatory_email", 200),
    flame_signatory_name: str(fd, "flame_signatory_name", 120), flame_signatory_position: str(fd, "flame_signatory_position", 120),
    effective_date: start || null, end_date: end || null, renewal_notice_days: notice,
    national_pct: split[0], regional_pct: split[1], provincial_pct: split[2], city_pct: split[3], late_rate_pct_per_day: rate, late_cap_pct: cap,
    offer_id: uuid(fd.get("offer_id")), licence_id: c.category === "toll_manufacturer" ? uuid(fd.get("licence_id")) : null,
    appointment_ids: uuids(fd, "appointment_ids", 30), special_terms: str(fd, "special_terms", 4000), internal_note,
  };
  // Short values the database would refuse become empty (so the draft still saves and "Still missing" lists them).
  for (const [k, min] of [["party_reg_no", 2], ["party_address", 5], ["signatory_name", 3], ["signatory_position", 2], ["authority_ref", 3], ["flame_signatory_name", 3], ["flame_signatory_position", 2]] as const) {
    const v = patch[k]; if (v && v.length < min) (patch as Record<string, unknown>)[k] = null;
  }
  const { error } = await ctx.db.from("partner_contracts").update(patch).eq("id", c.id).eq("status", "draft");
  if (error) fail(page, error.message, "#details");
  await history(ctx, c.id, "changed", null, true);
  await ctx.audit("partner_contract_saved", "partner_contracts", c.id);
  refresh(c.id);
  redirect(`${page}?done=saved`);
}

/** The legal check of the current version: cleared (every item ticked) or not cleared (with what must change). */
export async function legalCheck(fd: FormData) {
  const { ctx, c, page } = await loadContract(uuid(fd.get("id")));
  if (c.status !== "draft") redirect(`${page}?error=move#check`);
  const outcome = fd.get("outcome") === "cleared" ? "cleared" : "not_cleared";
  const ticked = fd.getAll("checklist").map(String).filter((k) => (CHECK_KEYS as string[]).includes(k));
  const note = str(fd, "note", 2000);
  if (!note || note.length < 5) redirect(`${page}?error=check_note#check`);
  if (outcome === "cleared" && !canClear(ticked)) redirect(`${page}?error=check_items#check`);
  if (outcome === "cleared" && contractMissing(c).length) redirect(`${page}?error=not_ready#check`);
  const { error } = await ctx.db.from("partner_contract_checks").insert({ contract_id: c.id, revision: c.revision, outcome, checklist: ticked, note, reviewer_id: ctx.user.id });
  if (error) fail(page, error.message, "#check");
  await history(ctx, c.id, "legal_check", `Version ${c.revision}: ${outcome === "cleared" ? "cleared" : "not cleared"}. ${note}`, true);
  await ctx.audit("partner_contract_legal_check", "partner_contracts", c.id, { revision: c.revision, outcome });
  refresh(c.id);
  redirect(`${page}?done=checked#check`);
}

/** Sends the contract for signing: builds the full text from approved templates and the records, freezes it, and tells
 *  the partner. The database refuses unless a legal check cleared this version. */
export async function sendContract(fd: FormData) {
  const { ctx, c, page } = await loadContract(uuid(fd.get("id")));
  if (c.status !== "draft") redirect(`${page}?error=move#send`);
  if (contractMissing(c).length) redirect(`${page}?error=not_ready#send`);
  const built = await buildContract(ctx.db, c);
  if (built.missingParts.length || built.draftParts.length || built.templateIds.length !== 6) redirect(`${page}?error=templates#send`);
  if (built.unfilled.length) redirect(`${page}?error=unfilled#send`);
  const { error } = await ctx.db.from("partner_contracts").update({ status: "out_for_signing", sent_by: ctx.user.id, body: built.text, template_ids: built.templateIds })
    .eq("id", c.id).eq("status", "draft").eq("revision", c.revision);
  if (error) fail(page, error.message, "#send");
  await history(ctx, c.id, "sent", `Version ${c.revision} sent for signing.`);
  await ctx.audit("partner_contract_sent", "partner_contracts", c.id, { revision: c.revision, sha256: built.hash });
  if (c.partner_user_id) {
    await tellApplicant(c.partner_user_id, `Contract ${c.ref_no} is ready for you to read and sign`, "Please read the whole contract. If something is wrong, ask for changes on the same page. Nothing is signed until you sign it.", `/partner-us/contracts/${c.id}`, "FLAME PH partner contract");
  }
  refresh(c.id);
  redirect(`${page}?done=sent`);
}

/** Takes a sent contract back to draft (a new version) so it can be changed; the partner's signature on the old
 *  version no longer counts. */
export async function returnToDraft(fd: FormData) {
  const { ctx, c, page } = await loadContract(uuid(fd.get("id")));
  if (!["out_for_signing", "partner_signed"].includes(c.status)) redirect(`${page}?error=move#status`);
  const reason = str(fd, "reason", 1000);
  if (!reason) redirect(`${page}?error=reason#status`);
  const { error } = await ctx.db.from("partner_contracts").update({ status: "draft", changed_by: ctx.user.id, status_reason: reason }).eq("id", c.id).eq("status", c.status);
  if (error) fail(page, error.message, "#status");
  await history(ctx, c.id, "returned", reason);
  await ctx.audit("partner_contract_returned", "partner_contracts", c.id, { from: c.status, revision: c.revision });
  if (c.partner_user_id) await tellApplicant(c.partner_user_id, `Contract ${c.ref_no} is being revised`, `The team is preparing a new version. Reason: ${reason}`, `/partner-us/contracts/${c.id}`, "FLAME PH partner contract");
  refresh(c.id);
  redirect(`${page}?done=returned`);
}

const MOVES: Record<string, string[]> = { draft: ["cancelled"], out_for_signing: ["cancelled"], partner_signed: ["cancelled"], signed: ["ended", "terminated"] };

/** Ends, terminates (after an approved termination sanction) or cancels a contract, with the reason. */
export async function contractStatus(fd: FormData) {
  const { ctx, c, page } = await loadContract(uuid(fd.get("id")));
  const to = String(fd.get("to") ?? "");
  if (!MOVES[c.status]?.includes(to)) redirect(`${page}?error=move#status`);
  const reason = str(fd, "reason", 1000);
  if (!reason) redirect(`${page}?error=reason#status`);
  const { error } = await ctx.db.from("partner_contracts").update({ status: to, changed_by: ctx.user.id, status_reason: reason }).eq("id", c.id).eq("status", c.status);
  if (error) {
    if (String(error.message).includes("termination sanction")) redirect(`${page}?error=sanction#status`);
    fail(page, error.message, "#status");
  }
  await history(ctx, c.id, to, reason);
  await ctx.audit(`partner_contract_${to}`, "partner_contracts", c.id, { from: c.status });
  if (c.partner_user_id && c.first_sent_at) {
    const title = to === "terminated" ? `Contract ${c.ref_no} was terminated` : to === "ended" ? `Contract ${c.ref_no} has ended` : `Contract ${c.ref_no} was cancelled`;
    await tellApplicant(c.partner_user_id, title, `Reason: ${reason}`, `/partner-us/contracts/${c.id}`, "FLAME PH partner contract");
  }
  refresh(c.id);
  redirect(`${page}?done=status`);
}

/** Uploads a contract file (signed copy or proof of authority), encrypted, private to the national team and the partner. */
export async function uploadContractFile(fd: FormData) {
  const { ctx, c, page } = await loadContract(uuid(fd.get("id")));
  const back = (q: string): never => redirect(`${page}?${q}#files`);
  if (c.status === "cancelled") back("error=move");
  const type = fd.get("doc_type");
  if (!isContractFileType(type)) back("error=doc_type");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) back("error=empty");
  const f = file as File;
  if (f.size > PARTNER_DOC_MAX_BYTES) back("error=size");
  const k = vettingKey();
  if (!k) back("error=failed");
  const buf = Buffer.from(await f.arrayBuffer());
  const mime = sniffMime(buf);
  if (!mime) back("error=format");
  const { count } = await ctx.db.from("vetting_documents").select("id", { count: "exact", head: true }).eq("contract_id", c.id).is("deleted_at", null);
  if ((count ?? 0) >= MAX_CONTRACT_FILES) back("error=too_many");
  const path = `contract/${c.id}/${randomUUID()}.bin`;
  const { error: upErr } = await ctx.db.storage.from(VETTING_BUCKET).upload(path, encryptDoc(buf, k!.key), { contentType: "application/octet-stream", upsert: false });
  if (upErr) back("error=failed");
  const { error } = await ctx.db.from("vetting_documents").insert({
    user_id: ctx.user.id, purpose: "contract", contract_id: c.id, doc_type: type, file_path: path, file_name: safeFileName(f.name), mime, size_bytes: f.size, key_id: k!.id,
  });
  if (error) { await ctx.db.storage.from(VETTING_BUCKET).remove([path]); back("error=failed"); }
  await history(ctx, c.id, "file_added", `${String(type).replace("_", " ")}: ${safeFileName(f.name)}`, true);
  await ctx.audit("partner_contract_file", "partner_contracts", c.id, { doc_type: type });
  refresh(c.id);
  back("done=uploaded");
}

/** Removes a contract file that no signature relies on, while the contract is not yet signed. */
export async function deleteContractFile(fd: FormData) {
  const { ctx, c, page } = await loadContract(uuid(fd.get("id")));
  const docId = uuid(fd.get("doc_id"));
  if (["signed", "ended", "terminated"].includes(c.status) || !docId) redirect(`${page}?error=move#files`);
  const { data: used } = await ctx.db.from("partner_contract_signatures").select("id").eq("document_id", docId!).limit(1);
  if (used?.length) redirect(`${page}?error=move#files`);
  const { data: row } = await ctx.db.from("vetting_documents").select("id, file_path").eq("id", docId!).eq("contract_id", c.id).is("deleted_at", null).maybeSingle();
  if (!row) redirect(`${page}?error=failed#files`);
  await purgeDocs(ctx.db, [row as { id: string; file_path: string }], "member_removed");
  await history(ctx, c.id, "file_removed", null, true);
  refresh(c.id);
  redirect(`${page}?done=deleted#files`);
}

/** Records a wet-ink signature from an uploaded signed copy (partner side by the team; FLAME's side by the founder). */
export async function recordWetInk(fd: FormData) {
  const { ctx, c, page } = await loadContract(uuid(fd.get("id")));
  const side = fd.get("side") === "flame" ? "flame" : "partner";
  const docId = uuid(fd.get("document_id"));
  const signedOn = String(fd.get("signed_on") ?? "");
  if (!docId) redirect(`${page}?error=file#sign`);
  if (!isDate(signedOn) || signedOn > manila()) redirect(`${page}?error=signed_on#sign`);
  if (side === "flame" && !ctx.roles.includes("super_admin")) redirect(`${page}?error=founder#sign`);
  if (String(fd.get("sha")) !== c.body_sha256) redirect(`${page}?error=changed#sign`);
  const { error } = await ctx.db.from("partner_contract_signatures").insert({
    contract_id: c.id, revision: c.revision, side, method: "wet_ink", recorded_by: ctx.user.id, signer_name: "-", signer_position: "-",
    body_sha256: c.body_sha256, document_id: docId, signed_on: signedOn,
  });
  if (error) fail(page, error.message, "#sign");
  await ctx.audit("partner_contract_wet_ink", "partner_contracts", c.id, { side, revision: c.revision });
  if (side === "flame" && c.partner_user_id) await tellApplicant(c.partner_user_id, `Contract ${c.ref_no} is signed by both sides`, "Your signed contract is on the contracts page. You can download a copy there.", `/partner-us/contracts/${c.id}`, "FLAME PH partner contract");
  refresh(c.id);
  redirect(`${page}?done=wet_ink#sign`);
}

/** FLAME's electronic signature, by the founder, after the partner signed. */
export async function flameSign(fd: FormData) {
  const { ctx, c, page } = await loadContract(uuid(fd.get("id")));
  if (!ctx.roles.includes("super_admin")) redirect(`${page}?error=founder#sign`);
  if (c.status !== "partner_signed") redirect(`${page}?error=move#sign`);
  if (String(fd.get("sha")) !== c.body_sha256) redirect(`${page}?error=changed#sign`);
  if (fd.get("consent") !== "on" || fd.get("authority") !== "on") redirect(`${page}?error=consent#sign`);
  const typed = String(fd.get("typed_name") ?? "").slice(0, 120);
  if (!nameMatches(typed, c.flame_signatory_name)) redirect(`${page}?error=name#sign`);
  const h = await headers();
  const { error } = await ctx.db.from("partner_contract_signatures").insert({
    contract_id: c.id, revision: c.revision, side: "flame", method: "electronic", signer_user_id: ctx.user.id, signer_name: "-", signer_position: "-",
    typed_name: typed, authority_confirmed: true, consent_esign: true, body_sha256: c.body_sha256,
    ip: (h.get("x-forwarded-for") || h.get("x-real-ip") || "").split(",")[0].trim().slice(0, 64) || null, user_agent: (h.get("user-agent") || "").slice(0, 300) || null,
  });
  if (error) fail(page, error.message, "#sign");
  await ctx.audit("partner_contract_flame_signed", "partner_contracts", c.id, { revision: c.revision });
  if (c.partner_user_id) await tellApplicant(c.partner_user_id, `Contract ${c.ref_no} is signed by both sides`, "Your signed contract is on the contracts page. You can download a copy there.", `/partner-us/contracts/${c.id}`, "FLAME PH partner contract");
  refresh(c.id);
  redirect(`${page}?done=signed_flame#sign`);
}

/** A note for the national team only. */
export async function contractNote(fd: FormData) {
  const { ctx, c, page } = await loadContract(uuid(fd.get("id")));
  const note = str(fd, "note", 2000);
  if (!note) redirect(`${page}?error=reason#history`);
  await history(ctx, c.id, "team_note", note, true);
  await ctx.audit("partner_contract_note", "partner_contracts", c.id);
  refresh(c.id);
  redirect(`${page}?done=note#history`);
}

/** Starts a DRAFT agreement commission rate (0034) from a signed contract's split; Commissions approves it as usual. */
export async function startRate(fd: FormData) {
  const { ctx, c, page } = await loadContract(uuid(fd.get("id")));
  if (c.status !== "signed") redirect(`${page}?error=move#after`);
  const s = c.national_pct !== null && c.regional_pct !== null && c.provincial_pct !== null && c.city_pct !== null
    ? { national_pct: c.national_pct, regional_pct: c.regional_pct, provincial_pct: c.provincial_pct, city_pct: c.city_pct } : DEFAULT_TARGETS[c.category];
  const { data, error } = await ctx.db.from("commission_rules").insert({
    scope: "agreement", partner_category: c.category, partner_user_id: c.partner_user_id, contract_id: c.id, offer_id: c.offer_id,
    ...s, effective_from: c.effective_date, effective_to: c.end_date, basis_note: "Qualified, collected net sales (contract Annex B).", created_by: ctx.user.id,
  }).select("id").single();
  if (error || !data) redirect(`${page}?error=rate#after`);
  await history(ctx, c.id, "rate_started", "Draft agreement commission rate made from this contract.", true);
  await ctx.audit("partner_contract_rate", "commission_rules", data!.id, { contract: c.id });
  revalidatePath("/admin/partners/commissions/rules");
  redirect(`/admin/partners/commissions/rules/${data!.id}?done=from_contract`);
}

/** Starts DRAFT agreement penalty terms (0035) from a signed contract; a second person approves them as usual. */
export async function startPenalty(fd: FormData) {
  const { ctx, c, page } = await loadContract(uuid(fd.get("id")));
  if (c.status !== "signed") redirect(`${page}?error=move#after`);
  let rate = c.late_rate_pct_per_day, cap = c.late_cap_pct;
  if (rate === null || cap === null) {
    const { data: t } = await ctx.db.from("partner_penalty_terms").select("late_rate_pct_per_day, late_cap_pct").eq("scope", "default").eq("status", "active").maybeSingle();
    rate = t?.late_rate_pct_per_day ?? 0.5; cap = t?.late_cap_pct ?? 5;
  }
  const { error } = await ctx.db.from("partner_penalty_terms").insert({
    scope: "agreement", partner_user_id: c.partner_user_id, partner_name: c.partner_name, contract_id: c.id, late_rate_pct_per_day: rate, late_cap_pct: cap,
    note: `From contract ${c.ref_no} (Annex C).`, created_by: ctx.user.id,
  });
  if (error) redirect(`${page}?error=rate#after`);
  await history(ctx, c.id, "rate_started", "Draft penalty terms made from this contract.", true);
  await ctx.audit("partner_contract_penalty_terms", "partner_contracts", c.id);
  revalidatePath("/admin/partners/complaints/settings");
  redirect(`${page}?done=penalty#after`);
}

// ------------------------------------------------------------------------------------------------------------------
// Templates
// ------------------------------------------------------------------------------------------------------------------
const TPL = `${HOME}/templates`;

/** Loads the standard plain-language drafts (version 1.0) for every part that has no version yet. */
export async function loadStandardTemplates() {
  const ctx = await adminContext([...NATIONAL]);
  const { data } = await ctx.db.from("contract_templates").select("part");
  const have = new Set((data ?? []).map((r) => r.part));
  const rows = PART_KEYS.filter((p) => !have.has(p)).map((p) => ({ part: p, version: STANDARD_VERSION, title: STANDARD_TEXTS[p].title, body: STANDARD_TEXTS[p].body, change_note: "Standard plain-language draft for lawyer review.", created_by: ctx.user.id }));
  if (rows.length) {
    const { error } = await ctx.db.from("contract_templates").insert(rows);
    if (error) fail(TPL, error.message);
    await ctx.audit("contract_templates_loaded", "contract_templates", undefined, { parts: rows.map((r) => r.part) });
  }
  revalidatePath(TPL);
  redirect(`${TPL}?done=loaded`);
}

/** Saves a draft template version (changes a draft, or starts a new version of a part). */
export async function saveTemplate(fd: FormData) {
  const ctx = await adminContext([...NATIONAL]);
  const id = uuid(fd.get("id"));
  const title = str(fd, "title", 150); const body = str(fd, "body", 60000); const change_note = str(fd, "change_note", 1000);
  const back = (q: string): never => redirect(`${id ? `${TPL}/${id}` : TPL}?${q}`);
  if (!title || title.length < 3 || !body || body.length < 50) back("error=template_text");
  if (unknownPlaceholders(body!).length) back(`error=placeholders&m=${encodeURIComponent(unknownPlaceholders(body!).join(", "))}`);
  if (id) {
    const { error } = await ctx.db.from("contract_templates").update({ title, body, change_note }).eq("id", id).eq("status", "draft");
    if (error) fail(`${TPL}/${id}`, error.message);
    await ctx.audit("contract_template_saved", "contract_templates", id);
    revalidatePath(TPL); revalidatePath(`${TPL}/${id}`);
    redirect(`${TPL}/${id}?done=template_saved`);
  }
  const part = String(fd.get("part") ?? ""); const version = String(fd.get("version") ?? "").trim();
  if (!isPart(part) || !/^[0-9]{1,2}\.[0-9]{1,2}$/.test(version)) back("error=version");
  const { data, error } = await ctx.db.from("contract_templates").insert({ part, version, title, body, change_note, created_by: ctx.user.id }).select("id").single();
  if (error || !data) { if (String(error?.message).includes("duplicate")) back("error=version"); fail(TPL, error?.message); }
  await ctx.audit("contract_template_new", "contract_templates", data!.id, { part, version });
  revalidatePath(TPL);
  redirect(`${TPL}/${data!.id}?done=template_saved`);
}

/** Approves a draft version after a lawyer reviewed it (the version it replaces is retired). */
export async function approveTemplate(fd: FormData) {
  const ctx = await adminContext([...NATIONAL]);
  const id = uuid(fd.get("id"));
  if (!id) redirect(TPL);
  const page = `${TPL}/${id}`;
  const lawyer = str(fd, "lawyer_name", 150); const on = String(fd.get("lawyer_reviewed_on") ?? "");
  if (!lawyer || lawyer.length < 3 || !isDate(on) || on > manila()) redirect(`${page}?error=lawyer#approve`);
  const { data: t } = await ctx.db.from("contract_templates").select("body").eq("id", id!).maybeSingle();
  if (!t || unknownPlaceholders(t.body).length) redirect(`${page}?error=placeholders#approve`);
  const { error } = await ctx.db.from("contract_templates").update({ status: "approved", approved_by: ctx.user.id, lawyer_name: lawyer, lawyer_reviewed_on: on }).eq("id", id!).eq("status", "draft");
  if (error) fail(page, error.message, "#approve");
  await ctx.audit("contract_template_approved", "contract_templates", id!, { lawyer, on });
  revalidatePath(TPL); revalidatePath(page);
  redirect(`${page}?done=template_approved`);
}

export async function retireTemplate(fd: FormData) {
  const ctx = await adminContext([...NATIONAL]);
  const id = uuid(fd.get("id"));
  if (!id) redirect(TPL);
  const { error } = await ctx.db.from("contract_templates").update({ status: "retired" }).eq("id", id!).eq("status", "approved");
  if (error) fail(`${TPL}/${id}`, error.message);
  await ctx.audit("contract_template_retired", "contract_templates", id!);
  revalidatePath(TPL);
  redirect(`${TPL}/${id}?done=template_retired`);
}

export async function deleteTemplate(fd: FormData) {
  const ctx = await adminContext([...NATIONAL]);
  const id = uuid(fd.get("id"));
  if (!id) redirect(TPL);
  const { error } = await ctx.db.from("contract_templates").delete().eq("id", id!).eq("status", "draft");
  if (error) fail(`${TPL}/${id}`, error.message);
  await ctx.audit("contract_template_deleted", "contract_templates", id!);
  revalidatePath(TPL);
  redirect(`${TPL}?done=template_deleted`);
}

/** Switches electronic signing on (founder only, after recording the lawyer's review of the e-signature flow) or off. */
export async function esignSetting(fd: FormData) {
  const ctx = await adminContext([...NATIONAL]);
  if (!ctx.roles.includes("super_admin")) redirect(`${TPL}?error=founder#esign`);
  const enabled = fd.get("enabled") === "on";
  const lawyer = str(fd, "lawyer_name", 150); const on = String(fd.get("reviewed_on") ?? "");
  if (enabled && (!lawyer || lawyer.length < 3 || !isDate(on) || on > manila())) redirect(`${TPL}?error=esign_lawyer#esign`);
  const value = { enabled, lawyer_name: lawyer, reviewed_on: isDate(on) ? on : null, by: ctx.user.id };
  const { error } = await ctx.db.from("settings").update({ value }).eq("key", "contract_esign");
  if (error) fail(TPL, error.message, "#esign");
  await ctx.audit("contract_esign_setting", "settings", undefined, value);
  revalidatePath(TPL); revalidatePath("/partner-us/contracts");
  redirect(`${TPL}?done=esign#esign`);
}
