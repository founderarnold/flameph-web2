import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { Notice } from "@/components/ui";
import { PartnerMoneyNotice } from "@/components/PartnerMoneyNotice";
import { SubmitButton } from "@/components/SubmitButton";
import {
  AUTHORITY_CONFIRM, CONTRACT_CATEGORIES, CONTRACT_COLS, CONTRACT_DONE, CONTRACT_ERRORS, CONTRACT_STATUS, ESIGN_CONSENT, SIGNATURE_COLS, shortHash,
  type ContractRow, type SignatureRow,
} from "@/lib/contracts";
import { askChanges, partnerSign } from "../actions";

export const metadata = { title: "Partner contract", robots: { index: false } };

const day = (s: string | null) => (s ? new Date(`${s.slice(0, 10)}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" }) : "—");
const when = (s: string) => new Date(s).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });
const TONE = { ok: "bg-ok-soft text-ok", info: "bg-primary-soft text-primary", warn: "bg-warn-soft text-warn", danger: "bg-danger-soft text-danger" } as const;

/** One of the partner's own contracts: the full frozen text with its fingerprint, the signatures so far, and — while it
 *  waits for them — signing (electronic, when switched on) or asking for changes. */
export default async function MyContract({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, user } = await requireUser(`/partner-us/contracts/${id}`);
  const [{ data }, { data: sigRows }, { data: histRows }, { data: docRows }, { data: esignOn }] = await Promise.all([
    supabase.from("partner_contracts").select(CONTRACT_COLS).eq("id", id).maybeSingle(),
    supabase.from("partner_contract_signatures").select(SIGNATURE_COLS).eq("contract_id", id).order("signed_at"),
    supabase.from("partner_contract_history").select("id, action, note, created_at").eq("contract_id", id).order("created_at", { ascending: false }).limit(50),
    supabase.from("vetting_documents").select("id, doc_type, file_name").eq("contract_id", id).eq("purpose", "contract").is("deleted_at", null),
    supabase.rpc("contract_esign_on"),
  ]);
  if (!data) notFound();
  const c = data as unknown as ContractRow;
  if (c.partner_user_id !== user.id) notFound();
  const sigs = ((sigRows ?? []) as SignatureRow[]).filter((s) => s.revision === c.revision);
  const hist = (histRows ?? []) as { id: string; action: string; note: string | null; created_at: string }[];
  const docs = (docRows ?? []) as { id: string; doc_type: string; file_name: string }[];
  const waiting = c.status === "out_for_signing";
  const err = sp.error ? CONTRACT_ERRORS[sp.error] ?? CONTRACT_ERRORS.failed : null;
  const done = sp.done ? CONTRACT_DONE[sp.done] : null;

  return (
    <div className="container-x max-w-3xl space-y-5 py-6 sm:py-10">
      <nav aria-label="Breadcrumb" className="text-sm text-muted"><Link href="/partner-us/contracts" className="underline">My partner contracts</Link> › {c.ref_no}</nav>
      <header>
        <p className="text-xs font-bold uppercase text-muted">Contract {c.ref_no} · version {c.revision} · {CONTRACT_CATEGORIES[c.category]}</p>
        <h1 className="break-words text-2xl font-extrabold text-primary sm:text-3xl">{c.partner_name}</h1>
        <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-sm font-bold ${TONE[CONTRACT_STATUS[c.status].tone]}`}>{c.status === "draft" ? "Being revised by the team" : CONTRACT_STATUS[c.status].label}</span>
        <p className="mt-1 text-sm" lang="fil">{CONTRACT_STATUS[c.status].fil}</p>
        <p className="mt-1 text-sm">{day(c.effective_date)} to {day(c.end_date)}</p>
      </header>
      {done && <div role="status"><Notice tone="ok">{done}</Notice></div>}
      {err && <div role="alert"><Notice tone="danger">{err}</Notice></div>}
      {c.status === "draft" && <Notice tone="info">The team is preparing a new version{c.status_reason ? ` (${c.status_reason})` : ""}. You will be told when it is ready to read and sign.</Notice>}
      {["ended", "terminated", "cancelled"].includes(c.status) && c.status_reason && <Notice tone="warn">Reason: {c.status_reason}</Notice>}

      <PartnerMoneyNotice />

      {c.body && (
        <section className="card space-y-3 p-4 sm:p-6" aria-labelledby="text-h">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 id="text-h" className="text-lg font-bold">The contract</h2>
            <a href={`/api/contracts/${c.id}/copy`} className="btn btn-outline min-h-11 w-full sm:w-auto">Download a copy</a>
          </div>
          <p className="text-sm text-muted">Fingerprint of this text (SHA-256): <code className="break-all text-xs">{c.body_sha256}</code>. It changes if even one letter changes, so it shows exactly what was signed.</p>
          <pre className="max-h-[75vh] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-bg-soft p-3 font-sans text-[15px] leading-7">{c.body}</pre>
        </section>
      )}

      <section id="sign" className="card scroll-mt-24 space-y-3 p-4 sm:p-6" aria-labelledby="sign-h">
        <h2 id="sign-h" className="text-lg font-bold">Signatures</h2>
        {sigs.length === 0 ? <p className="text-sm text-muted">No signature on this version yet.</p> : (
          <ul className="space-y-2 text-sm">
            {sigs.map((s) => (
              <li key={s.id} className="rounded-xl border border-line p-3">
                <p className="font-bold">{s.side === "partner" ? "Partner" : "MarketplacePH Online Store"}: {s.signer_name}, {s.signer_position}</p>
                <p>{s.method === "electronic" ? `Signed electronically on ${when(s.signed_at)}` : `Signed on paper on ${day(s.signed_on)}`} · text {shortHash(s.body_sha256)}</p>
              </li>
            ))}
          </ul>
        )}
        {docs.length > 0 && <p className="text-sm">Files: {docs.map((d, i) => <span key={d.id}>{i ? ", " : ""}<a href={`/api/vetting/doc/${d.id}`} className="underline">{d.file_name}</a></span>)}</p>}

        {waiting && (esignOn === true ? (
          <form action={partnerSign} className="space-y-3 rounded-xl border-2 border-flame p-3 sm:p-4">
            <input type="hidden" name="id" value={c.id} /><input type="hidden" name="sha" value={c.body_sha256 ?? ""} /><input type="hidden" name="revision" value={c.revision} />
            <p className="font-semibold">Sign electronically</p>
            <label className="flex items-start gap-2 text-[15px]"><input type="checkbox" name="authority" required className="check mt-1" /><span>{AUTHORITY_CONFIRM(c.signatory_name ?? "", c.signatory_position ?? "", c.partner_name)}</span></label>
            <label className="flex items-start gap-2 text-[15px]"><input type="checkbox" name="consent" required className="check mt-1" /><span>{ESIGN_CONSENT.en}<span className="mt-1 block text-sm text-muted" lang="fil">{ESIGN_CONSENT.tl}</span></span></label>
            <div className="field"><label htmlFor="typed_name" className="label">Type your full name exactly: {c.signatory_name}</label><input id="typed_name" name="typed_name" required autoComplete="name" className="input" /></div>
            <SubmitButton className="btn btn-flame min-h-11 w-full sm:w-auto" pendingText="Signing…">Sign the contract</SubmitButton>
            <p className="text-sm text-muted">Only {c.signatory_name} may sign. If someone else should sign, ask for changes below.</p>
          </form>
        ) : (
          <Notice tone="info">To sign: print or download the contract, have {c.signatory_name} ({c.signatory_position}) sign every page, and send the signed copy to the FLAME PH national team. They will upload it here. Electronic signing will open after a lawyer reviews it.</Notice>
        ))}
      </section>

      {waiting && (
        <section id="changes" className="card scroll-mt-24 space-y-3 p-4 sm:p-6" aria-labelledby="ch-h">
          <h2 id="ch-h" className="text-lg font-bold">Something wrong? Ask for changes</h2>
          <p className="text-sm text-muted">The contract goes back to the team, who prepare a new version for you to read again. Nothing is signed.</p>
          <form action={askChanges} className="space-y-3">
            <input type="hidden" name="id" value={c.id} />
            <div className="field"><label htmlFor="reason" className="label">What should change?</label><textarea id="reason" name="reason" required minLength={5} maxLength={1000} rows={3} className="input" /></div>
            <SubmitButton className="btn btn-outline min-h-11 w-full sm:w-auto" pendingText="Sending…">Ask for changes</SubmitButton>
          </form>
        </section>
      )}

      {hist.length > 0 && (
        <section className="card space-y-2 p-4" aria-labelledby="h-h">
          <h2 id="h-h" className="text-lg font-bold">History</h2>
          <ol className="space-y-1 text-sm">{hist.map((h) => <li key={h.id}><span className="font-semibold">{h.action.replace(/_/g, " ")}</span> · {when(h.created_at)}{h.note ? ` · ${h.note}` : ""}</li>)}</ol>
        </section>
      )}
    </div>
  );
}
