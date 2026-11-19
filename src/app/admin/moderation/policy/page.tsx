import Link from "next/link";
import { Notice } from "@/components/ui";
import { setKeyword } from "@/app/account/moderation-actions";
import { requireModerator } from "@/lib/moderation-data";
import { MOD_ERRORS } from "@/lib/moderation";

export const metadata = { title: "Moderation policy" };
type Keyword = { phrase: string; action: "hold" | "block"; created_at: string };

/** Founders only: the automatic keyword filter. Changes are logged in the audit log. */
export default async function PolicyPage({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireModerator("/admin/moderation/policy", 3);
  const { data } = await supabase.from("moderation_keywords").select("phrase, action, created_at").order("phrase").limit(500);
  const words = (data ?? []) as Keyword[];
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/admin/moderation" className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary"><span aria-hidden>←</span> Queue</Link>
      <h1 className="text-3xl font-extrabold text-primary">Moderation policy</h1>
      <section className="card space-y-2 p-4 text-sm">
        <h2 className="text-base font-bold">Automatic checks on every post and comment</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>At most 10 posts and 30 comments an hour; no duplicate posts within a day.</li>
          <li>New accounts: 3 posts on their first day, and no links. Everyone: at most 3 links in a post, 2 in a comment.</li>
          <li>Promised returns (guaranteed, fixed or risk-free, &quot;double your money&quot;, a percentage per day, week or month on an investment post), and pyramid, MLM or recruitment wording: held for review, in posts and in replies. Investment and loan posts, and every post by a member whose profile type is &quot;Investor or funder&quot;, get the investor warning.</li>
          <li>Spam patterns (the same letter many times, mostly capitals, many phone numbers): held for review.</li>
          <li>Members muted or banned by a moderator can&apos;t post or comment.</li>
          <li>The keywords below: <strong>Hold</strong> sends the post to the queue; <strong>Block</strong> refuses it.</li>
        </ul>
        <p className="text-muted">Held items go to the moderation queue with the 24-hour clock.</p>
      </section>
      {sp.done && <div role="status"><Notice tone="ok">{sp.done === "removed" ? "Keyword removed." : "Keyword added."} The change is in the audit log.</Notice></div>}
      {sp.error && <div role="alert"><Notice tone="danger">{MOD_ERRORS[sp.error] ?? MOD_ERRORS.failed}</Notice></div>}
      <form action={setKeyword} className="card grid gap-2 p-4 sm:grid-cols-[1fr_auto_auto]">
        <label htmlFor="phrase" className="sr-only">Word or phrase</label>
        <input id="phrase" name="phrase" required minLength={3} maxLength={60} placeholder="Word or phrase" className="input min-h-11 text-[16px]" />
        <label htmlFor="kw-action" className="sr-only">What to do</label>
        <select id="kw-action" name="action" className="input min-h-11"><option value="hold">Hold for review</option><option value="block">Block</option></select>
        <button className="btn btn-primary min-h-11 px-4">Add</button>
      </form>
      <ul className="card divide-y divide-line">
        {words.map((w) => (
          <li key={w.phrase} className="flex items-center justify-between gap-2 px-4 py-2">
            <span><span className="font-semibold">{w.phrase}</span> <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-bold ${w.action === "block" ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn"}`}>{w.action === "block" ? "Block" : "Hold"}</span></span>
            <form action={setKeyword}>
              <input type="hidden" name="phrase" value={w.phrase} /><input type="hidden" name="op" value="remove" />
              <button className="btn btn-ghost min-h-11 px-3 text-sm" aria-label={`Remove ${w.phrase}`}>Remove</button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
