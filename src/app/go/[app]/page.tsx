import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ECO_APPS, ecoTarget, cleanWhy } from "@/lib/ecosystem";

export const metadata = { title: "Opening a FLAME PH app", robots: { index: false, follow: false } };

const LOGO: Record<string, string> = { marketplaceph: "/ecosystem/marketplaceph-logo.png", negosyodepot: "/ecosystem/negosyodepot-logo.png" };
const ABOUT: Record<string, string> = {
  marketplaceph: "MarketplacePH is the FLAME PH ecosystem's focused app for buying and selling, delivery, jobs and hiring.",
  negosyodepot: "NegosyoDepot is the FLAME PH ecosystem's focused app for business packages, suppliers and Fulfillment by MSMEs.",
};

/**
 * The step between flameph.org and the other two FLAME PH apps: says where the member is going and why, then opens it.
 * Only addresses listed in src/lib/ecosystem.ts open; anything else is "not found".
 */
export default async function Go({ params, searchParams }: { params: Promise<{ app: string }>; searchParams: Promise<{ to?: string; why?: string }> }) {
  const { app } = await params;
  const sp = await searchParams;
  const target = ecoTarget(app, sp.to);
  if (!target) notFound();
  const a = ECO_APPS[app as "marketplaceph" | "negosyodepot"];
  const why = cleanWhy(sp.why);
  return (
    <section className="container-x py-12">
      <meta httpEquiv="refresh" content={`4;url=${target}`} />
      <div className="mx-auto max-w-md card space-y-4 p-6 text-center">
        <p className="text-sm font-bold uppercase tracking-wide text-flame-strong">One FLAME PH ecosystem</p>
        <span className="relative mx-auto block h-16 w-48"><Image src={LOGO[app]} alt={`${a.name} logo`} fill sizes="192px" className="object-contain" /></span>
        <h1 className="text-2xl font-extrabold text-primary">Opening {a.name}</h1>
        <p className="text-muted">{ABOUT[app]}</p>
        {why && <p className="text-sm">You chose: <strong>{why}</strong></p>}
        <p className="rounded-xl bg-bg-soft p-3 text-sm">Same FLAME PH account: if you&apos;re signed in here, you stay signed in there. Gumagana rin doon ang iisang FLAME PH account mo.</p>
        <a href={target} className="btn btn-primary min-h-11 w-full">Continue to {a.name}</a>
        <p className="text-xs text-muted" aria-live="polite">Opening by itself in a few seconds.</p>
        <Link href="/" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">Stay on FLAME PH</Link>
      </div>
    </section>
  );
}
