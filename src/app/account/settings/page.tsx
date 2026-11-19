import { BackToFeed } from "@/components/shell/TabShell";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getConsents } from "@/lib/consents";
import { CONSENTS, POLICY_VERSION, type ConsentKey } from "@/lib/policy";
import { ConsentSwitches } from "@/components/ConsentSwitches";
import { Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { ORG } from "@/lib/site";
import { saveConsents } from "../consent-actions";
import { PrivacyControls } from "@/components/listing/PrivacyControls";
import { saveNotificationPrefs } from "../notification-actions";
import { mergePrefs, NOTIFY_KEYS, NOTIFY_TYPES } from "@/lib/notification-prefs";

export const metadata = { title: "Settings", robots: { index: false } };

const when = (iso: string) => new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });
const SOURCE = { signup: "at sign-up", prompt: "after sign-in", settings: "in Settings", legacy_signup: "on the old Join form" } as const;

export default async function Page({ searchParams }: { searchParams: Promise<{ saved?: string; closing?: string; consent?: string; privacy?: string; notify?: string }> }) {
  const { supabase, user } = await requireUser("/account/settings");
  const sp = await searchParams;
  const [{ ready, state }, { data: history }, { data: biz }, prefsRes] = await Promise.all([
    getConsents(supabase, user.id),
    supabase.from("member_consents").select("id, consent_key, granted, policy_version, source, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(30),
    supabase.from("businesses").select("*").eq("owner_id", user.id).limit(1).maybeSingle(),
    supabase.from("notification_prefs").select("*").eq("user_id", user.id).maybeSingle(),
  ]);
  const prefs = mergePrefs(prefsRes.data);
  const prefsReady = !prefsRes.error;
  const on: Partial<Record<ConsentKey, boolean>> = Object.fromEntries(Object.entries(state).map(([k, v]) => [k, v.granted && (k !== "terms" || v.version === POLICY_VERSION)]));
  const title = (k: string) => CONSENTS.find((c) => c.key === k)?.title ?? k;
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-3xl font-extrabold text-primary">Settings</h1>
      {sp.saved && !sp.closing && <div role="status" className="space-y-3"><Notice tone="ok">Saved. Your choices apply right away.</Notice><BackToFeed /></div>}
      {sp.closing && <Notice tone="danger">You turned off switch 1, so we&apos;ll close your account in 15 working days. Changed your mind? Turn it back on and save. Want it closed now, or deleted? Go to <Link className="underline" href="/account/privacy">Your data and privacy</Link>.</Notice>}
      {sp.consent === "error" && <Notice tone="danger">That didn&apos;t save. Please try again.</Notice>}
      {!ready && <Notice>Your consent settings will appear here soon.</Notice>}

      <section aria-labelledby="consents" className="card space-y-4 p-5">
        <h2 id="consents" className="text-xl font-extrabold">Privacy and consent</h2>
        <p className="text-sm text-muted">Turn any switch off to withdraw that consent. Turning off switch 1 asks us to close your account, because membership needs it.</p>
        <form action={saveConsents} className="space-y-4">
          <input type="hidden" name="source" value="settings" />
          <ConsentSwitches on={on} />
          <SubmitButton className="btn btn-primary btn-ds w-full sm:w-auto" disabled={!ready}>Save choices</SubmitButton>
        </form>
      </section>

      {ready && (
        <section aria-labelledby="history" className="card p-5">
          <h2 id="history" className="text-xl font-extrabold">Your consent history</h2>
          {history?.length ? (
            <ul className="mt-3 divide-y divide-line text-sm">
              {history.map((h) => (
                <li key={h.id} className="flex flex-wrap justify-between gap-x-4 py-2">
                  <span><b>{title(h.consent_key)}</b>: {h.granted ? "on" : "off"} {SOURCE[h.source as keyof typeof SOURCE] ?? ""}</span>
                  <span className="text-muted">v{h.policy_version} · {when(h.created_at)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-sm text-muted">No choices saved yet.</p>}
        </section>
      )}

      <section id="notifications" aria-labelledby="notify-h" className="card scroll-mt-24 space-y-4 p-5">
        <h2 id="notify-h" className="text-xl font-extrabold">Notifications</h2>
        <p className="text-sm text-muted">Choose how we tell you about each thing. You always see them in the app: Messages, and your Business inbox in Workspace. Every email also has an unsubscribe link at the bottom.</p>
        {sp.notify === "saved" && <div role="status"><Notice tone="ok">Saved. Your notification choices apply right away.</Notice></div>}
        {sp.notify === "error" && <div role="alert"><Notice tone="danger">That didn&apos;t save. Please try again.</Notice></div>}
        {!prefsReady && <Notice tone="info">Notification choices open after FLAME PH finishes a database update. Until then you get the usual emails and phone alerts.</Notice>}
        <form action={saveNotificationPrefs} className="space-y-3">
          <table className="w-full text-sm">
            <caption className="sr-only">Notification choices by type</caption>
            <thead><tr className="text-left text-muted"><th scope="col" className="py-1 font-semibold">Type</th><th scope="col" className="w-20 py-1 text-center font-semibold">Phone</th><th scope="col" className="w-20 py-1 text-center font-semibold">Email</th></tr></thead>
            <tbody className="divide-y divide-line">
              {NOTIFY_KEYS.map((k) => (
                <tr key={k}>
                  <th scope="row" className="py-2 pr-2 text-left font-normal"><span className="block font-semibold">{NOTIFY_TYPES[k].label}</span><span className="block text-xs text-muted">{NOTIFY_TYPES[k].help}</span></th>
                  {(["push", "email"] as const).map((ch) => (
                    <td key={ch} className="text-center">
                      <label className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center">
                        <input type="checkbox" name={`${k}_${ch}`} defaultChecked={prefs[`${k}_${ch}`]} disabled={!prefsReady} className="size-5" />
                        <span className="sr-only">{NOTIFY_TYPES[k].label} by {ch === "push" ? "phone alert" : "email"}</span>
                      </label>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-muted">Phone alerts need alerts turned on for this phone in <Link className="text-mph underline" href="/account">My account</Link>. The weekly FLAME PH email follows switch 5, &quot;News and offers&quot;, above.</p>
          <SubmitButton className="btn btn-primary btn-ds w-full sm:w-auto" disabled={!prefsReady}>Save notification choices</SubmitButton>
        </form>
      </section>

      <PrivacyControls biz={biz} status={sp.privacy} />

      <section aria-labelledby="more" className="card p-5">
        <h2 id="more" className="text-xl font-extrabold">More</h2>
        <ul className="mt-2 space-y-2">
          <li><Link className="text-mph underline" href="/account/profile">Edit your profile</Link></li>
          <li><Link className="text-mph underline" href="/account/password">Change your password</Link></li>
          <li><Link className="text-mph underline" href="/account/ai">Delete your FLAME AI history</Link></li>
          <li><Link className="text-mph underline" href="/account/privacy">Your data and privacy</Link>: download a copy of your data, correct it, object to a use of it, or close or delete your account.</li>
          <li>Or email our Data Protection Officer at <a className="text-mph underline" href={`mailto:${ORG.emailPrimary}`}>{ORG.emailPrimary}</a>.</li>
        </ul>
      </section>
    </div>
  );
}
