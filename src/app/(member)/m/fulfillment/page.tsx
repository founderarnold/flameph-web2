import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { SubmissionForm } from "@/components/SubmissionForm";
import { FORMS } from "@/lib/forms";
import { TabShell } from "@/components/shell/TabShell";
import { buttonClass } from "@/components/ui";
import { timeAgo } from "@/lib/feed-rules";

export const metadata = { title: "Fulfillment" };

/**
 * Fulfillment tab (members see this at /fulfillment). Reuses the existing partner application; the full feature arrives in Phase 10.
 * Fulfillment offers are member posts of the "Fulfillment offer" kind: they appear in the Home feed and are gathered here.
 */
export default async function FulfillmentTab() {
  const { supabase } = await requireUser("/fulfillment");
  const { data: rows } = await supabase.from("feed_posts").select("id, body, category, author_name, created_at, status").eq("kind", "fulfillment").eq("status", "published")
    .order("created_at", { ascending: false }).limit(10);
  const list = (rows ?? []) as { id: string; body: string; category: string; author_name: string | null; created_at: string }[];
  return (
    <TabShell title="Fulfillment" fil="Kita mula sa kapwa MSME" soon="Order fulfillment tools arrive in a later update"
      intro="Member MSMEs produce, pack or deliver orders for other members, FLAME PH merch, Signature Brands and personalized requests.">
      <section id="offers" aria-labelledby="offers-h" className="scroll-mt-24 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="offers-h" className="text-lg font-bold">Fulfillment offers from members</h2>
          <Link href="/new-post?kind=fulfillment" className={buttonClass({ variant: "primary", size: "sm", className: "min-h-11" })}>Post an offer</Link>
        </div>
        {list.length === 0 ? <p className="card p-4 text-sm text-muted">No offers yet. If you can produce, pack or deliver for other members, post an offer. It also shows in the Home feed.</p> : (
          <ul className="space-y-2">
            {list.map((o) => (
              <li key={o.id} id={`offer-${o.id}`} className="card scroll-mt-24 p-4">
                <p className="text-sm text-muted">{o.author_name ?? "FLAME PH member"} · {o.category} · {timeAgo(o.created_at)}</p>
                <p className="mt-1 line-clamp-3">{o.body}</p>
                <Link href={`/posts/${o.id}#comments`} className={buttonClass({ variant: "outline", size: "sm", className: "mt-2 min-h-11" })}>Reply to this offer</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <h2 className="text-lg font-bold">Become a FLAME PH fulfillment partner</h2>
      <SubmissionForm def={FORMS.fulfillment} compact doneHref="/home" />
      <Link href="/fulfillment?view=public" className="text-sm font-semibold text-primary underline">About Fulfillment by MSMEs</Link>
    </TabShell>
  );
}
