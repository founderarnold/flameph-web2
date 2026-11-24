import Link from "next/link";
import { Notice } from "@/components/ui";
import { PartnerMoneyNotice } from "@/components/PartnerMoneyNotice";
import { SyncedTableScroll } from "@/components/admin/SyncedTableScroll";
import type { adminContext } from "@/lib/admin/guard";
import { offerResult, OFFER_STATUS, PASS_MARK, peso, VAT_BASIS, withVat, type ScoreRow } from "@/lib/offers";
import {
  basisLabel, compareServiceOffers, FREE_TRIAL, PACKAGE_COLS, rateDiscount, rateLabel, REFERENCE_COLS, SERVICE_CATEGORIES, SERVICE_COLS, SERVICE_MODES,
  type PackageRow, type ReferenceRow, type ServiceOfferRow,
} from "@/lib/service-offers";
import { trackRecords } from "@/lib/service-offers-server";
import { OFFER_COLS } from "@/lib/offers";

const day = (s: string | null) => (s ? new Date(`${s}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" }) : "—");
const today = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
type O = ServiceOfferRow & { user_id: string };

/**
 * Side-by-side comparison of 2 to 6 service provider offers (Step 6) on cost, qualifications, service levels and
 * customer results: the lowest member rate (with VAT) for each kind of package, member discount, licence, response
 * time, free consultation or trial, verified past clients, confirmed FLAME PH deals and ratings, complaints, trials,
 * the proposed commission and the score. Stacked cards on phones, a table from 1024px.
 */
export async function ServiceCompare({ ctx, ids }: { ctx: Awaited<ReturnType<typeof adminContext>>; ids: string[] }) {
  const [{ data: offerRows }, { data: pkgRows }, { data: refRows }, { data: scoreRows }] = await Promise.all([
    ctx.db.from("supplier_offers").select(`user_id, ${OFFER_COLS}, ${SERVICE_COLS}`).in("id", ids),
    ctx.db.from("service_offer_packages").select(`offer_id, ${PACKAGE_COLS}`).in("offer_id", ids).order("position"),
    ctx.db.from("service_offer_references").select(`offer_id, ${REFERENCE_COLS}`).in("offer_id", ids),
    ctx.db.from("supplier_offer_scores").select("offer_id, reviewer_id, revision, total, compliance_pass").in("offer_id", ids),
  ]);
  const offers = ((offerRows ?? []) as unknown as O[]).sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  const packages = (pkgRows ?? []) as unknown as (PackageRow & { offer_id: string })[];
  const refs = (refRows ?? []) as unknown as (ReferenceRow & { offer_id: string })[];
  const pkgsOf = (id: string) => packages.filter((p) => p.offer_id === id);
  const refsOf = (id: string) => refs.filter((r) => r.offer_id === id);
  const { data: profs } = await ctx.db.from("partner_profiles").select("user_id, legal_name, status").in("user_id", offers.map((o) => o.user_id));
  const prof = new Map((profs ?? []).map((p) => [p.user_id, p as { legal_name: string; status: string }]));
  const tracks = await trackRecords(ctx.db, offers.map((o) => o.user_id), new Map(offers.map((o) => [o.user_id, refsOf(o.id)])));
  const cmp = new Map(compareServiceOffers(offers.map((o) => ({ id: o.id, vat_basis: o.vat_basis, packages: pkgsOf(o.id) }))).map((c) => [c.id, c]));
  const result = new Map(offers.map((o) => [o.id, offerResult(((scoreRows ?? []) as (ScoreRow & { offer_id: string })[]).filter((s) => s.offer_id === o.id), o.revision)]));
  const bases = [...new Set(packages.map((p) => (p.rate_basis === "unit" ? `unit:${(p.unit_label ?? "").trim().toLowerCase()}` : p.rate_basis)))];

  const lines: { k: string; v: (o: O) => React.ReactNode }[] = [
    { k: "Service provider", v: (o) => <>{prof.get(o.user_id)?.legal_name ?? "—"}<span className="block text-xs text-muted">{prof.get(o.user_id)?.status === "accredited" ? "Accredited" : "Not accredited now"}</span></> },
    { k: "Status", v: (o) => <>{OFFER_STATUS[o.status].label}{o.revision > 0 ? ` · v${o.revision}` : ""}</> },
    { k: "Kind of service", v: (o) => (o.service_category ? SERVICE_CATEGORIES[o.service_category] : "—") },
    // Cost
    ...bases.map((b) => ({
      k: `Lowest member rate ${basisLabel(b)}`,
      v: (o: O) => {
        const c = cmp.get(o.id);
        const val = c?.lowest[b];
        return val === undefined ? <span className="text-muted">—</span> : <><strong className={c?.isBest[b] ? "text-ok" : ""}>{peso(val)}</strong>{c?.isBest[b] && <span className="ml-1 rounded-full bg-ok-soft px-2 text-xs font-bold text-ok">Lowest</span>}</>;
      },
    })),
    { k: "Member discount (average)", v: (o) => { const d = cmp.get(o.id)?.avgDiscount; return d === null || d === undefined ? "—" : `${d}%`; } },
    { k: "Packages", v: (o) => pkgsOf(o.id).length },
    { k: "Rates valid until", v: (o) => day(o.valid_until) },
    { k: "VAT", v: (o) => (o.vat_basis ? VAT_BASIS[o.vat_basis] : "—") },
    { k: "Free consultation or trial", v: (o) => (o.free_trial ? FREE_TRIAL[o.free_trial] : "—") },
    // Qualifications
    { k: "Profession", v: (o) => <span className="line-clamp-2">{o.profession ?? "—"}</span> },
    { k: "Qualifications", v: (o) => <span className="line-clamp-3">{o.qualifications ?? "—"}</span> },
    { k: "Licence", v: (o) => (o.license_required === null ? "—" : o.license_required ? <>{o.license_body} {o.license_no}{o.license_valid_until && o.license_valid_until < today() && <span className="block font-bold text-danger">Expired</span>}</> : "Not needed") },
    // Service levels
    { k: "Replies within", v: (o) => (o.response_hours !== null ? `${o.response_hours} hours` : "—") },
    { k: "Work starts within", v: (o) => (o.lead_time_days !== null ? `${o.lead_time_days} days` : "—") },
    { k: "On-site or remote", v: (o) => (o.service_mode ? SERVICE_MODES[o.service_mode] : "—") },
    { k: "Areas served", v: (o) => <span className="line-clamp-3">{o.serviceable_areas ?? "—"}</span> },
    { k: "Correction and refund", v: (o) => <span className="line-clamp-3">{[o.correction_policy, o.refund_policy].filter(Boolean).join(" · ") || "—"}</span> },
    { k: "Every package has acceptance criteria", v: (o) => (pkgsOf(o.id).length && pkgsOf(o.id).every((p) => p.acceptance_criteria?.trim()) ? <span className="text-ok">Yes</span> : "—") },
    // Customer results
    { k: "Past clients verified", v: (o) => { const t = tracks.get(o.user_id); return t?.referencesTotal ? `${t.referencesVerified} of ${t.referencesTotal}${t.referenceRating !== null ? ` · rated ${t.referenceRating}/5` : ""}` : "None listed"; } },
    { k: "Confirmed FLAME PH deals", v: (o) => { const t = tracks.get(o.user_id); return !t?.shared ? <span className="text-muted">Not shared or none</span> : `${t.deals}${t.ratingAvg !== null ? ` · rated ${t.ratingAvg}/5 (${t.ratingCount})` : ""}`; } },
    { k: "Complaints", v: (o) => { const t = tracks.get(o.user_id); return !t?.complaints ? "None" : <>{t.complaints}{t.complaintsOpen ? <span className="font-bold text-warn"> ({t.complaintsOpen} open)</span> : ""}</>; } },
    { k: "Chapter trials", v: (o) => { const t = tracks.get(o.user_id); return !t?.trials ? <span className="text-muted">None yet</span> : <>{t.trialAvg} of 25 ({t.trials}){t.safety ? <span className="block text-xs font-bold text-danger">{t.safety} safety concern(s)</span> : null}</>; } },
    // Decision
    { k: "Compliance gate", v: (o) => { const r = result.get(o.id)!; return r.compliance === "pass" ? <span className="font-bold text-ok">Passed</span> : r.compliance === "fail" ? <span className="font-bold text-danger">Failed</span> : <span className="text-muted">Not checked</span>; } },
    { k: "Proposed commission", v: (o) => (o.commission_pct !== null ? `${Number(o.commission_pct)}%` : "—") },
    { k: "Suggested cost score (of 30)", v: (o) => { const c = cmp.get(o.id); return c?.suggestedPriceScore ?? "—"; } },
    { k: `Score (pass mark ${PASS_MARK})`, v: (o) => { const r = result.get(o.id)!; return r.average === null ? <span className="text-muted">Not scored</span> : <><strong className={r.canSelect ? "text-ok" : ""}>{r.average}</strong> <span className="text-xs text-muted">({r.scores} reviewer{r.scores > 1 ? "s" : ""}){r.canSelect ? " · can be chosen" : ""}</span></>; } },
  ];

  const keyOf = (p: PackageRow) => (p.rate_basis === "unit" ? `unit:${(p.unit_label ?? "").trim().toLowerCase()}` : p.rate_basis);
  const vatOf = (id: string) => offers.find((o) => o.id === id)!.vat_basis;
  const allPkgs = [...packages].sort((a, b) => keyOf(a).localeCompare(keyOf(b)) || withVat(Number(a.member_rate), vatOf(a.offer_id)) - withVat(Number(b.member_rate), vatOf(b.offer_id)));
  const ownerOf = (id: string) => prof.get(offers.find((o) => o.id === id)!.user_id)?.legal_name ?? "—";

  return (
    <div className="space-y-4">
      <p className="text-sm"><Link href="/admin/partners/offers?kind=service" className="underline">← Service offers</Link></p>
      <div>
        <h1 className="text-2xl font-extrabold text-primary">Compare {offers.length} service offers</h1>
        <p className="text-sm text-muted">Cost, qualifications, service levels and customer results side by side. Member rates have 12% VAT added where the provider quoted without it, and are compared only with packages priced the same way (per hour, per month, per package, or the same unit). The suggested cost score is only a guide: 30 for the lowest, less in proportion. Results are judged against each package&apos;s written scope and acceptance criteria, never a blanket satisfaction promise.</p>
      </div>
      <PartnerMoneyNotice compact />
      {new Set(offers.map((o) => o.service_category)).size > 1 && <Notice tone="warn">These offers are for different kinds of service, so the rates may not be comparable.</Notice>}

      <ul className="space-y-3 lg:hidden" aria-label="Offers compared">
        {offers.map((o) => (
          <li key={o.id} className="card p-4">
            <Link href={`/admin/partners/offers/${o.id}`} className="block break-words text-lg font-extrabold text-primary underline">{o.title ?? "(no name)"}</Link>
            <dl className="mt-2 divide-y divide-line">
              {lines.map((l) => <div key={l.k} className="flex justify-between gap-3 py-1.5 text-sm"><dt className="text-muted">{l.k}</dt><dd className="min-w-0 break-words text-right">{l.v(o)}</dd></div>)}
            </dl>
          </li>
        ))}
      </ul>
      <div className="hidden lg:block">
        <SyncedTableScroll label="Offers side by side">
          <table className="min-w-[900px] table-fixed text-left text-[15px]">
            <colgroup><col className="w-[220px]" />{offers.map((o) => <col key={o.id} className="w-[220px]" />)}</colgroup>
            <thead className="border-b border-line bg-bg-soft"><tr><th className="px-3 py-2">Offer</th>{offers.map((o) => <th key={o.id} className="break-words px-3 py-2"><Link href={`/admin/partners/offers/${o.id}`} className="text-primary underline">{o.title ?? "(no name)"}</Link></th>)}</tr></thead>
            <tbody>{lines.map((l) => <tr key={l.k} className="border-b border-line align-top last:border-0"><th scope="row" className="px-3 py-2 text-sm font-semibold text-muted">{l.k}</th>{offers.map((o) => <td key={o.id} className="break-words px-3 py-2">{l.v(o)}</td>)}</tr>)}</tbody>
          </table>
        </SyncedTableScroll>
      </div>

      <section className="space-y-3" aria-labelledby="pkgs-h">
        <h2 id="pkgs-h" className="text-lg font-bold">Every package, lowest member rate first</h2>
        <ul className="space-y-2 lg:hidden">
          {allPkgs.map((p) => (
            <li key={p.id} className="card p-3 text-sm">
              <p className="break-words font-bold">{p.name}</p>
              <p className="text-muted">{ownerOf(p.offer_id)}</p>
              <p><strong>{peso(withVat(Number(p.member_rate), vatOf(p.offer_id)))} {rateLabel(p.rate_basis, p.unit_label)}</strong> with VAT{p.duration_days !== null ? ` · ${p.duration_days} days` : ""}</p>
              <p className="line-clamp-2 text-muted">Done when: {p.acceptance_criteria}</p>
            </li>
          ))}
        </ul>
        <div className="hidden lg:block">
          <SyncedTableScroll label="Packages compared">
            <table className="min-w-[1100px] table-fixed text-left text-[15px]">
              <colgroup><col className="w-[220px]" /><col className="w-[170px]" /><col className="w-[120px]" /><col className="w-[120px]" /><col className="w-[90px]" /><col className="w-[90px]" /><col className="w-[300px]" /></colgroup>
              <thead className="border-b border-line bg-bg-soft"><tr>{["Package", "Provider", "Priced", "Member rate with VAT", "Discount", "Days", "Done when (acceptance)"].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
              <tbody>
                {allPkgs.map((p) => {
                  const d = rateDiscount(p);
                  return (
                    <tr key={p.id} className="border-b border-line align-top last:border-0">
                      <td className="break-words px-3 py-2"><strong>{p.name}</strong></td>
                      <td className="break-words px-3 py-2">{ownerOf(p.offer_id)}</td>
                      <td className="break-words px-3 py-2">{rateLabel(p.rate_basis, p.unit_label)}{p.min_units > 1 ? <span className="block text-xs text-muted">min. {p.min_units}</span> : null}</td>
                      <td className="px-3 py-2 font-bold">{peso(withVat(Number(p.member_rate), vatOf(p.offer_id)))}</td>
                      <td className="px-3 py-2">{d === null ? "—" : `${d}%`}</td>
                      <td className="px-3 py-2">{p.duration_days ?? "—"}</td>
                      <td className="break-words px-3 py-2 text-sm">{p.acceptance_criteria}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </SyncedTableScroll>
        </div>
      </section>
    </div>
  );
}
