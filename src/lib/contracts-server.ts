import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MONEY_NOTICE, VAT_BASIS, type VatBasis } from "@/lib/offers";
import { rateLabel, type RateBasis } from "@/lib/service-offers";
import { CHANNELS, ONLINE_SALES, REVIEW_EVERY, TARGET_PERIOD, type Channel, type OnlineSales, type ReviewEvery, type TargetPeriod } from "@/lib/territory";
import { LEVEL_LABEL, toSplit, totalPct } from "@/lib/commission";
import { PRICE_INCLUDES, type PriceIncludes } from "@/lib/signature";
import {
  AUTHORITY, CONTRACT_CATEGORIES, FLAME_PARTY, OPERATOR, PARTS, REG_TYPES, VENUE, assembleContract, missingInText, requiredParts,
  type ContractRow, type Part, type Placeholder, type TemplatePart,
} from "@/lib/contracts";

// Partner accreditation (Step 8): builds a contract's full text from what is already on record (the chosen offer, the
// territorial appointments, the FLAME Signature licence, the commission split, the penalty terms and the complaint
// targets), with the template versions in use. The national team previews it on the contract page; when it is sent,
// this exact text is frozen in the database, which works out its fingerprint (SHA-256) itself.

const peso = (n: unknown) => (n === null || n === undefined || n === "" ? "—" : `PHP ${Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const dayText = (d: string | null | undefined) => (d ? new Date(`${d}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "long" }) : "");
const pctText = (n: unknown) => `${Number(n).toLocaleString("en-PH", { maximumFractionDigits: 3 })}%`;
export const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

type Tpl = { id: string; part: Part; version: string; title: string; body: string; status: string; created_at: string };

/** The template version each part would use: the approved one, or (for a preview only) the newest draft. */
export async function templatesFor(db: SupabaseClient, cat: ContractRow["category"]) {
  const parts = requiredParts(cat);
  const { data } = await db.from("contract_templates").select("id, part, version, title, body, status, created_at").in("part", parts).neq("status", "retired").order("created_at", { ascending: false });
  const rows = (data ?? []) as Tpl[];
  const chosen = parts.map((p) => rows.find((r) => r.part === p && r.status === "approved") ?? rows.find((r) => r.part === p) ?? null);
  return {
    chosen,
    missingParts: parts.filter((_p, i) => !chosen[i]).map((p) => PARTS[p].label),
    draftParts: chosen.filter((t): t is Tpl => !!t && t.status !== "approved").map((t) => `${PARTS[t.part].label} (version ${t.version})`),
  };
}

/** The values for every {{placeholder}}, from the contract and the records it points at. */
export async function contractValues(db: SupabaseClient, c: ContractRow): Promise<Partial<Record<Placeholder, string>>> {
  const v: Partial<Record<Placeholder, string>> = {
    contract_no: c.ref_no,
    revision: String(c.revision),
    operator_name: OPERATOR.name,
    operator_details: OPERATOR.details,
    flame_party: FLAME_PARTY,
    partner_legal_name: c.partner_name,
    partner_registration: c.party_reg_type && c.party_reg_no ? `${REG_TYPES[c.party_reg_type]} No. ${c.party_reg_no}` : "",
    partner_address: c.party_address ?? "",
    partner_category: CONTRACT_CATEGORIES[c.category].toLowerCase(),
    partner_signatory: c.signatory_name ?? "",
    partner_signatory_position: c.signatory_position ?? "",
    partner_authority: !c.signatory_authority ? "" : c.signatory_authority === "sole_proprietor" ? "who signs as the owner of the business"
      : `authorized by ${AUTHORITY[c.signatory_authority].replace(/ \(.*\)$/, "").toLowerCase()}${c.authority_ref ? ` (${c.authority_ref})` : ""}`,
    flame_signatory: c.flame_signatory_name ?? "",
    flame_signatory_position: c.flame_signatory_position ?? "",
    effective_date: dayText(c.effective_date),
    end_date: dayText(c.end_date),
    renewal_notice_days: String(c.renewal_notice_days),
    special_terms: c.special_terms?.trim() || "None.",
    money_notice: `${MONEY_NOTICE.en}\n${MONEY_NOTICE.tl}`,
    venue: VENUE,
  };

  // The chosen offer: products, service packages or FLAME Signature products, with prices.
  let leadDays: number | null = null; let responseHours: number | null = null;
  if (c.offer_id) {
    const { data: o } = await db.from("supplier_offers").select("id, kind, title, valid_until, vat_basis, lead_time_days, response_hours, shipping_terms, warranty, returns_policy, correction_policy, refund_policy").eq("id", c.offer_id).maybeSingle();
    if (o) {
      leadDays = o.lead_time_days ?? null; responseHours = o.response_hours ?? null;
      const head = `Offer: ${o.title ?? "(untitled)"}${o.valid_until ? `, prices valid until ${dayText(o.valid_until)}` : ""}. ${o.vat_basis ? VAT_BASIS[o.vat_basis as VatBasis] : ""}`.trim();
      let lines: string[] = [];
      if (o.kind === "service") {
        const { data } = await db.from("service_offer_packages").select("name, scope, exclusions, rate_basis, unit_label, normal_rate, member_rate, duration_days, acceptance_criteria").eq("offer_id", o.id).order("position");
        lines = (data ?? []).map((p) => `- ${p.name}: normal ${peso(p.normal_rate)}, member ${peso(p.member_rate)} ${rateLabel(p.rate_basis as RateBasis, p.unit_label)}${p.duration_days ? `; about ${p.duration_days} day(s)` : ""}.\n  Scope: ${p.scope ?? "—"}${p.exclusions ? `\n  Not included: ${p.exclusions}` : ""}${p.acceptance_criteria ? `\n  Accepted when: ${p.acceptance_criteria}` : ""}`);
      } else if (o.kind === "manufacturer") {
        const { data } = await db.from("signature_products").select("product_name, net_content, toll_price, price_includes, batch_size, moq, shelf_life_months, approval").eq("offer_id", o.id).order("position");
        lines = (data ?? []).map((p) => `- ${p.product_name} (${p.net_content}): toll price ${peso(p.toll_price)} per unit (${PRICE_INCLUDES[p.price_includes as PriceIncludes] ?? p.price_includes}); batch size ${Number(p.batch_size).toLocaleString("en-PH")}; minimum order ${Number(p.moq).toLocaleString("en-PH")}; shelf life ${p.shelf_life_months} months${p.approval === "approved" ? "" : " (not yet approved for the mark)"}.`);
      } else {
        const { data } = await db.from("supplier_offer_items").select("product_name, brand, sku, sell_unit, regular_price, wholesale_price, member_price, moq, lead_time_days").eq("offer_id", o.id).order("position");
        lines = (data ?? []).map((i) => `- ${i.product_name}${i.brand ? ` (${i.brand})` : ""}${i.sku ? `, SKU ${i.sku}` : ""}, per ${i.sell_unit}: regular ${peso(i.regular_price)}, wholesale ${peso(i.wholesale_price)}, member ${peso(i.member_price)}; minimum order ${i.moq ?? 1}${i.lead_time_days ? `; lead time ${i.lead_time_days} day(s)` : ""}.`);
      }
      const extra = [o.warranty ? `Warranty: ${o.warranty}` : "", o.returns_policy ? `Returns: ${o.returns_policy}` : "", o.correction_policy ? `Corrections: ${o.correction_policy}` : "", o.refund_policy ? `Refunds: ${o.refund_policy}` : ""].filter(Boolean);
      v.offer_block = [head, ...(lines.length ? lines : ["- (no items listed)"]), ...extra].join("\n");
    }
  } else {
    v.offer_block = c.category === "toll_manufacturer" ? "Toll prices are those of the FLAME Signature products in the licence (Annex D)." : "";
  }

  // Territories.
  if (c.appointment_ids.length) {
    const [{ data: appts }, { data: areas }] = await Promise.all([
      db.from("territorial_appointments").select("id, category_label, rights, exclusivity, channels, online_sales, excluded_accounts, start_date, end_date, review_every, target_period, target_net_sales, status").in("id", c.appointment_ids),
      db.from("territory_areas").select("appointment_id, label").in("appointment_id", c.appointment_ids),
    ]);
    v.territory_block = (appts ?? []).map((a) => {
      const where = (areas ?? []).filter((x) => x.appointment_id === a.id).map((x) => x.label).join(", ") || "—";
      const ch = ((a.channels ?? []) as Channel[]).map((k) => CHANNELS[k]?.label ?? k).join(", ") || "—";
      return [`- ${a.category_label} (${a.rights === "manufacturing" ? "manufacturing rights" : "distribution rights"}, ${a.exclusivity === "exclusive" ? "EXCLUSIVE" : "non-exclusive"})`,
        `  Areas: ${where}`, `  Channels: ${ch}`,
        a.online_sales ? `  Online orders: ${ONLINE_SALES[a.online_sales as OnlineSales]?.label ?? a.online_sales}` : "",
        `  Dates: ${dayText(a.start_date) || "to be set"} to ${dayText(a.end_date) || "to be set"}${a.status === "draft" ? " (appointment not yet approved; rights start only when the national team approves it)" : ""}`,
        (a.excluded_accounts ?? []).length ? `  Excluded accounts: ${(a.excluded_accounts as string[]).join(", ")}` : "",
        a.review_every ? `  Review: ${REVIEW_EVERY[a.review_every as ReviewEvery]?.label.toLowerCase()}${a.target_net_sales ? `, target ${peso(a.target_net_sales)} ${TARGET_PERIOD[a.target_period as TargetPeriod] ?? ""} (a goal, not a promise)` : ""}` : "",
      ].filter(Boolean).join("\n");
    }).join("\n");
  } else {
    v.territory_block = "No territorial rights. The Partner's offer is non-exclusive and is open to members wherever the Partner delivers or serves.";
  }

  // Commission: the split agreed in this contract, or the category default in force.
  let split: { national_pct: number; regional_pct: number; provincial_pct: number; city_pct: number } | null = null;
  let source = "as agreed in this contract";
  if (c.national_pct !== null && c.regional_pct !== null && c.provincial_pct !== null && c.city_pct !== null) split = toSplit(c);
  else {
    const { data: r } = await db.from("commission_rules").select("national_pct, regional_pct, provincial_pct, city_pct").eq("scope", "default").eq("partner_category", c.category).eq("status", "active").order("effective_from", { ascending: false }).limit(1).maybeSingle();
    if (r) { split = toSplit(r); source = "the program default for this category"; }
  }
  v.commission_block = split
    ? `Total ${pctText(totalPct(split))} of qualified, collected net sales (${source}): ${LEVEL_LABEL.national} ${pctText(split.national_pct)}, ${LEVEL_LABEL.regional} ${pctText(split.regional_pct)}, ${LEVEL_LABEL.provincial} ${pctText(split.provincial_pct)}, ${LEVEL_LABEL.city} ${pctText(split.city_pct)}. This is a recorded target, not a guaranteed payout.`
    : "";

  // Proposed late-delivery penalty: this contract's figures or the default terms in force.
  let rate = c.late_rate_pct_per_day, cap = c.late_cap_pct;
  if (rate === null || cap === null) {
    const { data: t } = await db.from("partner_penalty_terms").select("late_rate_pct_per_day, late_cap_pct").eq("scope", "default").eq("status", "active").maybeSingle();
    if (t) { rate = t.late_rate_pct_per_day; cap = t.late_cap_pct; }
  }
  v.penalty_block = rate !== null && cap !== null ? `${pctText(rate)} of the net value of the affected late goods for each day of delay, up to ${pctText(cap)} of that value in total.` : "";

  // Service levels: lead time and response from the offer, complaint targets in force.
  const { data: targets } = await db.from("complaint_targets").select("severity, first_response_hours, resolve_days");
  const order = ["critical", "high", "medium", "low"];
  const tl = ((targets ?? []) as { severity: string; first_response_hours: number; resolve_days: number }[]).sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity))
    .map((t) => `- ${t.severity[0].toUpperCase()}${t.severity.slice(1)} complaints: first reply within ${t.first_response_hours} hour(s), resolved within ${t.resolve_days} day(s).`);
  v.sla_block = [leadDays !== null ? `- Lead time: within ${leadDays} day(s) of an accepted order.` : "", responseHours !== null ? `- Response to members: within ${responseHours} hour(s).` : "", ...tl].filter(Boolean).join("\n");

  // FLAME Signature licence (manufacturers).
  if (c.licence_id) {
    const { data: l } = await db.from("signature_licences").select("ref_no, product_ids, site_ids, mfg_appointment_ids, dist_appointment_ids, start_date, end_date, status").eq("id", c.licence_id).maybeSingle();
    if (l) {
      const [{ data: prods }, { data: sites }] = await Promise.all([
        l.product_ids.length ? db.from("signature_products").select("product_name, net_content").in("id", l.product_ids) : Promise.resolve({ data: [] }),
        l.site_ids.length ? db.from("signature_sites").select("site_name, place_label").in("id", l.site_ids) : Promise.resolve({ data: [] }),
      ]);
      v.licence_block = [`FLAME Signature licence ${l.ref_no} (${l.status}), ${dayText(l.start_date) || "start to be set"} to ${dayText(l.end_date) || "end to be set"}.`,
        `Products: ${(prods ?? []).map((p) => `${p.product_name} (${p.net_content})`).join(", ") || "—"}.`,
        `Plants: ${(sites ?? []).map((s) => `${s.site_name}, ${s.place_label}`).join("; ") || "—"}.`,
        `Manufacturing rights: ${l.mfg_appointment_ids.length}; distribution rights: ${l.dist_appointment_ids.length} (see Annex A).`].join("\n");
    }
  } else {
    v.licence_block = c.category === "toll_manufacturer" ? "The FLAME Signature licence is issued separately by the national team. Until it is active, no product may carry the FLAME Signature mark." : "Not applicable (this Partner is not a FLAME Signature manufacturer).";
  }
  return v;
}

/** The full text of a contract as it stands, the templates used, and what blocks sending. */
export async function buildContract(db: SupabaseClient, c: ContractRow) {
  const [{ chosen, missingParts, draftParts }, values] = await Promise.all([templatesFor(db, c.category), contractValues(db, c)]);
  const parts = chosen.filter(Boolean) as Tpl[];
  const text = assembleContract(c.ref_no, c.revision, parts.map((t): TemplatePart => ({ part: t.part, version: t.version, title: t.title, body: t.body })), values);
  return { text, templateIds: parts.map((t) => t.id), missingParts, draftParts, unfilled: missingInText(text), hash: sha256(text) };
}
