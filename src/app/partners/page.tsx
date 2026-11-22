import Link from "next/link";
import { PageHero, Section } from "@/components/ui";
import { meta } from "@/lib/meta";

export const metadata = meta("Partner With Us", "Explore strategic, corporate, government, education, NGO and community partnership pathways with FLAME PH.", "/partners");

const PATHS = [
  { title: "Strategic & Corporate Partnerships", text: "Explore a structured collaboration with FLAME PH and its MSME community.", href: "/get-involved/partner" },
  { title: "Government & LGU Partnerships", text: "Bring practical MSME learning, community connections and ecosystem access to your locality.", href: "/get-involved/partner" },
  { title: "Schools & Universities", text: "Connect entrepreneurship education, speakers and community programs with learners.", href: "/get-involved/partner" },
  { title: "NGOs & Foundations", text: "Coordinate mission-aligned programs that support Filipino MSMEs and communities.", href: "/get-involved/partner" },
  { title: "Sponsor an Event", text: "Support a specific workshop, event, expo or learning activity.", href: "/get-involved/sponsor-event" },
  { title: "Sponsor a Community", text: "Support a local MSME community or chapter initiative.", href: "/get-involved/sponsor-community" },
];

export default function PartnersPage() {
  return <><PageHero status="live" fil="Para sa mga organisasyon" title="Partner With Us" path="/partners" intro="This hub is for companies, LGUs, government agencies, NGOs, foundations, schools, universities and MSME organizations. Individual volunteering remains under Get Involved." >
      <Link href="/get-involved/partner" className="btn btn-flame">Start a partnership conversation</Link><Link href="/contact" className="btn btn-outline">Contact the partnership team</Link>
    </PageHero>
    {/* Businesses that sell to members apply at /partner-us (owner, 22 Nov 2026); each page links to the other. */}
    <Section className="pb-0 lg:pb-0"><Link href="/partner-us" className="card flex flex-col gap-2 border-2 border-flame p-5 hover:border-primary sm:flex-row sm:items-center sm:justify-between">
      <span><span className="block text-lg font-extrabold text-primary">Are you a supplier, service provider or toll manufacturer?</span><span className="block text-muted">Apply to be an Accredited Partner and offer your best price to members.</span><span className="block text-sm text-muted" lang="fil">Para sa mga negosyong gustong magbenta sa mga member.</span></span>
      <span className="font-bold text-mph">Become an Accredited Partner →</span>
    </Link></Section>
    <Section title="Partnership pathways" intro="Choose the closest pathway. FLAME PH will confirm scope, responsibilities and any public claims before a partnership is presented as active."><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{PATHS.map((item) => <Link key={item.title} href={item.href} className="card block p-6 hover:border-primary"><h2 className="text-xl font-extrabold text-primary">{item.title}</h2><p className="mt-2 text-muted">{item.text}</p><span className="mt-4 inline-block font-bold text-mph">Learn more →</span></Link>)}</div></Section>
  </>;
}
