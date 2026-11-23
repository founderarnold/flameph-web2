import Link from "next/link";
import { redirect } from "next/navigation";
import { adminContext } from "@/lib/admin/guard";
import { createClient } from "@/lib/supabase/server";
import { Notice } from "@/components/ui";
import { PartnerTabs } from "@/components/admin/PartnerTabs";
import { SubmitButton } from "@/components/SubmitButton";
import { SyncedTableScroll } from "@/components/admin/SyncedTableScroll";
import { PARTNER_CATEGORIES, STATUS, type PartnerCategory, type PartnerStatus } from "@/lib/partner";
import { ALL_ROLES } from "@/lib/auth";
import { chapterNote } from "./actions";

export const metadata = { title: "Partner applications", robots: { index: false } };

type Row = { id: string; category: PartnerCategory; status: PartnerStatus; legal_name: string | null; city: string | null; province: string | null; submitted_at: string | null; updated_at?: string; revision?: number };
const FILTERS: [string, string][] = [["submitted", "Waiting for review"], ["needs_changes", "Sent back for changes"], ["approved", "Accredited"], ["rejected", "Not approved"], ["draft", "Drafts"], ["all", "All"]];
const day = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" }) : "—");
const MSG: Record<string, string> = { note: "Your note was saved. Only the national team reads it.", scope: "That application is not from your chapter.", own: "You can't add a note on your own application." };

export default async function PartnerAdmin({ searchParams }: { searchParams: Promise<{ status?: string; done?: string; error?: string }> }) {
  const sp = await searchParams;
  const ctx = await adminContext(ALL_ROLES);
  const national = ctx.roles.some((r) => ["super_admin", "admin", "national_reviewer"].includes(r));
  const coordinator = ctx.roles.includes("chapter_coordinator");
  const flash = sp.done ? MSG[sp.done] : sp.error ? MSG[sp.error] ?? "That didn't go through." : null;

  // Finance works only on commission figures (Step 4): it never sees applications or documents.
  if (!national && !coordinator && ctx.roles.includes("finance")) redirect("/admin/partners/commissions");
  if (!national && !coordinator) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-extrabold text-primary">Partners</h1>
        <Notice tone="info">Your partner role has nothing to do here yet. Chapter testers get sample forms in Step 5. Finance works in Commissions.</Notice>
      </div>
    );
  }

  let rows: Row[] = [];
  let counts: Record<string, number> = {};
  let storage = 0;
  const status = FILTERS.some(([k]) => k === sp.status) ? sp.status! : "submitted";
  if (national) {
    let q = ctx.db.from("partner_applications").select("id, category, status, legal_name, city, province, submitted_at, updated_at, revision").order("submitted_at", { ascending: false, nullsFirst: false }).limit(300);
    if (status !== "all") q = q.eq("status", status);
    const [{ data }, { data: all }, { data: sizes }] = await Promise.all([
      q, ctx.db.from("partner_applications").select("status").limit(5000),
      ctx.db.from("vetting_documents").select("size_bytes").eq("purpose", "partner").is("deleted_at", null).limit(5000),
    ]);
    rows = (data ?? []) as Row[];
    counts = (all ?? []).reduce((m, r) => ({ ...m, [r.status]: (m[r.status] ?? 0) + 1 }), {} as Record<string, number>);
    storage = (sizes ?? []).reduce((n, r) => n + (Number(r.size_bytes) || 0), 0);
  }
  let chapterRows: Row[] = [];
  if (coordinator && !national) {
    const supabase = await createClient();
    const { data } = supabase ? await supabase.rpc("partner_chapter_applications") : { data: null };
    chapterRows = (data ?? []) as Row[];
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold text-primary">Partner applications</h1>
        <p className="text-sm text-muted">Suppliers, service providers and toll manufacturers applying at <Link href="/partner-us" className="underline">/partner-us</Link>. {national ? "Only the national team (founder, admins, national reviewers) approves." : "As chapter coordinator you can recommend; only the national team approves."}</p>
      </div>
      {flash && <Notice tone={sp.done ? "ok" : "danger"}>{flash}</Notice>}

      {national && <>
        <PartnerTabs current="applications" />
        <nav aria-label="Filter by status" className="flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map(([k, l]) => (
            <Link key={k} href={`/admin/partners?status=${k}`} aria-current={k === status ? "page" : undefined} className="chip shrink-0">
              {l}{k !== "all" && <span className="text-muted"> {counts[k] ?? 0}</span>}
            </Link>
          ))}
        </nav>
        <p className="text-xs text-muted">Partner files stored: {(storage / 1048576).toFixed(1)} MB (Free plan: 1 GB for all files; each partner up to 50 MB).</p>
        {rows.length === 0 ? <Notice tone="info">Nothing here.</Notice> : <>
          <ul className="space-y-3 lg:hidden">
            {rows.map((r) => (
              <li key={r.id}><Link href={`/admin/partners/${r.id}`} className="card block p-4 hover:border-primary">
                <p className="text-xs font-bold uppercase text-muted">{PARTNER_CATEGORIES[r.category].label}</p>
                <p className="break-words text-lg font-extrabold text-primary">{r.legal_name || "(no name yet)"}</p>
                <p className="text-sm">{[r.city, r.province].filter(Boolean).join(", ") || "—"}</p>
                <p className="mt-1 text-sm"><strong>{STATUS[r.status].label}</strong> · sent {day(r.submitted_at)}</p>
              </Link></li>
            ))}
          </ul>
          <SyncedTableScroll label="Partner applications table">
            <table className="min-w-[900px] table-fixed text-left text-[15px]">
              <colgroup><col className="w-[280px]" /><col className="w-[150px]" /><col className="w-[200px]" /><col className="w-[180px]" /><col className="w-[120px]" /></colgroup>
              <thead className="border-b border-line bg-bg-soft"><tr>{["Business", "Category", "Town", "Status", "Sent"].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-line align-top last:border-0">
                    <td className="break-words px-3 py-2"><Link href={`/admin/partners/${r.id}`} className="font-bold text-primary underline">{r.legal_name || "(no name yet)"}</Link>{(r.revision ?? 1) > 1 && <span className="block text-xs text-muted">version {r.revision}</span>}</td>
                    <td className="px-3 py-2">{PARTNER_CATEGORIES[r.category].label}</td>
                    <td className="break-words px-3 py-2">{[r.city, r.province].filter(Boolean).join(", ") || "—"}</td>
                    <td className="px-3 py-2">{STATUS[r.status].label}</td>
                    <td className="px-3 py-2">{day(r.submitted_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SyncedTableScroll>
        </>}
      </>}

      {coordinator && !national && (
        <section className="space-y-3" aria-labelledby="ch-h">
          <h2 id="ch-h" className="text-lg font-bold">From your chapter</h2>
          {chapterRows.length === 0 ? <Notice tone="info">No applications from your chapter yet.</Notice> : (
            <ul className="space-y-3">
              {chapterRows.map((r) => (
                <li key={r.id} className="card space-y-2 p-4">
                  <p className="text-xs font-bold uppercase text-muted">{PARTNER_CATEGORIES[r.category].label}</p>
                  <p className="break-words text-lg font-extrabold">{r.legal_name || "(no name)"}</p>
                  <p className="text-sm">{[r.city, r.province].filter(Boolean).join(", ")} · <strong>{STATUS[r.status].label}</strong> · sent {day(r.submitted_at)}</p>
                  <form action={chapterNote} className="space-y-2">
                    <input type="hidden" name="id" value={r.id} />
                    <label htmlFor={`note-${r.id}`} className="label text-sm">Your recommendation for the national team</label>
                    <textarea id={`note-${r.id}`} name="note" required maxLength={2000} rows={3} className="input" placeholder="e.g. Known supplier in our chapter, reliable delivery for 3 years." />
                    <SubmitButton className="btn btn-outline min-h-11 w-full sm:w-auto" pendingText="Saving…">Send note</SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
