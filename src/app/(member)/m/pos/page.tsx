import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { TabShell } from "@/components/shell/TabShell";
import { buttonClass } from "@/components/ui";
import { POS_PLACES, POS_STAFF_LOGIN, posHref } from "@/lib/pos";

export const metadata = { title: "Flame POS" };

/**
 * Flame POS tab (members see this at /pos). Opens the existing FLAME POS (pos.flameph.org) signed in with the member's
 * FLAME PH account through the sign-in hub: no second password. FLAME POS itself is not rebuilt here.
 */
export default async function PosTab() {
  await requireUser("/pos");
  const [open, ...places] = POS_PLACES;
  return (
    <TabShell title="Flame POS" fil="Libreng POS para sa MSME"
      intro="Free point of sale for your store: sales, receipts, stock and reports. You are already signed in with your FLAME PH account, so there is no new password.">
      <a href={posHref(open.path)} className={buttonClass({ variant: "flame", block: true })}>{open.title}</a>
      <section aria-labelledby="pos-go" className="card p-4">
        <h2 id="pos-go" className="text-lg font-bold">Go straight to</h2>
        <ul className="mt-2 grid gap-x-4 sm:grid-cols-2">
          {places.map((p) => (
            <li key={p.path}>
              <a href={posHref(p.path)} className="flex min-h-11 items-center justify-between gap-2 border-b border-line py-2">
                <span><span className="block font-semibold">{p.title}</span><span className="block text-sm text-muted">{p.text}</span></span>
                <span aria-hidden className="text-muted">›</span>
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">The first time, FLAME POS asks you to set up your business. After that, it opens straight to your store.</p>
      </section>
      <a href={POS_STAFF_LOGIN} className={buttonClass({ variant: "outline", block: true })}>POS staff sign in</a>
      <Link href="/pos?view=public" className="inline-flex min-h-11 items-center self-center text-sm font-semibold text-primary underline">About FLAME POS</Link>
    </TabShell>
  );
}
