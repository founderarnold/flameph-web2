import Link from "next/link";
import * as I from "@/components/icons";
import { StatusBadge, type Status } from "@/components/StatusBadge";
import { goHref } from "@/lib/ecosystem";

/**
 * "Quick look" for first-time visitors, placed right below the home page hero.
 * It explains in one screenful what FLAME PH is, who it is for, the core features (each linked to the page
 * that already exists), and why to help build a chapter in every city and municipality.
 * Copy follows the pitch deck and business model (Nov 2026): plans are described as plans, never as results,
 * and nothing here promises earnings or investment gains.
 */

type Feature = { title: string; text: string; href?: string; icon: React.ReactNode; status?: Status; members?: boolean };

const WHO = [
  "Founders", "MSMEs", "Aspiring entrepreneurs", "Community builders", "Manufacturers", "Suppliers",
  "Professional services", "Volunteer speakers", "IT experts", "Organizational leaders", "Cooperative founders",
  "Career professionals", "B2B companies", "Overseas Filipinos",
];

const FLAGSHIPS: Feature[] = [
  {
    title: "Micro Fulfillment Hubs",
    text: "Fulfillment by MSMEs: qualified local businesses with space, staff or riders help other MSMEs store, pack and deliver orders, instead of everyone renting a warehouse alone. We are starting with a small pilot.",
    href: "/fulfillment", icon: <I.IconBox />, status: "soon",
  },
  {
    title: "Sugpuin ang Kahirapan Through Entrepreneurship",
    text: "Free educational workshops on starting small, budgeting, pricing and selling, plus “AI Tools for Business” seminars that show simple AI and digital tools for marketing, customer service and planning.",
    href: "/workshops", icon: <I.IconMic />, status: "live",
  },
];

const FEATURES: Feature[] = [
  { title: "Group ordering", text: "Buy supplies together for better prices. Members pay the supplier directly; FLAME PH never holds your money.", href: "/deals", icon: <I.IconCart />, status: "live" },
  { title: "Shared cost on common services", text: "Share the cost of services every MSME needs, like delivery, training and professional help.", href: "/benefits", icon: <I.IconHands /> },
  { title: "MSME toolkits", text: "Free guides, templates and checklists, with links to the official agencies.", href: "/resources", icon: <I.IconFile />, status: "live" },
  { title: "Business calculators", text: "Work out pricing, profit margin, break-even and more in seconds.", href: "/business-calculators", icon: <I.IconCalc />, status: "live" },
  { title: "Free Basic POS", text: "Sell, track inventory and see your daily sales with FLAME POS.", href: "/pos", icon: <I.IconPos />, status: "live" },
  { title: "Digital dashboards", text: "Your business page, mini-website, inbox, leads and tools in one workspace.", href: "/workspace", icon: <I.IconChart />, members: true },
  { title: "AI Tools for Business", text: "Ask Ka-FLAME AI in Taglish, and join seminars on using AI for your business.", href: "/trainings-webinars", icon: <I.IconSpark />, status: "beta" },
  { title: "MarketplacePH.com", text: "List products and services, find customers, jobs and applicants.", href: goHref("marketplaceph", "/", "to sell and find customers"), icon: <I.IconStore /> },
  { title: "NegosyoDepot.com", text: "Startup packages, franchises, suppliers and distributorships.", href: goHref("negosyodepot", "/", "to find packages and suppliers"), icon: <I.IconAward /> },
  { title: "Real Estate for MSMEs", text: "Find a store, office or production space, with Corporate H.", href: "/real-estate-for-msmes", icon: <I.IconHome /> },
  { title: "More opportunities", text: "Grants, trade fairs, buyer requests and B2B partnerships for business owners, professionals and companies.", href: "/opportunities", icon: <I.IconBriefcase /> },
];

const STEPS = [
  { title: "Join free", text: "Create your FLAME PH account and business profile in a few minutes." },
  { title: "Gather your community", text: "Invite MSMEs, suppliers, professionals and leaders in your city or municipality." },
  { title: "Build your chapter", text: "Lead local workshops, group orders and meetups, with tools and support from FLAME PH." },
];

function Tile({ f }: { f: Feature }) {
  return (
    <Link href={f.href ?? "/join"} className="card group flex h-full items-start gap-3 p-4 transition-colors hover:border-primary">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary [&>svg]:h-5 [&>svg]:w-5">{f.icon}</span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-bold leading-snug text-fg group-hover:text-primary">{f.title}</span>
          {f.members && <span className="rounded-full bg-bg-soft px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-muted">Members</span>}
        </span>
        <span className="mt-1 block text-sm leading-5 text-muted">{f.text}</span>
      </span>
    </Link>
  );
}

export function QuickLook() {
  return (
    <section id="quick-look" aria-labelledby="quick-look-h" className="border-b border-line bg-white">
      <div className="container-x py-10 sm:py-14">
        {/* What FLAME PH is, and who it is for */}
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start lg:gap-12">
          <div>
            <p className="inline-block rounded-full bg-flame-soft px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-flame-strong">Quick look · Bago ka lang dito?</p>
            <h2 id="quick-look-h" className="mt-4 text-3xl font-extrabold leading-tight text-primary sm:text-4xl">
              Pagaanin ang pagnenegosyo. <span className="text-[#e20b24]">Sama-sama.</span>
            </h2>
            <p className="mt-4 text-base leading-7 text-[#24324a] sm:text-lg">
              <strong>FLAME PH</strong> is a Filipino MSME ecosystem that lightens the weight of doing business. Instead of paying for many separate services alone, members learn together, order together, share costs and open doors as one community.
            </p>
            <p className="mt-3 text-base leading-7 text-[#24324a] sm:text-lg">
              Our advocacy: build a FLAME PH chapter in <strong>every city and municipality in the Philippines</strong>, and in Filipino communities overseas, so no negosyante has to grow alone.
            </p>
          </div>
          <div className="rounded-3xl bg-[#f4f8ff] p-5 sm:p-6">
            <p className="font-display text-sm font-extrabold uppercase tracking-[.12em] text-primary">Para kanino ito?</p>
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="Who FLAME PH is for">
              {WHO.map((w) => <li key={w} className="rounded-full border border-line bg-white px-3 py-1.5 text-sm font-semibold text-fg">{w}</li>)}
            </ul>
            <p className="mt-4 text-sm leading-6 text-muted">Whether you are starting your first small business or running a company that serves MSMEs, there is a place for you here.</p>
          </div>
        </div>

        {/* Flagship programs */}
        <h3 className="mt-10 font-display text-sm font-extrabold uppercase tracking-[.12em] text-flame-strong">Flagship programs</h3>
        <ul className="mt-3 grid gap-4 md:grid-cols-2">
          {FLAGSHIPS.map((f) => (
            <li key={f.title}>
              <Link href={f.href!} className="group flex h-full flex-col rounded-2xl border border-line bg-gradient-to-br from-primary-soft/70 to-white p-5 transition hover:border-primary hover:shadow-[0_14px_34px_rgba(0,50,137,.12)] sm:p-6">
                <span className="flex items-start justify-between gap-3">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary text-white [&>svg]:h-6 [&>svg]:w-6">{f.icon}</span>
                  {f.status && <StatusBadge status={f.status} />}
                </span>
                <span className="mt-4 block text-xl font-extrabold leading-tight text-primary">{f.title}</span>
                <span className="mt-2 block text-[15px] leading-6 text-muted">{f.text}</span>
                <span className="mt-auto pt-4 text-sm font-bold text-primary group-hover:underline">Learn more →</span>
              </Link>
            </li>
          ))}
        </ul>

        {/* Core features */}
        <h3 className="mt-10 font-display text-sm font-extrabold uppercase tracking-[.12em] text-flame-strong">Core features of the ecosystem</h3>
        <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {FEATURES.map((f) => <li key={f.title}><Tile f={f} /></li>)}
        </ul>

        {/* Why build a chapter + call to action */}
        <div className="mt-10 overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-[#0047b3] to-[#0a2f6b] text-white">
          <div className="grid gap-8 p-6 sm:p-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
            <div>
              <p className="font-display text-sm font-bold uppercase tracking-wider text-gold">Join the movement</p>
              <p className="mt-2 text-2xl font-extrabold leading-tight sm:text-4xl">Build a better business environment for every Filipino MSME.</p>
              <p className="mt-4 text-base leading-7 text-white/90">
                One business alone pays full price. A chapter of businesses can buy together, train together and refer each other. Help us grow chapters city by city, municipality by municipality, here and abroad. Kapag sama-sama, mas magaan.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/join" className="btn rounded-full bg-[#c00a0a] px-7 text-lg text-white shadow-lg hover:bg-[#a30808]">Join FLAME PH Free →</Link>
                <Link href="/get-involved/chapter-leader" className="btn rounded-full bg-white/15 px-7 text-lg text-white hover:bg-white/25">Build a chapter in your area</Link>
              </div>
              <p className="mt-4 text-sm text-white/75">Free to join. <Link href="/chapters" className="font-semibold text-white underline">See chapters near you</Link>.</p>
            </div>
            <ol className="grid gap-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex items-start gap-4 rounded-2xl bg-white/10 p-4">
                  <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gold font-display text-lg font-extrabold text-[#0a2f6b]">{i + 1}</span>
                  <span><span className="block font-bold">{s.title}</span><span className="mt-0.5 block text-sm leading-5 text-white/85">{s.text}</span></span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
