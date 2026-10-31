"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Calculator = { id: string; title: string; text: string };

export const CALCULATOR_GROUPS: { title: string; items: Calculator[] }[] = [
  {
    title: "Presyo, margin at break-even",
    items: [
      { id: "markup-margin", title: "Markup at Margin", text: "Tama ba ang presyo ko? Alamin ang kita bawat piraso." },
      { id: "break-even", title: "Break-Even", text: "Ilang piraso kada araw para hindi malugi?" },
      { id: "job-service-pricing", title: "Job & Service Pricing", text: "Magkano ang singil sa job, kasama ang oras, materyales at overhead?" },
    ],
  },
  {
    title: "Cash flow at working capital",
    items: [
      { id: "cash-flow", title: "8-Week Cash Flow", text: "Kukulangin ba ako ng pera sa susunod na 2 buwan?" },
      { id: "working-capital", title: "Working Capital & Quick Ratio", text: "Kaya ko bang bayaran ang mga utang sa loob ng 12 buwan? Handa ba ako sa loan?" },
      { id: "receivables-aging", title: "Receivable Aging & Collection Tracker", text: "Sino ang may utang, gaano na katagal, at paalala sa Messenger o Viber." },
    ],
  },
  {
    title: "Operasyon at logistics",
    items: [
      { id: "inventory-turnover", title: "Inventory Investment & Turnover", text: "Magkano ang nakatali sa stock, at kailan mag-order ulit?" },
      { id: "fleet-cost", title: "Vehicle & Fleet Operating Cost", text: "Totoong gastos kada km at kada delivery, at tamang delivery fee." },
      { id: "capacity-planning", title: "Capacity Planning", text: "Ano ang bottleneck ko, at kailan kailangan ng dagdag na tauhan o makina?" },
    ],
  },
  {
    title: "Paglago, tauhan at marketing",
    items: [
      { id: "employee-cost", title: "Total Employee Cost", text: "Magkano talaga ang empleyado, kasama ang SSS, PhilHealth, Pag-IBIG at 13th month?" },
      { id: "payroll", title: "Payroll", text: "Sahod kada cutoff: overtime, holiday, kaltas at withholding tax, may payslip." },
      { id: "expansion-readiness", title: "Hiring & Expansion Readiness", text: "Kaya na ba ng pera ko ang bagong tauhan o bagong branch?" },
      { id: "franchise-unit-economics", title: "Franchise / Micro-Fulfillment Unit Economics", text: "Puhunan, kita kada buwan at payback ng franchise, micro-store o depot." },
      { id: "customer-acquisition-cost", title: "Customer Acquisition Cost", text: "Magkano ang gastos sa bawat bagong customer, at sulit ba ang ads ko?" },
    ],
  },
];

const ALL = CALCULATOR_GROUPS.flatMap((g) => g.items);
const find = (id: string | null) => ALL.find((c) => c.id === id);

// Calculators are standalone pages served to members at /calculators/<id>; they report their height so the iframe never scrolls inside.
export function CalculatorPicker({ lang, signedIn }: { lang?: "tl"; signedIn: boolean }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [active, setActive] = useState(find(params.get("calc"))?.id ?? "markup-margin");
  const [height, setHeight] = useState(1100);
  const frame = useRef<HTMLIFrameElement>(null);
  const area = useRef<HTMLDivElement>(null);

  // Same origin, so we can also read the height directly; this covers a message sent before hydration.
  const measure = () => {
    const doc = frame.current?.contentDocument;
    if (doc?.readyState === "complete" && doc.body) setHeight(Math.ceil(doc.body.getBoundingClientRect().height));
  };

  useEffect(() => {
    measure();
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return;
      if (e.data?.type === "flame-calc-height" && typeof e.data.height === "number") setHeight(Math.ceil(e.data.height));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const choose = (id: string) => {
    setActive(id);
    router.replace(`${pathname}?calc=${id}`, { scroll: false });
    area.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const current = find(active)!;
  const loginHref = (id: string) => `/login?next=${encodeURIComponent(`/business-calculators?calc=${id}`)}`;
  const cardClass = (on: boolean) => `card block h-full p-4 text-left transition hover:border-primary ${on ? "border-primary bg-primary-soft" : ""}`;
  return (
    <>
      <div className="space-y-8">
        {CALCULATOR_GROUPS.map((group) => (
          <div key={group.title}>
            <h3 className="mb-3 text-lg font-extrabold">{group.title}</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.items.map((c) =>
                signedIn ? (
                  <button key={c.id} type="button" onClick={() => choose(c.id)} aria-pressed={c.id === active} className={cardClass(c.id === active)}>
                    <span className="block text-lg font-bold text-primary">{c.title}</span>
                    <span className="mt-1 block text-muted">{c.text}</span>
                  </button>
                ) : (
                  <Link key={c.id} href={loginHref(c.id)} className={cardClass(false)}>
                    <span className="flex items-start justify-between gap-2">
                      <span className="text-lg font-bold text-primary">{c.title}</span>
                      <span aria-label="Para sa members" title="Para sa members">🔒</span>
                    </span>
                    <span className="mt-1 block text-muted">{c.text}</span>
                  </Link>
                ),
              )}
            </div>
          </div>
        ))}
      </div>
      <div ref={area} className="mt-8 scroll-mt-24">
        {signedIn ? (
          <iframe
            ref={frame}
            key={active}
            src={`/calculators/${active}${lang ? `?lang=${lang}&embed=1` : "?embed=1"}`}
            title={`${current.title} Calculator`}
            className="block w-full rounded-2xl border border-line"
            style={{ height }}
            loading="lazy"
            onLoad={measure}
          />
        ) : (
          <div className="card grid items-center gap-5 border-primary bg-primary-soft p-6 sm:grid-cols-[1fr_auto] sm:p-8">
            <div>
              <p className="font-display font-bold text-flame-strong">Para sa FLAME PH members</p>
              <h2 className="mt-1 text-2xl font-extrabold text-primary">Mag-sign in para gamitin ang {ALL.length} calculators</h2>
              <p className="mt-2 text-muted">Libre ang membership. Pagka-sign in, babalik ka rito at bukas na ang lahat ng calculator.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href={loginHref(active)} className="btn btn-primary">Log in</Link>
              <Link href="/join" className="btn btn-outline">Join free</Link>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
