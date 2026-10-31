import Link from "next/link";
import { FeatureCard, Grid, PageHero, Section } from "@/components/ui";
import * as I from "@/components/icons";
import { meta } from "@/lib/meta";
import type { Status } from "@/components/StatusBadge";

export const metadata = meta("Free Benefits", "Explore the free FLAME PH tools, learning, community and business support available to members.", "/benefits");

const FREE_BENEFITS: { title: string; text: string; status: Status; href: string; icon: React.ReactNode; external?: boolean }[] = [
  { title: "Member account & digital ID", text: "A FLAME PH member ID with a QR code that anyone can verify.", status: "live", href: "/join", icon: <I.IconId /> },
  { title: "Free Business Directory", text: "Discover Filipino MSMEs and their public business pages. Hanapin ang mga negosyong malapit sa iyo.", status: "live", href: "https://pages.flameph.org/directory", external: true, icon: <I.IconStore /> },
  { title: "Free Mini-Website/Landing Pages", text: "Create your own public profile page with Messenger, Viber and call buttons. Gumawa ng sariling online page para madaling mahanap ng customers.", status: "live", href: "/login?next=%2Faccount%2Fbusiness", icon: <I.IconStore /> },
  { title: "Ka-FLAME AI", text: "Business Q&A and listing support with a daily free-member allowance.", status: "beta", href: "/bizconsult-ai", icon: <I.IconChat /> },
  { title: "Resource library", text: "Guides, templates and checklists as they are published.", status: "live", href: "/resources", icon: <I.IconBook /> },
  { title: "Workshops & events", text: "Register for workshops, trainings and expos when scheduled.", status: "live", href: "/workshops", icon: <I.IconCalendar /> },
  { title: "Local chapters", text: "Join or help start a chapter in your city or municipality.", status: "live", href: "/chapters", icon: <I.IconMap /> },
  { title: "Free Basic POS for MSMEs", text: "Sell, track inventory and understand your business using FLAME POS.", status: "live", href: "/pos", icon: <I.IconPos /> },
  { title: "Free Business Calculators", text: "Markup and margin, employee cost with SSS, PhilHealth and Pag-IBIG, break-even and cash flow. Tigil-hula na sa numero.", status: "live", href: "/business-calculators", icon: <I.IconFile /> },
  { title: "RideSafe", text: "Find nearby roadside services and save useful destinations.", status: "beta", href: "/ridesafe", icon: <I.IconMap /> },
  { title: "FLAME PH Academy", text: "Planned learning tracks organized by business stage.", status: "soon", href: "/academy", icon: <I.IconAward /> },
];

const FAQ = [
  { q: "Magkano ang membership?", a: "Free membership costs nothing. Upgraded benefits are not available yet, and no payments are collected on this website." },
  { q: "Does membership guarantee funding or customers?", a: "No. FLAME PH offers learning, tools and a community. It does not guarantee loans, grants, sales or customers." },
  { q: "Kailangan ba registered ang negosyo ko?", a: "No. Aspiring entrepreneurs are welcome. A Verified badge in the directory is given only after we check the applicable registration documents." },
  { q: "Paano ninyo pinoprotektahan ang data ko?", a: "We follow the Data Privacy Act of 2012. See our Privacy Notice for details. You can ask us to delete your account anytime." },
];

export default function BenefitsPage() {
  return (
    <>
      <PageHero status="live" fil="Libre, ngayon na" title="Free Benefits" path="/benefits"
        intro="One clear place for the free tools, learning, community and business support included with your FLAME PH account.">
        <Link href="/join" className="btn btn-flame">Join free</Link>
        <Link href="/account" className="btn btn-outline">Open my account</Link>
      </PageHero>
      <Section title="What free members can use" intro="Each benefit is labeled honestly so you know what works today and what is still being prepared.">
        <Grid>{FREE_BENEFITS.map((benefit) => <FeatureCard key={benefit.title} {...benefit} />)}</Grid>
      </Section>
      <Section className="!pt-0">
        <div className="card grid items-center gap-5 border-primary bg-primary-soft p-6 sm:grid-cols-[1fr_auto] sm:p-8">
          <div>
            <p className="font-display font-bold text-flame-strong">Optional future pathways</p>
            <h2 className="mt-1 text-2xl font-extrabold text-primary">Upgraded Benefits</h2>
            <p className="mt-2 text-muted">Review planned additional benefits and join the waitlist. No upgraded plan is being sold yet.</p>
          </div>
          <Link href="/membership/more-benefits" className="btn btn-primary">Explore upgraded benefits</Link>
        </div>
      </Section>
      <Section title="Join in 3 steps">
        <ol className="grid gap-4 sm:grid-cols-3">
          {["Sign up with Google or your email.", "Complete your profile: name, city and business stage.", "Use your account, list your business and explore free tools."].map((step, index) => (
            <li key={step} className="card p-5"><span className="grid h-10 w-10 place-items-center rounded-full bg-primary font-extrabold text-primary-fg">{index + 1}</span><p className="mt-3 font-semibold">{step}</p></li>
          ))}
        </ol>
      </Section>
      <Section title="Mga madalas itanong">
        <div className="space-y-3">
          {FAQ.map((item) => (
            <details key={item.q} className="card p-4"><summary className="min-h-8 cursor-pointer font-bold">{item.q}</summary><p className="mt-2 text-muted">{item.a}</p></details>
          ))}
        </div>
      </Section>
    </>
  );
}
