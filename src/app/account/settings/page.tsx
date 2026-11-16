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

export const metadata = { title: "Settings", robots: { index: false } };

const when = (iso: string) => new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });
const SOURCE = { signup: "at sign-up", prompt: "after sign-in", settings: "in Settings" } as const;

export default async function Page({ searchParams }: { searchParams: Promise<{ saved?: string; closing?: string; consent?: string; privacy?: string }> }) {
  const { supabase, user } = await requireUser("/account/settings");
  const sp = await searchParams;
  const [{ ready, state }, { data: history }, { data: biz }] = await Promise.all([
    getConsents(supabase, user.id),
    supabase.from("member_consents").select("id, consent_key, granted, policy_version, source, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(30),
    supabase.from("businesses").select("*").eq("owner_id", user.id).limit(1).maybeSingle(),
  ]);
  const on: Partial<Record<ConsentKey, boolean>> = Object.fromEntries(Object.entries(state).map(([k, v]) => [k, v.granted && (k !== "terms" || v.version === POLICY_VERSION)]));
  const title = (k: string) => CONSENTS.find((c) => c.key === k)?.title ?? k;
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-3xl font-extrabold text-primary">Settings</h1>
      {sp.saved && !sp.closing && <div role="status" className="space-y-3"><Notice tone="ok">Saved. Your choices apply right away.</Notice><BackToFeed /></div>}
      {sp.closing && <Notice tone="danger">You turned off switch 1, so we&apos;ll close your account. A person from FLAME PH will confirm by email within 15 working days. Changed your mind? Turn it back on and save.</Notice>}
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

      <PrivacyControls biz={biz} status={sp.privacy} />

      <section aria-labelledby="more" className="card p-5">
        <h2 id="more" className="text-xl font-extrabold">More</h2>
        <ul className="mt-2 space-y-2">
          <li><Link className="text-mph underline" href="/account/profile">Edit your profile</Link></li>
          <li><Link className="text-mph underline" href="/account/password">Change your password</Link></li>
          <li><Link className="text-mph underline" href="/account/ai">Delete your FLAME AI history</Link></li>
          <li>To see, correct or get a copy of your data, email our Data Protection Officer at <a className="text-mph underline" href={`mailto:${ORG.emailPrimary}`}>{ORG.emailPrimary}</a>.</li>
        </ul>
      </section>
    </div>
  );
}
