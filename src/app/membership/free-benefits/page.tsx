import Link from "next/link";
import { PageHero, Section, Grid, FeatureCard } from "@/components/ui";
import * as I from "@/components/icons";
import { meta } from "@/lib/meta";
import type { Status } from "@/components/StatusBadge";

export const metadata = meta("Avail Free MSME Benefits", "What free FLAME PH membership includes today, with honest Live, Beta and Coming soon labels.", "/membership/free-benefits");

const B: { title: string; text: string; status: Status; href: string; icon: React.ReactNode }[] = [
  { title: "Member account & digital ID", text: "A FLAME PH member ID with a QR code that anyone can verify.", status: "live", href: "/join", icon: <I.IconId /> },
  { title: "Free Micro Website/Business Directory", text: "Create a public micro website and appear in the FLAME PH Pages business directory.", status: "live", href: "https://pages.flameph.org/directory", icon: <I.IconStore /> },
  // Opens the FlamePH Pages builder; people who aren't signed in there are asked to create an account first.
  { title: "FREE Business Pages for MSMEs", text: "Your own business web page with order, call and chat buttons. Sign up and build it in minutes.", status: "live", href: "https://pages.flameph.org/build?signup=1", icon: <I.IconSpark /> },
  { title: "Ka-FLAME AI", text: "Business Q&A and listing writer. Free members get a daily question allowance.", status: "beta", href: "/bizconsult-ai", icon: <I.IconChat /> },
  { title: "Resource library", text: "Guides, templates and checklists as they are published.", status: "live", href: "/resources", icon: <I.IconBook /> },
  { title: "Event registration", text: "Register for workshops, trainings and expos when scheduled.", status: "live", href: "/workshops", icon: <I.IconCalendar /> },
  { title: "MSME Bulletin newsletter", text: "Updates by email. Unsubscribe anytime.", status: "live", href: "#newsletter", icon: <I.IconFile /> },
  { title: "Local chapters", text: "Join or start a chapter in your city or municipality.", status: "live", href: "/chapters", icon: <I.IconMap /> },
  { title: "Free POS for MSMEs", text: "Planned. Join the waitlist.", status: "soon", href: "/pos", icon: <I.IconPos /> },
  { title: "FLAME PH Academy courses", text: "Planned learning tracks by business stage.", status: "soon", href: "/academy", icon: <I.IconAward /> },
];

const FAQ = [
  { q: "Magkano ang membership?", a: "Free membership costs nothing. Paid tiers are not available yet, and no payments are collected on this website." },
  { q: "Does membership guarantee funding or customers?", a: "No. FLAME PH offers learning, tools and a community. It does not guarantee loans, grants, sales or customers." },
  { q: "Kailangan ba registered ang negosyo ko?", a: "No. Aspiring entrepreneurs are welcome. A \"Verified\" badge in the directory is given only after we check your DTI, SEC or BMBE documents." },
  { q: "Paano ninyo pinoprotektahan ang data ko?", a: "We follow the Data Privacy Act of 2012. See our Privacy Notice for details. You can ask us to delete your account anytime." },
  { q: "Is FLAME PH a government agency?", a: "No. FLAME PH is an SEC-registered non-stock, non-profit corporation founded by Filipino entrepreneurs." },
];

export default function Page() {
  return (
    <>
      <PageHero status="live" fil="Libre, ngayon na" title="Avail Free MSME Benefits" path="/membership/free-benefits"
        intro="Everything below is free. We label each benefit honestly so you know what works today.">
        <Link href="/join" className="btn btn-flame">Join free</Link>
      </PageHero>
      <Section title="What's included"><Grid>{B.map((b) => <FeatureCard key={b.title} {...b} />)}</Grid></Section>
      <Section title="Join in 3 steps">
        <ol className="grid gap-4 sm:grid-cols-3">
          {["Sign up with Google or your email.", "Complete your profile: name, city and business stage.", "List your business and start using Ka-FLAME AI."].map((s, i) => (
            <li key={s} className="card p-5"><span className="grid h-10 w-10 place-items-center rounded-full bg-primary font-extrabold text-primary-fg">{i + 1}</span><p className="mt-3 font-semibold">{s}</p></li>
          ))}
        </ol>
      </Section>
      <Section title="Mga madalas itanong">
        <div className="space-y-3">
          {FAQ.map((f) => (
            <details key={f.q} className="card p-4">
              <summary className="min-h-8 cursor-pointer font-bold">{f.q}</summary>
              <p className="mt-2 text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </Section>
    </>
  );
}
