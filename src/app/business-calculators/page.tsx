import { Suspense } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { FeatureCard, Grid, Notice, PageHero, Section } from "@/components/ui";
import { StatusBadge } from "@/components/StatusBadge";
import * as I from "@/components/icons";
import { getLang } from "@/lib/i18n";
import { meta } from "@/lib/meta";
import { CalculatorPicker } from "./CalculatorPicker";

export const metadata = meta(
  "Free Business Calculators for MSMEs",
  "Libreng calculators para sa MSMEs sa Pilipinas: markup at margin, employee cost, payroll (SSS, PhilHealth, Pag-IBIG, withholding tax), break-even, cash flow at customer acquisition cost.",
  "/business-calculators",
);

const NEXT_STEPS = [
  { title: "FLAME PH Academy", text: "Matuto ng pagpresyo, cash flow at pag-manage ng tauhan sa mga praktikal na aralin.", href: "/academy", icon: <I.IconAward /> },
  { title: "Tanungin si Ka-FLAME AI", text: "Ipaliwanag ang resulta mo at humingi ng susunod na hakbang, sa Taglish.", href: "/bizconsult-ai", icon: <I.IconChat /> },
  { title: "Grants, loans at oportunidad", text: "Kulang sa puhunan o working capital? Tingnan ang mga oportunidad para sa MSMEs.", href: "/opportunities", icon: <I.IconSpark /> },
];

const COMING_SOON = [
  "Job & Service Pricing",
  "Inventory Investment & Turnover",
  "Receivable Aging & Collection Tracker",
  "Working Capital & Quick Ratio",
  "Vehicle & Fleet Operating Cost",
  "Hiring & Expansion Readiness",
  "Capacity Planning",
  "Franchise / Micro-Fulfillment Unit Economics",
];

const FAQ = [
  { q: "Libre ba talaga?", a: "Oo. Libre para sa lahat, kahit hindi pa member. Walang kailangang i-install; gumagana sa cellphone." },
  { q: "Saan napupunta ang mga numero ko?", a: "Nananatili sa device mo. Hindi namin ipinapadala o sine-save ang mga inilagay mo sa calculator." },
  { q: "Tama ba ang SSS, PhilHealth at Pag-IBIG rates?", a: "Ginamit namin ang pinakabagong rate na alam namin at nakasulat ito sa ilalim ng calculator. I-verify pa rin sa accountant bago gamitin sa payroll." },
  { q: "Puwede bang i-PDF o i-share?", a: "Oo. Pindutin ang “I-download (PDF)” para i-save bilang PDF, o “I-share” para ipadala sa Messenger o Viber." },
];

export default async function Page() {
  const [lang, c] = await Promise.all([getLang(), cookies()]);
  const signedIn = c.getAll().some((x) => x.name.startsWith("sb-") && x.name.includes("auth-token"));
  return (
    <>
      <PageHero
        status="live"
        fil="Libre para sa lahat"
        title="Free Business Calculators for MSMEs"
        path="/business-calculators"
        intro="Tigil-hula na. Alamin ang tamang presyo, sahod at gastos sa tauhan, break-even, cash flow at gastos sa bawat bagong customer, libre at sa cellphone mo."
      >
        <a href="#calculators" className="btn btn-flame text-base">Simulan ang calculator</a>
        {!signedIn && <Link href="/join" className="btn btn-outline text-base">Join FLAME PH free</Link>}
      </PageHero>

      <Section id="calculators" title="Pumili ng calculator" intro="Anim na calculator na pinakakailangan ng sari-sari store, carinderia, online seller at service business.">
        <Suspense fallback={<div className="card p-6 text-muted">Naglo-load ang calculator…</div>}>
          <CalculatorPicker lang={lang === "fil" ? "tl" : undefined} />
        </Suspense>
        <p className="mt-3 text-sm text-muted">
          Tantiya lang ito para sa pagpaplano, hindi payong pang-buwis, legal o accounting. Kailangan ng eksperto?{" "}
          <Link href="/get-involved/professional-services" className="font-semibold text-primary underline">Professional services</Link>
        </p>
      </Section>

      {!signedIn && (
        <Section className="!pt-0">
          <div className="card grid items-center gap-5 border-primary bg-primary-soft p-6 sm:grid-cols-[1fr_auto] sm:p-8">
            <div>
              <p className="font-display font-bold text-flame-strong">Libreng membership</p>
              <h2 className="mt-1 text-2xl font-extrabold text-primary">Sumali sa FLAME PH</h2>
              <p className="mt-2 text-muted">Makakuha ng member ID, libreng POS, Ka-FLAME AI, workshops at business directory listing.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/join" className="btn btn-primary">Join free</Link>
              <Link href="/login?next=%2Fbusiness-calculators" className="btn btn-outline">Log in</Link>
            </div>
          </div>
        </Section>
      )}

      <section className="bg-bg-soft">
        <Section title="Susunod na hakbang" intro="Gamitin ang resulta mo para kumilos, kasama ang FLAME PH ecosystem.">
          <Grid>{NEXT_STEPS.map((step) => <FeatureCard key={step.title} {...step} />)}</Grid>
        </Section>
      </section>

      <Section title="Paparating na calculators" intro="Idadagdag namin ang mga ito ayon sa pinakakailangan ng mga member.">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {COMING_SOON.map((name) => (
            <li key={name} className="card flex min-h-20 flex-col justify-center gap-2 p-4">
              <StatusBadge status="soon" className="self-start" />
              <span className="font-semibold">{name}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Mga madalas itanong">
        <div className="space-y-3">
          {FAQ.map((item) => (
            <details key={item.q} className="card p-4"><summary className="min-h-8 cursor-pointer font-bold">{item.q}</summary><p className="mt-2 text-muted">{item.a}</p></details>
          ))}
        </div>
        <div className="mt-6">
          <Notice tone="info">Ang mga calculator ay gumagana sa browser mo. Walang numerong ipinapadala sa FLAME PH.</Notice>
        </div>
      </Section>
    </>
  );
}
