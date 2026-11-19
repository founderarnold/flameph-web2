import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { Avatar, Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { ConsentNeeded } from "@/components/RecordsConsentNeeded";
import { acceptQuote, cancelRequest, sendQuote, withdrawQuote } from "@/app/account/record-actions";
import { memberCards } from "@/lib/people";
import { shortTime } from "@/lib/messages";
import { peso, RECORD_ERRORS, TERMS_MAX } from "@/lib/records";
import { recordsConsentOn } from "@/lib/records-server";

export const metadata = { title: "Request", robots: { index: false } };

type Req = { id: string; requester_id: string; provider_id: string | null; title: string; category: string; details: string | null; needed_by: string | null; status: string; created_at: string };
type Quote = { id: string; request_id: string; provider_id: string; terms: string; amount: number | string | null; valid_until: string | null; status: string; created_at: string };

const DONE: Record<string, string> = {
  sent: "Request sent.", quoted: "Quote sent. The member will be told.", withdrawn: "Quote withdrawn.", cancelled: "Request cancelled.",
};
const Q_STATUS: Record<string, string> = { sent: "Waiting for an answer", accepted: "Accepted", declined: "Not chosen", withdrawn: "Withdrawn" };

/** One request: the requester sees every quote and can accept one; a provider sees only their own quote. */
export default async function RequestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, user } = await requireUser(`/requests/${id}`);
  const { data: r } = await supabase.from("service_requests").select("*").eq("id", id).maybeSingle();
  if (!r) notFound();
  const req = r as Req;
  const [{ data: qs }, { data: rec }, consentOn] = await Promise.all([
    supabase.from("service_quotes").select("*").eq("request_id", id).order("created_at", { ascending: true }).limit(100),
    supabase.from("transaction_records").select("id").eq("request_id", id).maybeSingle(),
    recordsConsentOn(supabase, user.id),
  ]);
  const quotes = (qs ?? []) as Quote[];
  const mine = req.requester_id === user.id;
  const myQuote = quotes.find((q) => q.provider_id === user.id);
  const cards = await memberCards(supabase, [req.requester_id, ...quotes.map((q) => q.provider_id), ...(req.provider_id ? [req.provider_id] : [])]);
  const name = (uid: string) => cards.get(uid)?.name ?? "FLAME PH member";
  const today = new Date().toISOString().slice(0, 10);
  const err = sp.error ? RECORD_ERRORS[sp.error] ?? RECORD_ERRORS.failed : null;
  const done = sp.done ? DONE[sp.done] : null;
  const canQuote = !mine && req.status === "open" && !myQuote;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/requests" className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary"><span aria-hidden>←</span> Requests</Link>
      {done && <div role="status"><Notice tone="ok">{done}</Notice></div>}
      {err && <div role="alert"><Notice tone="danger">{err}</Notice></div>}

      <article className="card space-y-2 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-flame-strong">{req.category} · {req.status === "open" ? "Open" : req.status === "accepted" ? "Quote accepted" : "Cancelled"}</p>
        <h1 className="text-2xl font-extrabold">{req.title}</h1>
        <p className="text-sm text-muted">
          {mine ? "You asked" : `${name(req.requester_id)} asked`} {req.provider_id ? (req.provider_id === user.id ? "you" : name(req.provider_id)) : "all members"} · {shortTime(req.created_at)}
          {req.needed_by ? ` · Needed by ${req.needed_by}` : ""}
        </p>
        {req.details && <p className="whitespace-pre-line">{req.details}</p>}
        {rec && <Link href={`/records/${rec.id}`} className="btn btn-outline min-h-11">Open the transaction record</Link>}
        {mine && req.status === "open" && (
          <form action={cancelRequest}><input type="hidden" name="request_id" value={req.id} />
            <SubmitButton className="btn btn-outline min-h-11" pendingText="Cancelling…">Cancel request</SubmitButton>
          </form>
        )}
      </article>

      {!consentOn && (canQuote || mine) && <ConsentNeeded />}

      <section id="quotes" aria-labelledby="quotes-h" className="scroll-mt-24 space-y-2">
        <h2 id="quotes-h" className="text-lg font-bold">{mine ? `Quotes (${quotes.length})` : "Your quote"}</h2>
        {quotes.length === 0 ? <p className="text-sm text-muted">{mine ? "No quotes yet. Members who can help will send their terms here." : "You haven't sent a quote."}</p> : (
          <ul className="space-y-3">
            {quotes.map((q) => (
              <li key={q.id} className="card space-y-2 p-4">
                <div className="flex items-center gap-2.5">
                  <Avatar name={name(q.provider_id)} size={36} />
                  <div className="min-w-0">
                    {cards.get(q.provider_id)?.slug ? <Link href={`/members/${cards.get(q.provider_id)!.slug}`} className="flex min-h-11 items-center truncate font-semibold hover:underline">{name(q.provider_id)}</Link> : <p className="truncate font-semibold">{name(q.provider_id)}</p>}
                    <p className="text-xs text-muted">{shortTime(q.created_at)} · {Q_STATUS[q.status] ?? q.status}</p>
                  </div>
                </div>
                <p className="whitespace-pre-line">{q.terms}</p>
                <p className="text-sm text-muted">{peso(q.amount) ? <>Amount typed by the provider: <strong className="text-fg">{peso(q.amount)}</strong> (FLAME PH doesn&apos;t check it)</> : "No amount given"}{q.valid_until ? ` · Valid until ${q.valid_until}` : ""}</p>
                {mine && req.status === "open" && q.status === "sent" && (
                  <form action={acceptQuote}>
                    <input type="hidden" name="quote_id" value={q.id} /><input type="hidden" name="request_id" value={req.id} />
                    <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Accepting…">Accept this quote</SubmitButton>
                  </form>
                )}
                {q.provider_id === user.id && q.status === "sent" && (
                  <form action={withdrawQuote}>
                    <input type="hidden" name="quote_id" value={q.id} /><input type="hidden" name="request_id" value={req.id} />
                    <SubmitButton className="btn btn-outline min-h-11" pendingText="Withdrawing…">Withdraw my quote</SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        {mine && req.status === "open" && quotes.some((q) => q.status === "sent") && <p className="text-sm text-muted">Accepting a quote closes the request and opens a transaction record for you and that member. The other quotes are marked &quot;Not chosen&quot;.</p>}
      </section>

      {canQuote && (
        <section id="quote" aria-labelledby="quote-h" className="card scroll-mt-24 space-y-4 p-4">
          <h2 id="quote-h" className="text-lg font-bold">Send your quote</h2>
          <form action={sendQuote} className="space-y-4">
            <input type="hidden" name="request_id" value={req.id} />
            <div>
              <label htmlFor="terms" className="label">Your terms</label>
              <textarea id="terms" name="terms" required minLength={3} maxLength={TERMS_MAX} rows={4} className="input" placeholder="What you'll deliver, when, and how you'll be paid (directly between you)." />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="amount" className="label">Amount in pesos (optional)</label>
                <input id="amount" name="amount" inputMode="decimal" maxLength={20} className="input" placeholder="e.g. 5,000" aria-describedby="amount-help" />
                <p id="amount-help" className="mt-1 text-xs text-muted">FLAME PH never checks or collects it.</p>
              </div>
              <div>
                <label htmlFor="valid_until" className="label">Valid until (optional)</label>
                <input id="valid_until" name="valid_until" type="date" min={today} className="input" />
              </div>
            </div>
            <SubmitButton className="btn btn-primary min-h-11 w-full" pendingText="Sending…">Send quote</SubmitButton>
          </form>
        </section>
      )}
      {!mine && <Link href={`/report?type=member&id=${req.requester_id}&back=/requests/${req.id}`} className="inline-flex min-h-11 items-center text-sm text-muted underline">Report this member</Link>}
    </div>
  );
}
