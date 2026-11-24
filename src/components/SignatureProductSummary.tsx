import { peso } from "@/lib/offers";
import { APPROVAL, CPR_HOLDER, CPR_STATUS, PRICE_INCLUDES, PRODUCT_TYPES, per100, unitCost, type SigProductRow, type SignatureOfferRow } from "@/lib/signature";

// A FLAME Signature product (Step 7) as a small card, used by the manufacturer's form and the national team's review.
const TONE = { ok: "bg-ok-soft text-ok", info: "bg-primary-soft text-primary", warn: "bg-warn-soft text-warn" } as const;

/** One product: name, size, toll price (with VAT and per 100 g/ml), MOQ, shelf life, FDA status, site and approval. */
export function SigProductSummary({ p, vat, site, showApproval = false }: { p: SigProductRow; vat: SignatureOfferRow["vat_basis"]; site: string | null; showApproval?: boolean }) {
  const q = per100(p, vat);
  const a = APPROVAL[p.approval];
  return (
    <div className="min-w-0 space-y-0.5">
      <p className="break-words font-bold">
        {p.product_name}
        {showApproval && <span className={`ml-2 inline-block rounded-full px-2 py-0.5 align-middle text-xs font-bold ${TONE[a.tone]}`}>{a.label}</span>}
      </p>
      <p className="text-sm text-muted">{PRODUCT_TYPES[p.product_type]} · {p.net_content} · {p.packaging}</p>
      <p className="text-sm">
        Toll price <strong>{peso(p.toll_price)}</strong> per unit{vat === "vat_exclusive" ? " + VAT" : ""}
        {vat === "vat_exclusive" ? ` (${peso(unitCost(p, vat))} with VAT)` : ""}
        {q ? ` · ${peso(q.value)} per 100 ${q.unit}` : ""}
      </p>
      <p className="text-xs text-muted">{PRICE_INCLUDES[p.price_includes]}{p.suggested_srp !== null ? ` · suggested shelf price ${peso(p.suggested_srp)}` : ""}</p>
      <p className="text-xs text-muted">
        Minimum order {p.moq.toLocaleString("en-PH")} · batch size {p.batch_size.toLocaleString("en-PH")} · shelf life {p.shelf_life_months} month(s)
        {p.lead_time_days !== null ? ` · ${p.lead_time_days} days to make` : ""}{p.sample_qty !== null ? ` · ${p.sample_qty} free sample unit(s)` : ""}
      </p>
      <p className="text-xs text-muted">
        {p.fda_needed ? "Needs FDA" : "No FDA needed"} · {CPR_STATUS[p.cpr_status]}{p.cpr_no ? ` (${p.cpr_no})` : ""}{p.cpr_holder ? ` · ${CPR_HOLDER[p.cpr_holder]}` : ""}
        {` · made at ${site ?? "(choose a site)"}`}
      </p>
      {showApproval && p.approval_note && <p className="break-words text-xs text-muted"><span className="font-semibold text-fg">National team:</span> {p.approval_note}</p>}
    </div>
  );
}
