import Link from "next/link";
import { PageHero, Section, EmptyState, Notice } from "@/components/ui";
import { meta } from "@/lib/meta";
import { getSession } from "@/lib/auth";
import { createPublicClient } from "@/lib/supabase/server";
import { mediaUrl } from "@/lib/content";
import { dateLabel, notExpired, peso } from "@/lib/growth";
import { joinDeal } from "@/app/account/actions";

export const metadata = meta("Buy Together", "FLAME PH members pool their orders to get wholesale prices on packaging, ingredients and equipment.", "/deals");

type Deal = { id: string; title: string; supplier: string | null; description: string | null; unit: string | null; deal_price: number | null; regular_price: number | null; target_members: number; deadline: string | null; status: string; photo_path: string | null };

export default async function Page({ searchParams }: { searchParams: Promise<{ joined?: string; left?: string; error?: string }> }) {
  const sp = await searchParams;
  const pub = createPublicClient();
  const { supabase, user } = await getSession();
  const [{ data }, { data: counts }, mineRes] = await Promise.all([
    pub ? pub.from("deals").select("*").eq("published", true).order("deadline", { ascending: true, nullsFirst: false }) : Promise.resolve({ data: [] }),
    pub ? pub.rpc("deal_counts") : Promise.resolve({ data: [] }),
    user && supabase ? supabase.from("deal_participants").select("deal_id, quantity").eq("user_id", user.id) : null,
  ]);
  const deals = ((data ?? []) as Deal[]).filter((d) => d.status !== "closed");
  const count = new Map(((counts ?? []) as { deal_id: string; members: number; quantity: number }[]).map((c) => [c.deal_id, c]));
  const mine = new Map(((mineRes?.data ?? []) as { deal_id: string; quantity: number }[]).map((m) => [m.deal_id, m.quantity]));

  return (
    <>
      <PageHero status="live" fil="Sama-samang pagbili" title="Buy Together" path="/deals"
        intro="Members pool their orders so small businesses get wholesale prices. Join a deal to reserve your share. FLAME PH contacts everyone with payment and pickup details once the target is reached." />
      <Section>
        {sp.joined && <div className="mb-4"><Notice tone="ok">You&apos;re in! We&apos;ll message you when the deal reaches its target.</Notice></div>}
        {sp.left && <div className="mb-4"><Notice tone="info">You left the deal.</Notice></div>}
        {sp.error && <div className="mb-4"><Notice>That didn&apos;t go through. The deal may already be closed.</Notice></div>}
        {deals.length === 0 ? (
          <EmptyState title="No open deals right now." text="FLAME PH is lining up group deals on packaging, ingredients and equipment. Check back soon, or tell us what you want to buy together." cta={{ href: "/contact", label: "Suggest a deal" }} />
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {deals.map((d) => {
              const c = count.get(d.id);
              const members = Number(c?.members ?? 0);
              const pct = Math.min(100, Math.round((members / d.target_members) * 100));
              const joined = mine.has(d.id);
              const open = d.status === "open" && notExpired(d.deadline);
              const save = d.regular_price && d.deal_price && d.regular_price > d.deal_price ? Math.round((1 - d.deal_price / d.regular_price) * 100) : null;
              return (
                <li key={d.id} id={`deal-${d.id}`} className="card flex scroll-mt-24 flex-col overflow-hidden">
                  {d.photo_path && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={mediaUrl(d.photo_path)!} alt="" className="aspect-[16/9] w-full object-cover" />
                  )}
                  <div className="flex flex-1 flex-col p-5">
                    <div className="flex flex-wrap gap-2 text-xs font-bold">
                      {save && <span className="rounded-full bg-ok-soft px-2.5 py-0.5 text-ok">Save {save}%</span>}
                      <span className={`rounded-full px-2.5 py-0.5 ${open ? "bg-primary-soft text-primary" : "bg-bg-soft text-muted"}`}>{d.status === "reached" ? "Target reached" : open ? "Open" : "Closed"}</span>
                    </div>
                    <h2 className="mt-2 text-lg font-bold">{d.title}</h2>
                    {d.supplier && <p className="text-sm text-muted">Supplier: {d.supplier}</p>}
                    {d.deal_price !== null && (
                      <p className="mt-2"><span className="text-xl font-extrabold">{peso(d.deal_price)}</span>{d.unit && <span className="text-muted"> / {d.unit}</span>}
                        {d.regular_price && <span className="ml-2 text-sm text-muted line-through">{peso(d.regular_price)}</span>}</p>
                    )}
                    {d.description && <p className="mt-2 whitespace-pre-line text-[15px]">{d.description}</p>}
                    <div className="mt-4">
                      <div className="flex justify-between text-sm"><span className="font-semibold">{members} of {d.target_members} members joined</span>{d.deadline && <span className="text-muted">until {dateLabel(d.deadline)}</span>}</div>
                      <div role="progressbar" aria-label={`${d.title} progress`} aria-valuenow={members} aria-valuemin={0} aria-valuemax={d.target_members} className="mt-1 h-2.5 overflow-hidden rounded-full bg-line">
                        <div className="h-full rounded-full bg-flame" style={{ width: `${Math.max(3, pct)}%` }} />
                      </div>
                    </div>
                    <div className="mt-auto pt-4">
                      {!user ? (
                        <Link href={`/login?next=${encodeURIComponent(`/deals#deal-${d.id}`)}`} className="btn btn-primary">Log in to join</Link>
                      ) : joined ? (
                        <form action={joinDeal} className="flex flex-wrap items-center gap-2">
                          <input type="hidden" name="deal_id" value={d.id} /><input type="hidden" name="leave" value="1" />
                          <span className="font-semibold text-ok">✓ You reserved {mine.get(d.id)}{d.unit ? ` ${d.unit}` : ""}</span>
                          {open && <button className="btn btn-ghost min-h-9 px-3 text-sm">Leave deal</button>}
                        </form>
                      ) : open ? (
                        <form action={joinDeal} className="flex flex-wrap items-end gap-2">
                          <input type="hidden" name="deal_id" value={d.id} />
                          <div><label className="label text-sm" htmlFor={`qty-${d.id}`}>Quantity{d.unit ? ` (${d.unit})` : ""}</label><input id={`qty-${d.id}`} name="quantity" type="number" min={1} max={10000} defaultValue={1} className="input w-28" /></div>
                          <button className="btn btn-primary">Join this deal</button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-6 text-sm text-muted">Joining reserves your share; no payment is taken on this site. FLAME PH confirms price, payment and pickup with every member before ordering.</p>
      </Section>
    </>
  );
}
