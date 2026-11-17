import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { EmptyState, Notice } from "@/components/ui";
import { memberCards } from "@/lib/people";
import { shortTime } from "@/lib/messages";
import { RECORD_ERRORS } from "@/lib/records";
import { recordsConsentOn } from "@/lib/records-server";
import { ConsentNeeded } from "@/components/RecordsConsentNeeded";

export const metadata = { title: "Requests and quotes", robots: { index: false } };

type Req = { id: string; requester_id: string; provider_id: string | null; title: string; category: string; status: string; needed_by: string | null; created_at: string };
const STATUS: Record<string, string> = { open: "Open", accepted: "Quote accepted", cancelled: "Cancelled" };

/** Requests and quotes: what members asked you for, open requests from members, and what you asked for. */
export default async function RequestsPage() {
  const { supabase, user } = await requireUser("/requests");
  const [toMe, open, mine, consentOn] = await Promise.all([
    supabase.from("service_requests").select("*").eq("provider_id", user.id).order("created_at", { ascending: false }).limit(50),
    supabase.from("service_requests").select("*").is("provider_id", null).eq("status", "open").neq("requester_id", user.id).order("created_at", { ascending: false }).limit(30),
    supabase.from("service_requests").select("*").eq("requester_id", user.id).order("created_at", { ascending: false }).limit(50),
    recordsConsentOn(supabase, user.id),
  ]);
  const err = toMe.error ?? open.error ?? mine.error;
  const all = [...(toMe.data ?? []), ...(open.data ?? []), ...(mine.data ?? [])] as Req[];
  const cards = await memberCards(supabase, [...new Set(all.flatMap((r) => [r.requester_id, r.provider_id]).filter(Boolean) as string[])]);
  const who = (id: string | null) => (id ? cards.get(id)?.name ?? "FLAME PH member" : "All members");

  const list = (rows: Req[], label: (r: Req) => string, empty: string) => rows.length ? (
    <ul className="card divide-y divide-line">
      {rows.map((r) => (
        <li key={r.id}>
          <Link href={`/requests/${r.id}`} className="block min-h-11 px-4 py-3 hover:bg-bg-soft">
            <span className="flex items-baseline justify-between gap-2">
              <span className={`truncate ${r.status === "open" ? "font-bold" : "font-semibold text-muted"}`}>{r.title}</span>
              <span className="shrink-0 text-xs text-muted">{shortTime(r.created_at)}</span>
            </span>
            <span className="block truncate text-sm text-muted">{label(r)} · {r.category} · {STATUS[r.status] ?? r.status}</span>
          </Link>
        </li>
      ))}
    </ul>
  ) : <p className="text-sm text-muted">{empty}</p>;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href="/workspace" className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary"><span aria-hidden>←</span> Workspace</Link>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-2xl font-extrabold sm:text-3xl">Requests and quotes</h1>
        <Link href="/records" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">Transaction records</Link>
      </div>
      <p className="text-muted">Ask members for a product or service. They answer with a quote. When you accept one, a transaction record opens for both of you. FLAME PH never takes or holds money.</p>
      {!consentOn && <ConsentNeeded />}
      <Link href="/requests/new" className="btn btn-primary min-h-11 w-full sm:w-auto">New request</Link>
      {err ? <Notice tone="info">{RECORD_ERRORS.unavailable}</Notice> : (
        <>
          <section aria-labelledby="to-me" className="space-y-2">
            <h2 id="to-me" className="text-lg font-bold">Sent to you</h2>
            {list((toMe.data ?? []) as Req[], (r) => `From ${who(r.requester_id)}`, "No requests sent to you yet. Members can tap \"Send a request\" on your business page.")}
          </section>
          <section aria-labelledby="open" className="space-y-2">
            <h2 id="open" className="text-lg font-bold">Open requests from members</h2>
            {list((open.data ?? []) as Req[], (r) => `From ${who(r.requester_id)}`, "No open requests right now.")}
          </section>
          <section aria-labelledby="mine" className="space-y-2">
            <h2 id="mine" className="text-lg font-bold">Your requests</h2>
            {(mine.data ?? []).length ? list((mine.data ?? []) as Req[], (r) => `To ${who(r.provider_id)}`, "")
              : <EmptyState title="You haven't asked for anything yet." text="Need a supplier, a service or a product? Send a request to one member or to all members." cta={{ href: "/requests/new", label: "New request" }} />}
          </section>
        </>
      )}
    </div>
  );
}
