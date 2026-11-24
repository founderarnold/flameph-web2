import Link from "next/link";
import { notFound } from "next/navigation";
import { adminContext } from "@/lib/admin/guard";
import { Notice } from "@/components/ui";
import { PartnerTabs } from "@/components/admin/PartnerTabs";
import { SubmitButton } from "@/components/SubmitButton";
import { LICENCE_COLS, LICENCE_STATUS, SIGNATURE_ADMIN_ERRORS, SIGNATURE_DONE, type LicenceRow } from "@/lib/signature";
import { licenceStatus, saveLicence, signatureNote } from "../../actions";

export const metadata = { title: "FLAME Signature licence", robots: { index: false } };

type Appt = { id: string; partner_user_id: string; category_label: string; rights: string; status: string; start_date: string | null; end_date: string | null; exclusivity: string };
type Hist = { id: string; action: string; note: string | null; internal: boolean; actor_id: string | null; created_at: string };
const day = (s: string | null) => (s ? new Date(`${s}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" }) : "—");
const when = (s: string) => new Date(s).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });
const today = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
const TONE = { ok: "bg-ok-soft text-ok", info: "bg-primary-soft text-primary", warn: "bg-warn-soft text-warn", danger: "bg-danger-soft text-danger" } as const;
const MOVES: Record<string, [string, string][]> = {
  draft: [["active", "Activate the licence"], ["cancelled", "Cancel the draft"]],
  active: [["suspended", "Suspend"], ["ended", "End the licence"]],
  suspended: [["active", "Reactivate"], ["ended", "End the licence"]],
};

/** One FLAME Signature licence: products (approved only), plants, manufacturing and distribution rights chosen
 *  separately, dates and terms while a draft; activation, suspension and ending; history and team notes. */
export default async function LicencePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string; error?: string; m?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await adminContext(["super_admin", "admin", "national_reviewer"]);
  const [{ data }, { data: histRows }] = await Promise.all([
    ctx.db.from("signature_licences").select(`${LICENCE_COLS}, internal_note`).eq("id", id).maybeSingle(),
    ctx.db.from("signature_history").select("id, action, note, internal, actor_id, created_at").eq("licence_id", id).order("created_at", { ascending: false }).limit(100),
  ]);
  if (!data) notFound();
  const l = data as unknown as LicenceRow & { internal_note: string | null };
  const draft = l.status === "draft";
  const APPT = "id, partner_user_id, category_label, rights, status, start_date, end_date, exclusivity";
  const chosen = [...l.mfg_appointment_ids, ...l.dist_appointment_ids];
  const [{ data: prods }, { data: sites }, { data: open }, { data: picked }] = await Promise.all([
    l.offer_id ? ctx.db.from("signature_products").select("id, product_name, net_content, approval, site_id").eq("offer_id", l.offer_id).order("position") : Promise.resolve({ data: [] }),
    l.offer_id ? ctx.db.from("signature_sites").select("id, site_name, place_label, lto_no, lto_valid_until").eq("offer_id", l.offer_id).order("position") : Promise.resolve({ data: [] }),
    // Active rights that can be chosen: every distribution appointment, and this manufacturer's manufacturing ones.
    draft ? ctx.db.from("territorial_appointments").select(APPT).eq("status", "active")
      .or(l.partner_user_id ? `rights.eq.distribution,partner_user_id.eq.${l.partner_user_id}` : "rights.eq.distribution").order("created_at", { ascending: false }).limit(300)
      : Promise.resolve({ data: [] }),
    chosen.length ? ctx.db.from("territorial_appointments").select(APPT).in("id", chosen) : Promise.resolve({ data: [] }),
  ]);
  const appts = [...new Map([...(picked ?? []), ...(open ?? [])].map((a) => [a.id, a])).values()];
  const products = (prods ?? []) as { id: string; product_name: string; net_content: string; approval: string; site_id: string | null }[];
  const plants = (sites ?? []) as { id: string; site_name: string; place_label: string; lto_no: string | null; lto_valid_until: string | null }[];
  const all = (appts ?? []) as Appt[];
  const mfg = all.filter((a) => a.rights === "manufacturing" && (a.partner_user_id === l.partner_user_id || l.mfg_appointment_ids.includes(a.id)));
  const dist = all.filter((a) => a.rights === "distribution");
  const apptIds = all.map((a) => a.id);
  const [{ data: areaRows }, { data: profs }] = apptIds.length ? await Promise.all([
    ctx.db.from("territory_areas").select("appointment_id, label").in("appointment_id", apptIds),
    ctx.db.from("partner_profiles").select("user_id, legal_name").in("user_id", [...new Set(all.map((a) => a.partner_user_id))]),
  ]) : [{ data: [] }, { data: [] }];
  const areasOf = (aid: string) => (areaRows ?? []).filter((a) => a.appointment_id === aid).map((a) => a.label as string).join(", ") || "—";
  const nameOf = new Map((profs ?? []).map((p) => [p.user_id, p.legal_name as string]));
  const hist = (histRows ?? []) as Hist[];
  const people = [...new Set(hist.map((h) => h.actor_id).filter(Boolean) as string[])];
  const { data: names } = people.length ? await ctx.db.from("profiles").select("id, full_name").in("id", people) : { data: [] };
  const who = new Map((names ?? []).map((p) => [p.id, p.full_name as string]));
  const own = l.partner_user_id === ctx.user.id;
  const err = sp.error === "db" && sp.m ? `The database refused: ${sp.m}.` : sp.error ? SIGNATURE_ADMIN_ERRORS[sp.error] ?? SIGNATURE_ADMIN_ERRORS.failed : null;
  const done = sp.done === "note" ? "Note saved (team only)." : sp.done ? SIGNATURE_DONE[sp.done] : null;
  const Check = ({ name, value, on, children, disabled }: { name: string; value: string; on: boolean; children: React.ReactNode; disabled?: boolean }) => (
    <label className={`flex min-h-11 items-start gap-2 rounded-xl border border-line px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-primary-soft ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <input type="checkbox" name={name} value={value} defaultChecked={on} disabled={disabled} className="check mt-0.5" /><span className="min-w-0 break-words text-[15px]">{children}</span>
    </label>
  );

  return (
    <div className="space-y-4">
      <PartnerTabs current="signature" />
      <p className="text-sm"><Link href="/admin/partners/signature" className="underline">← FLAME Signature</Link></p>
      <header>
        <p className="text-xs font-bold uppercase text-muted">FLAME Signature licence · {l.ref_no}</p>
        <h1 className="break-words text-2xl font-extrabold text-primary">{l.partner_name}</h1>
        <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-sm font-bold ${TONE[LICENCE_STATUS[l.status].tone]}`}>{LICENCE_STATUS[l.status].label}</span>
        {l.offer_id && <p className="mt-1 text-sm"><Link href={`/admin/partners/offers/${l.offer_id}`} className="underline">Open the proposal</Link></p>}
      </header>
      {done && <Notice tone="ok">{done}</Notice>}
      {err && <Notice tone="danger">{err}</Notice>}
      {own && <Notice tone="warn">{SIGNATURE_ADMIN_ERRORS.own}</Notice>}
      {l.status_reason && l.status !== "active" && <Notice tone="warn">Reason: {l.status_reason}</Notice>}

      <form action={saveLicence} className="card space-y-5 p-4 sm:p-6">
        <input type="hidden" name="id" value={l.id} />
        {!draft && <p className="text-sm text-muted">An active licence cannot be changed. To change it, end it and make a new one. You can still update the team note.</p>}
        <fieldset className="space-y-2">
          <legend className="text-lg font-bold">Products (approved only)</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {products.map((p) => <Check key={p.id} name="product_ids" value={p.id} on={l.product_ids.includes(p.id)} disabled={!draft || p.approval !== "approved"}>{p.product_name} <span className="text-muted">· {p.net_content}{p.approval !== "approved" ? " · not approved" : ""}</span></Check>)}
          </div>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="text-lg font-bold">Plants</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {plants.map((s) => <Check key={s.id} name="site_ids" value={s.id} on={l.site_ids.includes(s.id)} disabled={!draft}>{s.site_name} <span className="text-muted">· {s.place_label} · {s.lto_no ? `FDA LTO to ${day(s.lto_valid_until)}${(s.lto_valid_until ?? "") < today() ? " (EXPIRED)" : ""}` : "no FDA LTO"}</span></Check>)}
          </div>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="text-lg font-bold">Manufacturing rights <span className="text-sm font-normal text-muted">(where this manufacturer may make the products)</span></legend>
          {mfg.length === 0 ? <p className="text-sm text-muted">This manufacturer has no active manufacturing appointment. <Link href="/admin/partners/territories/new" className="underline">Make one in Territories</Link> (rights: manufacturing).</p> : (
            <div className="grid gap-2">{mfg.map((a) => <Check key={a.id} name="mfg_appointment_ids" value={a.id} on={l.mfg_appointment_ids.includes(a.id)} disabled={!draft}>{a.category_label} <span className="text-muted">· {areasOf(a.id)} · {day(a.start_date)} to {day(a.end_date)}</span></Check>)}</div>
          )}
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="text-lg font-bold">Distribution rights <span className="text-sm font-normal text-muted">(where products under the mark may be sold; separate from making)</span></legend>
          {dist.length === 0 ? <p className="text-sm text-muted">No active distribution appointment yet. <Link href="/admin/partners/territories/new" className="underline">Make one in Territories</Link> (rights: distribution).</p> : (
            <div className="grid gap-2">{dist.map((a) => <Check key={a.id} name="dist_appointment_ids" value={a.id} on={l.dist_appointment_ids.includes(a.id)} disabled={!draft}>{nameOf.get(a.partner_user_id) ?? "—"}: {a.category_label} <span className="text-muted">· {areasOf(a.id)} · {a.exclusivity === "exclusive" ? "exclusive" : "non-exclusive"} · to {day(a.end_date)}</span></Check>)}</div>
          )}
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="field"><label htmlFor="start_date" className="label">Start date</label><input id="start_date" name="start_date" type="date" defaultValue={l.start_date ?? ""} disabled={!draft} className="input" /></div>
          <div className="field"><label htmlFor="end_date" className="label">End date (up to 10 years)</label><input id="end_date" name="end_date" type="date" defaultValue={l.end_date ?? ""} disabled={!draft} className="input" /></div>
        </div>
        <div className="field"><label htmlFor="terms_note" className="label">Terms the manufacturer sees</label><textarea id="terms_note" name="terms_note" rows={3} maxLength={2000} defaultValue={l.terms_note ?? ""} disabled={!draft} className="input" placeholder="e.g. Label artwork v2 approved 2026-11-20. Use the mark only on the 250 ml bottle." /></div>
        <div className="field"><label htmlFor="internal_note" className="label">Team note (the manufacturer never sees it)</label><textarea id="internal_note" name="internal_note" rows={2} maxLength={2000} defaultValue={l.internal_note ?? ""} className="input" /></div>
        {!own && <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Saving…">Save</SubmitButton>}
      </form>

      {!own && MOVES[l.status] && (
        <section id="status" className="card scroll-mt-24 space-y-3 border-2 border-primary p-4" aria-labelledby="st-h">
          <h2 id="st-h" className="text-lg font-bold">Status</h2>
          {draft && <p className="text-sm text-muted">Activating checks everything again: the proposal is chosen with both reviews cleared, every product is approved, every plant has a current FDA License to Operate where needed and is inside a manufacturing right, every right is active and covers the dates, and the manufacturer is accredited and not on hold.</p>}
          <form action={licenceStatus} className="space-y-3">
            <input type="hidden" name="id" value={l.id} />
            <fieldset className="grid gap-2 sm:grid-cols-2">
              <legend className="sr-only">Change to</legend>
              {MOVES[l.status].map(([v, t]) => <label key={v} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-primary-soft"><input type="radio" name="to" value={v} required className="check" /><span className="font-semibold">{t}</span></label>)}
            </fieldset>
            <div className="field"><label htmlFor="reason" className="label">Reason (needed to suspend, end or cancel)</label><textarea id="reason" name="reason" rows={2} maxLength={1000} className="input" /></div>
            <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Saving…">Save status</SubmitButton>
          </form>
        </section>
      )}

      <section id="history" className="card scroll-mt-24 space-y-3 p-4" aria-labelledby="h-h">
        <h2 id="h-h" className="text-lg font-bold">History</h2>
        {hist.length === 0 ? <p className="text-sm text-muted">Nothing yet.</p> : (
          <ol className="space-y-2 text-sm">
            {hist.map((h) => (
              <li key={h.id} className="border-l-2 border-line pl-3">
                <span className="font-semibold">{h.action.replace("_", " ")}</span>{h.internal && <span className="ml-1 rounded bg-bg-soft px-1 text-xs">team only</span>}
                <span className="text-muted"> · {when(h.created_at)}{h.actor_id ? ` · ${who.get(h.actor_id) ?? "Team member"}` : ""}</span>
                {h.note && <span className="block whitespace-pre-line break-words">{h.note}</span>}
              </li>
            ))}
          </ol>
        )}
        <form action={signatureNote} className="space-y-2 border-t border-line pt-3">
          <input type="hidden" name="licence_id" value={l.id} />
          <label htmlFor="tnote" className="label text-sm">Add a note for the national team</label>
          <textarea id="tnote" name="note" required maxLength={2000} rows={2} className="input" />
          <SubmitButton className="btn btn-outline min-h-11 w-full sm:w-auto" pendingText="Saving…">Save note</SubmitButton>
        </form>
      </section>
    </div>
  );
}
