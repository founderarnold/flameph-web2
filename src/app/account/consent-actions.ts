"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getConsents, recordConsents } from "@/lib/consents";
import { choicesFrom } from "@/lib/policy";
import { safeNext } from "@/lib/safe-next";
import { sendEmail, NOTIFY_TO } from "@/lib/email";
import { FEED, feedResult } from "@/lib/member-shell";
import { createAdminClient } from "@/lib/supabase/server";
import { purgeMemberDocs } from "@/lib/vetting-server";
import { notifySites } from "@/lib/ecosystem-sso";

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

  // Turning off switch 4 deletes the member's vetting documents right away (Privacy Notice, section 5).
  if (changed.includes("vetting") && !choices.vetting) {
    const admin = createAdminClient();
    if (admin) await purgeMemberDocs(admin, user.id, "consent_withdrawn");
  }
  // Turning off switch 3 removes the badge from MarketplacePH and NegosyoDepot. The database stops sharing it at once;
  // this tells the sites to drop what they hold now (their own 10-minute re-check is the fallback; promise: 15 minutes).
  if (changed.includes("ecosystem_badge") && !choices.ecosystem_badge) {
    const admin = createAdminClient();
    if (admin) await notifySites(admin, user.id, "consent_off_notice");
  }
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
  // Say so on the page they land on. Member pages show the note; other pages (e.g. signing in to another FLAME PH site) are left untouched.
  // Signed-in members opening "/" land on the Home feed anyway; the feed confirms the save at the top.
  const landing = back === "/" ? FEED : back;
  const confirmed = landing === FEED ? feedResult("consents") : landing.startsWith("/account") ? `${landing}${landing.includes("?") ? "&" : "?"}consents=saved` : landing;
  redirect(source === "prompt" ? confirmed : `/account/settings?saved=1${changed.includes("terms") && !choices.terms ? "&closing=1" : ""}`);
}
