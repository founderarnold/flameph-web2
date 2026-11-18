import Link from "next/link";
import { ECO_APPS, goHref, type AppKey } from "@/lib/ecosystem";

/**
 * The same "One FLAME PH ecosystem" strip on flameph.org, MarketplacePH and NegosyoDepot (each app has its own copy of
 * these three lines). The other two open through /go/<app>, which says they are focused apps of the same ecosystem.
 */
export function EcosystemFooter({ here = "flameph" }: { here?: AppKey }) {
  const order: AppKey[] = ["flameph", "marketplaceph", "negosyodepot"];
  return (
    <section aria-labelledby="eco-h" className="border-b border-line bg-white">
      <div className="container-x py-6">
        <h2 id="eco-h" className="font-display text-base font-extrabold text-primary">One FLAME PH ecosystem · One account</h2>
        <p className="text-sm text-muted">Three focused apps for Filipino MSMEs. Your FLAME PH account works on all three.</p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-3">
          {order.map((k) => {
            const a = ECO_APPS[k];
            const body = (
              <>
                <span className="block font-bold text-fg">{a.name}{k === here && <span className="ml-2 text-xs font-bold uppercase text-flame-strong">You are here</span>}</span>
                <span className="block text-sm text-muted">{a.focus}</span>
              </>
            );
            return (
              <li key={k}>
                {k === here ? <div aria-current="page" className="min-h-11 rounded-xl border-2 border-primary p-3">{body}</div>
                  : k === "flameph" ? <Link href="/" className="block min-h-11 rounded-xl border border-line p-3 hover:border-primary">{body}</Link>
                  : <Link href={goHref(k)} className="block min-h-11 rounded-xl border border-line p-3 hover:border-primary">{body}</Link>}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
