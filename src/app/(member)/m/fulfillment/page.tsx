import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { SubmissionForm } from "@/components/SubmissionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { FORMS } from "@/lib/forms";
import { TabShell } from "@/components/shell/TabShell";
import { buttonClass } from "@/components/ui";
import { timeAgo } from "@/lib/feed-rules";
import { memberCards } from "@/lib/people";
import { RECORD_CATEGORIES, RECORD_ERRORS } from "@/lib/records";
import { sendFulfillmentRequest } from "@/app/account/record-actions";
import { FULFILLMENT_LINKS, FULFILLMENT_PREFIX, FULFILLMENT_TYPES } from "@/lib/fulfillment";
import { goHref } from "@/lib/ecosystem";
import { NO_MONEY_EN } from "@/lib/legal-text";

export const metadata = { title: "Fulfillment" };

const REQ_STATUS: Record<string, string> = { open: "Waiting for terms", accepted: "Terms accepted", cancelled: "Cancelled" };

/**
 * Fulfillment tab (members see this at /fulfillment), built on the existing Fulfillment by MSMEs feature:
 * member offers (feed posts of the "Fulfillment offer" kind), fulfillment requests (the existing requests and quotes),
 * the existing partner application, and Fulfillment by MSMEs on NegosyoDepot. The public page stays at /fulfillment?view=public.
 */
export default async function FulfillmentTab({ searchParams }: { searchParams: Promise<{ to?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser("/fulfillment");
  const [{ data: rows }, { data: jobs }, { data: me }] = await Promise.all([
    supabase.from("feed_posts").select("id, author_id, body, category, author_name, chapter_id, created_at, status").eq("kind", "fulfillment").eq("status", "published")
      .order("created_at", { ascending: false }).limit(10),
    supabase.from("service_requests").select("id, title, status, requester_id, provider_id, created_at").like("title", `${FULFILLMENT_PREFIX}%`)
      .or(`requester_id.eq.${user.id},provider_id.eq.${user.id}`).order("created_at", { ascending: false }).limit(10),
    supabase.from("profiles").select("chapter_id").eq("id", user.id).maybeSingle(),
  ]);
  const list = (rows ?? []) as { id: string; author_id: string; body: string; category: string; author_name: string | null; chapter_id: string | null; created_at: string }[];
  const myJobs = (jobs ?? []) as { id: string; title: string; status: string; requester_id: string; provider_id: string | null; created_at: string }[];
  const to = sp.to && /^[0-9a-f-]{36}$/i.test(sp.to) && sp.to !== user.id ? sp.to : null;
  const target = to ? (await memberCards(supabase, [to])).get(to) : null;
  const err = sp.error ? RECORD_ERRORS[sp.error] ?? RECORD_ERRORS.failed : null;
  return (
    <TabShell title="Fulfillment" fil="Fulfillment by MSMEs · Kita mula sa kapwa MSME"
      intro="Member MSMEs produce, pack, store or deliver orders for other members, FLAME PH merch, Signature Brands and personalized requests.">
      <section id="ask" aria-labelledby="ask-h" className="card scroll-mt-24 space-y-3 p-4">
        <h2 id="ask-h" className="text-lg font-bold">{target ? `Ask ${target.name} for fulfillment help` : "Ask members for fulfillment help"}</h2>
        <p className="text-sm text-muted">{target ? "Only you and this member see the request." : "Every active member can see it and send you terms. You choose one."}</p>
        <form action={sendFulfillmentRequest} className="space-y-3" aria-describedby={err ? "ask-error" : undefined}>
          {target && <input type="hidden" name="provider_id" value={to!} />}
          <div><label htmlFor="f-type" className="label">What help do you need?</label>
            <select id="f-type" name="type" required className="input" defaultValue="pack">{Object.entries(FULFILLMENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div><label htmlFor="f-what" className="label">For what, and how many?</label>
            <input id="f-what" name="what" required minLength={3} maxLength={90} className="input" placeholder="e.g. 300 gift boxes for December" /></div>
          <div><label htmlFor="f-cat" className="label">Your industry</label>
            <select id="f-cat" name="category" required className="input" defaultValue=""><option value="" disabled>Choose one</option>{RECORD_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div><label htmlFor="f-details" className="label">Details (optional)</label>
            <textarea id="f-details" name="details" rows={3} maxLength={1000} className="input" placeholder="Pick-up and delivery area, schedule, packaging, budget…" /></div>
          <div><label htmlFor="f-needed" className="label">Needed by (optional)</label><input id="f-needed" name="needed_by" type="date" className="input" /></div>
          <p className="text-sm text-muted">{NO_MONEY_EN}</p>
          {err && <p id="ask-error" role="alert" className="rounded-xl bg-danger-soft p-3 text-sm font-semibold text-danger">{err}</p>}
          <SubmitButton className="btn btn-primary min-h-11 w-full" pendingText="Sending…">{target ? `Send to ${target.name}` : "Send to all members"}</SubmitButton>
        </form>
      </section>

      <section id="offers" aria-labelledby="offers-h" className="scroll-mt-24 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="offers-h" className="text-lg font-bold">Fulfillment offers from members</h2>
          <Link href="/new-post?kind=fulfillment" className={buttonClass({ variant: "primary", size: "sm", className: "min-h-11" })}>Post an offer</Link>
        </div>
        {list.length === 0 ? <p className="card p-4 text-sm text-muted">No offers yet. If you can produce, pack or deliver for other members, post an offer. It also shows in the Home feed.</p> : (
          <ul className="space-y-2">
            {list.map((o) => (
              <li key={o.id} id={`offer-${o.id}`} className="card scroll-mt-24 p-4">
                <p className="text-sm text-muted">{o.author_name ?? "FLAME PH member"} · {o.category} · {timeAgo(o.created_at)}{me?.chapter_id && o.chapter_id === me.chapter_id ? " · In your chapter" : ""}</p>
                <p className="mt-1 line-clamp-3">{o.body}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {o.author_id !== user.id && <Link href={`/fulfillment?to=${o.author_id}#ask`} className={buttonClass({ variant: "primary", size: "sm", className: "min-h-11" })}>Ask for terms</Link>}
                  <Link href={`/posts/${o.id}#comments`} className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })}>Reply to this offer</Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="jobs-h" className="card p-4">
        <h2 id="jobs-h" className="text-lg font-bold">Your fulfillment requests</h2>
        {myJobs.length === 0 ? <p className="mt-1 text-sm text-muted">Requests you send or receive here show in this list.</p> : (
          <ul className="mt-2 divide-y divide-line">
            {myJobs.map((j) => (
              <li key={j.id}><Link href={`/requests/${j.id}`} className="flex min-h-11 flex-col justify-center py-2">
                <span className="font-semibold hover:underline">{j.title.slice(FULFILLMENT_PREFIX.length)}</span>
                <span className="text-xs text-muted">{j.requester_id === user.id ? "You asked" : "Sent to you"} · {REQ_STATUS[j.status] ?? j.status} · {timeAgo(j.created_at)}</span>
              </Link></li>
            ))}
          </ul>
        )}
        <Link href="/records" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">Your records</Link>
      </section>

      <section aria-labelledby="nd-h" className="card p-4">
        <h2 id="nd-h" className="text-lg font-bold">Fulfillment by MSMEs on NegosyoDepot</h2>
        <p className="text-sm text-muted">NegosyoDepot is the FLAME PH ecosystem&apos;s focused app for Fulfillment by MSMEs, with the same FLAME PH account.</p>
        <ul className="mt-2 divide-y divide-line">
          {FULFILLMENT_LINKS.map((l) => (
            <li key={l.to}><Link href={goHref("negosyodepot", l.to, l.label)} className="flex min-h-11 flex-col justify-center py-2"><span className="font-semibold text-primary hover:underline">{l.label}</span><span className="text-sm text-muted">{l.text}</span></Link></li>
          ))}
          <li><Link href={goHref("marketplaceph", "/delivery/new", "Book a delivery")} className="flex min-h-11 flex-col justify-center py-2"><span className="font-semibold text-primary hover:underline">Book a delivery on MarketplacePH</span><span className="text-sm text-muted">Riders and small couriers near you.</span></Link></li>
        </ul>
      </section>

      <h2 className="text-lg font-bold">Become a FLAME PH fulfillment partner</h2>
      <SubmissionForm def={FORMS.fulfillment} compact doneHref="/home" />
      <Link href="/fulfillment?view=public" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">About Fulfillment by MSMEs</Link>
    </TabShell>
  );
}
