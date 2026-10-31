import { Suspense } from "react";
import Link from "next/link";
import { FeatureCard, Grid, Notice, PageHero, Section } from "@/components/ui";
import * as I from "@/components/icons";
import { getSession } from "@/lib/auth";
import { getLang } from "@/lib/i18n";
import { meta } from "@/lib/meta";
import { CalculatorPicker } from "./CalculatorPicker";

export const metadata = meta(
  "Free Business Calculators for MSMEs",
  "15 libreng calculators para sa FLAME PH members: presyo at margin, break-even, ROI, cash flow, working capital, receivables, inventory, fleet cost, capacity, payroll, employee cost, expansion, franchise at customer acquisition cost.",
  "/business-calculators",
);

const NEXT_STEPS = [
  { title: "FLAME PH Academy", text: "Matuto ng pagpresyo, cash flow at pag-manage ng tauhan sa mga praktikal na aralin.", href: "/academy", icon: <I.IconAward /> },
  { title: "Tanungin si Ka-FLAME AI", text: "Ipaliwanag ang resulta mo at humingi ng susunod na hakbang, sa Taglish.", href: "/bizconsult-ai", icon: <I.IconChat /> },
  { title: "Grants, loans at oportunidad", text: "Kulang sa puhunan o working capital? Tingnan ang mga oportunidad para sa MSMEs.", href: "/opportunities", icon: <I.IconSpark /> },
];


const FAQ = [
  { q: "Libre ba talaga?", a: "Oo. Libre para sa lahat ng FLAME PH members, at libre rin ang membership. Mag-sign in lang. Walang kailangang i-install; gumagana sa cellphone." },
  { q: "Saan napupunta ang mga numero ko?", a: "Nananatili sa device mo. Hindi namin ipinapadala o sine-save ang mga inilagay mo sa calculator." },
  { q: "Tama ba ang SSS, PhilHealth at Pag-IBIG rates?", a: "Ginamit namin ang pinakabagong rate na alam namin at nakasulat ito sa ilalim ng calculator. I-verify pa rin sa accountant bago gamitin sa payroll." },
  { q: "Puwede bang i-PDF o i-share?", a: "Oo. Pindutin ang “I-download (PDF)” para i-save bilang PDF, o “I-share” para ipadala sa Messenger o Viber." },
];

export default async function Page() {
  const [lang, { user }] = await Promise.all([getLang(), getSession()]);
  const signedIn = !!user;
  return (
    <>
      <PageHero
        status="live"
        fil="Libre para sa FLAME PH members"
        title="Free Business Calculators for MSMEs"
        path="/business-calculators"
        intro="Tigil-hula na. 15 na calculator para sa presyo, ROI, cash flow, stock, delivery, tauhan, sahod at paglago ng negosyo mo, libre at sa cellphone mo."
      >
        {signedIn ? (
          <a href="#calculators" className="btn btn-flame text-base">Simulan ang calculator</a>
        ) : (
          <>
            <Link href="/login?next=%2Fbusiness-calculators" className="btn btn-flame text-base">Log in para magamit</Link>
            <Link href="/join" className="btn btn-outline text-base">Join FLAME PH free</Link>
          </>
        )}
      </PageHero>

      <Section id="calculators" title="Pumili ng calculator" intro="Para sa sari-sari store, carinderia, online seller, service business, distributor at franchisee.">
        <Suspense fallback={<div className="card p-6 text-muted">Naglo-load ang calculator…</div>}>
          <CalculatorPicker lang={lang === "fil" ? "tl" : undefined} signedIn={signedIn} />
        </Suspense>
        <p className="mt-3 text-sm text-muted">
          Tantiya lang ito para sa pagpaplano, hindi payong pang-buwis, legal o accounting. Kailangan ng eksperto?{" "}
          <Link href="/get-involved/professional-services" className="font-semibold text-primary underline">Professional services</Link>
        </p>
      </Section>


      <section className="bg-bg-soft">
        <Section title="Susunod na hakbang" intro="Gamitin ang resulta mo para kumilos, kasama ang FLAME PH ecosystem.">
          <Grid>{NEXT_STEPS.map((step) => <FeatureCard key={step.title} {...step} />)}</Grid>
        </Section>
      </section>


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
