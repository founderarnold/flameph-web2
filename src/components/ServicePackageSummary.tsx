import { peso } from "@/lib/offers";
import { rateDiscount, rateLabel, type PackageRow, type ServiceOfferRow } from "@/lib/service-offers";

// A service package (Step 6) as a small card, used by the provider's form and the national team's review.
/** One package as a small card: name, rate, what is included and how the member checks it is done. */
export function PackageSummary({ p, vat, full = false }: { p: PackageRow; vat: ServiceOfferRow["vat_basis"]; full?: boolean }) {
  const d = rateDiscount(p);
  return (
    <div className="min-w-0 space-y-0.5">
      <p className="break-words font-bold">{p.name}</p>
      <p className="text-sm">Member rate <strong>{peso(p.member_rate)}</strong> {rateLabel(p.rate_basis, p.unit_label)}{vat === "vat_exclusive" ? " + VAT" : ""}{d !== null ? ` (${d}% off normal ${peso(p.normal_rate)})` : ""}{p.min_units > 1 ? ` · at least ${p.min_units}` : ""}</p>
      <p className={`break-words text-sm text-muted ${full ? "whitespace-pre-line" : "line-clamp-2"}`}><span className="font-semibold text-fg">Included:</span> {p.scope}</p>
      {p.exclusions && <p className={`break-words text-sm text-muted ${full ? "whitespace-pre-line" : "line-clamp-2"}`}><span className="font-semibold text-fg">Not included:</span> {p.exclusions}</p>}
      <p className={`break-words text-sm text-muted ${full ? "whitespace-pre-line" : "line-clamp-2"}`}><span className="font-semibold text-fg">Done when:</span> {p.acceptance_criteria}</p>
      <p className="text-xs text-muted">{p.duration_days !== null ? `Finished in ${p.duration_days} days · ` : ""}{p.revisions_included} revision(s) included{p.milestones.length ? ` · milestones: ${p.milestones.map((m) => `${m.title}${m.due_days !== null ? ` (day ${m.due_days})` : ""}`).join("; ")}` : ""}</p>
    </div>
  );
}

