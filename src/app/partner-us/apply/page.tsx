import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { CATEGORY_KEYS, PARTNER_CATEGORIES, PARTNER_DONE, PARTNER_ERRORS, STATUS, type PartnerCategory, type PartnerStatus } from "@/lib/partner";
import { startApplication } from "../actions";

export const metadata = { title: "My partner applications", robots: { index: false } };

type Row = { id: string; category: PartnerCategory; status: PartnerStatus; legal_name: string | null; updated_at: string; revision: number };
const tone = (s: PartnerStatus) => ({ ok: "bg-ok-soft text-ok", warn: "bg-warn-soft text-warn", danger: "bg-danger-soft text-danger", info: "bg-primary-soft text-primary" })[STATUS[s].tone];

/** The member's partner applications (one per category), with Continue, and a button to start another category. */
export default async function MyApplications({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser("/partner-us/apply");
  const { data, error } = await supabase.from("partner_applications").select("id, category, status, legal_name, updated_at, revision").eq("user_id", user.id).order("created_at");
  const rows = (data ?? []) as Row[];
  const have = new Set(rows.map((r) => r.category));
  const err = sp.error ? PARTNER_ERRORS[sp.error] ?? PARTNER_ERRORS.failed : error ? PARTNER_ERRORS.unavailable : null;
  const done = sp.done ? PARTNER_DONE[sp.done] : null;

  return (
    <div className="container-x max-w-3xl space-y-5 py-6 sm:py-10">
      <nav aria-label="Breadcrumb" className="text-sm text-muted"><Link href="/partner-us" className="underline">Become an Accredited Partner</Link> › My applications</nav>
      <h1 className="text-3xl font-extrabold text-primary">My partner applications</h1>
      <p className="text-muted" lang="fil">Dito makikita ang inyong application at ang status nito.</p>
      {done && <div role="status"><Notice tone="ok">{done}</Notice></div>}
      {err && <div role="alert"><Notice tone="danger">{err}</Notice></div>}

      {rows.length === 0 && !err && <Notice tone="info">You have no application yet. Choose a category below to start.</Notice>}
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase text-muted">{PARTNER_CATEGORIES[r.category].label}{r.revision > 1 ? ` · version ${r.revision}` : ""}</p>
              <p className="truncate text-lg font-extrabold">{r.legal_name || "Business name not filled in yet"}</p>
              <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-sm font-bold ${tone(r.status)}`}>{STATUS[r.status].label}</span>
              <p className="mt-1 text-xs text-muted">Last saved {new Date(r.updated_at).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" })}</p>
            </div>
            <Link href={`/partner-us/apply/${r.id}`} className="btn btn-primary min-h-11 w-full sm:w-auto">{r.status === "draft" || r.status === "needs_changes" ? "Continue" : "Open"}</Link>
          </li>
        ))}
      </ul>

      {CATEGORY_KEYS.some((k) => !have.has(k)) && !error && (
        <section className="card space-y-3 p-4" aria-labelledby="start-h">
          <h2 id="start-h" className="text-lg font-bold">Apply for another category</h2>
          <div className="grid gap-2 sm:grid-cols-3">
            {CATEGORY_KEYS.filter((k) => !have.has(k)).map((k) => (
              <form key={k} action={startApplication}>
                <input type="hidden" name="category" value={k} />
                <SubmitButton className="btn btn-outline min-h-11 w-full" pendingText="Starting…">{PARTNER_CATEGORIES[k].label}</SubmitButton>
              </form>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
