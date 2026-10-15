import "server-only";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/server";
import { ORG } from "@/lib/site";

const PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PRIVATE = process.env.VAPID_PRIVATE_KEY;
export const pushEnabled = Boolean(PUBLIC && PRIVATE);
if (pushEnabled) webpush.setVapidDetails(`mailto:${ORG.emailPrimary}`, PUBLIC!, PRIVATE!);

/** Sends a notification to every device a member turned push on for. Never throws; removes expired devices. */
export async function sendPush(userId: string, msg: { title: string; body: string; url?: string }) {
  const admin = createAdminClient();
  if (!pushEnabled || !admin) return 0;
  const { data: subs } = await admin.from("push_subscriptions").select("endpoint, p256dh, auth").eq("user_id", userId);
  let sent = 0;
  await Promise.all((subs ?? []).map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: 86400 });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
    }
  }));
  return sent;
}
