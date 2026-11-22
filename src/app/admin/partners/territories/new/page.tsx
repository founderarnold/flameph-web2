import Link from "next/link";
import { adminContext } from "@/lib/admin/guard";
import { Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { PartnerTabs } from "@/components/admin/PartnerTabs";
import { PRODUCT_GROUPS } from "@/lib/offers";
import { APPOINT_RULE, PARTNER_KINDS, RIGHTS, type PartnerKind } from "@/lib/territory";
import { createAppointment } from "../actions";

export const metadata = { title: "New territory appointment", robots: { index: false } };

const ERR: Record<string, string> = {
  partner: "Choose the partner and what they are appointed as.", own: "You cannot appoint yourself. Another member of the national team must do it.",
  not_accredited: "That partner is not accredited in this category. Approve their partner application first.",
  category: "Choose a product group, or type the category name (at least 2 letters).", parent: "The main appointment must be active and must not itself be a sub-partner.",
  same_partner: "A partner cannot be its own sub-partner.",
};

/** Step 1 of an appointment: who, as what, and for which category. The rest is filled in on the draft. */
export default async function NewAppointment({ searchParams }: { searchParams: Promise<{ parent?: string; nomination?: string; offer?: string; error?: string; m?: string }> }) {
  const sp = await searchParams;
  const ctx = await adminContext(["super_admin", "admin", "national_reviewer"]);
  const isId = (v?: string) => !!v && /^[0-9a-f-]{36}$/i.test(v);
  const [{ data: profs }, { data: parent }, { data: nomination }, { data: offers }] = await Promise.all([
    ctx.db.from("partner_profiles").select("user_id, legal_name, categories").eq("status", "accredited").order("legal_name").limit(500),
    isId(sp.parent) ? ctx.db.from("territorial_appointments").select("id, partner_user_id, category_label, status, parent_id").eq("id", sp.parent!).maybeSingle() : Promise.resolve({ data: null }),
    isId(sp.nomination) ? ctx.db.from("territory_nominations").select("id, nominee_name, nominee_contact, nominee_phone, nominee_email, proposed_area, reason, status").eq("id", sp.nomination!).maybeSingle() : Promise.resolve({ data: null }),
    ctx.db.from("supplier_offers").select("id, user_id, title, product_group").eq("status", "selected").limit(300),
  ]);
  const partners = ((profs ?? []) as { user_id: string; legal_name: string; categories: PartnerKind[] }[]).filter((p) => p.user_id !== ctx.user.id && p.user_id !== parent?.partner_user_id);
  const { data: parentName } = parent ? await ctx.db.from("partner_profiles").select("legal_name").eq("user_id", parent.partner_user_id).maybeSingle() : { data: null };
  const err = sp.error === "db" ? sp.m ?? "That didn't go through." : sp.error ? ERR[sp.error] ?? "That didn't go through." : null;

  return (
    <div className="max-w-3xl space-y-4">
      <PartnerTabs current="territories" />
      <nav aria-label="Breadcrumb" className="text-sm text-muted"><Link href="/admin/partners/territories" className="underline">Territories</Link> › New appointment</nav>
      <h1 className="text-2xl font-extrabold text-primary">{parent ? "New sub-partner appointment" : "New territory appointment"}</h1>
      <p className="text-sm text-muted">{APPOINT_RULE.en} It starts as a draft only the national team sees. You add the areas, channels, dates and targets next, check for overlaps, then approve.</p>
      {err && <div role="alert"><Notice tone="danger">{err}</Notice></div>}

      {parent && (
        <Notice tone="info">Under the main appointment of <strong>{parentName?.legal_name ?? "—"}</strong> for {parent.category_label}{parent.status !== "active" ? " (not active: it cannot take sub-partners now)" : ""}. The sub-partner gets the same category and rights, and its areas, channels and dates must stay inside the main appointment.</Notice>
      )}
      {nomination && (
        <section className="card space-y-1 p-4 text-[15px]" aria-labelledby="nom-h">
          <h2 id="nom-h" className="font-bold">Nominated sub-partner</h2>
          <p><strong>{nomination.nominee_name}</strong> · {nomination.nominee_contact} · {[nomination.nominee_phone, nomination.nominee_email].filter(Boolean).join(" · ")}</p>
          <p className="text-muted">Proposed area: {nomination.proposed_area}</p>
          <p className="text-muted">Why: {nomination.reason}</p>
          <p className="text-sm">Only an accredited partner can be appointed. If they are not in the list below, ask them to apply at /partner-us first; you can come back to this nomination later.</p>
        </section>
      )}

      {partners.length === 0 ? <Notice tone="info">No accredited partners yet. Approve a partner application first (Admin › Partners › Applications).</Notice> : (
        <form action={createAppointment} className="card space-y-4 p-4 sm:p-5">
          {parent && <input type="hidden" name="parent_id" value={parent.id} />}
          {nomination && <input type="hidden" name="nomination_id" value={nomination.id} />}
          <div className="field">
            <label htmlFor="partner" className="label">Accredited partner</label>
            <select id="partner" name="partner" required className="input" defaultValue="">
              <option value="" disabled>Choose the partner</option>
              {partners.map((p) => <option key={p.user_id} value={p.user_id}>{p.legal_name} ({p.categories.map((c) => PARTNER_KINDS[c]).join(", ")})</option>)}
            </select>
          </div>
          <fieldset>
            <legend className="label">Appointed as</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {(Object.keys(PARTNER_KINDS) as PartnerKind[]).map((k, i) => (
                <label key={k} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
                  <input type="radio" name="partner_category" value={k} required defaultChecked={i === 0} className="check" /><span className="font-semibold">{PARTNER_KINDS[k]}</span>
                </label>
              ))}
            </div>
            <p className="field-help">The partner must be accredited in this category.</p>
          </fieldset>
          {!parent && <>
            <div className="field">
              <label htmlFor="group" className="label">Product or service category</label>
              <select id="group" name="group" className="input" defaultValue="">
                <option value="">Type the name below instead</option>
                {Object.entries(PRODUCT_GROUPS).filter(([k]) => k !== "other").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <p className="field-help">Use the same product groups as Best Offers, so overlaps are caught. For services, or anything not in the list, type the name below.</p>
            </div>
            <div className="field">
              <label htmlFor="category_name" className="label">Category name (services and other products)</label>
              <input id="category_name" name="category_name" maxLength={150} className="input" placeholder="e.g. Bookkeeping services; Rice milling; Coffee beans" />
            </div>
            <fieldset>
              <legend className="label">Rights (toll manufacturers only)</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {(Object.keys(RIGHTS) as (keyof typeof RIGHTS)[]).map((k) => (
                  <label key={k} className="flex min-h-11 cursor-pointer items-start gap-2 rounded-xl border border-line px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
                    <input type="radio" name="rights" value={k} defaultChecked={k === "distribution"} className="check mt-1" /><span><span className="block font-semibold">{RIGHTS[k].label}</span><span className="block text-sm text-muted">{RIGHTS[k].help}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>
            {(offers ?? []).length > 0 && (
              <div className="field">
                <label htmlFor="offer_id" className="label">Chosen Best Offer behind it (optional)</label>
                <select id="offer_id" name="offer_id" className="input" defaultValue={isId(sp.offer) ? sp.offer : ""}>
                  <option value="">None</option>
                  {(offers ?? []).map((o) => <option key={o.id} value={o.id}>{o.title ?? "(no name)"}{o.product_group ? ` · ${PRODUCT_GROUPS[o.product_group as keyof typeof PRODUCT_GROUPS]}` : ""}</option>)}
                </select>
              </div>
            )}
          </>}
          <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Starting…">Start the draft</SubmitButton>
        </form>
      )}
    </div>
  );
}
