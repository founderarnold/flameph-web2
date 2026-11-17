"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { PREF_COLUMNS } from "@/lib/notification-prefs";

/** Settings → Notifications: saves every switch at once. Only the member's own row can be written (row level security). */
export async function saveNotificationPrefs(fd: FormData) {
  const { supabase, user } = await requireUser("/account/settings#notifications");
  const row = Object.fromEntries(PREF_COLUMNS.map((c) => [c, fd.get(c) === "on"]));
  const { error } = await supabase.from("notification_prefs").upsert({ user_id: user.id, ...row, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  revalidatePath("/account/settings");
  redirect(`/account/settings?notify=${error ? "error" : "saved"}#notifications`);
}
