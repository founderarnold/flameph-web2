import Link from "next/link";
import { redirect } from "next/navigation";
import { adminContext } from "@/lib/admin/guard";
import { Notice } from "@/components/ui";
import { PartnerMoneyNotice } from "@/components/PartnerMoneyNotice";
import { SyncedTableScroll } from "@/components/admin/SyncedTableScroll";
import {
  BASE_UNITS, unitCount, compareOffers, ITEM_COLS, landedCost, memberDiscount, OFFER_COLS, offerResult, OFFER_STATUS, PASS_MARK, peso, PRODUCT_GROUPS, SAMPLES,
  SHIPPING_TERMS, VAT_BASIS, withVat, type BaseUnit, type ItemRow, type OfferRow, type ScoreRow,
} from "@/lib/offers";
import { ServiceCompare } from "./ServiceCompare";

export const metadata = { title: "Compare offers", robots: { index: false } };

const day = (s: string | null) => (s ? new Date(`${s}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" }) : "—");

/**
 * Side-by-side comparison of 2 to 6 supplier offers for the national team: normalized landed cost per unit (member price
 * with VAT + delivery, divided by the pieces/kg/liters in a selling unit), member discount, compliance, samples, the
 * proposed commission and the score. Stacked cards on phones, a table from 1024px.
 */
export default async function CompareOffers({ searchParams }: { searchParams: Promise<{ id?: string | string[] }> }) {
  const sp = await searchParams;
  const ctx = await adminContext(["super_admin", "admin", "national_reviewer"]);
  const ids = [...new Set((Array.isArray(sp.id) ? sp.id : sp.id ? [sp.id] : []).filter((v) => /^[0-9a-f-]{36}$/i.test(v)))].slice(0, 6);
  if (ids.length < 2) redirect("/admin/partners/offers?error=compare");
  // Step 6: service offers have their own comparison (cost, qualifications, service levels, customer results).
  const { data: kinds } = await ctx.db.from("supplier_offers").select("kind").in("id", ids);
  const k = new Set((kinds ?? []).map((r) => r.kind as string));
  if (k.size > 1) redirect("/admin/partners/offers?error=mixed");
  if (k.has("service")) return <ServiceCompare ctx={ctx} ids={ids} />;

  const [{ data: offerRows }, { data: itemRows }, { data: scoreRows }, { data: sampleRows }] = await Promise.all([
    ctx.db.from("supplier_offers").select(`user_id, ${OFFER_COLS}`).in("id", ids),
    ctx.db.from("supplier_offer_items").select(`offer_id, ${ITEM_COLS}`).in("offer_id", ids).order("position"),
    ctx.db.from("supplier_offer_scores").select("offer_id, reviewer_id, revision, total, compliance_pass").in("offer_id", ids),
    ctx.db.from("partner_sample_tests").select("offer_id, total, safety_concern").in("offer_id", ids).in("status", ["submitted", "reviewed"]),
  ]);
  // Chapter sample tests (Step 5) sent for these offers: average of the 5-to-25 totals, and any safety flags.
  const tests = (sampleRows ?? []) as { offer_id: string; total: number | null; safety_concern: boolean }[];
  const ratingOf = (id: string) => {
    const t = tests.filter((x) => x.offer_id === id && x.total !== null);
    if (t.length === 0) return <span className="text-muted">No tests sent yet</span>;
    const avg = Math.round((t.reduce((n, x) => n + Number(x.total), 0) / t.length) * 10) / 10;
    const flags = t.filter((x) => x.safety_concern).length;
    return <>{avg} of 25 <span className="text-xs text-muted">({t.length} test{t.length > 1 ? "s" : ""})</span>{flags > 0 && <span className="block text-xs font-bold text-danger">{flags} safety concern{flags > 1 ? "s" : ""}</span>}</>;
  };
  const offers = ((offerRows ?? []) as unknown as (OfferRow & { user_id: string })[]).sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  if (offers.length < 2) redirect("/admin/partners/offers?error=compare");
  const items = (itemRows ?? []) as unknown as (ItemRow & { offer_id: string })[];
  const { data: profs } = await ctx.db.from("partner_profiles").select("user_id, legal_name, status").in("user_id", offers.map((o) => o.user_id));
  const prof = new Map((profs ?? []).map((p) => [p.user_id, p as { legal_name: string; status: string }]));
  const itemsOf = (id: string) => items.filter((i) => i.offer_id === id);
  const cmp = new Map(compareOffers(offers.map((o) => ({ id: o.id, vat_basis: o.vat_basis, items: itemsOf(o.id) }))).map((c) => [c.id, c]));
  const result = new Map(offers.map((o) => [o.id, offerResult(((scoreRows ?? []) as (ScoreRow & { offer_id: string })[]).filter((s) => s.offer_id === o.id), o.revision)]));
  const units = [...new Set(items.map((i) => i.base_unit))] as BaseUnit[];

  // One line per question, one column per offer.
  const lines: { k: string; v: (o: OfferRow & { user_id: string }) => React.ReactNode }[] = [
    { k: "Supplier", v: (o) => <>{prof.get(o.user_id)?.legal_name ?? "—"}<span className="block text-xs text-muted">{prof.get(o.user_id)?.status === "accredited" ? "Accredited" : "Not accredited now"}</span></> },
    { k: "Status", v: (o) => <>{OFFER_STATUS[o.status].label}{o.revision > 0 ? ` · v${o.revision}` : ""}</> },
    { k: "Product group", v: (o) => (o.product_group ? PRODUCT_GROUPS[o.product_group] : "—") },
    ...units.map((u) => ({
      k: `Lowest landed cost per ${BASE_UNITS[u].label}`,
      v: (o: OfferRow) => {
        const c = cmp.get(o.id);
        const val = c?.lowest[u];
        return val === undefined ? <span className="text-muted">—</span> : <><strong className={c?.isBest[u] ? "text-ok" : ""}>{peso(val)}</strong>{c?.isBest[u] && <span className="ml-1 rounded-full bg-ok-soft px-2 text-xs font-bold text-ok">Lowest</span>}</>;
      },
    })),
    { k: "Member discount (average)", v: (o) => { const d = cmp.get(o.id)?.avgDiscount; return d === null || d === undefined ? "—" : `${d}%`; } },
    { k: "Smallest minimum order", v: (o) => { const m = itemsOf(o.id).map((i) => i.moq); return m.length ? `${Math.min(...m)} unit(s)` : "—"; } },
    { k: "Products", v: (o) => itemsOf(o.id).length },
    { k: "Prices valid until", v: (o) => day(o.valid_until) },
    { k: "VAT", v: (o) => (o.vat_basis ? VAT_BASIS[o.vat_basis] : "—") },
    { k: "Delivery", v: (o) => <>{o.shipping_terms ? SHIPPING_TERMS[o.shipping_terms] : "—"}{o.lead_time_days !== null ? `, ${o.lead_time_days} days` : ""}</> },
    { k: "Areas served", v: (o) => <span className="line-clamp-3">{o.serviceable_areas ?? "—"}</span> },
    { k: "Warranty and returns", v: (o) => <span className="line-clamp-3">{[o.warranty, o.returns_policy].filter(Boolean).join(" · ") || "—"}</span> },
    { k: "Samples", v: (o) => (o.sample_availability ? SAMPLES[o.sample_availability] : "—") },
    { k: "Sample test ratings", v: (o) => ratingOf(o.id) },
    { k: "Certifications", v: (o) => o.certifications ?? "—" },
    { k: "Compliance gate", v: (o) => { const r = result.get(o.id)!; return r.compliance === "pass" ? <span className="font-bold text-ok">Passed</span> : r.compliance === "fail" ? <span className="font-bold text-danger">Failed</span> : <span className="text-muted">Not checked</span>; } },
    { k: "Proposed commission", v: (o) => (o.commission_pct !== null ? `${Number(o.commission_pct)}%` : "—") },
    { k: "Suggested price score (of 30)", v: (o) => { const c = cmp.get(o.id); return c?.suggestedPriceScore ?? "—"; } },
    { k: `Score (pass mark ${PASS_MARK})`, v: (o) => { const r = result.get(o.id)!; return r.average === null ? <span className="text-muted">Not scored</span> : <><strong className={r.canSelect ? "text-ok" : ""}>{r.average}</strong> <span className="text-xs text-muted">({r.scores} reviewer{r.scores > 1 ? "s" : ""}){r.canSelect ? " · can be chosen" : ""}</span></>; } },
  ];

  const allItems = [...items].sort((a, b) => a.base_unit.localeCompare(b.base_unit) || landedCost(a, offers.find((o) => o.id === a.offer_id)!.vat_basis).perBaseUnitExact - landedCost(b, offers.find((o) => o.id === b.offer_id)!.vat_basis).perBaseUnitExact);
  const titleOf = (id: string) => offers.find((o) => o.id === id)!;

  return (
    <div className="space-y-4">
      <p className="text-sm"><Link href="/admin/partners/offers" className="underline">← Supplier offers</Link></p>
      <div>
        <h1 className="text-2xl font-extrabold text-primary">Compare {offers.length} offers</h1>
        <p className="text-sm text-muted">Landed cost = member price, with 12% VAT added where the supplier quoted without it, plus the supplier&apos;s delivery cost per unit, divided by the pieces, kg or liters in one selling unit. The suggested price score is only a guide: 30 for the lowest, less in proportion.</p>
      </div>
      <PartnerMoneyNotice compact />
      {new Set(offers.map((o) => o.product_group)).size > 1 && <Notice tone="warn">These offers are from different product groups, so the prices may not be comparable.</Notice>}

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

      <section className="space-y-3" aria-labelledby="items-h">
        <h2 id="items-h" className="text-lg font-bold">Every product, cheapest landed cost first</h2>
        <ul className="space-y-2 lg:hidden">
          {allItems.map((it) => {
            const o = titleOf(it.offer_id); const lc = landedCost(it, o.vat_basis);
            return (
              <li key={it.id} className="card p-3 text-sm">
                <p className="break-words font-bold">{it.product_name}{it.brand ? ` · ${it.brand}` : ""}</p>
                <p className="text-muted">{prof.get(o.user_id)?.legal_name ?? "—"} · {it.sell_unit}</p>
                <p><strong>{peso(lc.perBaseUnit)} per {BASE_UNITS[it.base_unit].label}</strong> · member {peso(it.member_price)}{o.vat_basis === "vat_exclusive" ? " + VAT" : ""} + delivery {peso(it.shipping_per_unit)} · MOQ {it.moq}</p>
              </li>
            );
          })}
        </ul>
        <div className="hidden lg:block">
          <SyncedTableScroll label="Products compared">
            <table className="min-w-[1100px] table-fixed text-left text-[15px]">
              <colgroup><col className="w-[240px]" /><col className="w-[180px]" /><col className="w-[140px]" /><col className="w-[120px]" /><col className="w-[120px]" /><col className="w-[110px]" /><col className="w-[130px]" /><col className="w-[90px]" /><col className="w-[90px]" /></colgroup>
              <thead className="border-b border-line bg-bg-soft"><tr>{["Product", "Supplier", "Sold by", "Member price", "With VAT", "Delivery", "Landed per unit", "Discount", "MOQ"].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
              <tbody>
                {allItems.map((it) => {
                  const o = titleOf(it.offer_id); const lc = landedCost(it, o.vat_basis); const d = memberDiscount(it);
                  return (
                    <tr key={it.id} className="border-b border-line align-top last:border-0">
                      <td className="break-words px-3 py-2"><strong>{it.product_name}</strong>{it.sku ? <span className="block text-xs text-muted">SKU {it.sku}</span> : null}</td>
                      <td className="break-words px-3 py-2">{prof.get(o.user_id)?.legal_name ?? "—"}</td>
                      <td className="break-words px-3 py-2">{it.sell_unit}<span className="block text-xs text-muted">{unitCount(it.base_qty, it.base_unit)}</span></td>
                      <td className="px-3 py-2">{peso(it.member_price)}</td>
                      <td className="px-3 py-2">{peso(withVat(Number(it.member_price), o.vat_basis))}</td>
                      <td className="px-3 py-2">{peso(it.shipping_per_unit)}</td>
                      <td className="px-3 py-2 font-bold">{peso(lc.perBaseUnit)}<span className="block text-xs font-normal text-muted">per {BASE_UNITS[it.base_unit].label}</span></td>
                      <td className="px-3 py-2">{d === null ? "—" : `${d}%`}</td>
                      <td className="px-3 py-2">{it.moq}</td>
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
