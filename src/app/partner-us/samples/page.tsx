import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import {
  ARRIVAL, CASE_DONE, CASE_ERRORS, day, FEEDBACK_TAGS, RECOMMEND, SAMPLE_SCORES, SAMPLE_STATUS, sampleTotal, when,
  type FeedbackTag, type SampleStatus,
} from "@/lib/partner-cases";
import { startSample } from "./actions";

export const metadata = { title: "Sample tests", robots: { index: false } };

type Row = { id: string; ref_no: string; status: SampleStatus; partner_name: string; product_name: string; total: number | null; safety_concern: boolean; updated_at: string; submitted_at: string | null };
type Target = { partner_user_id: string; partner_name: string; offer_id: string | null; offer_title: string | null; item_id: string | null; product_name: string | null; sell_unit: string | null };
type Result = { id: string; ref_no: string; product_name: string; received_on: string; arrival_condition: keyof typeof ARRIVAL; total: number; would_recommend: keyof typeof RECOMMEND; feedback_tags: FeedbackTag[]; feedback: string | null; safety_concern: boolean; reviewed_at: string } & Record<string, number | string | boolean | null | string[]>;
// "partner|offer|item", plus "|product name" for a FLAME Signature product (0037), which has an offer but no item line.
const pickKey = (t: Target) => `${t.partner_user_id}|${t.offer_id ?? ""}|${t.item_id ?? ""}${t.offer_id && !t.item_id && t.product_name ? `|${encodeURIComponent(t.product_name)}` : ""}`;
const TESTERS = ["super_admin", "admin", "national_reviewer", "chapter_tester"];

/** Chapter testers (and the national team during the pilot): their sample tests and a button to start one.
 *  Accredited partners: the reviewed results the national team chose to share with them. */
export default async function Samples({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase, user, roles } = await requireUser("/partner-us/samples");
  const tester = roles.some((r) => TESTERS.includes(r));
  const [{ data, error }, { data: targets }, { data: results }] = await Promise.all([
    tester ? supabase.from("partner_sample_tests").select("id, ref_no, status, partner_name, product_name, total, safety_concern, updated_at, submitted_at").eq("tester_id", user.id).order("created_at", { ascending: false }).limit(200) : Promise.resolve({ data: [], error: null }),
    tester ? supabase.rpc("partner_sample_targets") : Promise.resolve({ data: [] }),
    supabase.rpc("my_sample_results"),
  ]);
  const rows = (data ?? []) as Row[];
  // Every product from the partners' offers, plus one "other product" line per partner.
  const raw = (targets ?? []) as Target[];
  const picks = [...new Map([...raw, ...raw.map((t) => ({ ...t, offer_id: null, offer_title: null, item_id: null, product_name: null, sell_unit: null }))]
    .map((t) => [pickKey(t), t])).values()]
    .sort((x, y) => x.partner_name.localeCompare(y.partner_name) || (x.product_name ? 0 : 1) - (y.product_name ? 0 : 1));
  const shared = (results ?? []) as Result[];
  const err = sp.error ? CASE_ERRORS[sp.error] ?? CASE_ERRORS.failed : error ? CASE_ERRORS.unavailable : null;
  const done = sp.done ? CASE_DONE[sp.done] : null;

  return (
    <div className="container-x max-w-3xl space-y-5 py-6 sm:py-10">
      <nav aria-label="Breadcrumb" className="text-sm text-muted"><Link href="/partner-us" className="underline">Become an Accredited Partner</Link> › Sample tests</nav>
      <header>
        <p className="font-display font-bold text-flame-strong" lang="fil">Pagsusuri ng sample ng partner</p>
        <h1 className="text-3xl font-extrabold text-primary">Sample tests</h1>
        <p className="mt-1 text-muted">Chapter testers try partners&apos; samples the way a member would, score them the same way every time, and send photos. The national team reads every test. Testers never see prices or commissions.</p>
      </header>
      {done && <div role="status"><Notice tone="ok">{done}</Notice></div>}
      {err && <div role="alert"><Notice tone="danger">{err}</Notice></div>}

      {tester && (
        <section className="card space-y-3 border-2 border-flame p-4 sm:p-5" aria-labelledby="new-h">
          <h2 id="new-h" className="text-lg font-bold">Start a sample test</h2>
          {picks.length === 0 ? <Notice tone="info">There are no accredited partners to test yet.</Notice> : (
            <form action={startSample} className="space-y-3">
              <div className="field">
                <label htmlFor="target" className="label">Partner and product</label>
                <select id="target" name="target" required className="input" defaultValue="">
                  <option value="" disabled>Choose…</option>
                  {picks.map((t) => (
                    <option key={pickKey(t)} value={pickKey(t)}>
                      {t.partner_name}{t.product_name ? ` · ${t.product_name}${t.sell_unit ? ` (${t.sell_unit})` : ""}` : " · other product or service"}
                    </option>
                  ))}
                </select>
                <p className="field-help">Products come from the partner&apos;s Best Offers. Not listed? Choose the partner&apos;s &quot;other product&quot; line and type the name below.</p>
              </div>
              <div className="field">
                <label htmlFor="product_name" className="label">Product name (only if it is not in the list)</label>
                <input id="product_name" name="product_name" maxLength={150} className="input" placeholder="e.g. Kraft bag 10x14" />
              </div>
              <SubmitButton className="btn btn-flame min-h-11 w-full sm:w-auto" pendingText="Starting…">Start test</SubmitButton>
            </form>
          )}
        </section>
      )}

      {tester && (
        <section aria-labelledby="mine-h" className="space-y-3">
          <h2 id="mine-h" className="text-xl font-extrabold">My sample tests</h2>
          {rows.length === 0 ? <Notice tone="info">No tests yet.</Notice> : (
            <ul className="space-y-3">
              {rows.map((r) => (
                <li key={r.id} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase text-muted">{r.ref_no} · {r.partner_name}</p>
                    <p className="break-words text-lg font-extrabold">{r.product_name}</p>
                    <p className="text-sm">{SAMPLE_STATUS[r.status].label}{r.total !== null ? ` · score ${sampleTotal(r.total)}` : ""}{r.safety_concern ? " · safety concern flagged" : ""}</p>
                    <p className="text-xs text-muted">{r.submitted_at ? `Sent ${when(r.submitted_at)}` : `Last saved ${when(r.updated_at)}`}</p>
                  </div>
                  <Link href={`/partner-us/samples/${r.id}`} className="btn btn-primary min-h-11 w-full sm:w-auto">{r.status === "draft" ? "Continue" : "Open"}</Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {shared.length > 0 && (
        <section aria-labelledby="res-h" className="space-y-3">
          <h2 id="res-h" className="text-xl font-extrabold">Sample results for my products</h2>
          <p className="text-sm text-muted">Shared by the national team. Testers&apos; names are not shown. <span lang="fil">Resulta ng pagsusuri sa inyong mga sample.</span></p>
          <ul className="space-y-3">
            {shared.map((r) => (
              <li key={r.id} className="card space-y-1 p-4">
                <p className="text-xs font-bold uppercase text-muted">{r.ref_no} · received {day(r.received_on)}</p>
                <p className="text-lg font-extrabold">{r.product_name}: {sampleTotal(r.total)}</p>
                <p className="text-sm">{SAMPLE_SCORES.map((s) => `${s.label} ${r[s.key]}/5`).join(" · ")}</p>
                <p className="text-sm">Arrived: {ARRIVAL[r.arrival_condition]} · {RECOMMEND[r.would_recommend]}</p>
                {r.feedback_tags.length > 0 && <p className="text-sm text-muted">{r.feedback_tags.map((t) => FEEDBACK_TAGS[t]).join(" · ")}</p>}
                {r.feedback && <p className="whitespace-pre-line text-[15px]">{r.feedback}</p>}
                {r.safety_concern && <p className="text-sm font-bold text-danger">A safety concern was raised. The national team will contact you.</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {!tester && shared.length === 0 && (
        <Notice tone="info">Sample tests are done by chapter testers named by the national team. Accredited partners see their results here once the national team shares them.</Notice>
      )}

      <section className="card p-4 sm:p-5" aria-labelledby="how-h">
        <h2 id="how-h" className="text-lg font-bold">How a sample is tested</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px] leading-6 text-muted">
          <li>Write down when it arrived and how it looked, the batch or lot number and the expiry date.</li>
          <li>Use it as a member would. Score five things from 1 to 5: packaging, look, quality, does what it says, label.</li>
          <li>Tick the standard comments that fit, write what you noticed, and add photos.</li>
          <li>If anything could hurt or make someone sick, tick the safety box. The national team is told at once.</li>
          <li>Chapters test and report; only the national team decides.</li>
        </ul>
      </section>
    </div>
  );
}
