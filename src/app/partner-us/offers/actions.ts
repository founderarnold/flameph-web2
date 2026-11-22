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
import { partnerBytes } from "@/lib/partner-server";
import {
  BASE_UNITS, isOfferFileType, ITEM_COLS, MAX_ITEMS, MAX_OFFER_FILES, MAX_OFFERS, MAX_PHOTOS_PER_ITEM, OFFER_COLS, OFFER_EDITABLE, OFFER_LAST_STEP,
  offerMissing, parseCount, parseMoney, parseQty, parseTiers, PRODUCT_GROUPS, SAMPLES, SHIPPING_TERMS, STOCK, VAT_BASIS,
  type OfferStatus,
} from "@/lib/offers";

// The supplier's side of the Best Offer. Every write goes through here with the server key, after checking that the
// signed-in member owns the offer and that it is still a draft (or was sent back for changes). The database checks the
// same rules again (0032: accredited suppliers only, status moves, versions, limits, prices).

const HOME = "/partner-us/offers";
const go = (path: string): never => redirect(path);
const formPath = (id: string, step: number, q = "") => `${HOME}/${id}?step=${step}${q ? `&${q}` : ""}`;
const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
const str = (fd: FormData, k: string, max: number) => String(fd.get(k) ?? "").trim().slice(0, max) || null;
const pick = <T extends object>(v: unknown, list: T) => (typeof v === "string" && v in list ? v : null);

/** The member's own offer, read as the member (row level security), then the server key for writing. */
async function ownOffer(id: string | null) {
  const { supabase, user } = await requireUser(HOME);
  if (!id) go(HOME);
  const { data: offer, error } = await supabase.from("supplier_offers").select("id, user_id, status, revision, title").eq("id", id!).maybeSingle();
  if (error) go(`${HOME}?error=unavailable`);
  if (!offer || offer.user_id !== user.id) go(HOME);
  const admin = createAdminClient();
  if (!admin) go(`${HOME}?error=unavailable`);
  return { user, supabase, admin: admin!, offer: offer as { id: string; user_id: string; status: OfferStatus; revision: number; title: string | null } };
}

/** Starts a new offer. Only an accredited supplier (approved supplier application) can. */
export async function startOffer() {
  const { supabase, user } = await requireUser(HOME);
  const [{ data: prof, error }, { data: app }, { count }] = await Promise.all([
    supabase.from("partner_profiles").select("status, categories").eq("user_id", user.id).maybeSingle(),
    supabase.from("partner_applications").select("id").eq("user_id", user.id).eq("category", "supplier").eq("status", "approved").maybeSingle(),
    supabase.from("supplier_offers").select("id", { count: "exact", head: true }).eq("user_id", user.id),
  ]);
  if (error) go(`${HOME}?error=unavailable`);
  if (!prof || prof.status !== "accredited" || !(prof.categories as string[]).includes("supplier")) go(`${HOME}?error=not_supplier`);
  if ((count ?? 0) >= MAX_OFFERS) go(`${HOME}?error=limit`);
  const admin = createAdminClient();
  if (!admin) go(`${HOME}?error=unavailable`);
  const { data: row, error: insErr } = await admin!.from("supplier_offers").insert({ user_id: user.id, application_id: app?.id ?? null }).select("id").single();
  if (insErr || !row) go(`${HOME}?error=failed`);
  await admin!.from("audit_log").insert({ actor_id: user.id, action: "supplier_offer_start", table_name: "supplier_offers", row_id: row!.id });
  revalidatePath(HOME);
  go(formPath(row!.id, 1, "done=started"));
}

/** Saves screen 1, 3 or 5. "Save draft" stays; "Save and continue" goes on. Formats are checked; blanks are fine until sending. */
export async function saveOfferStep(fd: FormData) {
  const { offer, admin, user } = await ownOffer(uuid(fd.get("id")));
  const step = Math.min(OFFER_LAST_STEP, Math.max(1, Number(fd.get("step")) || 1));
  const next = fd.get("intent") === "next";
  if (!OFFER_EDITABLE.includes(offer.status)) go(formPath(offer.id, step, "error=locked"));
  const bad = (code: string): never => go(formPath(offer.id, step, `error=${code}`));
  const patch: Record<string, unknown> = {};

  if (step === 1) {
    patch.title = str(fd, "title", 150);
    patch.product_group = pick(fd.get("product_group"), PRODUCT_GROUPS);
    patch.vat_basis = pick(fd.get("vat_basis"), VAT_BASIS);
    const d = String(fd.get("valid_until") ?? "").trim();
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) bad("date");
    if (d && d < new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10)) bad("date");
    patch.valid_until = d || null;
  } else if (step === 3) {
    patch.serviceable_areas = str(fd, "serviceable_areas", 1000);
    patch.shipping_terms = pick(fd.get("shipping_terms"), SHIPPING_TERMS);
    patch.shipping_note = str(fd, "shipping_note", 500);
    const lt = parseCount(fd.get("lead_time_days"), 365);
    if (Number.isNaN(lt)) bad("qty");
    patch.lead_time_days = lt;
    patch.warranty = str(fd, "warranty", 500);
    patch.returns_policy = str(fd, "returns_policy", 800);
    patch.sample_availability = pick(fd.get("sample_availability"), SAMPLES);
    patch.sample_terms = str(fd, "sample_terms", 500);
    patch.certifications = str(fd, "certifications", 500);
  } else if (step === 5) {
    const raw = String(fd.get("commission_pct") ?? "").replace("%", "").trim();
    if (raw && !/^\d{1,2}(\.\d{1,2})?$/.test(raw)) bad("commission");
    const pct = raw ? Number(raw) : null;
    if (pct !== null && pct > 50) bad("commission");
    patch.commission_pct = pct;
    patch.commission_note = str(fd, "commission_note", 500);
  }
  if (Object.keys(patch).length) {
    const { error } = await admin.from("supplier_offers").update(patch).eq("id", offer.id).eq("user_id", user.id);
    if (error) bad("failed");
  }
  revalidatePath(`${HOME}/${offer.id}`);
  go(next ? formPath(offer.id, Math.min(OFFER_LAST_STEP, step + 1)) : formPath(offer.id, step, "done=saved"));
}

/** Adds or changes one product (SKU) with its prices and quantity tiers. */
export async function saveItem(fd: FormData) {
  const { offer, admin } = await ownOffer(uuid(fd.get("id")));
  const itemId = uuid(fd.get("item_id"));
  const back = (q: string): never => go(formPath(offer.id, 2, `${q}${itemId ? `&item=${itemId}` : "&item=new"}`));
  if (!OFFER_EDITABLE.includes(offer.status)) go(formPath(offer.id, 2, "error=locked"));

  const product_name = str(fd, "product_name", 150);
  const sell_unit = str(fd, "sell_unit", 60);
  if (!product_name || !sell_unit) back("error=name");
  const base_unit = pick(fd.get("base_unit"), BASE_UNITS);
  const base_qty = parseQty(fd.get("base_qty"));
  if (!base_unit || base_qty === null || Number.isNaN(base_qty)) back("error=base_qty");
  const regular_price = parseMoney(fd.get("regular_price"));
  const wholesale_price = parseMoney(fd.get("wholesale_price"));
  const member_price = parseMoney(fd.get("member_price"));
  const shipping = parseMoney(fd.get("shipping_per_unit"));
  if ([regular_price, wholesale_price, member_price, shipping].some((n) => Number.isNaN(n)) || !member_price || member_price <= 0) back("error=price");
  if (regular_price !== null && member_price! > regular_price) back("error=price");
  if (regular_price !== null && wholesale_price !== null && wholesale_price > regular_price) back("error=price");
  const moq = parseCount(fd.get("moq"), 10_000_000);
  const capacity = parseCount(fd.get("monthly_capacity"), 1_000_000_000);
  const lead = parseCount(fd.get("item_lead_time_days"), 365);
  if ([moq, capacity, lead].some((n) => Number.isNaN(n)) || moq === 0) back("error=qty");
  const tiers = parseTiers([0, 1, 2, 3].map((i) => ({ min: fd.get(`tier_min_${i}`), price: fd.get(`tier_price_${i}`) })), member_price!);
  if (tiers === "bad") back("error=tiers");

  const row = {
    product_name, brand: str(fd, "brand", 100), sku: str(fd, "sku", 60), description: str(fd, "description", 1000), sell_unit,
    base_unit, base_qty, regular_price, wholesale_price, member_price, tiers, moq: moq ?? 1, monthly_capacity: capacity,
    stock_status: pick(fd.get("stock_status"), STOCK) ?? "in_stock", lead_time_days: lead, shipping_per_unit: shipping ?? 0,
  };
  if (itemId) {
    const { error } = await admin.from("supplier_offer_items").update(row).eq("id", itemId).eq("offer_id", offer.id);
    if (error) back("error=failed");
  } else {
    const { data: items } = await admin.from("supplier_offer_items").select("position").eq("offer_id", offer.id).order("position", { ascending: false }).limit(MAX_ITEMS);
    if ((items?.length ?? 0) >= MAX_ITEMS) back("error=item_limit");
    const { error } = await admin.from("supplier_offer_items").insert({ ...row, offer_id: offer.id, position: Math.min(100, (items?.[0]?.position ?? 0) + 1) });
    if (error) back("error=failed");
  }
  revalidatePath(`${HOME}/${offer.id}`);
  go(formPath(offer.id, 2, "done=item_saved"));
}

export async function deleteItem(fd: FormData) {
  const { offer, admin } = await ownOffer(uuid(fd.get("id")));
  const itemId = uuid(fd.get("item_id"));
  if (!OFFER_EDITABLE.includes(offer.status)) go(formPath(offer.id, 2, "error=locked"));
  if (!itemId) go(formPath(offer.id, 2, "error=failed"));
  // The product's photos go with it.
  const { data: photos } = await admin.from("vetting_documents").select("id, file_path").eq("offer_id", offer.id).eq("item_id", itemId!).is("deleted_at", null);
  if (photos?.length) await purgeDocs(admin, photos as { id: string; file_path: string }[], "member_removed");
  const { error } = await admin.from("supplier_offer_items").delete().eq("id", itemId!).eq("offer_id", offer.id);
  if (error) go(formPath(offer.id, 2, "error=failed"));
  revalidatePath(`${HOME}/${offer.id}`);
  go(formPath(offer.id, 2, "done=item_deleted"));
}

/** One photo or file, checked (type, size, real file type), encrypted on the server and kept in the private bucket. */
export async function uploadOfferFile(fd: FormData) {
  const { offer, admin, user } = await ownOffer(uuid(fd.get("id")));
  const back = (q: string): never => go(formPath(offer.id, 4, q));
  if (!OFFER_EDITABLE.includes(offer.status)) back("error=locked");
  const type = fd.get("doc_type");
  const file = fd.get("file");
  if (!isOfferFileType(type)) back("error=doc_type");
  if (!(file instanceof File) || file.size === 0) back("error=empty");
  const f = file as File;
  if (f.size > PARTNER_DOC_MAX_BYTES) back("error=size");
  let itemId = uuid(fd.get("item_id"));
  if (type !== "product_photo") itemId = null;
  if (itemId) {
    const { data: it } = await admin.from("supplier_offer_items").select("id").eq("id", itemId).eq("offer_id", offer.id).maybeSingle();
    if (!it) itemId = null;
  }
  const k = vettingKey();
  if (!k) back("error=failed");
  const buf = Buffer.from(await f.arrayBuffer());
  const mime = sniffMime(buf);
  if (!mime) back("error=format");
  if (type === "product_photo" && !mime!.startsWith("image/")) back("error=format");
  const { data: existing } = await admin.from("vetting_documents").select("item_id").eq("offer_id", offer.id).is("deleted_at", null).limit(MAX_OFFER_FILES + 1);
  if ((existing?.length ?? 0) >= MAX_OFFER_FILES) back("error=too_many");
  if (itemId && (existing ?? []).filter((d) => d.item_id === itemId).length >= MAX_PHOTOS_PER_ITEM) back("error=photos");
  if ((await partnerBytes(admin, user.id)) + f.size > MAX_BYTES_PER_PARTNER) back("error=total");

  const path = `offer/${user.id}/${randomUUID()}.bin`;
  const { error: upErr } = await admin.storage.from(VETTING_BUCKET).upload(path, encryptDoc(buf, k!.key), { contentType: "application/octet-stream", upsert: false });
  if (upErr) back("error=failed");
  const { error } = await admin.from("vetting_documents").insert({
    user_id: user.id, purpose: "offer", offer_id: offer.id, item_id: itemId, doc_type: type, file_path: path,
    file_name: safeFileName(f.name), mime, size_bytes: f.size, key_id: k!.id,
  });
  if (error) { await admin.storage.from(VETTING_BUCKET).remove([path]); back("error=failed"); }
  revalidatePath(`${HOME}/${offer.id}`);
  back("done=uploaded");
}

export async function deleteOfferFile(fd: FormData) {
  const { offer, admin, user } = await ownOffer(uuid(fd.get("id")));
  const back = (q: string): never => go(formPath(offer.id, 4, q));
  if (!OFFER_EDITABLE.includes(offer.status)) back("error=locked");
  const docId = uuid(fd.get("doc_id"));
  if (!docId) back("error=failed");
  const { data: row } = await admin.from("vetting_documents").select("id, file_path").eq("id", docId!).eq("user_id", user.id).eq("offer_id", offer.id).is("deleted_at", null).maybeSingle();
  if (!row) back("error=failed");
  await purgeDocs(admin, [row as { id: string; file_path: string }], "member_removed");
  revalidatePath(`${HOME}/${offer.id}`);
  back("done=deleted");
}

/** Sends the offer (or sends it again after changes, as a new version). Everything required must be there. */
export async function submitOffer(fd: FormData) {
  const { offer, admin, user } = await ownOffer(uuid(fd.get("id")));
  const back = (q: string): never => go(formPath(offer.id, OFFER_LAST_STEP, q));
  if (!OFFER_EDITABLE.includes(offer.status)) back("error=locked");
  if (fd.get("declaration") !== "yes") back("error=declaration");
  const [{ data: full }, { data: items }, { count: photos }, { data: prof }] = await Promise.all([
    admin.from("supplier_offers").select(OFFER_COLS).eq("id", offer.id).single(),
    admin.from("supplier_offer_items").select(ITEM_COLS).eq("offer_id", offer.id).order("position"),
    admin.from("vetting_documents").select("id", { count: "exact", head: true }).eq("offer_id", offer.id).eq("doc_type", "product_photo").is("deleted_at", null),
    admin.from("partner_profiles").select("legal_name, status, categories").eq("user_id", user.id).maybeSingle(),
  ]);
  if (!full) back("error=failed");
  if (!prof || prof.status !== "accredited" || !(prof.categories as string[]).includes("supplier")) back("error=not_supplier");
  const o = full as unknown as Parameters<typeof offerMissing>[0] & { revision: number; title: string | null };
  if (offerMissing(o, items?.length ?? 0, photos ?? 0).length) back("error=missing");
  const now = new Date().toISOString();
  const wasChanges = offer.status === "needs_changes";
  const { data: sent, error } = await admin.from("supplier_offers").update({ status: "submitted", submitted_at: now, declaration_at: now })
    .eq("id", offer.id).eq("user_id", user.id).select("revision").single();
  if (error || !sent) back("error=failed");
  // The frozen copy of what was sent: this is the version history.
  await admin.from("supplier_offer_history").insert({
    offer_id: offer.id, actor_id: user.id, action: "submitted", revision: sent!.revision,
    snapshot: { offer: full, items: items ?? [] }, note: wasChanges ? "Sent again after changes" : null,
  });
  await admin.from("audit_log").insert({ actor_id: user.id, action: "supplier_offer_submit", table_name: "supplier_offers", row_id: offer.id, detail: { revision: sent!.revision, items: items?.length ?? 0 } });
  await sendEmail({
    to: NOTIFY_TO, subject: `Supplier Best Offer ${sent!.revision > 1 ? `version ${sent!.revision}` : "received"}: ${o.title ?? "(no name)"} from ${prof!.legal_name}`,
    text: `A supplier offer is waiting for the national team's review and scoring.\n\nOpen it in Admin > Partners > Supplier offers: ${ORG.url}/admin/partners/offers/${offer.id}`,
  });
  revalidatePath(HOME); revalidatePath(`${HOME}/${offer.id}`); revalidatePath("/admin/partners/offers");
  go(formPath(offer.id, OFFER_LAST_STEP, "done=submitted"));
}

export async function withdrawOffer(fd: FormData) {
  const { offer, admin, user } = await ownOffer(uuid(fd.get("id")));
  if (!["draft", "submitted", "needs_changes", "selected"].includes(offer.status)) go(`${HOME}/${offer.id}?error=locked`);
  const { error } = await admin.from("supplier_offers").update({ status: "withdrawn" }).eq("id", offer.id).eq("user_id", user.id);
  if (error) go(`${HOME}/${offer.id}?error=failed`);
  await admin.from("supplier_offer_history").insert({ offer_id: offer.id, actor_id: user.id, action: "withdrawn", revision: offer.revision });
  await admin.from("audit_log").insert({ actor_id: user.id, action: "supplier_offer_withdraw", table_name: "supplier_offers", row_id: offer.id });
  revalidatePath(HOME); revalidatePath("/admin/partners/offers");
  go(`${HOME}?done=withdrawn`);
}

/** A withdrawn, not chosen or chosen offer can be changed (new prices, more products): it opens as a draft and is sent
 *  again as a new version. A chosen offer stops being a Best Offer until the national team reviews the new version. */
export async function reopenOffer(fd: FormData) {
  const { offer, admin, user } = await ownOffer(uuid(fd.get("id")));
  if (!["not_selected", "withdrawn", "selected"].includes(offer.status)) go(`${HOME}/${offer.id}`);
  const { error } = await admin.from("supplier_offers").update({ status: "draft", declaration_at: null, submitted_at: null }).eq("id", offer.id).eq("user_id", user.id);
  if (error) go(`${HOME}/${offer.id}?error=failed`);
  await admin.from("supplier_offer_history").insert({ offer_id: offer.id, actor_id: user.id, action: "reopened", revision: offer.revision, note: offer.status === "selected" ? "Best Offer opened for changes" : null });
  revalidatePath(HOME); revalidatePath("/admin/partners/offers");
  go(formPath(offer.id, 1, "done=reopened"));
}

/** A draft that was never sent can be deleted, with its products and files. */
export async function deleteDraftOffer(fd: FormData) {
  const { offer, admin, user } = await ownOffer(uuid(fd.get("id")));
  if (offer.status !== "draft" || offer.revision !== 0) go(`${HOME}/${offer.id}?error=locked`);
  const { data: files } = await admin.from("vetting_documents").select("id, file_path").eq("offer_id", offer.id).is("deleted_at", null);
  if (files?.length) await purgeDocs(admin, files as { id: string; file_path: string }[], "member_removed");
  const { error } = await admin.from("supplier_offers").delete().eq("id", offer.id).eq("user_id", user.id).eq("status", "draft").eq("revision", 0);
  if (error) go(`${HOME}/${offer.id}?error=failed`);
  await admin.from("audit_log").insert({ actor_id: user.id, action: "supplier_offer_delete_draft", table_name: "supplier_offers", row_id: offer.id });
  revalidatePath(HOME);
  go(`${HOME}?done=removed`);
}
