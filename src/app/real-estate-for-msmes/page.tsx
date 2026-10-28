import Image from "next/image";
import Link from "next/link";
import { EcosystemJourney } from "@/components/real-estate/EcosystemJourney";
import { RealEstateDisclaimer } from "@/components/real-estate/RealEstateDisclaimer";
import { RealEstateNav } from "@/components/real-estate/RealEstateNav";
import { meta } from "@/lib/meta";

export const metadata = meta(
  "Real Estate for MSMEs",
  "Find property and location solutions for an MSME through Mapiles Realty Corporate H in the FLAME PH ecosystem.",
  "/real-estate-for-msmes",
);

const WHY = [
  ["START", "Find an affordable place to begin operations."],
  ["OPERATE", "Locate an office, shop, commissary, warehouse or production facility."],
  ["GROW", "Move into a more suitable location as the business expands."],
  ["DISTRIBUTE", "Support storage, logistics and local fulfillment."],
  ["INVEST", "Explore property ownership as a possible long-term business asset."],
  ["EXPAND", "Identify potential sites for new branches and territories."],
];

const NEEDS = [
  ["🏬", "Commercial Properties", "Shops, commercial units and business spaces."],
  ["📍", "Commercial Lots", "Potential sites for stores, buildings and facilities."],
  ["🏢", "Office Spaces", "For startups, professional services and growing companies."],
  ["📦", "Warehouses", "Storage and distribution requirements."],
  ["🏭", "Commissary / Production", "Food production, manufacturing and related operations."],
  ["🔑", "Leasing", "Commercial and other appropriate rental opportunities."],
  ["🏠", "Residential Properties", "For applicable entrepreneur and homeownership requirements."],
  ["🌱", "Raw Land", "For future development or business expansion."],
  ["📈", "Investment Properties", "Options that may fit an entrepreneur's property strategy."],
  ["🚚", "Micro-Fulfillment", "Potential local inventory and distribution hubs."],
];

export default function RealEstateForMsmesPage() {
  return (
    <>
      <RealEstateNav />
      <section className="overflow-hidden bg-gradient-to-br from-primary via-[#174f9a] to-[#0f7a61] text-white">
        <div className="container-x grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-[1.25fr_.75fr] lg:py-24">
          <div>
            <span className="inline-flex rounded-full bg-white/15 px-4 py-2 text-xs font-extrabold uppercase tracking-[.16em]">Real Estate for MSMEs · PLACE</span>
            <h1 className="mt-6 max-w-4xl text-4xl font-extrabold sm:text-5xl lg:text-6xl">Find the Right <span className="text-[#9ee6bd]">PLACE</span> for Your Business</h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-white/85">From your first small business location to your next warehouse, office, commercial property or investment, FLAME PH connects MSMEs with property solutions through Mapiles Realty Corporate H.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link className="btn bg-white text-primary hover:bg-white/90" href="/real-estate-for-msmes/find-property">Find a Property</Link>
              <Link className="btn border-2 border-white text-white hover:bg-white/10" href="/real-estate-for-msmes/find-property#property-form">Talk to a Property Specialist</Link>
              <a className="btn border-2 border-white/50 text-white hover:bg-white/10" href="https://www.mapiles.ai/" target="_blank" rel="noopener noreferrer">Explore Mapiles AI ↗</a>
            </div>
          </div>
          <aside className="rounded-3xl bg-white p-6 text-fg shadow-2xl sm:p-8">
            <p className="text-xs font-extrabold uppercase tracking-[.18em] text-ok">PLACE partner</p>
            <div className="mt-4 rounded-2xl border border-line bg-white p-4">
              <Image src="/partners/mapiles-realty-corporate-h.png" alt="Mapiles Realty Corporate H" width={560} height={560} priority className="mx-auto h-auto max-h-72 w-auto object-contain" />
            </div>
            <p className="mt-5 text-sm leading-6 text-muted"><strong>Real Estate &amp; Property Solutions Partner in the FLAME PH Ecosystem.</strong> FLAME PH and Mapiles Realty remain independent organizations.</p>
          </aside>
        </div>
      </section>

      <section className="container-x py-12 lg:py-16">
        <div className="mx-auto max-w-3xl text-center">
          <p className="font-bold text-flame-strong">Why PLACE matters</p>
          <h2 className="mt-2 text-3xl font-extrabold text-primary sm:text-4xl">Every Business Needs the Right Place</h2>
          <p className="mt-4 text-lg text-muted">A strong community, a good business idea, useful technology and access to customers all matter. Many businesses also need the right physical place to operate and grow.</p>
        </div>
        <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {WHY.map(([title, text], index) => (
            <article key={title} className="card p-6">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-ok-soft font-extrabold text-ok">{index + 1}</span>
              <h3 className="mt-4 text-lg font-extrabold">{title}</h3>
              <p className="mt-2 text-muted">{text}</p>
            </article>
          ))}
        </div>
      </section>

      <EcosystemJourney />

      <section className="container-x py-12 lg:py-16" aria-labelledby="property-needs-title">
        <p className="font-bold text-ok">Property needs directory</p>
        <h2 id="property-needs-title" className="mt-2 text-3xl font-extrabold text-primary sm:text-4xl">What Kind of PLACE Does Your Business Need?</h2>
        <p className="mt-3 max-w-3xl text-muted">Tell us your requirement. Availability is never guaranteed, and every option should be verified before any decision.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {NEEDS.map(([icon, title, text]) => (
            <article key={title} className="card flex flex-col p-5">
              <span aria-hidden className="text-3xl">{icon}</span>
              <h3 className="mt-3 font-extrabold text-primary">{title}</h3>
              <p className="mt-2 flex-1 text-sm text-muted">{text}</p>
              <Link className="mt-4 font-bold text-primary hover:underline" href={`/real-estate-for-msmes/find-property?property=${encodeURIComponent(title)}`}>Ask for options →</Link>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-line bg-bg-soft">
        <div className="container-x py-12 lg:py-16">
          <div className="mx-auto max-w-3xl text-center">
            <p className="font-bold text-flame-strong">Three separate journeys</p>
            <h2 className="mt-2 text-3xl font-extrabold text-primary sm:text-4xl">How Can We Help You Today?</h2>
            <p className="mt-3 text-muted">Choose the path that describes what you actually need.</p>
          </div>
          <div className="mt-9 grid gap-5 lg:grid-cols-3">
            <article className="card flex flex-col border-2 border-ok p-7"><span className="w-fit rounded-full bg-ok-soft px-3 py-1 text-xs font-extrabold text-ok">PROPERTY CLIENT</span><h3 className="mt-5 text-2xl font-extrabold text-primary">I need a property</h3><p className="mt-3 flex-1 text-muted">Share your property or business-location requirement for review by an appropriate property specialist.</p><Link className="btn btn-primary mt-6" href="/real-estate-for-msmes/find-property">Find the Right Place</Link></article>
            <article className="card flex flex-col p-7"><span className="w-fit rounded-full bg-primary-soft px-3 py-1 text-xs font-extrabold text-primary">REFERRAL / AFFILIATE</span><h3 className="mt-5 text-2xl font-extrabold text-primary">I know someone who needs property</h3><p className="mt-3 flex-1 text-muted">Explore the approved referral pathway. Participation does not make anyone a licensed broker or accredited salesperson.</p><Link className="btn btn-outline mt-6" href="/real-estate-for-msmes/referral-partner">Explore Referral Opportunities</Link></article>
            <article className="card flex flex-col p-7"><span className="w-fit rounded-full bg-flame-soft px-3 py-1 text-xs font-extrabold text-flame-strong">PROFESSIONAL PATH</span><h3 className="mt-5 text-2xl font-extrabold text-primary">I want a real-estate career</h3><p className="mt-3 flex-1 text-muted">Explore property marketing, professional sales, leadership, training and the appropriate accreditation pathway.</p><Link className="btn btn-flame mt-6" href="/real-estate-for-msmes/careers">Explore Careers</Link></article>
          </div>
        </div>
      </section>

      <section className="bg-primary text-white">
        <div className="container-x grid gap-8 py-12 lg:grid-cols-2 lg:items-center lg:py-16">
          <div><p className="font-bold text-[#9ee6bd]">Technology-assisted discovery</p><h2 className="mt-2 text-3xl font-extrabold sm:text-4xl">Smarter Property Discovery with Mapiles AI</h2><p className="mt-4 text-white/80">Explore public tools for property matching, search, project information, developer discovery, comparison and site-visit scheduling.</p><p className="mt-3 text-sm text-white/65">You will leave FLAME PH and become subject to Mapiles Realty&apos;s applicable terms and privacy policy.</p><a className="btn mt-6 bg-white text-primary" href="https://www.mapiles.ai/" target="_blank" rel="noopener noreferrer">Explore Mapiles AI ↗</a></div>
          <div className="rounded-3xl bg-white/10 p-7"><h3 className="text-xl font-extrabold">Clear, careful positioning</h3><p className="mt-3 text-white/80">Mapiles Realty began in 2014 and has expanded its real-estate sales and marketing presence beyond Central Luzon. Its direction includes PropTech and AI-assisted discovery. FLAME PH does not copy property inventory without an approved data-sharing arrangement.</p></div>
        </div>
      </section>

      <section className="container-x py-12 lg:py-16">
        <p className="font-bold text-flame-strong">Grow with Mapiles Realty Corporate H</p>
        <h2 className="mt-2 text-3xl font-extrabold text-primary">Choose the appropriate pathway</h2>
        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Affiliate / Referral Partner", "Start through your network.", "/real-estate-for-msmes/referral-partner", "Explore Referral Program"],
            ["Marketing Associate", "Develop property marketing skills.", "/real-estate-for-msmes/careers?role=marketing-associate", "Apply as Marketing Associate"],
            ["Professional Sales Path", "Build toward appropriate accreditation and professional development.", "/real-estate-for-msmes/careers", "Explore Sales Career"],
            ["Sales Manager", "For qualified sales leaders interested in developing a team.", "/real-estate-for-msmes/careers?role=sales-manager", "Apply as Sales Manager"],
          ].map(([title, text, href, label]) => <article key={title} className="card flex flex-col p-5"><h3 className="font-extrabold text-primary">{title}</h3><p className="mt-2 flex-1 text-sm text-muted">{text}</p><Link className="mt-4 font-bold text-primary hover:underline" href={href}>{label} →</Link></article>)}
        </div>
        <p className="mt-7 text-center"><span className="text-muted">Not looking for a career? </span><Link className="font-bold text-primary underline" href="/real-estate-for-msmes/find-property">Find a Property Instead</Link></p>
        <div className="mt-10"><RealEstateDisclaimer /></div>
      </section>
    </>
  );
}
