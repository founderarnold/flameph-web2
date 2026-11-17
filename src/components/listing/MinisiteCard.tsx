import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { builderHref, minisiteUrl, type Minisite } from "@/lib/minisites";

/**
 * The member's mini-website, from the existing FlamePH Pages builder. Shown on My business listing and in Workspace.
 * The builder itself is not rebuilt here: the buttons open it, already signed in.
 */
export async function MinisiteCard({ supabase, userId }: { supabase: SupabaseClient; userId: string }) {
  const { data } = await supabase.from("member_minisites").select("site_id, slug, name, category, published").eq("owner_id", userId).order("published", { ascending: false }).order("updated_at", { ascending: false }).limit(10);
  const sites = (data ?? []) as Minisite[];
  const live = sites.filter((s) => s.published);
  return (
    <section aria-labelledby="minisite-h" className="card mt-6 p-4">
      <h2 id="minisite-h" className="text-lg font-bold">My mini-website</h2>
      {sites.length === 0 ? (
        <p className="mt-1 text-sm text-muted">A free one-page website for your business, with its own address on flameph.org/business. Leads from its contact form come to your Inquiries.</p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {sites.map((s) => (
            <li key={s.site_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="min-w-0">
                <span className="block font-semibold">{s.name}</span>
                <span className="block break-all text-sm text-muted">flameph.org/business/{s.slug}{s.published ? "" : " · offline"}</span>
              </span>
              {s.published && <a href={minisiteUrl(s.slug)} target="_blank" rel="noopener" className="btn btn-outline min-h-11 px-3 text-sm">View ↗</a>}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <a href={builderHref(sites.length ? "/dashboard" : "/build")} className="btn btn-primary min-h-11">{sites.length ? "Edit my mini-website" : "Make my free mini-website"}</a>
        <Link href="/account/inquiries" className="btn btn-outline min-h-11">Leads and inquiries</Link>
      </div>
      <p className="mt-2 text-xs text-muted">{live.length ? "Your mini-website is linked on your member profile." : "Mini-websites made with the same email as your FLAME PH account show here, usually within a minute of publishing."}</p>
    </section>
  );
}
