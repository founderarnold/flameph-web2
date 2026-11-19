"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { createPost, type FormState } from "@/app/account/feed-actions";
import { SubmitButton } from "@/components/SubmitButton";
import { INDUSTRIES } from "@/lib/industries";
import { AUDIENCES, POST_KINDS, POST_MAX, classifyPost, linkCount, type Audience, type PostKind } from "@/lib/feed-rules";
import { INVESTOR_GROUP } from "@/lib/groups";
import { InvestorWarning } from "./InvestorWarning";
import { MediaPicker } from "./MediaPicker";
import { parseMedia } from "@/lib/post-media";

/** The New Post composer. Opens straight away; publishing returns the member to the feed, scrolled to the new post. */
export function Composer({ kind: startKind, category: startCategory, group = null, friendsAvailable = false, userId = null, investorAuthor = false }: {
  kind: PostKind; category: string; group?: { slug: string; name: string } | null; friendsAvailable?: boolean; userId?: string | null;
  /** The member's profile type is "Investor or funder": every post they make is an investor/funder post (0026). */
  investorAuthor?: boolean;
}) {
  const [state, action] = useActionState<FormState, FormData>(createPost, {});
  const [kind, setKind] = useState<PostKind>((state.values?.kind as PostKind) ?? startKind);
  const [body, setBody] = useState(state.values?.body ?? "");
  const [audience, setAudience] = useState<Audience>((state.values?.audience as Audience) || "members");
  const check = classifyPost(body, group?.slug === INVESTOR_GROUP ? "investor" : kind, investorAuthor);
  const links = linkCount(body);
  return (
    <form action={action} className="space-y-4" aria-describedby={state.error ? "post-error" : undefined}>
      {group && (
        <p className="rounded-xl bg-primary-soft p-3 text-sm">Posting in the group <strong>{group.name}</strong>. All members can see it, in the group and in the feed.
          <input type="hidden" name="group" value={group.slug} /></p>
      )}
      <div>
        <label htmlFor="post-body" className="label">Your post</label>
        <textarea id="post-body" name="body" required rows={6} maxLength={POST_MAX} value={body} onChange={(e) => setBody(e.target.value)}
          placeholder={kind === "question" ? "What would you like to ask other members?" : kind === "request" ? "What are you looking for? Include the quantity and your city." : kind === "fulfillment" ? "What can you produce, pack or deliver for other members? Include your capacity and area." : "Share an update with FLAME PH members…"}
          className="input w-full text-[16px]" aria-describedby="post-count" autoFocus />
        <p id="post-count" className="mt-1 text-right text-xs text-muted" aria-live="polite">{body.length} / {POST_MAX}{links > 3 ? " · Please keep it to 3 links or fewer" : ""}</p>
      </div>

      {userId && <MediaPicker userId={userId} initial={parseMedia(state.values?.media ?? "[]", userId)} initialLink={state.values?.video_url ?? ""} />}

      <fieldset>
        <legend className="label">What are you sharing?</legend>
        <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {(Object.keys(POST_KINDS) as PostKind[]).map((k) => (
            <label key={k} className={`flex min-h-11 cursor-pointer flex-col justify-center rounded-xl border px-3 py-2 text-sm ${kind === k ? "border-primary bg-primary-soft" : "border-line"}`}>
              <span className="flex items-center gap-2 font-semibold">
                <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="size-4" />
                {POST_KINDS[k].label}
              </span>
              <span className="hidden text-xs text-muted sm:block">{POST_KINDS[k].help}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="post-category" className="label">Industry</label>
        <select id="post-category" name="category" required defaultValue={state.values?.category ?? startCategory} className="input min-h-11 w-full">
          <option value="">Choose an industry</option>
          {INDUSTRIES.map((i) => (
            <optgroup key={i.name} label={i.name}>
              <option value={i.name}>{i.name} (general)</option>
              {i.subs.map((s) => <option key={s} value={`${i.name}||${s}`}>{s}</option>)}
            </optgroup>
          ))}
        </select>
        <p className="mt-1 text-sm text-muted">Members filter the feed and the forum by industry.</p>
      </div>

      {!group && friendsAvailable && (
        <fieldset>
          <legend className="label">Who can see it?</legend>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {(Object.keys(AUDIENCES) as Audience[]).map((a) => (
              <label key={a} className={`flex min-h-11 cursor-pointer flex-col justify-center rounded-xl border px-3 py-2 text-sm ${audience === a ? "border-primary bg-primary-soft" : "border-line"}`}>
                <span className="flex items-center gap-2 font-semibold">
                  <input type="radio" name="audience" value={a} checked={audience === a} onChange={() => setAudience(a)} className="size-4" />
                  {AUDIENCES[a].label}
                </span>
                <span className="text-xs text-muted">{AUDIENCES[a].help}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {check.kind === "investor" && (
        <div>
          <p className="mb-2 text-sm font-semibold">{investorAuthor ? "Your profile type is Investor or funder, so this warning is always shown on your posts and their replies. It can't be removed or hidden:" : kind === "investor" ? "This warning is always shown on your post and its replies:" : "Your post mentions investment or funding, so this warning will be shown on it and its replies:"}</p>
          <InvestorWarning />
        </div>
      )}
      {check.held && (
        <p role="note" className="rounded-xl bg-warn-soft p-3 text-sm text-fg">Posts that promise guaranteed, fixed or risk-free returns, or that use pyramid, MLM or recruitment structures, are checked by a FLAME PH moderator before other members see them.</p>
      )}

      <p className="text-sm text-muted">{audience === "friends" && !group ? "Only your Friends will see this post." : "Only signed-in FLAME PH members see posts."} Please follow the <Link href="/membership/terms" className="underline">Community Guidelines</Link>. FLAME PH never handles payment between members.</p>
      {state.error && <p id="post-error" role="alert" className="rounded-xl bg-danger-soft p-3 text-sm font-semibold text-danger">{state.error}</p>}
      <div className="flex flex-wrap gap-2">
        <SubmitButton className="btn btn-primary min-h-11 px-6" pendingText="Posting…">Post</SubmitButton>
        <Link href={group ? `/groups/${group.slug}` : "/home"} className="btn btn-outline min-h-11">Cancel</Link>
      </div>
    </form>
  );
}
