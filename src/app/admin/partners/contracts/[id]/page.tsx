import Link from "next/link";
import { notFound } from "next/navigation";
import { adminContext } from "@/lib/admin/guard";
import { Notice } from "@/components/ui";
import { PartnerTabs } from "@/components/admin/PartnerTabs";
import { PartnerMoneyNotice } from "@/components/PartnerMoneyNotice";
import { SubmitButton } from "@/components/SubmitButton";
import { DEFAULT_TARGETS } from "@/lib/commission";
import { buildContract } from "@/lib/contracts-server";
import {
  AUTHORITY, CHECK_ITEMS, CONTRACT_CATEGORIES, CONTRACT_COLS, CONTRACT_DONE, CONTRACT_ERRORS, CONTRACT_FILE_TYPES, CONTRACT_STATUS, ESIGN_CONSENT,
  AUTHORITY_CONFIRM, REG_TYPES, contractMissing, daysLeft, renewalState, shortHash, type ContractRow,
} from "@/lib/contracts";
import {
  contractNote, contractStatus, deleteContractFile, flameSign, legalCheck, recordWetInk, returnToDraft, saveContract, sendContract, startPenalty, startRate,
  uploadContractFile, createContract,
} from "../actions";

export const metadata = { title: "Partner contract", robots: { index: false } };

const day = (s: string | null) => (s ? new Date(`${s.slice(0, 10)}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" }) : "—");
const when = (s: string) => new Date(s).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });
const manila = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
const TONE = { ok: "bg-ok-soft text-ok", info: "bg-primary-soft text-primary", warn: "bg-warn-soft text-warn", danger: "bg-danger-soft text-danger" } as const;
const KIND = { supplier: "supplier", service_provider: "service", toll_manufacturer: "manufacturer" } as const;
type Check = { id: string; revision: number; outcome: string; checklist: string[]; note: string; reviewer_id: string | null; created_at: string };
type Sig = { id: string; revision: number; side: string; method: string; signer_name: string; signer_position: string; typed_name: string | null; body_sha256: string; signed_on: string | null; ip: string | null; user_agent: string | null; signed_at: string; document_id: string | null; signer_user_id: string | null; recorded_by: string | null };
type Hist = { id: string; action: string; note: string | null; internal: boolean; actor_id: string | null; created_at: string };
type Doc = { id: string; doc_type: string; file_name: string; size_bytes: number; uploaded_at: string };

/** One partner contract for the national team: details while a draft, the legal check of this version, the full text
 *  (live preview, or the frozen text once sent), sending, signatures (wet ink, or the founder's e-signature), files,
 *  ending or renewal, and the history. */
export default async function ContractPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string; error?: string; m?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await adminContext(["super_admin", "admin", "national_reviewer"]);
  const [{ data }, { data: checkRows }, { data: sigRows }, { data: histRows }, { data: docRows }, { data: es }] = await Promise.all([
    ctx.db.from("partner_contracts").select(`${CONTRACT_COLS}, internal_note`).eq("id", id).maybeSingle(),
    ctx.db.from("partner_contract_checks").select("id, revision, outcome, checklist, note, reviewer_id, created_at").eq("contract_id", id).order("created_at", { ascending: false }).limit(50),
    ctx.db.from("partner_contract_signatures").select("id, revision, side, method, signer_name, signer_position, typed_name, body_sha256, signed_on, ip, user_agent, signed_at, document_id, signer_user_id, recorded_by").eq("contract_id", id).order("signed_at"),
    ctx.db.from("partner_contract_history").select("id, action, note, internal, actor_id, created_at").eq("contract_id", id).order("created_at", { ascending: false }).limit(200),
    ctx.db.from("vetting_documents").select("id, doc_type, file_name, size_bytes, uploaded_at").eq("contract_id", id).eq("purpose", "contract").is("deleted_at", null).order("uploaded_at"),
    ctx.db.from("settings").select("value").eq("key", "contract_esign").maybeSingle(),
  ]);
  if (!data) notFound();
  const c = data as unknown as ContractRow & { internal_note: string | null };
  const draft = c.status === "draft";
  const own = c.partner_user_id === ctx.user.id;
  const founder = ctx.roles.includes("super_admin");
  const esignOn = !!(es?.value as { enabled?: boolean } | null)?.enabled;
  const checks = (checkRows ?? []) as Check[];
  const sigs = (sigRows ?? []) as Sig[];
  const hist = (histRows ?? []) as Hist[];
  const docs = (docRows ?? []) as Doc[];
  const latest = checks.find((k) => k.revision === c.revision);
  const cleared = latest?.outcome === "cleared";
  const missing = draft ? contractMissing(c) : [];
  const built = draft ? await buildContract(ctx.db, c) : null;
  const text = draft ? built!.text : c.body ?? "";
  const today = manila();
  const rs = renewalState(c, today);

  // Choices while a draft: the partner's chosen offers, licences and territories in this category.
  const [{ data: offers }, { data: lics }, { data: appts }] = draft && c.partner_user_id ? await Promise.all([
    ctx.db.from("supplier_offers").select("id, title, status").eq("user_id", c.partner_user_id).eq("kind", KIND[c.category]).in("status", ["selected"]).order("decided_at", { ascending: false }),
    c.category === "toll_manufacturer" ? ctx.db.from("signature_licences").select("id, ref_no, status, start_date, end_date").eq("partner_user_id", c.partner_user_id).neq("status", "cancelled").order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    ctx.db.from("territorial_appointments").select("id, category_label, rights, exclusivity, status, start_date, end_date").eq("partner_user_id", c.partner_user_id).eq("partner_category", c.category).in("status", ["draft", "active", "suspended"]).order("created_at", { ascending: false }),
  ]) : [{ data: [] }, { data: [] }, { data: [] }];
  const people = [...new Set([...hist.map((h) => h.actor_id), ...checks.map((k) => k.reviewer_id)].filter(Boolean) as string[])];
  const { data: names } = people.length ? await ctx.db.from("profiles").select("id, full_name").in("id", people) : { data: [] };
  const who = new Map((names ?? []).map((p) => [p.id, p.full_name as string]));
  const err = sp.error === "db" && sp.m ? `The database refused: ${sp.m}.` : sp.error ? CONTRACT_ERRORS[sp.error] ?? CONTRACT_ERRORS.failed : null;
  const done = sp.done ? CONTRACT_DONE[sp.done] : null;
  const dflt = DEFAULT_TARGETS[c.category];
  const dis = !draft || own;
  const F = ({ id: fid, label, children, help }: { id: string; label: string; children: React.ReactNode; help?: string }) => (
    <div className="field"><label htmlFor={fid} className="label">{label}</label>{children}{help && <p className="field-help">{help}</p>}</div>
  );
  const signedCopies = docs.filter((d) => d.doc_type === "signed_contract");
  const nextSide = c.status === "out_for_signing" ? "partner" : c.status === "partner_signed" ? "flame" : null;

  return (
    <div className="space-y-4">
      <PartnerTabs current="contracts" />
      <p className="text-sm"><Link href="/admin/partners/contracts" className="underline">← Contracts</Link></p>
      <header>
        <p className="text-xs font-bold uppercase text-muted">Contract {c.ref_no} · version {c.revision} · {CONTRACT_CATEGORIES[c.category]}</p>
        <h1 className="break-words text-2xl font-extrabold text-primary">{c.partner_name}</h1>
        <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-sm font-bold ${TONE[CONTRACT_STATUS[c.status].tone]}`}>{CONTRACT_STATUS[c.status].label}</span>
        <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {c.offer_id && <Link href={`/admin/partners/offers/${c.offer_id}`} className="underline">Open the Best Offer</Link>}
          {c.licence_id && <Link href={`/admin/partners/signature/licences/${c.licence_id}`} className="underline">Open the licence</Link>}
          {c.renews_id && <Link href={`/admin/partners/contracts/${c.renews_id}`} className="underline">Contract it renews</Link>}
          {c.body && <a href={`/api/contracts/${c.id}/copy`} className="underline">Download a copy (text)</a>}
        </p>
      </header>
      {done && <div role="status"><Notice tone="ok">{done}</Notice></div>}
      {err && <div role="alert"><Notice tone="danger">{err}</Notice></div>}
      {own && <Notice tone="warn">{CONTRACT_ERRORS.own}</Notice>}
      {c.status_reason && <Notice tone="warn">{draft ? "Why it came back to draft" : "Reason"}: {c.status_reason}</Notice>}
      {rs === "due" && c.end_date && <Notice tone="warn">This contract ends in {daysLeft(c.end_date, today)} day(s). Prepare the renewal below; nothing renews by itself.</Notice>}
      {rs === "expired" && <Notice tone="danger">The end date has passed. Renew it or mark it ended.</Notice>}
      {draft && missing.length > 0 && <Notice tone="info">Still missing: {missing.join("; ")}.</Notice>}

      <form id="details" action={saveContract} className="card scroll-mt-24 space-y-5 p-4 sm:p-6">
        <input type="hidden" name="id" value={c.id} />
        {!draft && <p className="text-sm text-muted">A sent or signed contract cannot be changed. To change one that is not signed yet, take it back to draft (a new version). You can still update the team note.</p>}
        <fieldset className="space-y-3">
          <legend className="text-lg font-bold">The partner, as a legal party</legend>
          <F id="partner_name" label="Legal name"><input id="partner_name" name="partner_name" defaultValue={c.partner_name} maxLength={200} disabled={dis} className="input" /></F>
          <div className="grid gap-3 sm:grid-cols-2">
            <F id="party_reg_type" label="Registration"><select id="party_reg_type" name="party_reg_type" defaultValue={c.party_reg_type ?? ""} disabled={dis} className="input"><option value="">Choose…</option>{Object.entries(REG_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></F>
            <F id="party_reg_no" label="Registration number"><input id="party_reg_no" name="party_reg_no" defaultValue={c.party_reg_no ?? ""} maxLength={60} disabled={dis} className="input" /></F>
          </div>
          <F id="party_address" label="Business address"><input id="party_address" name="party_address" defaultValue={c.party_address ?? ""} maxLength={300} disabled={dis} className="input" /></F>
        </fieldset>
        <fieldset className="space-y-3">
          <legend className="text-lg font-bold">The partner&apos;s signatory</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <F id="signatory_name" label="Full name" help="The partner types this exact name to sign electronically."><input id="signatory_name" name="signatory_name" defaultValue={c.signatory_name ?? ""} maxLength={120} disabled={dis} className="input" /></F>
            <F id="signatory_position" label="Position"><input id="signatory_position" name="signatory_position" defaultValue={c.signatory_position ?? ""} maxLength={120} disabled={dis} className="input" /></F>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <F id="signatory_authority" label="Authority to sign"><select id="signatory_authority" name="signatory_authority" defaultValue={c.signatory_authority ?? ""} disabled={dis} className="input"><option value="">Choose…</option>{Object.entries(AUTHORITY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></F>
            <F id="authority_ref" label="Reference of the authority" help="e.g. Board Resolution No. 2026-05, 3 Nov 2026. Upload it under Files."><input id="authority_ref" name="authority_ref" defaultValue={c.authority_ref ?? ""} maxLength={200} disabled={dis} className="input" /></F>
          </div>
          <F id="signatory_email" label="Signatory's email (optional)"><input id="signatory_email" name="signatory_email" type="email" defaultValue={c.signatory_email ?? ""} maxLength={200} disabled={dis} className="input" /></F>
        </fieldset>
        <fieldset className="space-y-3">
          <legend className="text-lg font-bold">FLAME&apos;s signatory (for MarketplacePH Online Store)</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <F id="flame_signatory_name" label="Full name" help="Only the founder can sign for FLAME."><input id="flame_signatory_name" name="flame_signatory_name" defaultValue={c.flame_signatory_name ?? ""} maxLength={120} disabled={dis} className="input" /></F>
            <F id="flame_signatory_position" label="Position"><input id="flame_signatory_position" name="flame_signatory_position" defaultValue={c.flame_signatory_position ?? ""} maxLength={120} disabled={dis} className="input" /></F>
          </div>
        </fieldset>
        <fieldset className="space-y-3">
          <legend className="text-lg font-bold">What it is based on</legend>
          {c.category !== "toll_manufacturer" || (offers ?? []).length > 0 ? (
            <F id="offer_id" label="Chosen Best Offer">
              <select id="offer_id" name="offer_id" defaultValue={c.offer_id ?? ""} disabled={dis} className="input">
                <option value="">None</option>
                {draft ? (offers ?? []).map((o) => <option key={o.id} value={o.id}>{o.title ?? "(no name)"}</option>) : c.offer_id && <option value={c.offer_id}>{(offers ?? []).find((o) => o.id === c.offer_id)?.title ?? "Linked offer"}</option>}
              </select>
            </F>
          ) : null}
          {c.category === "toll_manufacturer" && (
            <F id="licence_id" label="FLAME Signature licence">
              <select id="licence_id" name="licence_id" defaultValue={c.licence_id ?? ""} disabled={dis} className="input">
                <option value="">None yet</option>
                {draft ? (lics ?? []).map((l) => <option key={l.id} value={l.id}>{l.ref_no} · {l.status} · {day(l.start_date)} to {day(l.end_date)}</option>) : c.licence_id && <option value={c.licence_id}>Linked licence</option>}
              </select>
            </F>
          )}
          <div className="space-y-2">
            <p className="label">Territories (Annex A)</p>
            {draft && (appts ?? []).length === 0 && <p className="text-sm text-muted">No territorial appointment in this category. Annex A will say the offer is non-exclusive. <Link href="/admin/partners/territories/new" className="underline">Make one in Territories</Link>.</p>}
            <div className="grid gap-2">
              {(draft ? appts ?? [] : []).map((a) => (
                <label key={a.id} className="flex min-h-11 cursor-pointer items-start gap-2 rounded-xl border border-line px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
                  <input type="checkbox" name="appointment_ids" value={a.id} defaultChecked={c.appointment_ids.includes(a.id)} disabled={dis} className="check mt-0.5" />
                  <span className="min-w-0 break-words text-[15px]">{a.category_label} <span className="text-muted">· {a.rights} · {a.exclusivity === "exclusive" ? "exclusive" : "non-exclusive"} · {a.status} · {day(a.start_date)} to {day(a.end_date)}</span></span>
                </label>
              ))}
              {!draft && <p className="text-sm text-muted">{c.appointment_ids.length} territorial appointment(s), listed in Annex A of the text below.</p>}
            </div>
          </div>
        </fieldset>
        <fieldset id="terms" className="scroll-mt-24 space-y-3">
          <legend className="text-lg font-bold">Terms</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <F id="effective_date" label="Start date"><input id="effective_date" name="effective_date" type="date" defaultValue={c.effective_date ?? ""} disabled={dis} className="input" /></F>
            <F id="end_date" label="End date (up to 5 years)"><input id="end_date" name="end_date" type="date" defaultValue={c.end_date ?? ""} disabled={dis} className="input" /></F>
            <F id="renewal_notice_days" label="Renewal reminder (days before the end)"><input id="renewal_notice_days" name="renewal_notice_days" type="number" min={30} max={180} defaultValue={c.renewal_notice_days} disabled={dis} className="input" /></F>
          </div>
          <p className="label">Commission split agreed (% of qualified, collected net sales)</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(["national_pct", "regional_pct", "provincial_pct", "city_pct"] as const).map((k) => (
              <F key={k} id={k} label={{ national_pct: "National", regional_pct: "Regional", provincial_pct: "Provincial", city_pct: "City or municipal" }[k]}>
                <input id={k} name={k} inputMode="decimal" defaultValue={c[k] ?? ""} placeholder={String(dflt[k])} disabled={dis} className="input" />
              </F>
            ))}
          </div>
          <p className="field-help">Leave all four empty to use the program default for this category ({dflt.national_pct}/{dflt.regional_pct}/{dflt.provincial_pct}/{dflt.city_pct}). A target, not a guaranteed payout.</p>
          <PartnerMoneyNotice compact />
          <div className="grid gap-3 sm:grid-cols-2">
            <F id="late_rate_pct_per_day" label="Late-delivery penalty, % per day (proposed)"><input id="late_rate_pct_per_day" name="late_rate_pct_per_day" inputMode="decimal" defaultValue={c.late_rate_pct_per_day ?? ""} placeholder="0.5" disabled={dis} className="input" /></F>
            <F id="late_cap_pct" label="Penalty cap, % (proposed)"><input id="late_cap_pct" name="late_cap_pct" inputMode="decimal" defaultValue={c.late_cap_pct ?? ""} placeholder="5" disabled={dis} className="input" /></F>
          </div>
          <p className="field-help">Leave both empty to use the default penalty terms in force. Penalty clauses need a lawyer&apos;s review.</p>
          <F id="special_terms" label="Special terms (part of the contract text)"><textarea id="special_terms" name="special_terms" rows={3} maxLength={4000} defaultValue={c.special_terms ?? ""} disabled={dis} className="input" /></F>
        </fieldset>
        <F id="internal_note" label="Team note (the partner never sees it)"><textarea id="internal_note" name="internal_note" rows={2} maxLength={2000} defaultValue={c.internal_note ?? ""} disabled={own} className="input" /></F>
        {!own && <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Saving…">Save</SubmitButton>}
      </form>

      <section id="text" className="card scroll-mt-24 space-y-3 p-4 sm:p-6" aria-labelledby="text-h">
        <h2 id="text-h" className="text-lg font-bold">{draft ? "Contract text (preview of this version)" : "Contract text as sent (frozen)"}</h2>
        {draft && built!.missingParts.length > 0 && <Notice tone="warn">No template yet for: {built!.missingParts.join(", ")}. <Link href="/admin/partners/contracts/templates" className="underline">Templates</Link></Notice>}
        {draft && built!.draftParts.length > 0 && <Notice tone="warn">Preview only. These parts are drafts that no lawyer has reviewed yet, so the contract cannot be sent: {built!.draftParts.join(", ")}.</Notice>}
        {draft && built!.unfilled.length > 0 && <Notice tone="warn">Not filled in yet: {built!.unfilled.join("; ")}.</Notice>}
        {!draft && <p className="text-sm">Fingerprint (SHA-256): <code className="break-all text-xs">{c.body_sha256}</code>. Sent {c.sent_at ? when(c.sent_at) : "—"}.</p>}
        <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-bg-soft p-3 font-sans text-[14px] leading-6">{text || "—"}</pre>
      </section>

      <section id="check" className="card scroll-mt-24 space-y-3 p-4 sm:p-6" aria-labelledby="check-h">
        <h2 id="check-h" className="text-lg font-bold">Legal check (version {c.revision})</h2>
        <p className="text-sm text-muted">A person on the national team reads this version against the records and the lawyer-reviewed templates. It must clear before sending. Any change to the details after a check makes a new version that must be checked again.</p>
        {latest ? <Notice tone={cleared ? "ok" : "warn"}>{cleared ? "Cleared" : "Not cleared"} by {latest.reviewer_id ? who.get(latest.reviewer_id) ?? "a team member" : "—"} on {when(latest.created_at)}: {latest.note}</Notice> : <p className="text-sm">Not checked yet.</p>}
        {draft && !own && (
          <form action={legalCheck} className="space-y-3">
            <input type="hidden" name="id" value={c.id} />
            <fieldset className="grid gap-2">
              <legend className="sr-only">Check items</legend>
              {Object.entries(CHECK_ITEMS).map(([k, l]) => (
                <label key={k} className="flex min-h-11 cursor-pointer items-start gap-2 rounded-xl border border-line px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
                  <input type="checkbox" name="checklist" value={k} className="check mt-0.5" /><span className="text-[15px]">{l}</span>
                </label>
              ))}
            </fieldset>
            <fieldset className="grid gap-2 sm:grid-cols-2">
              <legend className="sr-only">Outcome</legend>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line px-3 has-[:checked]:border-primary has-[:checked]:bg-primary-soft"><input type="radio" name="outcome" value="cleared" required className="check" /><span className="font-semibold">Cleared</span></label>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line px-3 has-[:checked]:border-primary has-[:checked]:bg-primary-soft"><input type="radio" name="outcome" value="not_cleared" className="check" /><span className="font-semibold">Not cleared</span></label>
            </fieldset>
            <div className="field"><label htmlFor="cnote" className="label">Note</label><textarea id="cnote" name="note" required minLength={5} maxLength={2000} rows={2} className="input" placeholder="What you checked, or what must change." /></div>
            <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Saving…">Save the legal check</SubmitButton>
          </form>
        )}
        {checks.length > 1 && (
          <details className="text-sm"><summary className="cursor-pointer font-semibold">Earlier checks ({checks.length - 1})</summary>
            <ul className="mt-2 space-y-1">{checks.slice(1).map((k) => <li key={k.id}>Version {k.revision}: {k.outcome === "cleared" ? "cleared" : "not cleared"} · {when(k.created_at)} · {k.note}</li>)}</ul>
          </details>
        )}
      </section>

      {draft && !own && (
        <section id="send" className="card scroll-mt-24 space-y-3 border-2 border-primary p-4 sm:p-6" aria-labelledby="send-h">
          <h2 id="send-h" className="text-lg font-bold">Send for signing</h2>
          <ul className="space-y-1 text-sm">
            <li>{missing.length === 0 ? "✓" : "✗"} Details complete</li>
            <li>{cleared ? "✓" : "✗"} Legal check of version {c.revision} cleared</li>
            <li>{built!.missingParts.length === 0 && built!.draftParts.length === 0 ? "✓" : "✗"} Every part uses a lawyer-reviewed, approved template</li>
            <li>{built!.unfilled.length === 0 ? "✓" : "✗"} Nothing left unfilled in the text</li>
          </ul>
          <p className="text-sm text-muted">Sending freezes the text above. The partner is told and can sign{esignOn ? " electronically" : " on paper (electronic signing is off)"} or ask for changes.</p>
          <form action={sendContract}><input type="hidden" name="id" value={c.id} /><SubmitButton className="btn btn-flame min-h-11 w-full sm:w-auto" pendingText="Sending…">Send to the partner</SubmitButton></form>
        </section>
      )}

      <section id="sign" className="card scroll-mt-24 space-y-3 p-4 sm:p-6" aria-labelledby="sign-h">
        <h2 id="sign-h" className="text-lg font-bold">Signatures</h2>
        {sigs.length === 0 ? <p className="text-sm text-muted">No signature yet.</p> : (
          <ul className="space-y-2 text-sm">
            {sigs.map((s) => (
              <li key={s.id} className={`rounded-xl border border-line p-3 ${s.revision !== c.revision ? "opacity-60" : ""}`}>
                <p className="font-bold">{s.side === "partner" ? "Partner" : "FLAME"}: {s.signer_name}, {s.signer_position}{s.revision !== c.revision ? ` (version ${s.revision}, no longer counts)` : ""}</p>
                <p>{s.method === "electronic" ? `Signed electronically ${when(s.signed_at)}; typed "${s.typed_name}"` : `Wet-ink signed copy dated ${day(s.signed_on)}, recorded ${when(s.signed_at)}`}</p>
                <p className="break-all text-xs text-muted">Text fingerprint {shortHash(s.body_sha256)}{s.ip ? ` · IP ${s.ip}` : ""}{s.user_agent ? ` · ${s.user_agent}` : ""}</p>
              </li>
            ))}
          </ul>
        )}
        {nextSide && !own && (
          <div className="space-y-3 border-t border-line pt-3">
            <p className="text-sm font-semibold">Waiting for: {nextSide === "partner" ? `the partner's signatory (${c.signatory_name})` : `FLAME's signatory (${c.flame_signatory_name})`}</p>
            {(nextSide === "partner" || founder) && (
              <form action={recordWetInk} className="space-y-3 rounded-xl bg-bg-soft p-3">
                <input type="hidden" name="id" value={c.id} /><input type="hidden" name="side" value={nextSide} /><input type="hidden" name="sha" value={c.body_sha256 ?? ""} />
                <p className="font-semibold">Record a wet-ink signature ({nextSide === "partner" ? "partner" : "FLAME"})</p>
                {signedCopies.length === 0 ? <p className="text-sm">Upload the scanned signed copy under Files first.</p> : <>
                  <div className="field"><label htmlFor="document_id" className="label">Signed copy</label><select id="document_id" name="document_id" required className="input">{signedCopies.map((d) => <option key={d.id} value={d.id}>{d.file_name}</option>)}</select></div>
                  <div className="field"><label htmlFor="signed_on" className="label">Date written on the signed paper</label><input id="signed_on" name="signed_on" type="date" required max={today} className="input" /></div>
                  <p className="text-sm text-muted">Check that the paper is this exact version ({c.ref_no}, version {c.revision}) and is signed by {nextSide === "partner" ? `${c.signatory_name}, ${c.signatory_position}` : `${c.flame_signatory_name}`}.</p>
                  <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Saving…">Record the signature</SubmitButton>
                </>}
              </form>
            )}
            {nextSide === "flame" && founder && esignOn && (
              <form action={flameSign} className="space-y-3 rounded-xl border-2 border-flame p-3">
                <input type="hidden" name="id" value={c.id} /><input type="hidden" name="sha" value={c.body_sha256 ?? ""} />
                <p className="font-semibold">Sign electronically for FLAME</p>
                <label className="flex items-start gap-2 text-[15px]"><input type="checkbox" name="authority" className="check mt-1" required /><span>{AUTHORITY_CONFIRM(c.flame_signatory_name ?? "", c.flame_signatory_position ?? "", "MarketplacePH Online Store")}</span></label>
                <label className="flex items-start gap-2 text-[15px]"><input type="checkbox" name="consent" className="check mt-1" required /><span>{ESIGN_CONSENT.en}</span></label>
                <div className="field"><label htmlFor="typed_name" className="label">Type your full name: {c.flame_signatory_name}</label><input id="typed_name" name="typed_name" required autoComplete="name" className="input" /></div>
                <SubmitButton className="btn btn-flame min-h-11 w-full sm:w-auto" pendingText="Signing…">Sign for FLAME</SubmitButton>
              </form>
            )}
            {nextSide === "flame" && !founder && <p className="text-sm text-muted">Only the founder signs for FLAME.</p>}
          </div>
        )}
      </section>

      <section id="files" className="card scroll-mt-24 space-y-3 p-4 sm:p-6" aria-labelledby="files-h">
        <h2 id="files-h" className="text-lg font-bold">Files</h2>
        <p className="text-sm text-muted">Signed copies and proof of authority. Encrypted and private; signed copies are kept 10 years after the contract ends.</p>
        {docs.length === 0 ? <p className="text-sm">No files.</p> : (
          <ul className="space-y-2 text-sm">
            {docs.map((d) => (
              <li key={d.id} className="flex flex-col gap-2 rounded-xl border border-line p-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0 break-words"><a href={`/api/vetting/doc/${d.id}`} className="font-semibold underline">{d.file_name}</a> · {CONTRACT_FILE_TYPES[d.doc_type as keyof typeof CONTRACT_FILE_TYPES] ?? d.doc_type} · {(d.size_bytes / 1048576).toFixed(1)} MB</span>
                {!own && !["signed", "ended", "terminated"].includes(c.status) && !sigs.some((s) => s.document_id === d.id) && (
                  <form action={deleteContractFile}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="doc_id" value={d.id} /><SubmitButton className="btn btn-outline min-h-11 w-full sm:w-auto" pendingText="Removing…">Remove</SubmitButton></form>
                )}
              </li>
            ))}
          </ul>
        )}
        {!own && c.status !== "cancelled" && (
          <form action={uploadContractFile} className="space-y-3 border-t border-line pt-3">
            <input type="hidden" name="id" value={c.id} />
            <div className="field"><label htmlFor="doc_type" className="label">Kind of file</label><select id="doc_type" name="doc_type" required className="input">{Object.entries(CONTRACT_FILE_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            <div className="field"><label htmlFor="file" className="label">File (PDF, JPG, PNG or WEBP, up to 4 MB)</label><input id="file" name="file" type="file" required accept="application/pdf,image/jpeg,image/png,image/webp" className="input" /></div>
            <SubmitButton className="btn btn-outline min-h-11 w-full sm:w-auto" pendingText="Uploading…">Upload</SubmitButton>
          </form>
        )}
      </section>

      {!own && c.status === "signed" && (
        <section id="after" className="card scroll-mt-24 space-y-3 p-4 sm:p-6" aria-labelledby="after-h">
          <h2 id="after-h" className="text-lg font-bold">After signing</h2>
          <p className="text-sm text-muted">Start the agreement commission rate and the penalty terms from this contract (its number and signing date are filled in). They still need their usual second-person approval.</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <form action={startRate}><input type="hidden" name="id" value={c.id} /><SubmitButton className="btn btn-outline min-h-11 w-full" pendingText="Starting…">Start the agreement rate</SubmitButton></form>
            <form action={startPenalty}><input type="hidden" name="id" value={c.id} /><SubmitButton className="btn btn-outline min-h-11 w-full" pendingText="Starting…">Start the penalty terms</SubmitButton></form>
            <form action={createContract}><input type="hidden" name="renews_id" value={c.id} /><SubmitButton className="btn btn-flame min-h-11 w-full" pendingText="Preparing…">Prepare the renewal</SubmitButton></form>
          </div>
        </section>
      )}
      {!own && c.status === "ended" && (
        <form action={createContract} className="card p-4"><input type="hidden" name="renews_id" value={c.id} /><SubmitButton className="btn btn-flame min-h-11 w-full sm:w-auto" pendingText="Preparing…">Prepare a renewal from this contract</SubmitButton></form>
      )}

      {!own && ["out_for_signing", "partner_signed", "draft", "signed"].includes(c.status) && (
        <section id="status" className="card scroll-mt-24 space-y-3 p-4 sm:p-6" aria-labelledby="st-h">
          <h2 id="st-h" className="text-lg font-bold">Change, end or cancel</h2>
          {["out_for_signing", "partner_signed"].includes(c.status) && (
            <form action={returnToDraft} className="space-y-2 rounded-xl bg-bg-soft p-3">
              <input type="hidden" name="id" value={c.id} />
              <p className="font-semibold">Take it back to draft to change it</p>
              <p className="text-sm text-muted">Makes version {c.revision + 1}. Any signature on this version stops counting; the partner is told.</p>
              <div className="field"><label htmlFor="rreason" className="label">What will change</label><textarea id="rreason" name="reason" required maxLength={1000} rows={2} className="input" /></div>
              <SubmitButton className="btn btn-outline min-h-11 w-full sm:w-auto" pendingText="Saving…">Take back to draft</SubmitButton>
            </form>
          )}
          <form action={contractStatus} className="space-y-2">
            <input type="hidden" name="id" value={c.id} />
            <fieldset className="grid gap-2 sm:grid-cols-2">
              <legend className="sr-only">Change to</legend>
              {(c.status === "signed" ? [["ended", "End the contract"], ["terminated", "Terminate (after a termination sanction)"]] : [["cancelled", "Cancel (never signed)"]]).map(([v, t]) => (
                <label key={v} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line px-3 has-[:checked]:border-primary has-[:checked]:bg-primary-soft"><input type="radio" name="to" value={v} required className="check" /><span className="font-semibold">{t}</span></label>
              ))}
            </fieldset>
            <div className="field"><label htmlFor="sreason" className="label">Reason</label><textarea id="sreason" name="reason" required maxLength={1000} rows={2} className="input" /></div>
            <SubmitButton className="btn btn-outline min-h-11 w-full sm:w-auto" pendingText="Saving…">Save</SubmitButton>
          </form>
        </section>
      )}

      <section id="history" className="card scroll-mt-24 space-y-3 p-4" aria-labelledby="h-h">
        <h2 id="h-h" className="text-lg font-bold">History</h2>
        {hist.length === 0 ? <p className="text-sm text-muted">Nothing yet.</p> : (
          <ol className="space-y-2 text-sm">
            {hist.map((h) => (
              <li key={h.id} className="border-l-2 border-line pl-3">
                <span className="font-semibold">{h.action.replace(/_/g, " ")}</span>{h.internal && <span className="ml-1 rounded bg-bg-soft px-1 text-xs">team only</span>}
                <span className="text-muted"> · {when(h.created_at)}{h.actor_id ? ` · ${who.get(h.actor_id) ?? "Team member"}` : ""}</span>
                {h.note && <span className="block whitespace-pre-line break-words">{h.note}</span>}
              </li>
            ))}
          </ol>
        )}
        {!own && (
          <form action={contractNote} className="space-y-2 border-t border-line pt-3">
            <input type="hidden" name="id" value={c.id} />
            <label htmlFor="tnote" className="label text-sm">Add a note for the national team</label>
            <textarea id="tnote" name="note" required maxLength={2000} rows={2} className="input" />
            <SubmitButton className="btn btn-outline min-h-11 w-full sm:w-auto" pendingText="Saving…">Save note</SubmitButton>
          </form>
        )}
      </section>
    </div>
  );
}
