import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { Avatar, Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { AutoRefresh } from "@/components/shell/AutoRefresh";
import { sendMessage } from "@/app/account/message-actions";
import { setBlock } from "@/app/account/people-actions";
import { memberCards } from "@/lib/people";
import { noteText } from "@/lib/people-rules";
import { MESSAGE_MAX, MSG_ERRORS, otherMember, theirReadAt, type Conversation } from "@/lib/messages";
import { reportHref } from "@/components/feed/PostCard";

export const metadata = { title: "Conversation", robots: { index: false } };

type Msg = { id: string; sender_id: string; body: string; created_at: string; hidden_at: string | null };
const when = (iso: string) => new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const btn = "btn min-h-11 w-full px-3 text-sm";

/** One conversation: the messages, a reply box, and Block and Report for the other member, right here. */
export default async function ConversationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; note?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const here = `/messages/${id}`;
  const { supabase, user } = await requireUser(here);
  // Row level security: this returns nothing unless the signed-in member is one of the two in the conversation.
  const { data: conv } = await supabase.from("conversations").select("*").eq("id", id).maybeSingle();
  if (!conv) notFound();
  const c = conv as Conversation;
  const other = otherMember(c, user.id);
  const [{ data: rows }, cards, { data: iBlocked }, { data: blockedEither }] = await Promise.all([
    supabase.from("direct_messages").select("id, sender_id, body, created_at, hidden_at").eq("conversation_id", id).order("created_at", { ascending: false }).limit(100),
    memberCards(supabase, [other]),
    supabase.from("member_blocks").select("blocked_id").eq("blocker_id", user.id).eq("blocked_id", other).maybeSingle(),
    supabase.rpc("is_blocked_between", { a: user.id, b: other }),
    supabase.rpc("mark_conversation_read", { p_conversation: id }),
  ]);
  const msgs = ((rows ?? []) as Msg[]).reverse();
  const card = cards.get(other);
  const name = card?.name ?? "FLAME PH member";
  const blocked = Boolean(blockedEither);
  const seen = theirReadAt(c, user.id);
  const lastMine = [...msgs].reverse().find((m) => m.sender_id === user.id);
  const err = sp.error ? MSG_ERRORS[sp.error] ?? MSG_ERRORS.failed : null;
  const note = noteText(sp.note);

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      {!blocked && <AutoRefresh seconds={15} />}
      <Link href="/messages" className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary"><span aria-hidden>←</span> Messages</Link>
      <header className="card flex items-center gap-3 p-3">
        <Avatar name={name} size={44} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold">{name}</h1>
          {card?.slug ? <Link href={`/members/${card.slug}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">See their page</Link>
            : <p className="text-sm text-muted">{[card?.sector, card?.city].filter(Boolean).join(" · ") || "FLAME PH member"}</p>}
        </div>
      </header>

      {note && <div role="status"><Notice tone="ok">{note}</Notice></div>}

      <section aria-label={`Conversation with ${name}`} className="card space-y-3 p-3">
        {msgs.length === 0 && <p className="p-2 text-sm text-muted">Say hello. Only you and {name} can read this conversation.</p>}
        <ol className="space-y-3">
          {msgs.map((m) => {
            const mine = m.sender_id === user.id;
            return (
              <li key={m.id} id={m === msgs[msgs.length - 1] ? "latest" : undefined} className={`flex scroll-mt-24 ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] ${mine ? "text-right" : ""}`}>
                  <p className={`whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-left ${m.hidden_at ? "bg-bg-soft italic text-muted" : mine ? "bg-primary text-primary-fg" : "bg-bg-soft"}`}>
                    <span className="sr-only">{mine ? "You" : name}: </span>
                    {m.hidden_at ? "A moderator hid this message." : m.body}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                    <time dateTime={m.created_at}>{when(m.created_at)}</time>
                    {mine && m === lastMine && seen && new Date(seen) >= new Date(m.created_at) && <span>· Seen</span>}
                    {!mine && !m.hidden_at && (
                      <Link href={reportHref("message", m.id, here)} className="inline-flex min-h-11 items-center underline" aria-label={`Report this message from ${name}`}>Report</Link>
                    )}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {blocked ? (
        <Notice tone="info">{iBlocked ? `You blocked ${name}. Neither of you can send messages here.` : "You can't reply in this conversation."}</Notice>
      ) : (
        <form id="write" action={sendMessage} className="card scroll-mt-24 space-y-2 p-3" aria-describedby={err ? "send-error" : undefined}>
          <input type="hidden" name="conversation_id" value={id} />
          <label htmlFor="body" className="label">Your message</label>
          <textarea id="body" name="body" rows={3} required maxLength={MESSAGE_MAX} className="input w-full text-[16px]" placeholder={`Write to ${name}…`} />
          {err && <p id="send-error" role="alert" className="rounded-xl bg-danger-soft p-3 text-sm font-semibold text-danger">{err}</p>}
          <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Sending…">Send</SubmitButton>
          <p className="text-xs text-muted">Be careful with anyone who asks you to pay first or to share a password or one-time code. FLAME PH never asks for these.</p>
        </form>
      )}

      <section aria-labelledby="safety-h" className="card p-3">
        <h2 id="safety-h" className="font-bold">Safety</h2>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <Link href={reportHref("member", other, here)} className={`${btn} btn-outline`}>Report {name}</Link>
          {iBlocked ? (
            <form action={setBlock}>
              <input type="hidden" name="member_id" value={other} /><input type="hidden" name="back" value={here} /><input type="hidden" name="on" value="0" />
              <button className={`${btn} btn-outline`} aria-label={`Unblock ${name}`}>Unblock {name}</button>
            </form>
          ) : (
            <details>
              <summary className={`${btn} btn-outline cursor-pointer list-none`}>Block {name}</summary>
              <form action={setBlock} className="mt-2 grid gap-2">
                <input type="hidden" name="member_id" value={other} /><input type="hidden" name="back" value={here} /><input type="hidden" name="on" value="1" />
                <p className="text-sm text-muted">Blocking stops messages both ways, ends any friendship and follow, and hides your posts from each other. They aren&apos;t told.</p>
                <button className={`${btn} btn-primary`} aria-label={`Yes, block ${name}`}>Yes, block</button>
              </form>
            </details>
          )}
        </div>
        <p className="mt-2 text-xs text-muted">To report one message, tap Report under it. Moderators see only the message you report, never the rest of this conversation.</p>
      </section>
    </div>
  );
}
