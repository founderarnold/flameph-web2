import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { sendPush } from "@/lib/push";
import { ORG } from "@/lib/site";
import { mergePrefs, NOTIFY_TYPES, type NotifyType } from "@/lib/notification-prefs";
import { unsubscribeHeaders, unsubscribeUrl } from "@/lib/unsubscribe";

// One place that tells a member something happened: the in-app list (Workspace → Inbox), a push to their phone,
// and an email. Push and email follow the member's choices in Settings; every email has a working unsubscribe.
// Never throws. Runs on the server only (the in-app list can only be written with the server key).

const KIND: Record<NotifyType, "message" | "lead" | "quote" | "request"> = { messages: "message", leads: "lead", quotes: "quote", requests: "request" };

export type Note = {
  title: string;
  body?: string;
  url: string;                                  // a path on flameph.org, e.g. /messages/…
  email?: { subject: string; text: string; replyTo?: string; to?: string[] };   // extra recipients, e.g. the listing's contact email
  inApp?: boolean;                              // default true; messages use the Messages unread count instead
};

export async function notify(userId: string, type: NotifyType, note: Note): Promise<{ push: boolean; email: boolean }> {
  const admin = createAdminClient();
  if (!admin) return { push: false, email: false };
  try {
    const { data: row } = await admin.from("notification_prefs").select("*").eq("user_id", userId).maybeSingle();
    const prefs = mergePrefs(row);
    if (note.inApp !== false) {
      await admin.from("member_notifications").insert({
        user_id: userId, kind: KIND[type], title: note.title.slice(0, 140), body: note.body?.slice(0, 300) ?? null, url: note.url.slice(0, 300),
      });
    }
    let push = false, email = false;
    if (prefs[`${type}_push`]) push = (await sendPush(userId, { title: note.title, body: note.body ?? "", url: note.url })) > 0;
    if (prefs[`${type}_email`] && note.email) {
      const { data: u } = await admin.auth.admin.getUserById(userId);
      const to = [...new Set([u.user?.email, ...(note.email.to ?? [])].filter(Boolean) as string[])];
      const off = unsubscribeUrl(userId, type);
      if (to.length) {
        email = await sendEmail({
          to, replyTo: note.email.replyTo, subject: note.email.subject, headers: unsubscribeHeaders(userId, type),
          text: `${note.email.text}\n\n—\nOpen in FLAME PH: ${ORG.url}${note.url}\nYou get this email for "${NOTIFY_TYPES[type].label}". ${off ? `Stop these emails: ${off}` : ""}\nChoose what we send you: ${ORG.url}/account/settings#notifications`,
        });
      }
    }
    return { push, email };
  } catch {
    return { push: false, email: false };
  }
}
