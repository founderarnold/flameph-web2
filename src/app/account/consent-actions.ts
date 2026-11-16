"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getConsents, recordConsents } from "@/lib/consents";
import { choicesFrom } from "@/lib/policy";
import { safeNext } from "@/lib/safe-next";
import { sendEmail, NOTIFY_TO } from "@/lib/email";

/** Saves the switches from the sign-in prompt or the Settings page. Only changed switches add a row. */
export async function saveConsents(fd: FormData) {
  const { supabase, user } = await requireUser("/account/settings");
  const source = fd.get("source") === "prompt" ? "prompt" : "settings";
  const back = source === "prompt" ? safeNext(String(fd.get("next") ?? "")) : "/account/settings";
  const choices = choicesFrom((n) => (fd.get(n) === "on" ? "1" : null));
  const { ready, state } = await getConsents(supabase, user.id);
  if (!ready) redirect(`${source === "prompt" ? back : "/account/settings"}${back.includes("?") ? "&" : "?"}consent=unavailable`);

  const { ok, changed } = await recordConsents(supabase, user.id, choices, source, state);
  if (!ok) redirect(`/account/settings?consent=error`);

  // Turning off switch 1 is a request to close the account (Terms, section 16). Tell the team so a person handles it.
  if (changed.includes("terms") && !choices.terms && state.terms?.granted) {
    await sendEmail({
      to: NOTIFY_TO,
      subject: "Member withdrew consent 1 (account closure request)",
      text: `A member turned off "Terms, Guidelines and Privacy" in Settings.\n\nMember ID: ${user.id}\nEmail: ${user.email ?? "(none)"}\nTime: ${new Date().toISOString()}\n\nPlease close the account and reply to the member within 15 working days, as the Privacy Notice promises.`,
      replyTo: user.email ?? undefined,
    });
  }
  revalidatePath("/account", "layout");
  redirect(source === "prompt" ? back : `/account/settings?saved=1${changed.includes("terms") && !choices.terms ? "&closing=1" : ""}`);
}
