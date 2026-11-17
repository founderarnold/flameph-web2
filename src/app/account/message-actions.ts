"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { safeNext } from "@/lib/safe-next";
import { notify } from "@/lib/notify";
import { memberCards } from "@/lib/people";
import { createAdminClient } from "@/lib/supabase/server";
import { MESSAGE_MAX, msgErrorCode } from "@/lib/messages";

// Member-to-member messages. Every rule is enforced by the database (0021); these only ask and send the member back.

const s = (v: FormDataEntryValue | null, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const uuid = (v: string) => (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v : null);

/** "Message" button on a member's page, a lead from a member, or a Friend: open (or start) the conversation. */
export async function startConversation(fd: FormData) {
  const { supabase, user } = await requireUser("/messages");
  const other = uuid(s(fd.get("member_id"), 40));
  if (!other || other === user.id) redirect(safeNext(s(fd.get("back")), "/messages"));
  const { data, error } = await supabase.rpc("start_conversation", { p_other: other });
  if (error || !data) redirect(`/messages?msg_error=${msgErrorCode(error?.message ?? "not_found")}`);
  redirect(`/messages/${data}`);
}

/** Send one message in a conversation, then tell the other member (push and email, as they chose in Settings). */
export async function sendMessage(fd: FormData) {
  const { supabase, user } = await requireUser("/messages");
  const conv = uuid(s(fd.get("conversation_id"), 40));
  if (!conv) redirect("/messages");
  const body = s(fd.get("body"), MESSAGE_MAX);
  if (!body) redirect(`/messages/${conv}?error=empty#write`);
  const { error } = await supabase.from("direct_messages").insert({ conversation_id: conv, body });
  if (error) redirect(`/messages/${conv}?error=${msgErrorCode(error.message)}#write`);

  // Tell the other member. One email per unread run: only when this is the first message they haven't seen yet.
  const { data: c } = await supabase.from("conversations").select("member_a, member_b, a_read_at, b_read_at").eq("id", conv).maybeSingle();
  if (c) {
    const other = c.member_a === user.id ? c.member_b : c.member_a;
    const theirRead = c.member_a === user.id ? c.b_read_at : c.a_read_at;
    const admin = createAdminClient();
    let firstUnread = true;
    if (admin) {
      let q = admin.from("direct_messages").select("id", { count: "exact", head: true }).eq("conversation_id", conv).eq("sender_id", user.id);
      if (theirRead) q = q.gt("created_at", theirRead);
      const { count } = await q;
      firstUnread = (count ?? 1) <= 1;
    }
    const name = (await memberCards(supabase, [user.id])).get(user.id)?.name ?? "A FLAME PH member";
    const preview = body.length > 120 ? `${body.slice(0, 117)}…` : body;
    await notify(other, "messages", {
      title: `New message from ${name}`, body: preview, url: `/messages/${conv}`, inApp: false,
      email: firstUnread ? { subject: `${name} sent you a message on FLAME PH`, text: `${name} sent you a message:\n\n"${preview}"\n\nReply in FLAME PH. For your safety, the sender's email isn't shared; reply inside FLAME PH.` } : undefined,
    });
  }
  revalidatePath("/messages", "layout");
  redirect(`/messages/${conv}#latest`);
}
