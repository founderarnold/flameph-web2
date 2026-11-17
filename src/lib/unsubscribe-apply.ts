import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { POLICY_VERSION } from "@/lib/policy";
import { columnsOff, type UnsubTopic } from "@/lib/notification-prefs";

/**
 * Turns off one kind of email for one member (the link was already checked). Notification emails go off in
 * notification_prefs; the weekly email goes off through the consent log (switch 5, "News and offers"), so the member's
 * consent history shows it, exactly as if they had unticked it in Settings.
 */
export async function applyUnsubscribe(userId: string, topic: UnsubTopic): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin) return false;
  let ok = true;
  const cols = columnsOff(topic);
  if (cols.length) {
    const { error } = await admin.from("notification_prefs")
      .upsert({ user_id: userId, ...Object.fromEntries(cols.map((c) => [c, false])), updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) ok = false;
  }
  if (topic === "digest" || topic === "all") {
    const { data: p } = await admin.from("profiles").select("consent_marketing").eq("id", userId).maybeSingle();
    if (p?.consent_marketing) {
      const { error } = await admin.from("member_consents").insert({ user_id: userId, consent_key: "marketing", granted: false, policy_version: POLICY_VERSION, source: "settings" });
      if (error) {
        const { error: e2 } = await admin.from("profiles").update({ consent_marketing: false }).eq("id", userId);
        if (e2) ok = false;
      }
    }
  }
  return ok;
}
