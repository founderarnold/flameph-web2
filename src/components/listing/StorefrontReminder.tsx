import Link from "next/link";
import { POINTS } from "@/lib/growth";

/**
 * Reminder at the top of My business listing (owner, 25 Nov 2026): a finished listing, directory details and
 * mini-website with logo and photos make a more attractive digital storefront, get more leads and earn reward points.
 */
export function StorefrontReminder({ rewards }: { rewards: { key: string; label: string; earned: boolean }[] }) {
  const left = rewards.filter((r) => !r.earned).length;
  const total = rewards.length * POINTS.milestone;
  return (
    <section aria-labelledby="storefront-h" className="mt-5 rounded-2xl border border-gold/50 bg-bg-warm p-4 sm:p-5">
      <h2 id="storefront-h" className="text-lg font-extrabold">
        {left === 0 ? "⭐ Your digital storefront is complete" : `⭐ Finish your digital storefront, earn up to ${left * POINTS.milestone} more points`}
      </h2>
      <p className="mt-1 text-sm text-muted">
        A complete storefront with your logo and photos looks more trustworthy, is easier to find and gets more leads.
        {left > 0 && <> Each part below earns {POINTS.milestone} points, once ({total} in all).</>}
      </p>
      <ul className="mt-3 space-y-1.5 text-sm">
        {rewards.map((r) => (
          <li key={r.key} className="flex gap-2">
            <span aria-hidden className={r.earned ? "font-bold text-ok" : "text-flame-strong"}>{r.earned ? "✓" : "＋"}</span>
            <span className={r.earned ? "text-muted" : ""}>{r.label} <strong className={r.earned ? "text-ok" : "text-flame-strong"}>{r.earned ? `· ${POINTS.milestone} points earned` : `· +${POINTS.milestone} points`}</strong></span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm"><Link href="/account/rewards" className="font-bold text-primary underline">See my points and rewards</Link></p>
    </section>
  );
}
