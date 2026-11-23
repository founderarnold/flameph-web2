import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { PARTNER_CATEGORIES, type PartnerCategory } from "@/lib/partner";
import { CASE_ERRORS, COMPLAINT_PRIVACY } from "@/lib/partner-cases";
import { startComplaint } from "../actions";

export const metadata = { title: "File a complaint", robots: { index: false } };

type P = { user_id: string; legal_name: string; categories: PartnerCategory[] };

/** Step 1 of a complaint: choose the accredited partner. Only the business name and kind are listed. */
export default async function NewComplaint({ searchParams }: { searchParams: Promise<{ error?: string; q?: string }> }) {
  const sp = await searchParams;
  const { user } = await requireUser("/partner-us/complaints/new");
  const admin = createAdminClient();
  const q = (sp.q ?? "").trim().slice(0, 60);
  let list: P[] = [];
  if (admin) {
    let query = admin.from("partner_profiles").select("user_id, legal_name, categories").neq("user_id", user.id).order("legal_name").limit(300);
    if (q) query = query.ilike("legal_name", `%${q.replace(/[%_\\]/g, "")}%`);
    const { data } = await query;
    list = (data ?? []) as P[];
  }
  const err = sp.error ? CASE_ERRORS[sp.error] ?? CASE_ERRORS.failed : !admin ? CASE_ERRORS.unavailable : null;

  return (
    <div className="container-x max-w-3xl space-y-5 py-6 sm:py-10">
      <nav aria-label="Breadcrumb" className="text-sm text-muted"><Link href="/partner-us/complaints" className="underline">Complaints</Link> › File a complaint</nav>
      <header>
        <p className="font-display font-bold text-flame-strong" lang="fil">Hakbang 1: Piliin ang partner</p>
        <h1 className="text-3xl font-extrabold text-primary">Which partner is it about?</h1>
        <p className="mt-1 text-muted">Complaints here are about FLAME PH accredited partners (suppliers, service providers, toll manufacturers). For a problem with another member, use Report on their post or record instead.</p>
      </header>
      {err && <div role="alert"><Notice tone="danger">{err}</Notice></div>}

      <form method="get" className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="field flex-1">
          <label htmlFor="q" className="label">Search the business name</label>
          <input id="q" name="q" defaultValue={q} maxLength={60} className="input" placeholder="e.g. A Trading" />
        </div>
        <button type="submit" className="btn btn-outline min-h-11">Search</button>
      </form>

      {list.length === 0 ? (
        <Notice tone="info">{q ? "No accredited partner matches that name." : "There are no accredited partners yet."}</Notice>
      ) : (
        <form action={startComplaint} className="card space-y-4 p-4 sm:p-6">
          <fieldset className="space-y-2">
            <legend className="label">Choose the partner</legend>
            <ul className="divide-y divide-line rounded-xl border border-line">
              {list.map((p) => (
                <li key={p.user_id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2">
                    <input type="radio" name="partner_user_id" value={p.user_id} required className="size-5" />
                    <span className="min-w-0"><span className="block break-words font-semibold">{p.legal_name}</span>
                      <span className="block text-xs text-muted">{p.categories.map((c) => PARTNER_CATEGORIES[c]?.label ?? c).join(", ")}</span></span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
          <p className="text-sm text-muted">{COMPLAINT_PRIVACY}</p>
          <SubmitButton className="btn btn-flame min-h-11 w-full sm:w-auto" pendingText="Starting…">Continue</SubmitButton>
        </form>
      )}
    </div>
  );
}
