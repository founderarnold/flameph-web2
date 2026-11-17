import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Avatar, EmptyState, Notice } from "@/components/ui";
import { memberCards } from "@/lib/people";
import { hasUnread, MSG_ERRORS, otherMember, shortTime, type Conversation } from "@/lib/messages";
import { AutoRefresh } from "@/components/shell/AutoRefresh";

export const metadata = { title: "Messages", robots: { index: false } };

/** Messages: every conversation the member is in, newest first. Only the two members in a conversation can read it. */
export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ msg_error?: string }> }) {
  const { supabase, user } = await requireUser("/messages");
  const sp = await searchParams;
  const { data, error } = await supabase.from("conversations").select("*")
    .or(`member_a.eq.${user.id},member_b.eq.${user.id}`).not("last_message_at", "is", null)
    .order("last_message_at", { ascending: false }).limit(100);
  const convs = (data ?? []) as Conversation[];
  const cards = await memberCards(supabase, convs.map((c) => otherMember(c, user.id)));
  const err = sp.msg_error ? MSG_ERRORS[sp.msg_error] ?? MSG_ERRORS.failed : null;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <AutoRefresh seconds={30} />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-2xl font-bold">Messages</h1>
        <Link href="/workspace/inbox" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">Business inbox</Link>
      </div>
      <p className="text-sm text-muted">Private conversations between you and one other member. Only the two of you can read them.</p>
      {err && <div role="alert"><Notice tone="danger">{err}</Notice></div>}
      {error ? (
        <Notice tone="info">{MSG_ERRORS.unavailable}</Notice>
      ) : convs.length === 0 ? (
        <EmptyState title="No messages yet." text="Open a member's page and tap Message, or reply to a member's inquiry from your Leads." cta={{ href: "/members", label: "Find members" }} />
      ) : (
        <ul className="card divide-y divide-line">
          {convs.map((c) => {
            const other = otherMember(c, user.id);
            const name = cards.get(other)?.name ?? "FLAME PH member";
            const unread = hasUnread(c, user.id);
            return (
              <li key={c.id}>
                <Link href={`/messages/${c.id}#latest`} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-bg-soft"
                  aria-label={`${name}${unread ? ", new message" : ""}`}>
                  <Avatar name={name} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={`truncate ${unread ? "font-extrabold" : "font-semibold"}`}>{name}</span>
                      {c.last_message_at && <span className="shrink-0 text-xs text-muted">{shortTime(c.last_message_at)}</span>}
                    </span>
                    <span className={`block truncate text-sm ${unread ? "font-semibold text-fg" : "text-muted"}`}>
                      {c.last_sender_id === user.id ? "You: " : ""}{c.last_preview}
                    </span>
                  </span>
                  {unread && <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-flame" />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
