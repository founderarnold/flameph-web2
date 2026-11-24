import Link from "next/link";
import { Notice } from "@/components/ui";
import { PartnerMoneyNotice } from "@/components/PartnerMoneyNotice";
import { SyncedTableScroll } from "@/components/admin/SyncedTableScroll";
import type { adminContext } from "@/lib/admin/guard";
import { offerResult, OFFER_COLS, OFFER_STATUS, PASS_MARK, peso, VAT_BASIS, type ScoreRow } from "@/lib/offers";
import {
  compareKeyLabel, compareSignature, FORMULA_OWNERSHIP, PACKAGING_SUPPLY, per100, PRODUCT_TYPES, reviewState, SIG_PRODUCT_COLS, SIGNATURE_CATEGORIES, SIGNATURE_COLS,
  SITE_COLS, unitCost, type ReviewRow, type SigProductRow, type SignatureOfferRow, type SiteRow,
} from "@/lib/signature";

const day = (s: string | null) => (s ? new Date(`${s}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" }) : "—");
const today = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
type O = SignatureOfferRow & { user_id: string };

/**
 * Side-by-side comparison of 2 to 6 FLAME Signature proposals (Step 7): the lowest toll price per 100 g or 100 ml (with
 * VAT) for each kind of product, MOQ, shelf life, plants and FDA licences, quality and recall readiness, formula
 * ownership, chapter sample tests, both reviews, the proposed commission and the score. Stacked cards on phones, a table
 * from 1024px.
 */
export async function SignatureCompare({ ctx, ids }: { ctx: Awaited<ReturnType<typeof adminContext>>; ids: string[] }) {
  const [{ data: offerRows }, { data: prodRows }, { data: siteRows }, { data: scoreRows }, { data: revRows }, { data: sampleRows }] = await Promise.all([
    ctx.db.from("supplier_offers").select(`user_id, kind, ${OFFER_COLS}, ${SIGNATURE_COLS}`).in("id", ids),
    ctx.db.from("signature_products").select(`offer_id, ${SIG_PRODUCT_COLS}`).in("offer_id", ids).order("position"),
    ctx.db.from("signature_sites").select(`offer_id, ${SITE_COLS}`).in("offer_id", ids).order("position"),
    ctx.db.from("supplier_offer_scores").select("offer_id, reviewer_id, revision, total, compliance_pass").in("offer_id", ids),
    ctx.db.from("signature_reviews").select("offer_id, revision, review_type, outcome, created_at").in("offer_id", ids),
    ctx.db.from("partner_sample_tests").select("offer_id, total, safety_concern").in("offer_id", ids).in("status", ["submitted", "reviewed"]),
  ]);
  const offers = ((offerRows ?? []) as unknown as O[]).sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  const products = (prodRows ?? []) as unknown as (SigProductRow & { offer_id: string })[];
  const sites = (siteRows ?? []) as unknown as (SiteRow & { offer_id: string })[];
  const reviews = (revRows ?? []) as unknown as (ReviewRow & { offer_id: string })[];
  const tests = (sampleRows ?? []) as { offer_id: string; total: number | null; safety_concern: boolean }[];
  const prodsOf = (id: string) => products.filter((p) => p.offer_id === id);
  const sitesOf = (id: string) => sites.filter((s) => s.offer_id === id);
  const { data: profs } = await ctx.db.from("partner_profiles").select("user_id, legal_name, status").in("user_id", offers.map((o) => o.user_id));
  const prof = new Map((profs ?? []).map((p) => [p.user_id, p as { legal_name: string; status: string }]));
  const cmp = new Map(compareSignature(offers.map((o) => ({ id: o.id, vat_basis: o.vat_basis, products: prodsOf(o.id) }))).map((c) => [c.id, c]));
  const result = new Map(offers.map((o) => [o.id, offerResult(((scoreRows ?? []) as (ScoreRow & { offer_id: string })[]).filter((s) => s.offer_id === o.id), o.revision)]));
  const rState = (o: O) => reviewState(reviews.filter((r) => r.offer_id === o.id), o.revision);
  const keys = [...new Set([...cmp.values()].flatMap((c) => Object.keys(c.lowest)))].sort();
  const word = (x: "cleared" | "not_cleared" | null) => (x === "cleared" ? <span className="font-bold text-ok">Cleared</span> : x === "not_cleared" ? <span className="font-bold text-danger">Not cleared</span> : <span className="text-muted">Not done</span>);
  const ratingOf = (id: string) => {
    const t = tests.filter((x) => x.offer_id === id && x.total !== null);
    if (t.length === 0) return <span className="text-muted">No tests sent yet</span>;
    const avg = Math.round((t.reduce((n, x) => n + Number(x.total), 0) / t.length) * 10) / 10;
    const flags = t.filter((x) => x.safety_concern).length;
    return <>{avg} of 25 <span className="text-xs text-muted">({t.length})</span>{flags > 0 && <span className="block text-xs font-bold text-danger">{flags} safety concern(s)</span>}</>;
  };

  const lines: { k: string; v: (o: O) => React.ReactNode }[] = [
    { k: "Toll manufacturer", v: (o) => <>{prof.get(o.user_id)?.legal_name ?? "—"}<span className="block text-xs text-muted">{prof.get(o.user_id)?.status === "accredited" ? "Accredited" : "Not accredited now"}</span></> },
    { k: "Status", v: (o) => <>{OFFER_STATUS[o.status].label}{o.revision > 0 ? ` · v${o.revision}` : ""}</> },
    { k: "Kind of products", v: (o) => (o.signature_category ? SIGNATURE_CATEGORIES[o.signature_category] : "—") },
    ...keys.map((k) => ({
      k: `Lowest toll price: ${compareKeyLabel(k)}`,
      v: (o: O) => {
        const c = cmp.get(o.id);
        const val = c?.lowest[k];
        return val === undefined ? <span className="text-muted">—</span> : <><strong className={c?.isBest[k] ? "text-ok" : ""}>{peso(val)}</strong>{c?.isBest[k] && <span className="ml-1 rounded-full bg-ok-soft px-2 text-xs font-bold text-ok">Lowest</span>}</>;
      },
    })),
    { k: "Products", v: (o) => prodsOf(o.id).length },
    { k: "Smallest minimum order", v: (o) => { const m = prodsOf(o.id).map((p) => p.moq); return m.length ? Math.min(...m).toLocaleString("en-PH") : "—"; } },
    { k: "Shelf life", v: (o) => { const m = prodsOf(o.id).map((p) => p.shelf_life_months); return m.length ? `${Math.min(...m)} to ${Math.max(...m)} months` : "—"; } },
    { k: "Toll prices valid until", v: (o) => day(o.valid_until) },
    { k: "VAT", v: (o) => (o.vat_basis ? VAT_BASIS[o.vat_basis] : "—") },
    { k: "Who owns the formula", v: (o) => (o.formulation_ownership ? FORMULA_OWNERSHIP[o.formulation_ownership].label : "—") },
    { k: "Packaging supplied by", v: (o) => (o.packaging_supply ? PACKAGING_SUPPLY[o.packaging_supply] : "—") },
    { k: "Plants and FDA licence", v: (o) => { const s = sitesOf(o.id); if (!s.length) return "—"; const bad = s.filter((x) => !x.lto_no || (x.lto_valid_until ?? "") < today()).length; return <>{s.length} plant(s){bad ? <span className="block font-bold text-warn">{bad} without a current FDA licence</span> : <span className="block text-ok">All with a current FDA licence</span>}</>; } },
    { k: "Products needing FDA registration", v: (o) => { const p = prodsOf(o.id).filter((x) => x.fda_needed); return p.length ? `${p.filter((x) => x.cpr_status === "registered").length} of ${p.length} registered` : "None"; } },
    { k: "Days to deliver", v: (o) => (o.lead_time_days !== null ? `${o.lead_time_days} days` : "—") },
    { k: "Batch records kept", v: (o) => (o.batch_record_years !== null ? `${o.batch_record_years} year(s)` : "—") },
    { k: "Recall plan", v: (o) => (o.recall_plan ? <>Yes{o.mock_recall_on ? <span className="block text-xs text-muted">mock recall {day(o.mock_recall_on)}</span> : null}</> : "—") },
    { k: "Chapter sample tests", v: (o) => ratingOf(o.id) },
    { k: "Regulatory review", v: (o) => word(rState(o).regulatory) },
    { k: "Legal review", v: (o) => word(rState(o).legal) },
    { k: "Compliance gate", v: (o) => { const r = result.get(o.id)!; return r.compliance === "pass" ? <span className="font-bold text-ok">Passed</span> : r.compliance === "fail" ? <span className="font-bold text-danger">Failed</span> : <span className="text-muted">Not checked</span>; } },
    { k: "Proposed commission", v: (o) => (o.commission_pct !== null ? `${Number(o.commission_pct)}%` : "—") },
    { k: "Suggested price score (of 30)", v: (o) => cmp.get(o.id)?.suggestedPriceScore ?? "—" },
    { k: `Score (pass mark ${PASS_MARK})`, v: (o) => { const r = result.get(o.id)!; const ok = r.canSelect && rState(o).cleared; return r.average === null ? <span className="text-muted">Not scored</span> : <><strong className={ok ? "text-ok" : ""}>{r.average}</strong> <span className="text-xs text-muted">({r.scores}){ok ? " · can be chosen" : ""}</span></>; } },
  ];

  const vatOf = (id: string) => offers.find((o) => o.id === id)!.vat_basis;
  const ownerOf = (id: string) => prof.get(offers.find((o) => o.id === id)!.user_id)?.legal_name ?? "—";
  const all = [...products].sort((a, b) => a.product_type.localeCompare(b.product_type) || (per100(a, vatOf(a.offer_id))?.value ?? 1e9) - (per100(b, vatOf(b.offer_id))?.value ?? 1e9));

  return (
    <div className="space-y-4">
      <p className="text-sm"><Link href="/admin/partners/offers?kind=manufacturer" className="underline">← FLAME Signature proposals</Link></p>
      <div>
        <h1 className="text-2xl font-extrabold text-primary">Compare {offers.length} FLAME Signature proposals</h1>
        <p className="text-sm text-muted">Toll prices have 12% VAT added where the manufacturer quoted without it, and are compared per 100 g or 100 ml for the same kind of product, so different pack sizes are fair. The suggested price score is only a guide: 30 for the lowest, less in proportion. A proposal can be chosen only with the score passed, the compliance gate passed and both reviews cleared.</p>
      </div>
      <PartnerMoneyNotice compact />
      {new Set(offers.map((o) => o.signature_category)).size > 1 && <Notice tone="warn">These proposals are for different kinds of products, so the prices may not be comparable.</Notice>}

      <ul className="space-y-3 lg:hidden" aria-label="Proposals compared">
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
        <SyncedTableScroll label="Proposals side by side">
          <table className="min-w-[900px] table-fixed text-left text-[15px]">
            <colgroup><col className="w-[240px]" />{offers.map((o) => <col key={o.id} className="w-[220px]" />)}</colgroup>
            <thead className="border-b border-line bg-bg-soft"><tr><th className="px-3 py-2">Proposal</th>{offers.map((o) => <th key={o.id} className="break-words px-3 py-2"><Link href={`/admin/partners/offers/${o.id}`} className="text-primary underline">{o.title ?? "(no name)"}</Link></th>)}</tr></thead>
            <tbody>{lines.map((l) => <tr key={l.k} className="border-b border-line align-top last:border-0"><th scope="row" className="px-3 py-2 text-sm font-semibold text-muted">{l.k}</th>{offers.map((o) => <td key={o.id} className="break-words px-3 py-2">{l.v(o)}</td>)}</tr>)}</tbody>
          </table>
        </SyncedTableScroll>
      </div>

      <section className="space-y-3" aria-labelledby="prods-h">
        <h2 id="prods-h" className="text-lg font-bold">Every product, lowest price per 100 g or ml first</h2>
        <ul className="space-y-2 lg:hidden">
          {all.map((p) => { const q = per100(p, vatOf(p.offer_id)); return (
            <li key={p.id} className="card p-3 text-sm">
              <p className="break-words font-bold">{p.product_name} <span className="font-normal text-muted">· {p.net_content}</span></p>
              <p className="text-muted">{ownerOf(p.offer_id)} · {PRODUCT_TYPES[p.product_type]}</p>
              <p><strong>{peso(unitCost(p, vatOf(p.offer_id)))}</strong> per unit with VAT{q ? ` · ${peso(q.value)} per 100 ${q.unit}` : ""}</p>
              <p className="text-muted">MOQ {p.moq.toLocaleString("en-PH")} · shelf life {p.shelf_life_months} months</p>
            </li>
          ); })}
        </ul>
        <div className="hidden lg:block">
          <SyncedTableScroll label="Products compared">
            <table className="min-w-[1000px] table-fixed text-left text-[15px]">
              <colgroup><col className="w-[220px]" /><col className="w-[170px]" /><col className="w-[120px]" /><col className="w-[110px]" /><col className="w-[120px]" /><col className="w-[90px]" /><col className="w-[90px]" /><col className="w-[110px]" /></colgroup>
              <thead className="border-b border-line bg-bg-soft"><tr>{["Product", "Manufacturer", "Kind", "Size", "Toll price with VAT", "Per 100 g/ml", "MOQ", "Shelf life"].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
              <tbody>
                {all.map((p) => { const q = per100(p, vatOf(p.offer_id)); return (
                  <tr key={p.id} className="border-b border-line align-top last:border-0">
                    <td className="break-words px-3 py-2"><strong>{p.product_name}</strong></td>
                    <td className="break-words px-3 py-2">{ownerOf(p.offer_id)}</td>
                    <td className="px-3 py-2">{PRODUCT_TYPES[p.product_type]}</td>
                    <td className="break-words px-3 py-2">{p.net_content}</td>
                    <td className="px-3 py-2 font-bold">{peso(unitCost(p, vatOf(p.offer_id)))}</td>
                    <td className="px-3 py-2">{q ? `${peso(q.value)} /${q.unit}` : "—"}</td>
                    <td className="px-3 py-2">{p.moq.toLocaleString("en-PH")}</td>
                    <td className="px-3 py-2">{p.shelf_life_months} mo</td>
                  </tr>
                ); })}
              </tbody>
            </table>
          </SyncedTableScroll>
        </div>
      </section>
    </div>
  );
}
