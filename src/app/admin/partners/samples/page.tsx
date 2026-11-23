import Link from "next/link";
import { adminContext } from "@/lib/admin/guard";
import { createClient } from "@/lib/supabase/server";
import { Notice } from "@/components/ui";
import { PartnerTabs } from "@/components/admin/PartnerTabs";
import { adminFlash, SAMPLE_STATUS, sampleTotal, when, type SampleStatus } from "@/lib/partner-cases";

export const metadata = { title: "Sample tests", robots: { index: false } };

type Row = { id: string; ref_no: string; status: SampleStatus; partner_name: string; product_name: string; total: number | null; safety_concern: boolean; submitted_at: string | null; chapter_id: string | null };
const FILTERS: [string, string][] = [["submitted", "Waiting for review"], ["reviewed", "Reviewed"], ["safety", "Safety concerns"], ["all", "All sent"]];

/** Sent sample tests. The national team sees and reviews all; a chapter coordinator sees their chapter's (read only). */
export default async function SamplesAdmin({ searchParams }: { searchParams: Promise<{ status?: string; done?: string; error?: string; why?: string }> }) {
  const sp = await searchParams;
  const ctx = await adminContext(["super_admin", "admin", "national_reviewer", "chapter_coordinator"]);
  const national = ctx.roles.some((r) => ["super_admin", "admin", "national_reviewer"].includes(r));
  const status = FILTERS.some(([k]) => k === sp.status) ? sp.status! : "submitted";
  // Coordinators read through their own session, so row level security limits them to their chapter.
  const db = national ? ctx.db : await createClient();
  let rows: Row[] = [];
  let failed = !db;
  if (db) {
    let q = db.from("partner_sample_tests").select("id, ref_no, status, partner_name, product_name, total, safety_concern, submitted_at, chapter_id").neq("status", "draft").order("submitted_at", { ascending: false }).limit(300);
    if (status === "safety") q = q.eq("safety_concern", true);
    else if (status !== "all") q = q.eq("status", status);
    const { data, error } = await q;
    rows = (data ?? []) as Row[];
    failed = !!error;
  }
  const flash = adminFlash(sp);

  return (
    <div className="space-y-4">
      {national && <PartnerTabs current="samples" />}
      <div>
        <h1 className="text-2xl font-extrabold text-primary">Sample tests</h1>
        <p className="text-sm text-muted">Chapter testers&apos; reports on partners&apos; samples. {national ? "Review each one and choose whether to share the result with the partner. Scores feed the Best Offer \"quality and samples\" score." : "You see your chapter's tests. Only the national team reviews them."}</p>
      </div>
      {flash && <Notice tone={flash.tone}>{flash.text}</Notice>}
      {failed && <Notice tone="warn">Sample tests open after the database update (0035).</Notice>}
      <nav aria-label="Filter" className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map(([k, l]) => <Link key={k} href={`/admin/partners/samples?status=${k}`} aria-current={k === status ? "page" : undefined} className="chip shrink-0">{l}</Link>)}
      </nav>
      {rows.length === 0 ? <Notice tone="info">Nothing here.</Notice> : (
        <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {rows.map((r) => (
            <li key={r.id} className={`card p-4 ${r.safety_concern ? "border-2 border-danger" : ""}`}>
              <p className="text-xs font-bold uppercase text-muted">{r.ref_no} · {SAMPLE_STATUS[r.status].label}</p>
              {national ? <Link href={`/admin/partners/samples/${r.id}`} className="block break-words text-lg font-extrabold text-primary underline">{r.product_name}</Link> : <p className="break-words text-lg font-extrabold">{r.product_name}</p>}
              <p className="break-words text-sm">{r.partner_name}</p>
              <p className="text-sm">Score {sampleTotal(r.total)}{r.safety_concern ? <strong className="text-danger"> · safety concern</strong> : ""}</p>
              <p className="text-xs text-muted">Sent {when(r.submitted_at)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
