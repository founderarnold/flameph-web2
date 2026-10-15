import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { MemberCard } from "@/components/MemberCard";
import { Notice } from "@/components/ui";
import { ListingStrength } from "@/components/ListingStrength";
import { StagePicker } from "@/components/StagePicker";
import { hasExtras, type Listing } from "@/lib/listing";
import { list } from "@/lib/content";
import { OPPORTUNITY_KINDS, STAGES, type Opportunity, type Stage, dateLabel, matches, notExpired } from "@/lib/growth";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const { supabase, user } = await requireUser();
  const sp = await searchParams;
  const [{ data: p }, { data: biz }, { data: regs }, { count: aiCount }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("businesses").select("*").eq("owner_id", user.id).limit(1).maybeSingle(),
    supabase.from("event_registrations").select("id, created_at, events(title, starts_at, city)").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("ai_conversations").select("id", { count: "exact", head: true }).eq("user_id", user.id),
  ]);
  // Growth features (0003 database update). Each query is empty, not an error page, until that update is run.
  const since30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [{ data: productRows }, { data: stats }, { count: newInquiries }, { data: opps }, { data: deals }, events] = await Promise.all([
    biz ? supabase.from("business_products").select("id").eq("business_id", biz.id) : Promise.resolve({ data: [] }),
    biz ? supabase.from("business_stats").select("views, clicks").eq("business_id", biz.id).gte("day", since30) : Promise.resolve({ data: [] }),
    supabase.from("business_inquiries").select("id", { count: "exact", head: true }).eq("owner_id", user.id).eq("status", "new"),
    supabase.from("opportunities").select("*").eq("published", true).order("deadline", { ascending: true, nullsFirst: false }).limit(100),
    supabase.from("deals").select("id, title, deadline, target_members").eq("published", true).eq("status", "open").limit(3),
    list<{ id: string; title: string; slug: string | null; starts_at: string; city: string | null; type: string; status: string }>({ table: "events", select: "id,title,slug,starts_at,city,type,status", order: "starts_at", ascending: true }),
  ]);
  const productCount = productRows?.length ?? 0;
  const views = (stats ?? []).reduce((n, x) => n + (x.views ?? 0), 0);
  const matched = ((opps ?? []) as Opportunity[]).filter((o) => notExpired(o.deadline) && matches(o, { province: biz?.province ?? p?.province, sector: biz?.sector, stage: p?.business_stage }));
  const upcoming = events.filter((e) => e.status === "scheduled" && new Date(e.starts_at).getTime() > Date.now()).slice(0, 2);
  const feed = [
    ...matched.slice(0, 3).map((o) => ({ key: o.id, title: o.title, sub: `${OPPORTUNITY_KINDS[o.kind] ?? "Opportunity"}${o.deadline ? ` · apply by ${dateLabel(o.deadline)}` : ""}`, href: "/opportunities" })),
    ...(deals ?? []).slice(0, 2).map((d) => ({ key: d.id, title: `Buy together: ${d.title}`, sub: d.deadline ? `Join by ${dateLabel(d.deadline)}` : "Open to members", href: `/deals#deal-${d.id}` })),
    ...upcoming.map((e) => ({ key: e.id, title: e.title, sub: `${new Date(e.starts_at).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" })}${e.city ? ` · ${e.city}` : ""}`, href: e.type === "webinar" || e.type === "training" ? "/trainings-webinars" : "/workshops" })),
  ];
  const stage = p?.business_stage as Stage | null;
  const incomplete = !p?.full_name || !p?.province || !p?.city || !p?.consent_privacy;
  const listing = biz ? ({ ...biz, product_count: productCount } as Listing) : null;
  const photos = listing?.photos?.length ?? 0;
  const steps = [
    { label: "Confirm your email", done: Boolean(user.email_confirmed_at), href: null },
    { label: "Complete your profile", done: !incomplete, href: "/account/profile" },
    { label: "List your business (free)", done: Boolean(biz), href: "/account/business" },
    { label: hasExtras(listing) ? "Add your logo and 3 photos" : "Add 3 photos", done: photos >= 3 && (!hasExtras(listing) || Boolean(listing?.logo_url)), href: "/account/business" },
    { label: "Add your products with prices", done: productCount > 0 || Boolean(String(listing?.products ?? "").trim()), href: "/account/business#products" },
    { label: "Ask FLAME AI a question", done: (aiCount ?? 0) > 0, href: "/bizconsult-ai" },
    { label: "Register for an event", done: (regs?.length ?? 0) > 0, href: "/workshops" },
  ];
  const doneCount = steps.filter((x) => x.done).length;
  return (
    <div className="space-y-8">
      {sp.denied && <Notice>That page is for FLAME PH admins only.</Notice>}
      <h1 className="text-3xl font-extrabold text-primary">Kumusta{p?.full_name ? `, ${p.full_name.split(" ")[0]}` : ""}!</h1>
      {incomplete && <Notice>Your profile isn&apos;t complete yet. <Link href="/account/profile" className="font-bold underline">Finish it</Link> so you count toward your province on our Impact page.</Notice>}
      {!user.email_confirmed_at && <Notice>Please confirm your email address to activate your member ID.</Notice>}
      {doneCount < steps.length && (
        <section className="card p-5" aria-labelledby="first-steps">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="first-steps" className="text-xl font-extrabold">Your first steps</h2>
            <p className="text-sm font-bold text-muted">{doneCount} of {steps.length} done</p>
          </div>
          <div role="progressbar" aria-label="First steps" aria-valuenow={doneCount} aria-valuemin={0} aria-valuemax={steps.length} className="mt-3 h-2.5 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-ok" style={{ width: `${Math.max(4, Math.round((doneCount / steps.length) * 100))}%` }} />
          </div>
          <ol className="mt-4 grid gap-2 sm:grid-cols-2">
            {steps.map((x) => (
              <li key={x.label} className="flex items-center gap-3">
                <span aria-hidden className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold ${x.done ? "bg-ok text-white" : "border-2 border-line"}`}>{x.done ? "✓" : ""}</span>
                {x.done || !x.href ? <span className={x.done ? "text-muted line-through" : ""}>{x.label}<span className="sr-only">{x.done ? " (done)" : ""}</span></span>
                  : <Link href={x.href} className="font-semibold text-primary underline-offset-2 hover:underline">{x.label} →</Link>}
              </li>
            ))}
          </ol>
        </section>
      )}
      {p && !p.business_stage && (
        <section className="card p-5" aria-labelledby="stage-q">
          <h2 id="stage-q" className="text-xl font-extrabold">Nasaan na ang negosyo mo?</h2>
          <p className="mt-1 text-muted">Pick one so we can send you the right tips, programs and events.</p>
          <StagePicker />
        </section>
      )}
      <section aria-label="This month" className="grid grid-cols-3 gap-3">
        <Link href="/account/inquiries" className="card p-4 hover:border-primary"><p className="font-display text-2xl font-extrabold tabular-nums text-primary">{biz ? views : "–"}</p><p className="text-sm text-muted">listing views, 30 days</p></Link>
        <Link href="/account/inquiries" className={`card p-4 hover:border-primary ${newInquiries ? "border-flame" : ""}`}><p className="font-display text-2xl font-extrabold tabular-nums text-primary">{newInquiries ?? 0}</p><p className="text-sm text-muted">new inquiries</p></Link>
        <Link href="/opportunities" className="card p-4 hover:border-primary"><p className="font-display text-2xl font-extrabold tabular-nums text-primary">{matched.length}</p><p className="text-sm text-muted">opportunities for you</p></Link>
      </section>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="card p-5">
          <h2 className="text-xl font-extrabold">For you this week</h2>
          {feed.length ? (
            <ul className="mt-3 space-y-3">
              {feed.map((x) => <li key={x.key} className="border-l-4 border-flame pl-3"><Link href={x.href} className="font-semibold hover:underline">{x.title}</Link><p className="text-sm text-muted">{x.sub}</p></li>)}
            </ul>
          ) : <p className="mt-2 text-muted">Nothing new yet. Check <Link href="/opportunities" className="underline">Opportunities</Link> and <Link href="/trainings-webinars" className="underline">Trainings</Link>.</p>}
        </section>
        <section className="card p-5">
          <h2 className="text-xl font-extrabold">Your growth path</h2>
          {stage && STAGES[stage] ? (
            <>
              <p className="mt-1">You&apos;re in the <b>{STAGES[stage].label}</b> stage: {STAGES[stage].blurb}</p>
              <p className="mt-1 text-sm text-muted">Next up: {STAGES[stage].milestones[0].label.toLowerCase()} and more.</p>
            </>
          ) : <p className="mt-1 text-muted">Tell us your stage to get a step-by-step path.</p>}
          <div className="mt-3 flex flex-wrap gap-2"><Link href="/account/growth" className="btn btn-primary">See my growth path</Link><Link href="/account/rewards" className="btn btn-outline">Rewards &amp; invites</Link></div>
        </section>
      </div>
      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="text-xl font-extrabold">Your digital member ID</h2>
          <div className="mt-3">{p && <MemberCard name={p.full_name ?? ""} code={p.member_code} since={p.created_at} tier={p.tier} status={p.status} />}</div>
          {p && <p className="mt-2 text-sm text-muted">Anyone can scan the QR to confirm your membership at <Link className="underline" href={`/verify/${p.member_code}`}>/verify/{p.member_code}</Link>.</p>}
        </div>
        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="text-lg font-bold">My business listing</h2>
            {biz ? (
              <>
                <p className="mt-1">{biz.name} · {biz.published ? <Link href={`/directory/${biz.slug}`} className="text-mph underline">Live in directory</Link> : "Not published"}{biz.verification_status === "pending" && " · Verification pending"}</p>
                <div className="mt-3"><ListingStrength biz={listing} supportsExtras={hasExtras(listing)} max={2} compact /></div>
              </>
            ) : <p className="mt-1 text-muted">You haven&apos;t listed a business yet.</p>}
            <Link href="/account/business" className="btn btn-primary mt-3">{biz ? "Edit listing" : "List my business free"}</Link>
          </div>
          <div className="card p-5">
            <h2 className="text-lg font-bold">Login</h2>
            <p className="mt-1 text-muted">Set a password so you can log in instantly, without waiting for an email code.</p>
            <Link href="/account/password" className="btn btn-outline mt-3">Set or change password</Link>
          </div>
          <div className="card p-5">
            <h2 className="text-lg font-bold">FLAME AI</h2>
            <p className="mt-1 text-muted">Ask a business question or write a product listing.</p>
            <div className="mt-3 flex flex-wrap gap-2"><Link href="/bizconsult-ai" className="btn btn-flame">Open FLAME AI</Link><Link href="/account/ai" className="btn btn-outline">My history</Link></div>
          </div>
          <div className="card p-5">
            <h2 className="text-lg font-bold">My event registrations</h2>
            {regs && regs.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {regs.map((r) => {
                  const e = (Array.isArray(r.events) ? r.events[0] : r.events) as { title: string; starts_at: string; city: string | null } | null;
                  return <li key={r.id}>{e?.title} <span className="text-sm text-muted">· {e && new Date(e.starts_at).toLocaleDateString("en-PH", { dateStyle: "medium" })}</span></li>;
                })}
              </ul>
            ) : <p className="mt-1 text-muted">None yet. <Link href="/workshops" className="underline">See events</Link></p>}
          </div>
        </div>
      </div>
    </div>
  );
}
