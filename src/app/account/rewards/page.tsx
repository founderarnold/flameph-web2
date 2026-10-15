import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { CopyLink } from "@/components/CopyLink";
import { ORG } from "@/lib/site";
import { POINTS } from "@/lib/growth";

export default async function Rewards() {
  const { supabase, user } = await requireUser("/account/rewards");
  const [{ data: p }, refs, reviews, regs, ms, deals] = await Promise.all([
    supabase.from("profiles").select("member_code").eq("id", user.id).single(),
    supabase.rpc("my_referrals"),
    supabase.from("business_reviews").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("event_registrations").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("member_milestones").select("key", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("deal_participants").select("deal_id", { count: "exact", head: true }).eq("user_id", user.id),
  ]);
  const n = {
    referral: Number(refs.data ?? 0), review: reviews.count ?? 0, event: regs.count ?? 0, milestone: ms.count ?? 0, deal: deals.count ?? 0,
  };
  const rows = [
    { key: "referral" as const, label: "Members you invited", hint: "They join with your link and confirm their email." },
    { key: "event" as const, label: "Trainings and events registered", hint: "Register on the Trainings or Workshops pages." },
    { key: "milestone" as const, label: "Growth milestones reached", hint: "Tick them on your Growth path." },
    { key: "review" as const, label: "Reviews written for other members", hint: "Help other buyers decide." },
    { key: "deal" as const, label: "Buy-together deals joined", hint: "Save money with other members." },
  ];
  const total = rows.reduce((s, r) => s + n[r.key] * POINTS[r.key], 0);
  const badges = [
    { name: "Ka-FLAME Connector", rule: "Invite 3 members", got: n.referral >= 3 },
    { name: "Lifelong Learner", rule: "Register for 3 events", got: n.event >= 3 },
    { name: "Community Voice", rule: "Write 3 reviews", got: n.review >= 3 },
    { name: "Growth Climber", rule: "Reach 5 milestones", got: n.milestone >= 5 },
    { name: "Bayanihan Buyer", rule: "Join a buy-together deal", got: n.deal >= 1 },
  ];
  const link = `${ORG.url}/join?ref=${p?.member_code ?? ""}`;

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold text-primary">Rewards</h1>
        <p className="mt-2 text-muted">Earn points for helping the community grow.</p>
      </div>
      <section className="card p-5">
        <p className="text-sm font-bold uppercase text-flame-strong">Your points</p>
        <p className="font-display text-5xl font-extrabold tabular-nums text-primary">{total}</p>
        <p className="mt-2 text-sm text-muted">Coming soon: use points for priority booths at FLAME PH expos, merch discounts and partner perks.</p>
      </section>

      <section className="card p-5">
        <h2 className="text-xl font-extrabold">Invite fellow entrepreneurs</h2>
        <p className="mt-1 text-muted">Share your link on Facebook, Viber or your group chats. You get {POINTS.referral} points for each member who joins and confirms their email.</p>
        <div className="mt-3"><CopyLink url={link} label="Copy invite link" /></div>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <a className="btn btn-outline min-h-9 px-3" href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`} target="_blank" rel="noopener">Share on Facebook</a>
          <a className="btn btn-outline min-h-9 px-3" href={`viber://forward?text=${encodeURIComponent(`Sumali ka sa FLAME PH, libre! May member ID, business listing at FLAME AI: ${link}`)}`}>Share on Viber</a>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-extrabold">How you earned them</h2>
        <div className="card mt-3 overflow-x-auto">
          <table className="w-full text-left text-[15px]">
            <thead className="border-b border-line bg-bg-soft"><tr><th className="px-4 py-2">Activity</th><th className="px-4 py-2 text-right">Count</th><th className="px-4 py-2 text-right">Points</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-line last:border-0">
                  <td className="px-4 py-2"><p className="font-semibold">{r.label}</p><p className="text-sm text-muted">{r.hint} {POINTS[r.key]} points each.</p></td>
                  <td className="px-4 py-2 text-right tabular-nums">{n[r.key]}</td>
                  <td className="px-4 py-2 text-right font-bold tabular-nums">{n[r.key] * POINTS[r.key]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-extrabold">Badges</h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {badges.map((b) => (
            <li key={b.name} className={`card flex items-center gap-3 p-4 ${b.got ? "" : "opacity-70"}`}>
              <span aria-hidden className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-lg font-extrabold ${b.got ? "bg-flame text-white" : "border-2 border-dashed border-line text-muted"}`}>{b.got ? "★" : "☆"}</span>
              <div><p className="font-bold">{b.name}</p><p className="text-sm text-muted">{b.got ? "Earned" : b.rule}</p></div>
            </li>
          ))}
        </ul>
      </section>
      <p className="text-sm text-muted">See also your <Link href="/account/growth" className="underline">Growth path</Link>.</p>
    </div>
  );
}
