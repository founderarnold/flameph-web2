import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { ORG, OFFICIAL_LINKS } from "@/lib/site";
import { REQUEST_KINDS, STATUS_LABEL, PRIVACY_ERRORS, day, ERASURE_COOL_OFF_DAYS, type RequestKind, type RequestStatus } from "@/lib/data-rights";
import { closeAccount, eraseAccount, reopenAccount, saveSuggestionChoice, sendPrivacyRequest, withdrawRequest } from "../privacy-actions";

export const metadata = { title: "Your data and privacy", robots: { index: false } };

type Req = { id: string; kind: RequestKind; status: RequestStatus; details: string | null; created_at: string; due_at: string; erase_after: string | null; response: string | null; closed_at: string | null };

const DONE: Record<string, string> = {
  request: "Sent. Our Data Protection Officer will answer within 15 working days.",
  closed: "Your account is closed. Your profile, posts and listings are hidden. You can reopen it below any time before it is erased.",
  erasure: `Your account is closed now. We'll erase it and your data in ${ERASURE_COOL_OFF_DAYS} days. You can still change your mind below until then.`,
  reopened: "Welcome back. Your account is open again.",
  withdrawn: "Request withdrawn.",
  suggestions: "Saved.",
};

/**
 * Phase 12: the member's data rights in one place (Data Privacy Act of 2012): see and download their data (access and
 * portability), correct it, object to a use of it, and close or delete their account. Requests go to the DPO with a
 * 15-working-day clock.
 */
export default async function PrivacyPage({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  const { supabase, user } = await requireUser("/account/privacy");
  const sp = await searchParams;
  const [{ data: prof }, reqs] = await Promise.all([
    supabase.from("profiles").select("status, closed_at, hide_from_suggestions").eq("id", user.id).maybeSingle(),
    supabase.from("privacy_requests").select("id, kind, status, details, created_at, due_at, erase_after, response, closed_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(30),
  ]);
  const ready = !reqs.error;
  const requests = (reqs.data ?? []) as Req[];
  const closed = prof?.status === "closed";
  const pendingErase = requests.find((r) => r.kind === "erasure" && (r.status === "open" || r.status === "in_progress"));
  const eraseOn = pendingErase?.erase_after ?? (prof?.closed_at ? new Date(new Date(prof.closed_at).getTime() + 365 * 86400_000).toISOString() : null);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-3xl font-extrabold text-primary">Your data and privacy</h1>
      <p className="text-muted">Under the Data Privacy Act of 2012 you can see, copy, correct and delete your data, and object to how we use it. Most of it you can do here, right away. For anything else, our Data Protection Officer answers within 15 working days.</p>
      {sp.done && DONE[sp.done] && <div role="status"><Notice tone="ok">{DONE[sp.done]}</Notice></div>}
      {sp.error && <div role="alert"><Notice tone="danger">{PRIVACY_ERRORS[sp.error] ?? PRIVACY_ERRORS.failed}</Notice></div>}
      {!ready && <Notice tone="info">{PRIVACY_ERRORS.unavailable}</Notice>}

      {closed && (
        <section aria-labelledby="closed-h" className="card space-y-3 border-2 border-flame p-5">
          <h2 id="closed-h" className="text-xl font-extrabold">Your account is closed</h2>
          <p className="text-sm">Your profile, posts, listings and badge are hidden, and you can&apos;t post or send messages. {eraseOn && <>We erase your account and data on <b>{day(eraseOn)}</b>.</>}</p>
          <form action={reopenAccount}><SubmitButton className="btn btn-primary btn-ds min-h-11">Reopen my account</SubmitButton></form>
        </section>
      )}

      <section aria-labelledby="see-h" className="card space-y-3 p-5">
        <h2 id="see-h" className="text-xl font-extrabold">See and copy your data</h2>
        <p className="text-sm text-muted">One file with everything we hold about you: account, profile, consents, businesses, posts, comments, messages, records, requests, AI chats, notices, and the log of what we shared with MarketplacePH and NegosyoDepot. It&apos;s a JSON file, which other apps can read.</p>
        <a href="/account/privacy/download" className="btn btn-primary btn-ds min-h-11" download>Download my data</a>
        <p className="text-xs text-muted">Up to 3 times a day. Each download is recorded in our audit log.</p>
      </section>

      <section aria-labelledby="fix-h" className="card space-y-3 p-5">
        <h2 id="fix-h" className="text-xl font-extrabold">Correct your data</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li><Link className="text-mph underline" href="/account/profile">Your name, mobile, province, city and profile type</Link></li>
          <li><Link className="text-mph underline" href="/account/business">Your business listing</Link></li>
          <li><Link className="text-mph underline" href="/account/settings">Your consents and notification choices</Link></li>
        </ul>
        <RequestForm kind="correction" label="Something else is wrong? Tell us what, and what it should say." disabled={!ready} />
      </section>

      <section id="object" aria-labelledby="obj-h" className="card scroll-mt-24 space-y-3 p-5">
        <h2 id="obj-h" className="text-xl font-extrabold">Object to a use of your data</h2>
        <form action={saveSuggestionChoice} className="space-y-3">
          <label className="flex min-h-11 cursor-pointer items-start gap-3">
            <input type="checkbox" name="hide" defaultChecked={Boolean(prof?.hide_from_suggestions)} className="mt-1 size-5" />
            <span><b>Don&apos;t suggest me to other members.</b> <span className="block text-sm text-muted">You won&apos;t appear in &quot;People you may know&quot;. Members can still find you by name.</span></span>
          </label>
          <SubmitButton className="btn btn-outline btn-ds min-h-11">Save</SubmitButton>
        </form>
        <p className="text-sm text-muted">News and offers by email or push: turn off switch 5 in <Link className="text-mph underline" href="/account/settings">Settings</Link>. Your badge on other sites: switch 3.</p>
        <RequestForm kind="objection" label="Object to another use: tell us which, and why." disabled={!ready} />
      </section>

      {!closed && (
        <section id="close" aria-labelledby="close-h" className="card scroll-mt-24 space-y-3 p-5">
          <h2 id="close-h" className="text-xl font-extrabold">Close your account</h2>
          <p className="text-sm text-muted">Hides your profile, posts, listings and badge at once, and signs you out of the other FLAME PH sites. Your data is kept for 1 year in case you come back, then erased.</p>
          <form action={closeAccount} className="space-y-3">
            <label className="flex min-h-11 cursor-pointer items-start gap-3"><input type="checkbox" name="confirm" className="mt-1 size-5" required /><span className="text-sm">Yes, close my FLAME PH account.</span></label>
            <SubmitButton className="btn btn-outline btn-ds min-h-11" disabled={!ready}>Close my account</SubmitButton>
          </form>
        </section>
      )}

      {!pendingErase && (
        <section id="erase" aria-labelledby="erase-h" className="card scroll-mt-24 space-y-3 p-5">
          <h2 id="erase-h" className="text-xl font-extrabold">Delete your account and data</h2>
          <p className="text-sm text-muted">Your account closes now. After {ERASURE_COOL_OFF_DAYS} days we erase your account, profile, businesses, posts, comments, messages, records, AI chats and files. Records and conversations you share with other members are removed for them too.</p>
          <p className="text-sm text-muted">We keep only what the law needs: a note that you asked and when we erased, and moderation cases (3 years, without your name).</p>
          <form action={eraseAccount} className="space-y-3">
            <label className="flex min-h-11 cursor-pointer items-start gap-3"><input type="checkbox" name="confirm" className="mt-1 size-5" required /><span className="text-sm">Yes, delete my FLAME PH account and data. I&apos;ve downloaded anything I want to keep.</span></label>
            <SubmitButton className="btn btn-danger btn-ds min-h-11" disabled={!ready}>Delete my account and data</SubmitButton>
          </form>
        </section>
      )}

      <section id="requests" aria-labelledby="req-h" className="card scroll-mt-24 space-y-3 p-5">
        <h2 id="req-h" className="text-xl font-extrabold">Your requests</h2>
        {requests.length === 0 ? <p className="text-sm text-muted">None yet.</p> : (
          <ul className="divide-y divide-line text-sm">
            {requests.map((r) => (
              <li key={r.id} className="space-y-1 py-3">
                <p className="flex flex-wrap justify-between gap-x-3"><b>{REQUEST_KINDS[r.kind]?.label ?? r.kind}</b><span className="text-muted">{STATUS_LABEL[r.status]} · sent {day(r.created_at)}</span></p>
                {(r.status === "open" || r.status === "in_progress") && <p className="text-muted">Answer due by {day(r.due_at)}{r.kind === "erasure" && r.erase_after ? ` · erasure on ${day(r.erase_after)}` : ""}</p>}
                {r.response && <p>{r.response}</p>}
                {(r.status === "open" || r.status === "in_progress") && r.kind !== "erasure" && r.kind !== "closure" && (
                  <form action={withdrawRequest}><input type="hidden" name="id" value={r.id} /><button className="text-mph min-h-11 underline">Withdraw</button></form>
                )}
              </li>
            ))}
          </ul>
        )}
        <details className="text-sm">
          <summary className="min-h-11 cursor-pointer py-2 font-semibold">Ask for something else</summary>
          <div className="space-y-3 pt-2">
            <RequestForm kind="access" label="A written answer about your data (what we hold, why, who we shared it with)" optional disabled={!ready} />
            <RequestForm kind="portability" label="A copy in another format, or sent somewhere else" optional disabled={!ready} />
          </div>
        </details>
      </section>

      <section aria-labelledby="dpo-h" className="card space-y-2 p-5 text-sm">
        <h2 id="dpo-h" className="text-xl font-extrabold">Contact</h2>
        <p>Data Protection Officer: <a className="text-mph underline" href={`mailto:${ORG.emailPrimary}`}>{ORG.emailPrimary}</a> · {ORG.address}</p>
        <p>Not happy with our answer? You can file a complaint with the <a className="text-mph underline" href={OFFICIAL_LINKS.NPC} target="_blank" rel="noopener">National Privacy Commission</a>.</p>
        <p><Link className="text-mph underline" href="/legal/privacy">Privacy Notice</Link>, including how long we keep each kind of data.</p>
      </section>
    </div>
  );
}

function RequestForm({ kind, label, optional = false, disabled }: { kind: RequestKind; label: string; optional?: boolean; disabled?: boolean }) {
  const id = `req-${kind}`;
  return (
    <form action={sendPrivacyRequest} className="space-y-2">
      <input type="hidden" name="kind" value={kind} />
      <label htmlFor={id} className="label">{label}</label>
      <textarea id={id} name="details" rows={3} maxLength={2000} minLength={optional ? undefined : 10} required={!optional} className="input w-full" />
      <SubmitButton className="btn btn-outline btn-ds min-h-11" disabled={disabled}>Send to our Data Protection Officer</SubmitButton>
    </form>
  );
}
