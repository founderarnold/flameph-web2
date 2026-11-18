import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { Notice } from "@/components/ui";
import { FixedNotice } from "@/components/LegalPage";
import { SubmitButton } from "@/components/SubmitButton";
import { ConsentNeeded } from "@/components/RecordsConsentNeeded";
import { cancelRecord, confirmRecord } from "@/app/account/record-actions";
import { memberCards } from "@/lib/people";
import { NO_MONEY_EN, NO_MONEY_TL } from "@/lib/legal-text";
import {
  myConfirmedAt, myReview, needsMyConfirm, otherParty, PAIR_CAP, peso, RECORD_ERRORS, RECORD_TAGS, showsNoMoney,
  STATUS_HELP, STATUS_LABEL, TAG_KEYS, theirConfirmedAt, type TxRecord,
} from "@/lib/records";
import { recordsConsentOn } from "@/lib/records-server";

export const metadata = { title: "Transaction record", robots: { index: false } };

const DONE: Record<string, string> = {
  accepted: "Quote accepted. When the work is done, both of you confirm this record.",
  pending: "You confirmed. It counts after the other member confirms too.",
  confirmed: "Both of you confirmed. This record now counts.",
  cancelled: "Record cancelled.",
};
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }) : null);

/** One transaction record. Only its two members (and admins reviewing a dispute) can open it. */
export default async function RecordPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, user } = await requireUser(`/records/${id}`);
  const { data } = await supabase.from("transaction_records").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const r = data as TxRecord;
  const party = user.id === r.requester_id || user.id === r.provider_id;
  const other = party ? otherParty(r, user.id) : r.provider_id;
  const cards = await memberCards(supabase, [r.requester_id, r.provider_id]);
  const name = (uid: string) => cards.get(uid)?.name ?? "FLAME PH member";

  // Does this record count? Confirmed, and one of the first 3 with this member, or both businesses vetted.
  let counts: boolean | null = null;
  if (r.status === "confirmed") {
    const [{ data: pair }, { data: v1 }, { data: v2 }] = await Promise.all([
      supabase.from("transaction_records").select("id, confirmed_at").eq("status", "confirmed")
        .or(`and(requester_id.eq.${r.requester_id},provider_id.eq.${r.provider_id}),and(requester_id.eq.${r.provider_id},provider_id.eq.${r.requester_id})`)
        .order("confirmed_at", { ascending: true }).order("id", { ascending: true }).limit(200),
      supabase.rpc("is_vetted", { uid: r.requester_id }),
      supabase.rpc("is_vetted", { uid: r.provider_id }),
    ]);
    const rank = (pair ?? []).findIndex((x) => x.id === r.id) + 1;
    counts = (rank > 0 && rank <= PAIR_CAP) || (Boolean(v1) && Boolean(v2));
  }
  const consentOn = party ? await recordsConsentOn(supabase, user.id) : true;
  const err = sp.error ? RECORD_ERRORS[sp.error] ?? RECORD_ERRORS.failed : null;
  const done = sp.done ? DONE[sp.done] : null;
  const review = party ? myReview(r, user.id) : { rating: null, tags: [] as string[] };
  const today = new Date().toISOString().slice(0, 10);
  const yearAgo = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
  const canDispute = party && ["in_progress", "pending", "confirmed"].includes(r.status);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href={party ? "/records" : "/admin/moderation"} className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary"><span aria-hidden>←</span> {party ? "Records" : "Moderation"}</Link>
      {done && <div role="status"><Notice tone="ok">{done}</Notice></div>}
      {err && <div role="alert"><Notice tone="danger">{err}</Notice></div>}

      <article className="card space-y-3 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-flame-strong">Transaction record · {r.category}</p>
        <h1 className="text-2xl font-extrabold">{r.description}</h1>
        <p className="font-semibold">{STATUS_LABEL[r.status]}</p>
        <p className="text-sm text-muted">{STATUS_HELP[r.status]}</p>
        <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
          <div><dt className="text-muted">Asked by (buyer)</dt><dd className="font-semibold">{name(r.requester_id)}{r.requester_id === user.id ? " (you)" : ""}</dd></div>
          <div><dt className="text-muted">Provided by (seller)</dt><dd className="font-semibold">{name(r.provider_id)}{r.provider_id === user.id ? " (you)" : ""}</dd></div>
          <div><dt className="text-muted">Date of the deal</dt><dd className="font-semibold">{r.deal_date}</dd></div>
          <div><dt className="text-muted">Amount typed by the members</dt><dd className="font-semibold">{peso(r.amount) ?? "Not given"}</dd></div>
          <div><dt className="text-muted">{name(r.requester_id)} confirmed</dt><dd>{when(r.requester_confirmed_at) ?? "Not yet"}</dd></div>
          <div><dt className="text-muted">{name(r.provider_id)} confirmed</dt><dd>{when(r.provider_confirmed_at) ?? "Not yet"}</dd></div>
        </dl>
        <p className="text-xs text-muted">FLAME PH never checks the amount. Only the two members see it; it is never shown on profiles.</p>
        {counts !== null && (
          <p className={`rounded-xl p-3 text-sm font-semibold ${counts ? "bg-primary-soft text-fg" : "bg-bg-soft text-muted"}`}>
            {counts ? "This record counts toward badges and reputation." : `This record doesn't count yet: only the first ${PAIR_CAP} records between the same two members count until both businesses are vetted.`}
          </p>
        )}
        {r.status === "disputed" && <p className="text-sm">Disputed {r.disputed_by === user.id ? "by you" : r.disputed_by ? `by ${name(r.disputed_by)}` : ""} on {when(r.disputed_at)}. A FLAME PH admin will review it.</p>}
        {r.status === "voided" && <p className="text-sm">Voided on {when(r.voided_at)}.{r.void_note ? ` Note: ${r.void_note}` : ""} If you think this is a mistake, <Link href="/contact" className="font-semibold text-primary underline">contact FLAME PH</Link>.</p>}
        {r.request_id && party && <Link href={`/requests/${r.request_id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">See the request and quote</Link>}
      </article>

      {/* The no-money reminder: on every confirmed record, English and Taglish, exactly as written. It has no close button. */}
      {showsNoMoney(r) && (
        <section aria-label="Reminder"><FixedNotice><p>{NO_MONEY_EN}</p><p lang="fil">{NO_MONEY_TL}</p></FixedNotice></section>
      )}

      {party && !consentOn && needsMyConfirm(r, user.id) && <ConsentNeeded />}

      {party && needsMyConfirm(r, user.id) && (
        <section id="confirm" aria-labelledby="confirm-h" className="card scroll-mt-24 space-y-4 p-4">
          <h2 id="confirm-h" className="text-lg font-bold">Confirm the deal with {name(other)}</h2>
          <p className="text-sm text-muted">Confirm only when the work or delivery is done. {theirConfirmedAt(r, user.id) ? `${name(other)} already confirmed. ` : ""}If you change the amount or the date, the other member is asked to confirm again.</p>
          <form action={confirmRecord} className="space-y-4">
            <input type="hidden" name="record_id" value={r.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="deal_date" className="label">Date of the deal</label>
                <input id="deal_date" name="deal_date" type="date" min={yearAgo} max={today} defaultValue={r.deal_date} className="input" />
              </div>
              <div>
                <label htmlFor="amount" className="label">Amount in pesos (optional)</label>
                <input id="amount" name="amount" inputMode="decimal" maxLength={20} defaultValue={r.amount === null ? "" : String(Number(r.amount))} className="input" aria-describedby="amt-help" />
                <p id="amt-help" className="mt-1 text-xs text-muted">Typed by you; FLAME PH never checks it.</p>
              </div>
            </div>
            <fieldset>
              <legend className="label">Rate {name(other)} (optional)</legend>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <label key={n} className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1 rounded-xl border border-line px-3 has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
                    <input type="radio" name="rating" value={n} defaultChecked={review.rating === n} className="size-4" /><span>{n} ★</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="label">Endorse {name(other)} (optional, up to 5)</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {TAG_KEYS.map((t) => (
                  <label key={t} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line px-3 has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
                    <input type="checkbox" name="tags" value={t} defaultChecked={review.tags.includes(t)} className="size-4" />{RECORD_TAGS[t]}
                  </label>
                ))}
              </div>
            </fieldset>
            <SubmitButton className="btn btn-primary min-h-11 w-full" pendingText="Confirming…">Confirm this deal</SubmitButton>
          </form>
        </section>
      )}
      {party && myConfirmedAt(r, user.id) && r.status === "pending" && <Notice tone="info">You confirmed. Waiting for {name(other)} to confirm.</Notice>}

      {party && (r.status === "in_progress" || canDispute) && (
        <section aria-labelledby="problem-h" className="card space-y-3 p-4">
          <h2 id="problem-h" className="text-lg font-bold">Something wrong?</h2>
          {r.status === "in_progress" && (
            <form action={cancelRecord} className="space-y-2">
              <input type="hidden" name="record_id" value={r.id} />
              <p className="text-sm text-muted">The deal didn&apos;t happen? Either of you can cancel before anyone confirms.</p>
              <SubmitButton className="btn btn-outline min-h-11" pendingText="Cancelling…">Cancel this record</SubmitButton>
            </form>
          )}
          {canDispute && (
            <div className="space-y-2">
              <p className="text-sm text-muted">Dispute it if the details are wrong or the deal didn&apos;t happen. The record goes on hold for a FLAME PH admin to review.</p>
              <Link href={`/report?type=record&id=${r.id}&back=/records/${r.id}`} className="btn btn-outline min-h-11">Dispute this record</Link>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
