"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type CalculatorId = "markup-margin" | "employee-cost" | "payroll" | "break-even" | "cash-flow" | "customer-acquisition-cost";

export const CALCULATORS: { id: CalculatorId; title: string; text: string }[] = [
  { id: "markup-margin", title: "Markup at Margin", text: "Tama ba ang presyo ko? Alamin ang kita bawat piraso." },
  { id: "employee-cost", title: "Total Employee Cost", text: "Magkano talaga ang empleyado, kasama ang SSS, PhilHealth, Pag-IBIG at 13th month?" },
  { id: "payroll", title: "Payroll", text: "Sahod kada cutoff: overtime, holiday, kaltas at withholding tax, may payslip." },
  { id: "break-even", title: "Break-Even", text: "Ilang piraso kada araw para hindi malugi?" },
  { id: "cash-flow", title: "8-Week Cash Flow", text: "Kukulangin ba ako ng pera sa susunod na 2 buwan?" },
  { id: "customer-acquisition-cost", title: "Customer Acquisition Cost", text: "Magkano ang gastos sa bawat bagong customer, at sulit ba ang ads ko?" },
];

const isCalculator = (v: string | null): v is CalculatorId => CALCULATORS.some((c) => c.id === v);

// The calculators are standalone pages in /public/calculators; they report their height so the iframe never scrolls inside.
export function CalculatorPicker({ lang }: { lang?: "tl" }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const fromUrl = params.get("calc");
  const [active, setActive] = useState<CalculatorId>(isCalculator(fromUrl) ? fromUrl : "markup-margin");
  const [height, setHeight] = useState(1100);
  const frame = useRef<HTMLIFrameElement>(null);
  const area = useRef<HTMLDivElement>(null);

  // Same origin, so we can also read the height directly; this covers a message sent before hydration.
  const measure = () => {
    const doc = frame.current?.contentDocument;
    if (doc?.readyState === "complete") setHeight(doc.documentElement.scrollHeight + 8);
  };

  useEffect(() => {
    measure();
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return;
      if (e.data?.type === "flame-calc-height" && typeof e.data.height === "number") setHeight(Math.ceil(e.data.height) + 8);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const choose = (id: CalculatorId) => {
    setActive(id);
    router.replace(`${pathname}?calc=${id}`, { scroll: false });
    area.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const current = CALCULATORS.find((c) => c.id === active)!;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {CALCULATORS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => choose(c.id)}
            aria-pressed={c.id === active}
            className={`card p-4 text-left transition hover:border-primary ${c.id === active ? "border-primary bg-primary-soft" : ""}`}
          >
            <span className="block text-lg font-bold text-primary">{c.title}</span>
            <span className="mt-1 block text-muted">{c.text}</span>
          </button>
        ))}
      </div>
      <div ref={area} className="mt-6 scroll-mt-24">
        <iframe
          ref={frame}
          key={active}
          src={`/calculators/${active}.html?embed=1${lang ? `&lang=${lang}` : ""}`}
          title={`${current.title} Calculator`}
          className="block w-full rounded-2xl border border-line"
          style={{ height }}
          loading="lazy"
          onLoad={measure}
        />
      </div>
    </>
  );
}
