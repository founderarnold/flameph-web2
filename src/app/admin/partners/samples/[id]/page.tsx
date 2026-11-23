import Link from "next/link";
import { notFound } from "next/navigation";
import { adminContext } from "@/lib/admin/guard";
import { Notice } from "@/components/ui";
import { PartnerTabs } from "@/components/admin/PartnerTabs";
import { SubmitButton } from "@/components/SubmitButton";
import { adminFlash, ARRIVAL, day, FEEDBACK_TAGS, RECOMMEND, SAMPLE_COLS, SAMPLE_SCORES, SAMPLE_STATUS, sampleTotal, when, YES_PARTLY_NO, type SampleRow } from "@/lib/partner-cases";
import { reviewSample } from "../../complaints/actions";

export const metadata = { title: "Sample test", robots: { index: false } };

/** One sample test for the national team: the tester's answers and photos, the review note, and "share with partner". */
export default async function SampleAdmin({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string; error?: string; why?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await adminContext(["super_admin", "admin", "national_reviewer"]);
  const { data } = await ctx.db.from("partner_sample_tests").select(`${SAMPLE_COLS}, tester_id, partner_user_id, chapter_id, review_note, partner_visible, reviewed_by`).eq("id", id).neq("status", "draft").maybeSingle();
  if (!data) notFound();
  const t = data as unknown as SampleRow & { tester_id: string | null; partner_user_id: string | null; chapter_id: string | null; review_note: string | null; partner_visible: boolean };
  const [{ data: photos }, { data: tester }, { data: chapter }, { data: offer }] = await Promise.all([
    ctx.db.from("vetting_documents").select("id, file_name").eq("sample_id", id).is("deleted_at", null).order("uploaded_at"),
    t.tester_id ? ctx.db.from("profiles").select("full_name").eq("id", t.tester_id).maybeSingle() : Promise.resolve({ data: null }),
    t.chapter_id ? ctx.db.from("chapters").select("name").eq("id", t.chapter_id).maybeSingle() : Promise.resolve({ data: null }),
    t.offer_id ? ctx.db.from("supplier_offers").select("id, title").eq("id", t.offer_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const own = t.tester_id === ctx.user.id || t.partner_user_id === ctx.user.id;
  const flash = adminFlash(sp);

  return (
    <div className="space-y-4">
      <PartnerTabs current="samples" />
      <nav aria-label="Breadcrumb" className="text-sm text-muted"><Link href="/admin/partners/samples" className="underline">Sample tests</Link> › {t.ref_no}</nav>
      <h1 className="break-words text-2xl font-extrabold text-primary">{t.product_name}: {sampleTotal(t.total)}</h1>
      <p className="text-sm">{t.partner_name} · {SAMPLE_STATUS[t.status].label} · tested by {tester?.full_name ?? "account removed"}{chapter ? ` (${chapter.name})` : " (national team)"}{offer ? <> · offer <Link href={`/admin/partners/offers/${offer.id}`} className="underline">{offer.title}</Link></> : null}</p>
      {flash && <Notice tone={flash.tone}>{flash.text}</Notice>}
      {t.safety_concern && <Notice tone="danger">Safety concern: {t.safety_note}</Notice>}

      <section className="card space-y-2 p-4 text-[15px]">
        <p>Received {day(t.received_on)}{t.batch_lot ? ` · lot ${t.batch_lot}` : ""}{t.expiry_on ? ` · expiry ${day(t.expiry_on)}` : ""} · {t.arrival_condition ? ARRIVAL[t.arrival_condition] : ""}</p>
        <p>Matches the description: {t.matches_description ? YES_PARTLY_NO[t.matches_description] : "—"} · label complete: {t.label_complete ? YES_PARTLY_NO[t.label_complete] : "—"}</p>
        <ul className="grid gap-1 sm:grid-cols-2">{SAMPLE_SCORES.map((s) => <li key={s.key}>{s.label}: <strong>{t[s.key]}/5</strong></li>)}</ul>
        <p>{t.would_recommend ? RECOMMEND[t.would_recommend] : ""}</p>
        {t.feedback_tags.length > 0 && <p className="text-sm text-muted">{t.feedback_tags.map((x) => FEEDBACK_TAGS[x]).join(" · ")}</p>}
        {t.feedback && <p className="whitespace-pre-line">{t.feedback}</p>}
        <p className="text-xs text-muted">Sent {when(t.submitted_at)}{t.reviewed_at ? ` · reviewed ${when(t.reviewed_at)}` : ""}</p>
      </section>

      <section className="card space-y-2 p-4">
        <h2 className="text-lg font-bold">Photos</h2>
        {(photos ?? []).length === 0 ? <p className="text-sm">No photos.</p> : (
          <ul className="flex flex-wrap gap-2">{((photos ?? []) as { id: string; file_name: string }[]).map((p) => <li key={p.id}><a href={`/api/vetting/doc/${p.id}`} target="_blank" rel="noopener" className="btn btn-outline min-h-11 px-3 text-sm">{p.file_name}</a></li>)}</ul>
        )}
      </section>

      {own ? <Notice tone="info">You tested this sample or it is your product, so another national team member reviews it.</Notice> : (
        <form action={reviewSample} className="card space-y-3 p-4">
          <input type="hidden" name="sample_id" value={t.id} />
          <h2 className="text-lg font-bold">{t.status === "reviewed" ? "Review (you can update the note and sharing)" : "Review"}</h2>
          <div className="field"><label htmlFor="review_note" className="label">Team note (the tester and partner do not see it)</label><textarea id="review_note" name="review_note" maxLength={2000} rows={3} className="input" defaultValue={t.review_note ?? ""} /></div>
          <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="partner_visible" value="yes" defaultChecked={t.partner_visible} className="check" />Share the result with the partner (without the tester&apos;s name or this note)</label>
          <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Saving…">{t.status === "reviewed" ? "Save" : "Mark reviewed"}</SubmitButton>
        </form>
      )}
    </div>
  );
}
