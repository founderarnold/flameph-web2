import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Avatar, CountBadge, Notice } from "@/components/ui";
import { acceptFriend, removeFriend } from "@/app/account/people-actions";
import { friendLists, memberCards } from "@/lib/people";
import { noteText } from "@/lib/people-rules";
import { inquiryKind, KIND_LABEL } from "@/lib/inbox";
import { shortTime } from "@/lib/messages";
import { sourceLabel } from "@/lib/minisites";
import { recordsWaiting } from "@/lib/records-server";

export const metadata = { title: "Business inbox", robots: { index: false } };

type Inquiry = { id: string; name: string; message: string; product_name: string | null; status: string; created_at: string; kind?: string | null; source?: string | null; minisite_slug?: string | null };
type Note = { id: number; kind: string; title: string; body: string | null; url: string | null; created_at: string; read_at: string | null };
const BACK = "/workspace/inbox";
const btn = "btn min-h-11 px-3 text-sm";

function Section({ id, title, count, all, children }: { id: string; title: string; count: number; all?: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="card scroll-mt-24 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`${id}-h`} className="flex items-center gap-2 text-lg font-bold">{title}<CountBadge count={count} label="new" /></h2>
        {all && <Link href={all.href} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">{all.label}</Link>}
      </div>
      {children}
    </section>
  );
}

/** Workspace → Business inbox: leads, quote requests, Friend requests and notifications, in one place. */
export default async function InboxPage({ searchParams }: { searchParams: Promise<{ note?: string }> }) {
  const { supabase, user } = await requireUser(BACK);
  const sp = await searchParams;
  const [{ data: inq, error: inqErr }, lists, { data: notes, error: notesErr }, { data: unreadMsgs }, waitingRecords] = await Promise.all([
    supabase.from("business_inquiries").select("*").eq("owner_id", user.id).neq("status", "archived").order("created_at", { ascending: false }).limit(100),
    friendLists(supabase, user.id),
    supabase.from("member_notifications").select("id, kind, title, body, url, created_at, read_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(30),
    supabase.rpc("unread_direct_messages"),
    recordsWaiting(supabase, user.id),
  ]);
  const rows = (inq ?? []) as Inquiry[];
  const leads = rows.filter((q) => inquiryKind(q) === "inquiry");
  const quotes = rows.filter((q) => inquiryKind(q) === "quote");
  const newLeads = leads.filter((q) => q.status === "new").length;
  const newQuotes = quotes.filter((q) => q.status === "new").length;
  const cards = await memberCards(supabase, lists.received.slice(0, 20));
  const list = (notes ?? []) as Note[];
  const unreadNotes = list.filter((n) => !n.read_at).length;
  // Opening the inbox marks its notifications as seen (only the member's own; row level security).
  if (unreadNotes) await supabase.from("member_notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
  const note = noteText(sp.note);
  const msgCount = Number(unreadMsgs) || 0;

  const item = (q: Inquiry) => (
    <li key={q.id}>
      <Link href={`/account/inquiries${inquiryKind(q) === "quote" ? "?kind=quote" : ""}#inq-${q.id}`} className="block min-h-11 py-2.5">
        <span className="flex items-baseline justify-between gap-2">
          <span className={`truncate ${q.status === "new" ? "font-extrabold" : "font-semibold"}`}>{q.name}{q.product_name ? ` · ${q.product_name}` : ""}</span>
          <span className="shrink-0 text-xs text-muted">{shortTime(q.created_at)}</span>
        </span>
        <span className="block truncate text-sm text-muted">{q.message}</span>
        <span className="block text-xs text-muted">{sourceLabel(q)}{q.status === "new" ? " · New" : ""}</span>
      </Link>
    </li>
  );

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/workspace" className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary"><span aria-hidden>←</span> Workspace</Link>
      <h1 className="text-2xl font-extrabold sm:text-3xl">Business inbox</h1>
      <p className="text-muted">Leads, quote requests, member requests, records, Friend requests and notifications in one place. Choose how we tell you in <Link href="/account/settings#notifications" className="font-semibold text-primary underline">Settings</Link>.</p>
      {note && <div role="status"><Notice tone="ok">{note}</Notice></div>}

      <nav aria-label="Inbox sections" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[{ href: "#leads", label: "Leads", n: newLeads }, { href: "#quotes", label: "Quotes", n: newQuotes }, { href: "#requests", label: "Requests", n: lists.received.length }, { href: "#notifications", label: "Notifications", n: unreadNotes }].map((x) => (
          <a key={x.href} href={x.href} className="btn btn-outline min-h-11 justify-between px-3 text-sm">{x.label}<CountBadge count={x.n} label="new" /></a>
        ))}
      </nav>

      <Link href="/messages" className="card flex min-h-11 items-center justify-between gap-2 p-4 font-semibold hover:border-primary">
        <span>Messages from members</span>
        <span className="flex items-center gap-2 text-sm text-primary">{msgCount ? <CountBadge count={msgCount} label="unread messages" /> : null}Open Messages</span>
      </Link>

      <div id="records" className="card scroll-mt-24 p-4">
        <p className="flex items-center gap-2 font-semibold">Requests, quotes and records<CountBadge count={waitingRecords} label="waiting for you" /></p>
        <p className="text-sm text-muted">Requests sent to you, and deals waiting for you to confirm.</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Link href="/requests" className="btn btn-outline min-h-11 px-3 text-sm">Requests and quotes</Link>
          <Link href="/records" className="btn btn-outline min-h-11 px-3 text-sm">Transaction records</Link>
        </div>
      </div>

      {inqErr && <Notice tone="info">Leads are almost ready. FLAME PH is finishing a database update.</Notice>}

      <Section id="leads" title="Leads and inquiries" count={newLeads} all={{ href: "/account/inquiries", label: "Open all leads" }}>
        {leads.length ? <ul className="mt-1 divide-y divide-line">{leads.slice(0, 5).map(item)}</ul>
          : <p className="mt-2 text-sm text-muted">No leads yet. Buyers send them from your <Link href="/account/business" className="font-semibold text-primary underline">listing</Link> and your mini-website.</p>}
      </Section>

      <Section id="quotes" title="Quote requests" count={newQuotes} all={{ href: "/account/inquiries?kind=quote", label: "Open all quotes" }}>
        {quotes.length ? <ul className="mt-1 divide-y divide-line">{quotes.slice(0, 5).map(item)}</ul>
          : <p className="mt-2 text-sm text-muted">No quote requests yet. Buyers can tick &quot;{KIND_LABEL.quote}&quot; on your listing&apos;s inquiry form.</p>}
      </Section>

      <Section id="requests" title="Friend requests" count={lists.received.length} all={{ href: "/friends", label: "Friends page" }}>
        {lists.received.length === 0 ? <p className="mt-2 text-sm text-muted">No requests waiting.</p> : (
          <ul className="mt-1 divide-y divide-line">
            {lists.received.slice(0, 10).map((id) => {
              const c = cards.get(id);
              const name = c?.name ?? "FLAME PH member";
              return (
                <li key={id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Avatar name={name} size={36} />
                    <span className="min-w-0">
                      {c?.slug ? <Link href={`/members/${c.slug}`} className="flex min-h-11 items-center truncate font-semibold hover:underline">{name}</Link> : <span className="block truncate font-semibold">{name}</span>}
                      <span className="block truncate text-xs text-muted">{[c?.sector, c?.city].filter(Boolean).join(" · ")}</span>
                    </span>
                  </span>
                  <span className="flex shrink-0 gap-2">
                    <form action={acceptFriend}><input type="hidden" name="member_id" value={id} /><input type="hidden" name="back" value={BACK} /><button className={`${btn} btn-primary`} aria-label={`Accept Friend request from ${name}`}>Accept</button></form>
                    <form action={removeFriend}><input type="hidden" name="member_id" value={id} /><input type="hidden" name="back" value={BACK} /><input type="hidden" name="what" value="declined" /><button className={`${btn} btn-outline`} aria-label={`Decline Friend request from ${name}`}>Decline</button></form>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section id="notifications" title="Notifications" count={unreadNotes}>
        {notesErr ? <p className="mt-2 text-sm text-muted">Notifications appear here after FLAME PH finishes a database update.</p>
          : list.length === 0 ? <p className="mt-2 text-sm text-muted">Nothing yet. New leads, quote requests and Friend requests show up here.</p> : (
          <ul className="mt-1 divide-y divide-line">
            {list.map((n) => (
              <li key={n.id}>
                <Link href={n.url ?? BACK} className="block min-h-11 py-2.5">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`truncate ${n.read_at ? "font-semibold" : "font-extrabold"}`}>{n.title}</span>
                    <span className="shrink-0 text-xs text-muted">{shortTime(n.created_at)}</span>
                  </span>
                  {n.body && <span className="block truncate text-sm text-muted">{n.body}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
