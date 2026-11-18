import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { ConsentNeeded } from "@/components/RecordsConsentNeeded";
import { sendRequest } from "@/app/account/record-actions";
import { memberCards } from "@/lib/people";
import { DETAILS_MAX, RECORD_CATEGORIES, RECORD_ERRORS, TITLE_MAX } from "@/lib/records";
import { recordsConsentOn } from "@/lib/records-server";

export const metadata = { title: "New request", robots: { index: false } };

/** Ask for a product or service: from one member ("Send a request" on their page) or from all members. */
export default async function NewRequestPage({ searchParams }: { searchParams: Promise<{ to?: string; error?: string }> }) {
  const sp = await searchParams;
  const to = sp.to && /^[0-9a-f-]{36}$/i.test(sp.to) ? sp.to : null;
  const { supabase, user } = await requireUser(`/requests/new${to ? `?to=${to}` : ""}`);
  const target = to && to !== user.id ? (await memberCards(supabase, [to])).get(to) : null;
  const consentOn = await recordsConsentOn(supabase, user.id);
  const err = sp.error ? RECORD_ERRORS[sp.error] ?? RECORD_ERRORS.failed : null;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link href="/requests" className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary"><span aria-hidden>←</span> Requests</Link>
      <h1 className="text-2xl font-extrabold">{target ? `Request from ${target.name}` : "New request"}</h1>
      <p className="text-muted">{target ? "Only you and this member can see this request." : "Every active member can see an open request and send you a quote. Only you see the quotes."}</p>
      {!consentOn && <ConsentNeeded />}
      <form action={sendRequest} className="card space-y-4 p-4" aria-describedby={err ? "req-error" : undefined}>
        {target && <input type="hidden" name="provider_id" value={to!} />}
        <div>
          <label htmlFor="title" className="label">What do you need?</label>
          <input id="title" name="title" required minLength={3} maxLength={TITLE_MAX} className="input" placeholder="e.g. 200 printed pastry boxes" />
        </div>
        <div>
          <label htmlFor="category" className="label">Category</label>
          <select id="category" name="category" required className="input" defaultValue={target?.sector && (RECORD_CATEGORIES as readonly string[]).includes(target.sector) ? target.sector : ""}>
            <option value="" disabled>Choose one</option>
            {RECORD_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="details" className="label">Details (optional)</label>
          <textarea id="details" name="details" rows={4} maxLength={DETAILS_MAX} className="input" placeholder="Quantity, size, where to deliver, your budget…" />
        </div>
        <div>
          <label htmlFor="needed_by" className="label">Needed by (optional)</label>
          <input id="needed_by" name="needed_by" type="date" min={today} className="input" />
        </div>
        <p className="text-sm text-muted">FLAME PH only records deals. No money passes through FLAME PH; payment and delivery are between you and the other member.</p>
        {err && <p id="req-error" role="alert" className="rounded-xl bg-danger-soft p-3 text-sm font-semibold text-danger">{err}</p>}
        <SubmitButton className="btn btn-primary min-h-11 w-full" pendingText="Sending…">{target ? `Send to ${target.name}` : "Send to all members"}</SubmitButton>
      </form>
      {!target && to && <Notice tone="info">We couldn&apos;t find that member, so this request will be open to all members.</Notice>}
    </div>
  );
}
