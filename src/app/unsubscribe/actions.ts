"use server";
import { redirect } from "next/navigation";
import { isUnsubTopic } from "@/lib/notification-prefs";
import { verifyUnsubscribe } from "@/lib/unsubscribe";
import { applyUnsubscribe } from "@/lib/unsubscribe-apply";

/** The confirm button on /unsubscribe. Works without signing in: the signed link proves which member and which email. */
export async function confirmUnsubscribe(fd: FormData) {
  const u = String(fd.get("u") ?? ""), t = String(fd.get("t") ?? ""), s = String(fd.get("s") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(u) || !isUnsubTopic(t) || !verifyUnsubscribe(u, t, s)) redirect("/unsubscribe?error=link");
  const ok = await applyUnsubscribe(u, t);
  redirect(ok ? `/unsubscribe?done=${t}` : `/unsubscribe?${new URLSearchParams({ u, t, s, error: "save" })}`);
}
