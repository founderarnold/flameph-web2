import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getConsents } from "@/lib/consents";
import { POLICY_EFFECTIVE_LABEL, POLICY_VERSION, type ConsentKey } from "@/lib/policy";
import { safeNext } from "@/lib/safe-next";
import { ConsentSwitches } from "@/components/ConsentSwitches";
import { Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { saveConsents } from "../consent-actions";

export const metadata = { title: "Our updated policies", robots: { index: false } };

/** Asked once after sign-in when the member hasn't accepted the current policies. "Not now" always lets them carry on. */
export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { supabase, user } = await requireUser("/account/consent");
  const next = safeNext((await searchParams).next);
  const [{ ready, state }, { data: p }] = await Promise.all([
    getConsents(supabase, user.id),
    supabase.from("profiles").select("consent_marketing").eq("id", user.id).maybeSingle(),
  ]);
  // Show what the member already chose. Marketing falls back to the newsletter choice they made before these switches existed.
  const on: Partial<Record<ConsentKey, boolean>> = Object.fromEntries(Object.entries(state).map(([k, v]) => [k, v.granted && (k !== "terms" || v.version === POLICY_VERSION)]));
  if (!state.marketing && p?.consent_marketing) on.marketing = true;
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <header>
        <h1 className="text-3xl font-extrabold text-primary">We updated our policies</h1>
        <p className="mt-2 text-muted">Version {POLICY_VERSION}, effective {POLICY_EFFECTIVE_LABEL}. Please look over your choices. Everything you already use keeps working, whatever you choose today.</p>
      </header>
      {!ready && <Notice>Saving choices isn&apos;t available yet. You can carry on and we&apos;ll ask again later.</Notice>}
      <form action={saveConsents} className="card space-y-4 p-5">
        <input type="hidden" name="source" value="prompt" />
        <input type="hidden" name="next" value={next} />
        <ConsentSwitches on={on} />
        <div className="flex flex-col gap-3 sm:flex-row">
          <SubmitButton className="btn btn-primary btn-ds sm:flex-1" disabled={!ready}>Save my choices</SubmitButton>
          <Link href={next} className="btn btn-ghost sm:flex-1">Not now</Link>
        </div>
        <p className="text-sm text-muted">You can change any of these later in <Link className="text-mph underline" href="/account/settings">Settings</Link>.</p>
      </form>
    </div>
  );
}
