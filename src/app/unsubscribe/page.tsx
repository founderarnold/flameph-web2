import Link from "next/link";
import { Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { isUnsubTopic, UNSUB_TOPICS } from "@/lib/notification-prefs";
import { verifyUnsubscribe } from "@/lib/unsubscribe";
import { confirmUnsubscribe } from "./actions";

export const metadata = { title: "Unsubscribe", robots: { index: false } };

type SP = { u?: string; t?: string; s?: string; done?: string; error?: string };

/** Opened from the link at the bottom of a FLAME PH email. One button stops that kind of email; no sign-in needed. */
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const settings = <Link href="/account/settings#notifications" className="btn btn-outline min-h-11 w-full">Choose in Settings instead</Link>;

  if (sp.done && isUnsubTopic(sp.done)) {
    return (
      <div className="container-x mx-auto max-w-xl space-y-4 py-10">
        <h1 className="text-2xl font-bold">You&apos;re unsubscribed</h1>
        <div role="status"><Notice tone="ok">We won&apos;t send you {sp.done === "all" ? "any more FLAME PH emails about these" : `"${UNSUB_TOPICS[sp.done]}" emails`}. You can turn them back on any time in Settings.</Notice></div>
        <p className="text-sm text-muted">Account and security emails (such as sign-in links) still come, because you need them to use your account.</p>
        {settings}
      </div>
    );
  }

  const valid = Boolean(sp.u && isUnsubTopic(sp.t) && sp.s && verifyUnsubscribe(sp.u, sp.t, sp.s));
  if (!valid || !isUnsubTopic(sp.t)) {
    return (
      <div className="container-x mx-auto max-w-xl space-y-4 py-10">
        <h1 className="text-2xl font-bold">Unsubscribe</h1>
        <Notice tone="info">This unsubscribe link isn&apos;t complete. Sign in and choose which emails you get in Settings.</Notice>
        {settings}
      </div>
    );
  }
  const topic = sp.t;
  return (
    <div className="container-x mx-auto max-w-xl space-y-4 py-10">
      <h1 className="text-2xl font-bold">Stop these emails?</h1>
      <p>{topic === "all" ? "We'll stop every FLAME PH notification email and the weekly email." : <>We&apos;ll stop emails about: <strong>{UNSUB_TOPICS[topic]}</strong>.</>}</p>
      <p className="text-sm text-muted">You&apos;ll still see these in the app. Account and security emails still come.</p>
      {sp.error === "save" && <div role="alert"><Notice tone="danger">That didn&apos;t save. Please try again, or turn it off in Settings.</Notice></div>}
      <form action={confirmUnsubscribe} className="space-y-3">
        <input type="hidden" name="u" value={sp.u} /><input type="hidden" name="t" value={topic} /><input type="hidden" name="s" value={sp.s} />
        <SubmitButton className="btn btn-primary min-h-11 w-full" pendingText="Saving…">Yes, unsubscribe</SubmitButton>
      </form>
      {settings}
    </div>
  );
}
