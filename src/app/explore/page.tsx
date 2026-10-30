import Link from "next/link";
import { PageHero, Section } from "@/components/ui";
import { meta } from "@/lib/meta";

export const metadata = meta("Explore FLAME PH", "Discover the FLAME PH community, member tools, learning, opportunities and specialist MSME ecosystem platforms.", "/explore");

const AREAS = [
  { title: "Start with your goal", text: "Tell us what you want to accomplish and go directly to the right service.", href: "/start" },
  { title: "Member benefits", text: "See the free benefits available now and the additional membership pathways.", href: "/benefits" },
  { title: "Learning & advice", text: "Use FLAME Academy, workshops, resources and FLAME AI for practical guidance.", href: "/academy" },
  { title: "Business opportunities", text: "Review checked FLAME PH opportunities and connect to specialist ecosystem platforms.", href: "/opportunities" },
  { title: "Local chapters", text: "Meet MSMEs near you or help form a chapter in your community.", href: "/chapters" },
  { title: "Get involved", text: "Volunteer, mentor, speak, refer businesses or support an MSME initiative.", href: "/get-involved" },
];

export default function ExplorePage() {
  return <><PageHero status="live" fil="Tuklasin ang network" title="Explore FLAME PH" path="/explore" intro="FLAME PH is the community and front door. Its ecosystem platforms handle specialist needs such as commerce, jobs, business packages, pizza entrepreneurship and property." />
    <Section title="Choose where to begin" intro="These hubs organize existing services without replacing their working pages or URLs.">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{AREAS.map((area) => <Link key={area.href} href={area.href} className="card block p-6 hover:border-primary"><h2 className="text-xl font-extrabold text-primary">{area.title}</h2><p className="mt-2 text-muted">{area.text}</p><span className="mt-4 inline-block font-bold text-mph">Explore →</span></Link>)}</div>
    </Section>
    <Section className="!pt-0"><div className="rounded-3xl bg-primary px-6 py-9 text-white sm:px-10"><h2 className="text-2xl font-extrabold">Not sure where your goal belongs?</h2><p className="mt-2 max-w-2xl text-white/85">Use the task-first front desk. It routes jobs and hiring to MarketplacePH, business packages to NegosyoDepot, easy-start pizza business opportunities to Manager&apos;s Pizza, and property needs to Real Estate for MSMEs.</p><Link href="/start" className="btn mt-5 rounded-full bg-white text-primary">Ano Ang Gusto Mong Gawin Ngayon For Your Business? →</Link></div></Section>
  </>;
}
