import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { OPPORTUNITY_KINDS, type Opportunity, dateLabel, matches, notExpired } from "@/lib/growth";
import { CountBadge, buttonClass } from "@/components/ui";
import { TabShell } from "@/components/shell/TabShell";

export const metadata = { title: "Workspace" };

/** The member's day-to-day business tools in one place. Every tile opens an existing tool; nothing is rebuilt here. */
const TOOLS = [
  { href: "/account/business", title: "My business page", text: "Edit your listing, photos and products." },
  { href: "/account/inquiries", title: "Messages and inquiries", text: "Questions from buyers and members.", unread: true },
  { href: "/pos", title: "Flame POS", text: "Sales, receipts and stock." },
  { href: "/group-order", title: "Group Order", text: "Buy in bulk with other members." },
  { href: "/fulfillment", title: "Fulfillment", text: "Produce, pack or deliver orders." },
  { href: "/business-calculators", title: "Business calculators", text: "Pricing, profit and break-even." },
  { href: "/bizconsult-ai", title: "Ka-FLAME AI", text: "Ask a business question anytime." },
  { href: "/account/growth", title: "Growth path", text: "Your stage and next milestones." },
  { href: "/account/rewards", title: "Rewards", text: "Points and what you can claim." },
  { href: "/account#member-id", title: "Member ID", text: "Your digital FLAME PH ID." },
  { href: "/resources", title: "Resources and guides", text: "Templates and how-tos." },
  { href: "/real-estate-for-msmes", title: "Real Estate for MSMEs", text: "Find a space for your business." },
];

export default async function Workspace() {
  const { supabase, user } = await requireUser("/workspace");
  const [{ data: p }, { data: biz }, { data: opps }, { count: unread }] = await Promise.all([
    supabase.from("profiles").select("province, business_stage").eq("id", user.id).single(),
    supabase.from("businesses").select("sector, province").eq("owner_id", user.id).limit(1).maybeSingle(),
    supabase.from("opportunities").select("*").eq("published", true).order("deadline", { ascending: true, nullsFirst: false }).limit(100),
    supabase.from("business_inquiries").select("id", { count: "exact", head: true }).eq("owner_id", user.id).eq("status", "new"),
  ]);
  const open = ((opps ?? []) as Opportunity[]).filter((o) => notExpired(o.deadline));
  const fit = open.filter((o) => matches(o, { province: biz?.province ?? p?.province, sector: biz?.sector, stage: p?.business_stage }));
  const shown = (fit.length ? fit : open).slice(0, 5);
  return (
    <TabShell title="Workspace" intro="Your day-to-day business tools, and opportunities picked for you.">
      <section id="opportunities" aria-labelledby="ws-opps" className="card p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="ws-opps" className="text-lg font-bold">Opportunities {fit.length ? "for you" : ""}</h2>
          <Link href="/opportunities" className="text-sm font-semibold text-primary underline">See all</Link>
        </div>
        {shown.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No open opportunities right now. We post grants, loans, trade fairs and buyer requests as they come.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {shown.map((o) => (
              <li key={o.id}>
                <Link href="/opportunities" className="block min-h-11 py-2.5">
                  <span className="block font-semibold">{o.title}</span>
                  <span className="block text-sm text-muted">{OPPORTUNITY_KINDS[o.kind] ?? "Opportunity"}{o.deadline ? ` · apply by ${dateLabel(o.deadline)}` : ""}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="ws-tools">
        <h2 id="ws-tools" className="text-lg font-bold">Tools</h2>
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {TOOLS.map((t) => (
            <li key={t.href}>
              <Link href={t.href} className="card flex h-full min-h-24 flex-col p-3 hover:border-primary">
                <span className="flex items-center gap-2 font-semibold">{t.title}{t.unread && <CountBadge count={unread ?? 0} label="unread" />}</span>
                <span className="mt-1 text-sm text-muted">{t.text}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <Link href="/account" className={buttonClass({ variant: "ghost" })}>My account</Link>
    </TabShell>
  );
}
