import Image from "next/image";
import Link from "next/link";
import * as I from "@/components/icons";

type Action = {
  title: string;
  text: string;
  href: string;
  external?: boolean;
  accent: string;
  image: string;
};

const ACTIONS: Action[] = [
  { title: "Start a Business", text: "Explore business ideas, packages and practical guidance. Halimbawa: pumili ng negosyong pasok sa puhunan at skills mo.", href: "https://www.negosyodepot.com", external: true, accent: "#0b4fd1", image: "/goal-cards/start-business.webp" },
  { title: "Grow My Business", text: "Use training, tools, resources and community connections. Halimbawa: alamin kung paano dagdagan ang sales at ayusin ang operations.", href: "/explore", accent: "#24a467", image: "/goal-cards/grow-business.webp" },
  { title: "Sell My Products", text: "Reach more customers through MarketplacePH. Halimbawa: ilagay online ang produkto para mas maraming makakita at bumili.", href: "https://www.marketplaceph.com", external: true, accent: "#ef3340", image: "/goal-cards/sell-products.webp" },
  { title: "Buy a Business", text: "Explore businesses and ready opportunities you can acquire through MarketplacePH. Halimbawa: humanap ng existing na negosyo na pasok sa budget at plano mo.", href: "https://www.marketplaceph.com", external: true, accent: "#1680f5", image: "/goal-cards/buy-business.webp" },
  { title: "Sell a Business", text: "Reach potential buyers when you are ready to transfer or sell your business. Halimbawa: ilista ang negosyo kasama ang malinaw na details para makita ng interested buyers.", href: "https://www.marketplaceph.com", external: true, accent: "#ef3340", image: "/goal-cards/sell-business.webp" },
  { title: "Pasalo a Business", text: "Find or hand over an operating business through a clear pasalo opportunity. Halimbawa: ipasa ang store sa bagong operator na kayang magpatuloy ng negosyo.", href: "https://www.marketplaceph.com", external: true, accent: "#f18a10", image: "/goal-cards/pasalo-business.webp" },
  { title: "Franchise a Business", text: "Compare franchise and ready-to-start business packages from NegosyoDepot. Halimbawa: pumili ng tested concept at alamin ang support bago mag-franchise.", href: "https://www.negosyodepot.com", external: true, accent: "#6d5ce7", image: "/goal-cards/franchise-business.webp" },
  { title: "Find Suppliers", text: "Explore suppliers, distributors and business packages. Halimbawa: maghanap ng mapagkakatiwalaang supplier na swak sa budget.", href: "https://www.negosyodepot.com", external: true, accent: "#6d5ce7", image: "/goal-cards/find-suppliers.webp" },
  { title: "Find Cargo Movers", text: "Connect with trucking, freight and air-cargo providers for MSME shipments. Halimbawa: ipadala ang products sa ibang lungsod o bansa nang mas maayos.", href: "https://www.marketplaceph.com", external: true, accent: "#1680f5", image: "/goal-cards/cargo-movers.webp" },
  { title: "Find Vehicle Dealers", text: "Find vehicle dealers and business-ready transport options for deliveries or operations. Halimbawa: humanap ng van o truck na bagay sa delivery needs at budget mo.", href: "https://www.marketplaceph.com", external: true, accent: "#0b4fd1", image: "/goal-cards/vehicle-dealers.webp" },
  { title: "Find Import Assistance", text: "Get practical help with import documents, shipping and customs coordination. Halimbawa: magpatulong sa requirements bago umangkat ng supplies o products.", href: "/directory", accent: "#0b4fd1", image: "/goal-cards/import-assistance.webp" },
  { title: "Find Tax Compliance Assistance", text: "Find bookkeeping and tax professionals to help keep your business records and filings in order. Halimbawa: ayusin ang resibo at BIR requirements bago ang deadline.", href: "/get-involved/professional-services", accent: "#24a467", image: "/goal-cards/tax-compliance.webp" },
  { title: "Find Legal Assistance", text: "Connect with business legal professionals for contracts, permits and practical guidance. Halimbawa: magpa-review ng kontrata bago pumirma o makipag-partner.", href: "/get-involved/professional-services", accent: "#7258e8", image: "/goal-cards/legal-assistance.webp" },
  { title: "Find Business Opportunities", text: "Discover FLAME PH and NegosyoDepot opportunities. Halimbawa: tingnan ang distributorship, partnership o bagong pagkakakitaan.", href: "/opportunities", accent: "#f18a10", image: "/goal-cards/business-opportunities.webp" },
  { title: "Find Investment Opportunities", text: "Explore grants, programs and carefully reviewed opportunities for business growth. Halimbawa: humanap ng opportunity na tugma sa puhunan, risk at long-term plan mo.", href: "/opportunities", accent: "#e4a400", image: "/goal-cards/investment-opportunities.webp" },
  { title: "Find Partners or Joint Venture", text: "Connect with potential partners for a shared project, investment or market opportunity. Halimbawa: humanap ng ka-partner para pagsamahin ang skills, puhunan o customers.", href: "/partners", accent: "#7258e8", image: "/goal-cards/joint-venture.webp" },
  { title: "Find Customers", text: "List, promote and sell through the right ecosystem service. Halimbawa: ipakilala ang negosyo sa tamang buyers sa iyong lugar.", href: "https://www.marketplaceph.com", external: true, accent: "#00a99d", image: "/goal-cards/find-customers.webp" },
  { title: "Easy Startup for Aspiring Managers", text: "Explore ready-to-start pizza business packages and operational support. Halimbawa: magsimula ng pizza business gamit ang tested package at support.", href: "https://www.managerspizza.com", external: true, accent: "#ef1762", image: "/goal-cards/pizza-startup.webp" },
  { title: "Get Business Advice", text: "Ask FLAME AI or connect with mentors and experts. Halimbawa: humingi ng gabay sa pricing, permits o susunod na business step.", href: "/bizconsult-ai", accent: "#7258e8", image: "/goal-cards/business-advice.webp" },
  { title: "Find Digital Marketing Experts", text: "Connect with professionals who can improve your online visibility, content and customer reach. Halimbawa: magpatulong sa social media at online ads para mas maraming makakita ng negosyo mo.", href: "/get-involved/professional-services", accent: "#00a99d", image: "/goal-cards/digital-marketing-experts.webp" },
  { title: "Find Training", text: "Join FLAME Academy, workshops and webinars. Halimbawa: matuto ng bookkeeping, marketing at business planning.", href: "/academy", accent: "#e4a400", image: "/goal-cards/find-training.webp" },
  { title: "Find a Job", text: "Search employment opportunities on MarketplacePH. Halimbawa: maghanap ng trabahong tugma sa skills at lokasyon mo.", href: "https://www.marketplaceph.com", external: true, accent: "#1680f5", image: "/goal-cards/find-job.webp" },
  { title: "Work From Home Jobs", text: "Find flexible remote and home-based work opportunities through MarketplacePH. Halimbawa: maghanap ng online o work-from-home na trabaho na bagay sa schedule at skills mo.", href: "https://www.marketplaceph.com", external: true, accent: "#0b4fd1", image: "/goal-cards/work-from-home-jobs.webp" },
  { title: "Find Financing Assistance", text: "Explore grants, loans and trusted financing information for your next business step. Halimbawa: maghanap ng financing option para sa dagdag puhunan o bagong equipment.", href: "/opportunities", accent: "#24a467", image: "/goal-cards/financing-assistance.webp" },
  { title: "Hire People", text: "Post jobs and reach applicants through MarketplacePH. Halimbawa: humanap ng maaasahang staff para lumago ang negosyo.", href: "https://www.marketplaceph.com", external: true, accent: "#18a7d4", image: "/goal-cards/hire-people.webp" },
  { title: "Find Business Property", text: "Explore Real Estate for MSMEs via Corporate H. Halimbawa: humanap ng pwesto para sa store, office o production area.", href: "/real-estate-for-msmes", accent: "#2e9c59", image: "/goal-cards/business-property.webp" },
  { title: "Earn Extra Income", text: "Explore affiliate and referral opportunities. Halimbawa: kumita sa qualified referrals at partner opportunities.", href: "/get-involved/affiliate", accent: "#e55773", image: "/goal-cards/extra-income.webp" },
  { title: "Build Portfolio", text: "Volunteer your professional services to gain hands-on experience, build a credible portfolio, and unlock earning opportunities through upgraded services. Halimbawa: tumulong sa isang MSME project, idagdag ang output sa portfolio mo, at mag-offer ng premium service kapag handa ka na.", href: "/get-involved/professional-services", accent: "#6d52e5", image: "/goal-cards/build-portfolio.webp" },
];

const ECOSYSTEM = [
  { name: "FLAME PH", description: "Community, benefits, training, tools and support", href: "/explore", image: "/brand/flameph-logo.png", external: false },
  { name: "MarketplacePH", description: "Buy, sell, find customers, jobs and applicants", href: "https://www.marketplaceph.com", image: "/ecosystem/marketplaceph-logo.png", external: true },
  { name: "NegosyoDepot", description: "Business packages, suppliers and distributorships", href: "https://www.negosyodepot.com", image: "/ecosystem/negosyodepot-logo.png", external: true },
  { name: "Easy Startup for Aspiring Managers", description: "Pizza business packages and operational support", href: "https://www.managerspizza.com", image: "/ecosystem/managers-pizza-logo.png", external: true },
  { name: "Real Estate for MSMEs", description: "Property pathways with Corporate H", href: "/real-estate-for-msmes", image: "/ecosystem/real-estate-msmes-logo.png", external: false },
];

function SmartLink({ action }: { action: Action }) {
  const [summary, example] = action.text.split(" Halimbawa: ");
  const body = (
    <>
      <span className="relative block h-36 w-full overflow-hidden rounded-2xl" style={{ background: `linear-gradient(145deg, ${action.accent}18, ${action.accent}05)` }}>
        <Image src={action.image} alt="" fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 180px" className="object-contain p-2 transition-transform duration-300 group-hover:scale-105" />
      </span>
      <span className="mt-4 block text-lg font-extrabold leading-tight text-primary">{action.title}</span>
      <span className="mt-2 block text-sm leading-5 text-muted">{summary}</span>
      {example && <span className="mt-2 block rounded-xl bg-bg-soft px-3 py-2 text-sm leading-5 text-fg"><strong>Halimbawa:</strong> {example}</span>}
      <span aria-hidden className="mt-auto pt-5"><span className="inline-grid h-8 w-8 place-items-center rounded-full text-lg font-black text-white" style={{ backgroundColor: action.accent }}>→</span></span>
    </>
  );
  const cls = "group flex h-full flex-col items-start gap-0 rounded-2xl border border-line bg-card p-5 shadow-[0_8px_24px_rgba(0,50,137,.08)] transition hover:-translate-y-1 hover:border-primary hover:shadow-[0_14px_34px_rgba(0,50,137,.14)]";
  return action.external ? <a href={action.href} target="_blank" rel="noopener" className={cls}>{body}<span className="sr-only"> (opens in a new tab)</span></a> : <Link href={action.href} className={cls}>{body}</Link>;
}

export function EcosystemFrontDoor() {
  return (
    <>
      <section className="relative isolate min-h-[560px] overflow-hidden border-b border-line bg-[#eaf7ff] sm:min-h-[610px] lg:min-h-[640px]">
        <Image src="/ecosystem/flameph-msme-hero.png" alt="Filipino entrepreneurs representing retail, food, delivery, professional services and agriculture" fill priority sizes="100vw" className="object-cover object-[68%_center] sm:object-center" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,#fff_0%,rgba(255,255,255,.98)_38%,rgba(255,255,255,.76)_58%,rgba(255,255,255,0)_84%)]" />
        <div className="container-x relative flex min-h-[560px] items-start py-10 sm:min-h-[610px] sm:items-center lg:min-h-[640px]">
          <div className="max-w-[640px] rounded-3xl bg-white/82 p-5 shadow-sm backdrop-blur-[2px] sm:p-8 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none">
            <p className="font-display text-sm font-extrabold uppercase tracking-[.14em] text-flame-strong">Hindi mo kailangang mag-business nang mag-isa.</p>
            <h1 className="mt-3 text-[2.35rem] font-extrabold leading-[1.02] text-primary sm:text-5xl lg:text-6xl">Ano Ang Gusto Mong Gawin Ngayon <span className="text-[#e20b24]">For Your Business?</span></h1>
            <p className="mt-5 max-w-xl text-base font-medium leading-7 text-[#24324a] sm:text-lg">
              Ang <strong>FLAME PH</strong> ang iyong digital workspace para sa araw-araw na operasyon ng negosyo: mula pag-aaral, paghanap ng supplier, customers and more opportunities, hanggang sa paggamit ng basic POS, business calculators at mga AI tools. <strong>Choose your goal and we’ll guide you to the right FLAME PH service or trusted ecosystem platform.</strong>
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href="#choose-a-goal" className="btn btn-flame rounded-full px-6">Choose what you need ↓</a>
              <Link href="/join" className="btn btn-outline rounded-full px-6">Join FLAME PH</Link>
            </div>
            <ul className="mt-7 grid max-w-lg grid-cols-3 gap-3 text-center text-xs font-bold text-primary sm:text-sm">
              <li className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl bg-white/90 p-3 text-balance"><span className="grid h-9 w-9 place-items-center rounded-full bg-primary-soft text-primary [&>svg]:h-5 [&>svg]:w-5"><I.IconUsers /></span>Connect with MSMEs</li>
              <li className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl bg-white/90 p-3 text-balance"><span className="grid h-9 w-9 place-items-center rounded-full bg-warn-soft text-warn [&>svg]:h-5 [&>svg]:w-5"><I.IconHands /></span>Access opportunities</li>
              <li className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl bg-white/90 p-3 text-balance"><span className="grid h-9 w-9 place-items-center rounded-full bg-success-soft text-success [&>svg]:h-5 [&>svg]:w-5"><I.IconStore /></span>Grow your business</li>
            </ul>
          </div>
        </div>
      </section>

      <section id="choose-a-goal" className="bg-[#f4f8ff] py-10 sm:py-14">
        <div className="container-x">
          <div className="max-w-3xl">
            <p className="font-display font-bold text-flame-strong">Choose your next step</p>
            <h2 className="mt-1 text-3xl font-extrabold text-primary sm:text-4xl">Your goal comes first</h2>
            <p className="mt-3 text-muted">Each card routes you to the service that owns the task. MarketplacePH handles commerce, customers, jobs and hiring; NegosyoDepot handles business packages and supplier opportunities; FLAME PH remains your community and support hub.</p>
          </div>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {ACTIONS.map((action) => <SmartLink key={action.title} action={action} />)}
          </div>
        </div>
      </section>

      <section className="border-y border-line bg-white py-10 sm:py-12">
        <div className="container-x">
          <div className="grid gap-6 lg:grid-cols-[260px_1fr] lg:items-center">
            <div>
              <p className="text-2xl font-extrabold leading-tight text-primary">The FLAME PH Ecosystem</p>
              <p className="mt-2 text-sm text-muted">One network. Clear roles. More opportunities for Filipino MSMEs. External platforms may require their own account until shared sign-in is formally implemented.</p>
              <Link href="/programs-ecosystem" className="btn btn-flame mt-5 rounded-full">Explore the ecosystem →</Link>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {ECOSYSTEM.map((item) => {
                const body = <><span className="relative block h-16 w-full"><Image src={item.image} alt={`${item.name} logo`} fill sizes="220px" className="object-contain object-left" /></span><strong className="mt-3 block text-sm text-primary">{item.name}</strong><span className="mt-1 block text-xs leading-5 text-muted">{item.description}</span></>;
                return <li key={item.name}>{item.external ? <a href={item.href} target="_blank" rel="noopener" className="block min-h-44 rounded-2xl border border-line p-4 hover:border-primary">{body}</a> : <Link href={item.href} className="block min-h-44 rounded-2xl border border-line p-4 hover:border-primary">{body}</Link>}</li>;
              })}
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}
