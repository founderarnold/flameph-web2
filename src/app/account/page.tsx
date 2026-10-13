import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { MemberCard } from "@/components/MemberCard";
import { Notice } from "@/components/ui";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const { supabase, user } = await requireUser();
  const sp = await searchParams;
  const [{ data: p }, { data: biz }, { data: regs }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("businesses").select("name,slug,published,verification_status").eq("owner_id", user.id).limit(1).maybeSingle(),
    supabase.from("event_registrations").select("id, created_at, events(title, starts_at, city)").eq("user_id", user.id).order("created_at", { ascending: false }),
  ]);
  const incomplete = !p?.full_name || !p?.province || !p?.city || !p?.consent_privacy;
  return (
    <div className="space-y-8">
      {sp.denied && <Notice>That page is for FLAME PH admins only.</Notice>}
      <h1 className="text-3xl font-extrabold text-primary">Kumusta{p?.full_name ? `, ${p.full_name.split(" ")[0]}` : ""}!</h1>
      {incomplete && <Notice>Your profile isn&apos;t complete yet. <Link href="/account/profile" className="font-bold underline">Finish it</Link> so you count toward your province on our Impact page.</Notice>}
      {!user.email_confirmed_at && <Notice>Please confirm your email address to activate your member ID.</Notice>}
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
              <p className="mt-1">{biz.name} · {biz.published ? <Link href={`/directory/${biz.slug}`} className="text-mph underline">Live in directory</Link> : "Not published"}{biz.verification_status === "pending" && " · Verification pending"}</p>
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
