import Link from "next/link";
import { adminContext } from "@/lib/admin/guard";
import { Notice } from "@/components/ui";
import { PartnerTabs } from "@/components/admin/PartnerTabs";
import { SubmitButton } from "@/components/SubmitButton";
import { CONTRACT_DONE, CONTRACT_ERRORS, NOT_LEGAL_ADVICE, PARTS, PART_KEYS, TEMPLATE_STATUS, type Part, type TemplateStatus } from "@/lib/contracts";
import { esignSetting, loadStandardTemplates } from "../actions";

export const metadata = { title: "Contract templates", robots: { index: false } };

type Tpl = { id: string; part: Part; version: string; title: string; status: TemplateStatus; lawyer_name: string | null; lawyer_reviewed_on: string | null; approved_at: string | null; created_at: string };
const day = (s: string | null) => (s ? new Date(`${s.slice(0, 10)}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" }) : "—");
const TONE = { ok: "bg-ok-soft text-ok", info: "bg-primary-soft text-primary", warn: "bg-warn-soft text-warn", danger: "bg-danger-soft text-danger" } as const;
const manila = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

/** The versioned agreement templates: the Master Partner Agreement, a schedule for each kind of partner and four
 *  annexes. A version is used only after a lawyer reviewed it and the team approved it. Also: the electronic signing
 *  switch, which only the founder turns on after a lawyer reviews the e-signature flow. */
export default async function Templates({ searchParams }: { searchParams: Promise<{ done?: string; error?: string; m?: string }> }) {
  const sp = await searchParams;
  const ctx = await adminContext(["super_admin", "admin", "national_reviewer"]);
  const [{ data, error }, { data: es }] = await Promise.all([
    ctx.db.from("contract_templates").select("id, part, version, title, status, lawyer_name, lawyer_reviewed_on, approved_at, created_at").order("created_at", { ascending: false }),
    ctx.db.from("settings").select("value").eq("key", "contract_esign").maybeSingle(),
  ]);
  const rows = (data ?? []) as Tpl[];
  const esign = (es?.value ?? {}) as { enabled?: boolean; lawyer_name?: string | null; reviewed_on?: string | null };
  const founder = ctx.roles.includes("super_admin");
  const err = sp.error === "db" && sp.m ? `The database refused: ${sp.m}.` : sp.error ? CONTRACT_ERRORS[sp.error] ?? CONTRACT_ERRORS.failed : null;

  return (
    <div className="space-y-4">
      <PartnerTabs current="contracts" />
      <p className="text-sm"><Link href="/admin/partners/contracts" className="underline">← Contracts</Link></p>
      <div>
        <h1 className="text-2xl font-extrabold text-primary">Contract templates</h1>
        <p className="text-sm text-muted">Each contract is built from the approved version of each part. To change a part, write a new version; the approved one is never edited.</p>
      </div>
      {sp.done && <div role="status"><Notice tone="ok">{CONTRACT_DONE[sp.done] ?? "Saved."}</Notice></div>}
      {err && <div role="alert"><Notice tone="danger">{err}</Notice></div>}
      {error && <Notice tone="warn">Templates open after the database update (0038).</Notice>}
      <Notice tone="warn">{NOT_LEGAL_ADVICE}</Notice>

      {PART_KEYS.some((p) => !rows.some((r) => r.part === p)) && !error && (
        <form action={loadStandardTemplates} className="card space-y-2 border-2 border-flame p-4">
          <p className="font-semibold">Load the standard plain-language drafts (version 1.0) for the parts that have none yet.</p>
          <p className="text-sm text-muted">They load as drafts. Send them to your lawyer, make any changes as new drafts, then record the lawyer&apos;s review to approve each one.</p>
          <SubmitButton className="btn btn-flame min-h-11 w-full sm:w-auto" pendingText="Loading…">Load the standard drafts</SubmitButton>
        </form>
      )}

      <ul className="grid gap-3 md:grid-cols-2">
        {PART_KEYS.map((p) => {
          const versions = rows.filter((r) => r.part === p);
          const live = versions.find((r) => r.status === "approved");
          return (
            <li key={p} className="card space-y-2 p-4">
              <p className="font-extrabold text-primary">{PARTS[p].label}</p>
              {live ? <p className="text-sm text-ok">In use: version {live.version}, reviewed by {live.lawyer_name} on {day(live.lawyer_reviewed_on)}</p> : <p className="text-sm font-bold text-warn">No lawyer-reviewed version yet. Contracts needing this part cannot be sent.</p>}
              {versions.length > 0 && (
                <ul className="space-y-1 text-sm">
                  {versions.map((v) => (
                    <li key={v.id} className="flex flex-wrap items-center gap-2">
                      <Link href={`/admin/partners/contracts/templates/${v.id}`} className="font-semibold underline">Version {v.version}</Link>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${TONE[TEMPLATE_STATUS[v.status].tone]}`}>{TEMPLATE_STATUS[v.status].label}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      <section id="esign" className="card scroll-mt-24 space-y-3 p-4 sm:p-6" aria-labelledby="es-h">
        <h2 id="es-h" className="text-lg font-bold">Electronic signing (RA 8792)</h2>
        <Notice tone={esign.enabled ? "ok" : "warn"}>{esign.enabled ? `ON since a lawyer (${esign.lawyer_name}) reviewed the electronic signing flow on ${day(esign.reviewed_on ?? null)}.` : "OFF. Until a lawyer reviews the electronic signing flow, contracts are signed on paper and the team uploads the signed copy."}</Notice>
        <p className="text-sm text-muted">How electronic signing works here: the signer is signed in to their own account, confirms their authority, consents to signing electronically, and types their full name exactly as written in the contract. The site keeps the fingerprint of the exact text signed, the time, the account, the IP address and the browser. The partner signs first, then the founder for FLAME.</p>
        {founder ? (
          <form action={esignSetting} className="space-y-3">
            <label className="flex items-start gap-2 text-[15px]"><input type="checkbox" name="enabled" defaultChecked={!!esign.enabled} className="check mt-1" /><span>Electronic signing is on</span></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="field"><label htmlFor="lawyer_name" className="label">Lawyer who reviewed the flow</label><input id="lawyer_name" name="lawyer_name" defaultValue={esign.lawyer_name ?? ""} maxLength={150} className="input" placeholder="Atty. …" /></div>
              <div className="field"><label htmlFor="reviewed_on" className="label">Date of the review</label><input id="reviewed_on" name="reviewed_on" type="date" max={manila()} defaultValue={esign.reviewed_on ?? ""} className="input" /></div>
            </div>
            <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Saving…">Save</SubmitButton>
          </form>
        ) : <p className="text-sm">Only the founder changes this.</p>}
      </section>
    </div>
  );
}
