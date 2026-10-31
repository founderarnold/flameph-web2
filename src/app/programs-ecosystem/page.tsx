import Image from "next/image";
import Link from "next/link";
import { PageHero, Section } from "@/components/ui";
import { meta } from "@/lib/meta";
import { EcosystemJourney } from "@/components/real-estate/EcosystemJourney";

export const metadata = meta("How the FLAME PH MSME Ecosystem Works", "Find the right FLAME PH community, tool or sister platform for starting, growing and scaling your business.", "/programs-ecosystem");

type CardProps = { title: string; text: string; image: string; href?: string; external?: boolean; badge?: string };

const STAGES: CardProps[] = [
  { title: "I have a business idea", text: "Compare practical startup pathways, packages and guidance before you invest. Halimbawa: pumili ng negosyong pasok sa puhunan at skills mo.", image: "/goal-cards/start-business.webp", href: "https://www.negosyodepot.com", external: true, badge: "Start" },
  { title: "I am starting my business", text: "Learn the basics, build your profile and connect with people who can help you take the first step. Halimbawa: gumawa ng simple business plan at maghanap ng mentor.", image: "/goal-cards/find-training.webp", href: "/academy", badge: "Start" },
  { title: "I already operate a business", text: "Improve daily operations, find customers, use digital tools and learn with other MSMEs. Halimbawa: gumamit ng POS at magbenta online para mas organisado ang negosyo.", image: "/goal-cards/grow-business.webp", href: "/explore", badge: "Grow" },
  { title: "I am ready to grow or scale", text: "Reach new markets, find partners, improve your location and build a stronger brand. Halimbawa: maghanap ng bagong channel, property o ka-partner para lumawak.", image: "/goal-cards/business-opportunities.webp", href: "/opportunities", badge: "Scale" },
];

const PLATFORMS: CardProps[] = [
  { title: "FLAME PH", text: "Community, membership, chapters, workshops, mentors, resources and support for every stage.", image: "/brand/flameph-logo.png", href: "/explore" },
  { title: "NegosyoDepot", text: "Business packages, suppliers, distributorships and startup resources. Some pathways are still coming soon.", image: "/ecosystem/negosyodepot-logo.png", href: "https://www.negosyodepot.com", external: true, badge: "External platform" },
  { title: "MarketplacePH", text: "Sell products, find customers, post jobs and reach applicants. MarketplacePH owns the commerce and hiring activity.", image: "/ecosystem/marketplaceph-logo.png", href: "https://www.marketplaceph.com", external: true, badge: "External platform" },
  { title: "Easy Startup for Aspiring Managers", text: "A focused ready-to-start pathway for aspiring managers who want a pizza business package and operational support.", image: "/ecosystem/managers-pizza-logo.png", href: "https://www.managerspizza.com", external: true, badge: "External platform" },
  { title: "FLAME PH Digital Tools", text: "Ka-FLAME AI, basic POS, business pages, calculators and other practical tools for everyday operations.", image: "/goal-cards/business-advice.webp", href: "/benefits" },
  { title: "Real Estate for MSMEs", text: "Find a place for operations, storage, production, expansion or investment through the appropriate property pathway.", image: "/ecosystem/real-estate-msmes-logo.png", href: "/real-estate-for-msmes" },
];

const NEEDS: CardProps[] = [
  { title: "Business page and directory", text: "Sign in to build your free mini-website, then use the Pages directory to discover listed Filipino MSMEs.", image: "/goal-cards/build-portfolio.webp", href: "/login?next=%2Faccount%2Fbusiness", badge: "Sign in first" },
  { title: "Customers, products and jobs", text: "Use MarketplacePH for selling, finding customers, jobs and hiring. FLAME PH does not duplicate those marketplace functions.", image: "/goal-cards/find-customers.webp", href: "https://www.marketplaceph.com", external: true },
  { title: "Suppliers and business packages", text: "Explore NegosyoDepot for supplier, distributorship and business-package opportunities.", image: "/goal-cards/find-suppliers.webp", href: "https://www.negosyodepot.com", external: true },
  { title: "Advice and professional support", text: "Start with Ka-FLAME AI, mentors or the professional-services pathway for tax, legal, marketing and operational needs.", image: "/goal-cards/business-advice.webp", href: "/get-involved/professional-services" },
  { title: "Business location and expansion", text: "Submit a property requirement for a shop, office, warehouse, commissary or expansion site.", image: "/goal-cards/business-property.webp", href: "/real-estate-for-msmes" },
  { title: "Digital operations", text: "Use FLAME PH’s basic POS and digital tools to organize sales, inventory, content and everyday decisions.", image: "/goal-cards/grow-business.webp", href: "/pos" },
];

const PROGRAMS: CardProps[] = [
  { title: "FLAME PH Academy", text: "Learning tracks organized by business stage.", image: "/goal-cards/find-training.webp", href: "/academy", badge: "Coming soon" },
  { title: "NegosyoTalks", text: "Conversations with Filipino entrepreneurs and business builders.", image: "/goal-cards/business-advice.webp", href: "/negosyo-talks", badge: "Coming soon" },
  { title: "Educational Workshops", text: "Hands-on sessions with LGUs, barangays and schools.", image: "/goal-cards/find-training.webp", href: "/workshops", badge: "Live" },
  { title: "Trainings & Webinars", text: "Short skills sessions online and in person.", image: "/goal-cards/find-training.webp", href: "/trainings-webinars", badge: "Live" },
  { title: "Expos & Summits", text: "Events where MSMEs can exhibit and meet buyers.", image: "/goal-cards/find-customers.webp", href: "/expos-summits", badge: "Live" },
  { title: "Annual MSME Awards", text: "A future pathway for recognizing resilient and innovative MSMEs.", image: "/goal-cards/investment-opportunities.webp", href: "/awards", badge: "Coming soon" },
];

function IllustratedCard({ title, text, image, href, external, badge }: CardProps) {
  const content = <>
    <span className="relative block h-36 w-full shrink-0 overflow-hidden rounded-2xl bg-primary-soft"><Image src={image} alt="" fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 280px" className="object-contain p-3" /></span>
    {badge && <span className="mt-4 inline-flex rounded-full bg-bg-soft px-2.5 py-1 text-xs font-extrabold uppercase tracking-wide text-primary">{badge}</span>}
    <h3 className="mt-3 text-lg font-extrabold text-primary">{title}</h3>
    <p className="mt-2 min-w-0 text-[15px] leading-6 text-muted">{text}</p>
    {href && <span className="mt-auto inline-flex pt-5 font-bold text-mph">Explore this pathway {external ? "↗" : "→"}</span>}
  </>;
  const className = "card flex h-full min-w-0 flex-col overflow-hidden p-4 transition hover:-translate-y-0.5 hover:border-primary sm:p-5";
  return href ? external ? <a href={href} target="_blank" rel="noopener" className={className}>{content}<span className="sr-only"> (opens in a new tab)</span></a> : <Link href={href} className={className}>{content}</Link> : <article className={className}>{content}</article>;
}

const FAQ = [
  ["What is FLAME PH and what are the sister platforms?", "FLAME PH is the community and support hub. NegosyoDepot focuses on startup resources and suppliers, MarketplacePH focuses on commerce and jobs, Manager’s Pizza offers a focused startup pathway, and Real Estate for MSMEs connects business-location needs to the appropriate property pathway."],
  ["Do I need a separate account on every platform?", "You need a FLAME PH account for FLAME PH services. External platforms may require their own account until shared sign-in is formally implemented. Each platform handles its own listings, applications, orders, payments and terms."],
  ["What can I use today?", "Membership, resources, workshops, webinars, Ka-FLAME AI beta, the business-page builder, basic POS, MarketplacePH pathways and Real Estate for MSMEs request pathways are available. Items marked Coming soon are still being prepared."],
  ["Does FLAME PH guarantee customers, loans, jobs or investment returns?", "No. FLAME PH provides community, education, tools and connections. Customers, financing approval, employment, property availability, investment outcomes and business success are never guaranteed."],
  ["Can I join if my business is not registered yet?", "Yes. Aspiring entrepreneurs are welcome. Some directory, property, financing or regulated-service pathways may require additional documents or verification."],
  ["Can I create a free business page?", "Yes. Sign in to FLAME PH, open the business page builder, create your page and follow the applicable review requirements for directory publication."],
  ["Does Ka-FLAME AI replace a lawyer, accountant or financial adviser?", "No. Ka-FLAME AI provides general business guidance and writing support. Use qualified professionals and official government agencies for regulated advice and filings."],
  ["Who should I contact if I do not know where to begin?", "Use the homepage goal cards, ask Ka-FLAME AI, join a workshop or contact FLAME PH. Start by choosing the business stage or need that best describes your situation."],
];

export default function Page() {
  return <>
    <PageHero status="live" fil="Isang ecosystem para sa MSME" title="Start, Grow or Scale Your Business with a Clear Next Step" path="/programs-ecosystem" intro="FLAME PH is your community and digital workspace. We connect you to the right people, learning, tools and trusted ecosystem platform for your current business need.">
      <a href="#choose-stage" className="btn btn-flame">Choose my business stage</a>
      <Link href="/join" className="btn btn-outline">Join FLAME PH free</Link>
    </PageHero>

    <Section id="choose-stage" title="Where are you in your business journey?" intro="Choose the path that best describes you today. You can move between paths as your business changes.">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{STAGES.map((item) => <IllustratedCard key={item.title} {...item} />)}</div>
    </Section>

    <section className="border-y border-line bg-bg-soft">
      <div className="container-x grid items-center gap-8 py-10 lg:grid-cols-[1fr_1.1fr] lg:py-14">
        <div><p className="font-display font-bold text-flame-strong">One clear path</p><h2 className="mt-1 text-2xl font-extrabold text-primary sm:text-3xl">Start small → grow locally → scale globally</h2><p className="mt-3 text-muted">Your next step may be learning, finding a supplier, reaching customers, improving operations or securing a better location. FLAME PH helps you choose the right door without making you learn how the whole network is organized.</p></div>
        <div className="relative overflow-hidden rounded-3xl border border-line bg-white shadow-sm"><Image src="/ecosystem/msme-growth-journey.png" alt="A Filipino entrepreneur journey from starting at home to growing a team and reaching wider markets" width={2048} height={1152} className="h-auto w-full" /></div>
      </div>
    </section>

    <Section id="platforms" title="Know who does what" intro="FLAME PH is the navigation and community layer. The relevant sister platform owns its specialized activity and may have separate terms or sign-in.">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{PLATFORMS.map((item) => <IllustratedCard key={item.title} {...item} />)}</div>
    </Section>

    <EcosystemJourney />

    <Section id="needs" title="Find help by business need" intro="Use the service that owns the task so you get the right experience and avoid duplicate listings or functions across the ecosystem.">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{NEEDS.map((item) => <IllustratedCard key={item.title} {...item} />)}</div>
    </Section>

    <Section id="programs" title="Programs and pathways" intro="Live programs are available now. Items marked Coming soon are being prepared and should not be treated as currently available services.">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{PROGRAMS.map((item) => <IllustratedCard key={item.title} {...item} />)}</div>
      <p className="mt-6"><Link href="/join" className="btn btn-flame">Join free and get started</Link></p>
    </Section>

    <section className="bg-warn-soft">
      <div className="container-x py-10 lg:py-12"><h2 className="text-2xl font-extrabold text-primary">Important expectations</h2><div className="mt-4 grid gap-3 text-[15px] leading-6 text-fg sm:grid-cols-2"><p>FLAME PH does not guarantee loans, grants, customers, jobs, investment returns, property availability or business success.</p><p>Verify prices, availability, licenses, credentials and official requirements before making a financial, property, legal or tax decision.</p><p>External platforms may require separate accounts and have their own privacy notices, terms, payments and customer-service processes.</p><p>Ka-FLAME AI is a general business guide, not a substitute for licensed legal, tax, accounting, financial or other regulated advice.</p></div></div>
    </section>

    <Section id="faqs" title="Frequently asked questions" intro="The answers below explain what FLAME PH can do, where each platform fits and what you should expect.">
      <div className="space-y-3">{FAQ.map(([q, a]) => <details key={q} className="card p-4"><summary className="cursor-pointer font-bold">{q}</summary><p className="mt-2 leading-6 text-muted">{a}</p></details>)}</div>
    </Section>

    <section className="bg-gradient-to-br from-primary via-[#0047b3] to-[#0a2f6b] text-white"><div className="container-x py-12 text-center sm:py-16"><h2 className="text-3xl font-extrabold sm:text-4xl">Hindi mo kailangang mag-business nang mag-isa.</h2><p className="mx-auto mt-4 max-w-2xl text-lg text-white/90">Choose your stage, pick your next step and let FLAME PH guide you to the right part of the ecosystem.</p><div className="mt-7 flex flex-wrap justify-center gap-3"><Link href="/start" className="btn rounded-full bg-[#c00a0a] px-7 text-white hover:bg-[#a30808]">Choose your next step</Link><Link href="/join" className="btn rounded-full bg-white/15 px-7 text-white hover:bg-white/25">Join FLAME PH free</Link></div></div></section>
  </>;
}
