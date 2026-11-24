import Link from "next/link";
import { notFound } from "next/navigation";
import { adminContext } from "@/lib/admin/guard";
import { Notice } from "@/components/ui";
import { PartnerTabs } from "@/components/admin/PartnerTabs";
import { SubmitButton } from "@/components/SubmitButton";
import { CONTRACT_DONE, CONTRACT_ERRORS, PARTS, PLACEHOLDERS, TEMPLATE_STATUS, unknownPlaceholders, type Part, type TemplateStatus } from "@/lib/contracts";
import { approveTemplate, deleteTemplate, retireTemplate, saveTemplate } from "../../actions";

export const metadata = { title: "Contract template", robots: { index: false } };

type Tpl = { id: string; part: Part; version: string; title: string; body: string; change_note: string | null; status: TemplateStatus; lawyer_name: string | null; lawyer_reviewed_on: string | null; approved_at: string | null; created_at: string };
const day = (s: string | null) => (s ? new Date(`${s.slice(0, 10)}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" }) : "—");
const TONE = { ok: "bg-ok-soft text-ok", info: "bg-primary-soft text-primary", warn: "bg-warn-soft text-warn", danger: "bg-danger-soft text-danger" } as const;
const manila = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
const nextVersion = (v: string, taken: string[]) => { let [a, b] = v.split(".").map(Number); do { b += 1; if (b > 99) { a += 1; b = 0; } } while (taken.includes(`${a}.${b}`)); return `${a}.${b}`; };

/** One template version: edit while a draft, record the lawyer's review to approve, retire, or start the next version. */
export default async function TemplatePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string; error?: string; m?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await adminContext(["super_admin", "admin", "national_reviewer"]);
  const { data } = await ctx.db.from("contract_templates").select("id, part, version, title, body, change_note, status, lawyer_name, lawyer_reviewed_on, approved_at, created_at").eq("id", id).maybeSingle();
  if (!data) notFound();
  const t = data as Tpl;
  const { data: sib } = await ctx.db.from("contract_templates").select("version").eq("part", t.part);
  const next = nextVersion(t.version, (sib ?? []).map((s) => s.version as string));
  const draft = t.status === "draft";
  const unknown = unknownPlaceholders(t.body);
  const err = sp.error === "db" && sp.m ? `The database refused: ${sp.m}.` : sp.error === "placeholders" && sp.m ? `${CONTRACT_ERRORS.placeholders} Unknown: ${sp.m}.` : sp.error ? CONTRACT_ERRORS[sp.error] ?? CONTRACT_ERRORS.failed : null;

  return (
    <div className="space-y-4">
      <PartnerTabs current="contracts" />
      <p className="text-sm"><Link href="/admin/partners/contracts/templates" className="underline">← Templates</Link></p>
      <header>
        <p className="text-xs font-bold uppercase text-muted">{PARTS[t.part].label} · version {t.version}</p>
        <h1 className="break-words text-2xl font-extrabold text-primary">{t.title}</h1>
        <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-sm font-bold ${TONE[TEMPLATE_STATUS[t.status].tone]}`}>{TEMPLATE_STATUS[t.status].label}</span>
        {t.lawyer_name && <p className="mt-1 text-sm">Reviewed by {t.lawyer_name} on {day(t.lawyer_reviewed_on)}.</p>}
      </header>
      {sp.done && <div role="status"><Notice tone="ok">{CONTRACT_DONE[sp.done] ?? "Saved."}</Notice></div>}
      {err && <div role="alert"><Notice tone="danger">{err}</Notice></div>}
      {unknown.length > 0 && <Notice tone="warn">Unknown placeholders: {unknown.join(", ")}.</Notice>}

      <form action={saveTemplate} className="card space-y-4 p-4 sm:p-6">
        {draft ? <input type="hidden" name="id" value={t.id} /> : <><input type="hidden" name="part" value={t.part} /></>}
        {!draft && (
          <div className="field"><label htmlFor="version" className="label">New version number</label><input id="version" name="version" defaultValue={next} required pattern="[0-9]{1,2}\.[0-9]{1,2}" className="input" /><p className="field-help">An approved version is never edited. Saving here makes a new draft version from this text.</p></div>
        )}
        <div className="field"><label htmlFor="title" className="label">Title</label><input id="title" name="title" required maxLength={150} defaultValue={t.title} className="input" /></div>
        <div className="field">
          <label htmlFor="body" className="label">Text</label>
          <textarea id="body" name="body" required rows={22} maxLength={60000} defaultValue={t.body} className="input font-mono text-[13px] leading-5" />
          <p className="field-help">Write {"{{name}}"} where the contract&apos;s own data goes.</p>
        </div>
        <div className="field"><label htmlFor="change_note" className="label">What changed in this version</label><input id="change_note" name="change_note" maxLength={1000} defaultValue={draft ? t.change_note ?? "" : ""} className="input" /></div>
        <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Saving…">{draft ? "Save the draft" : "Save as a new draft version"}</SubmitButton>
      </form>

      {draft && (
        <section id="approve" className="card scroll-mt-24 space-y-3 border-2 border-primary p-4 sm:p-6" aria-labelledby="ap-h">
          <h2 id="ap-h" className="text-lg font-bold">Approve after the lawyer&apos;s review</h2>
          <p className="text-sm text-muted">Approve only the exact text a lawyer reviewed. Contracts sent from now on will use it; the version it replaces is retired. Contracts already sent keep their frozen text.</p>
          <form action={approveTemplate} className="space-y-3">
            <input type="hidden" name="id" value={t.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="field"><label htmlFor="lawyer_name" className="label">Lawyer who reviewed this version</label><input id="lawyer_name" name="lawyer_name" required minLength={3} maxLength={150} className="input" placeholder="Atty. …" /></div>
              <div className="field"><label htmlFor="lawyer_reviewed_on" className="label">Date of the review</label><input id="lawyer_reviewed_on" name="lawyer_reviewed_on" type="date" required max={manila()} className="input" /></div>
            </div>
            <SubmitButton className="btn btn-flame min-h-11 w-full sm:w-auto" pendingText="Approving…">Approve this version</SubmitButton>
          </form>
          <form action={deleteTemplate}><input type="hidden" name="id" value={t.id} /><SubmitButton className="btn btn-outline min-h-11 w-full sm:w-auto" pendingText="Deleting…">Delete this draft</SubmitButton></form>
        </section>
      )}
      {t.status === "approved" && (
        <form action={retireTemplate} className="card space-y-2 p-4">
          <input type="hidden" name="id" value={t.id} />
          <p className="text-sm text-muted">Retiring stops new contracts from being sent until another version of this part is approved.</p>
          <SubmitButton className="btn btn-outline min-h-11 w-full sm:w-auto" pendingText="Retiring…">Retire this version</SubmitButton>
        </form>
      )}

      <details className="card p-4 text-sm">
        <summary className="cursor-pointer font-semibold">Placeholders you can use</summary>
        <dl className="mt-2 grid gap-1 sm:grid-cols-2">
          {Object.entries(PLACEHOLDERS).map(([k, l]) => <div key={k}><dt className="font-mono text-xs">{`{{${k}}}`}</dt><dd className="text-muted">{l}</dd></div>)}
        </dl>
      </details>
    </div>
  );
}
