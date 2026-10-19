import Image from "next/image";
import premiumId from "@/assets/premium-id.webp";
import Link from "next/link";
import { StatsStrip, HeroStats } from "@/components/StatsStrip";
import { PrincipleDiagram } from "@/components/PrincipleDiagram";
import { HowWeHelp } from "@/components/HowWeHelp";
import { FeatureCard, Grid, Initials, Section } from "@/components/ui";
import * as I from "@/components/icons";
import { FOUNDERS, TAGLINES, TRUST_LINE } from "@/lib/site";
import { getDict } from "@/lib/i18n";
import { list, type EventRow } from "@/lib/content";
import type { Status } from "@/components/StatusBadge";
import { FlameAdSlot } from "@/components/FlameAdSlot";

const NEEDS = [
  { label: "Magsimula ng negosyo", sub: "Start a business", href: "https://negosyodepot.com", art: "start-business", external: true },
  { label: "Mag-register ng business", sub: "Permits & registration guides", href: "/resources?topic=permits", art: "register-business" },
  { label: "Magtanong kay Ka-FLAME AI", sub: "Free business Q&A", href: "/bizconsult-ai", art: "ask-kaflame" },
  { label: "Ilista ang negosyo ko", sub: "Free business directory", href: "/directory", art: "list-business" },
  { label: "Magbenta online", sub: "MarketplacePH", href: "https://www.marketplaceph.com", art: "sell-online", external: true },
  { label: "Sumali sa workshop", sub: "Workshops & trainings", href: "/workshops", art: "join-workshop" },
  { label: "Humanap ng mentor", sub: "Volunteer mentors", href: "/about/mentors", art: "find-mentor" },
  { label: "Sumali sa chapter", sub: "Chapters near you", href: "/chapters", art: "join-chapter" },
];

const BENEFITS: { title: string; text: string; status: Status; href: string; icon: React.ReactNode }[] = [
  { title: "Free membership & digital ID", text: "Sign up with Google or email and get a FLAME PH member ID with a QR verification page.", status: "live", href: "/join", icon: <I.IconId /> },
  { title: "Ka-FLAME AI business assistant", text: "Ask start, grow and scale questions in Taglish. It's an AI guide, not a lawyer or accountant.", status: "beta", href: "/bizconsult-ai", icon: <I.IconChat /> },
  { title: "Free business directory listing", text: "Your own mini website with Messenger, Viber and call buttons.", status: "live", href: "/directory", icon: <I.IconStore /> },
  { title: "Resource library", text: "Guides, templates and checklists with links to official agencies.", status: "live", href: "/resources", icon: <I.IconBook /> },
  { title: "Workshops & trainings", text: "Join events as they are scheduled, or request one for your barangay or LGU.", status: "live", href: "/workshops", icon: <I.IconCalendar /> },
  { title: "Free POS for MSMEs", text: "A simple point-of-sale for small stores. Join the waitlist.", status: "soon", href: "/pos", icon: <I.IconPos /> },
];

const SCENARIOS = [
  { name: "Ana", text: "Ana wants to sell home-made ube jam. She asks Ka-FLAME AI how to price it, reads the permits checklist, and lists her shop in the directory." },
  { name: "Ben", text: "Ben runs a sari-sari store. He joins a workshop on cash flow and connects with other store owners in his chapter to buy supplies together." },
  { name: "Carla", text: "Carla is a fresh graduate with a baking idea. She follows the Start track, finds a mentor, and starts selling to neighbors first." },
  { name: "Dina", text: "Dina has a growing snack brand. She uses the listing writer to describe her products and prepares to sell more widely through MarketplacePH." },
];

export default async function Home() {
  const t = await getDict();
  const [events, posts] = await Promise.all([
    list<EventRow>({ table: "events", filters: { status: "scheduled" }, order: "starts_at", ascending: true, limit: 3 }),
    list<{ id: string; title: string; slug: string; excerpt: string | null; published_at: string | null }>({ table: "posts", order: "published_at", limit: 3 }),
  ]);
  const upcoming = events.filter((e) => new Date(e.starts_at).getTime() > Date.now());

  return (
    <>
      <section className="bg-bg-warm">
        <div className="container-x grid items-center gap-8 py-10 lg:grid-cols-[1.3fr_1fr] lg:py-16">
          <div>
            <p className="font-display text-lg font-bold text-flame-strong">BUILD Ecosystem. FUEL Leaders. EMPOWER Entrepreneurs.</p>
            <h1 className="mt-2 text-[2rem] font-extrabold leading-tight text-primary sm:text-5xl">
              {TAGLINES.notAlone}
            </h1>
            <p className="mt-4 max-w-xl text-lg text-muted">
              Join thousands of Filipino entrepreneurs building businesses together to break the chains of poverty among Filipino households and towards a first-world Philippines for the next Filipino generation.
            </p>
            <p className="mt-3 max-w-xl font-semibold">Learn. Connect. Find suppliers. Promote your business. Use business tools. Find opportunities.</p>
            <p className="mt-3 inline-block rounded-full bg-flame-soft px-3 py-1 font-display text-sm font-extrabold tracking-wide text-flame-strong">₱0 TO JOIN</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/join" className="btn btn-flame text-lg">{t.joinFree}</Link>
              <Link href="/bizconsult-ai" className="btn btn-outline text-lg">{t.tryKaflame}</Link>
            </div>
            <p className="mt-6 text-sm font-semibold text-muted">{TRUST_LINE}</p>
          </div>
          <div className="mx-auto grid w-full max-w-sm gap-5 sm:max-w-md">
            <Link href="/join" aria-label={`${t.joinFree}: FLAME PH Premium Community Member ID`} className="group block rounded-2xl">
              <Image src={premiumId} alt="FLAME PH Premium Community Member ID card" priority placeholder="blur" sizes="(min-width:640px) 448px, calc(100vw - 32px)" className="h-auto w-full rounded-2xl shadow-xl transition-transform duration-200 group-hover:-translate-y-1 group-hover:scale-[1.02]" />
            </Link>
            <HeroStats />
          </div>
        </div>
      </section>

      <div className="container-x py-5 sm:py-7">
        <FlameAdSlot slot="HOME_AFTER_HERO" />
      </div>

      <Section title={t.needPicker} intro="Piliin ang kailangan mo, at dadalhin ka namin sa tamang lugar.">
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {NEEDS.map((n) => {
            const inner = (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/illustrations/${n.art}.svg`} alt="" width={64} height={64} loading="lazy" className="h-16 w-16 transition-transform group-hover:-translate-y-0.5" />
                <span className="mt-2 block font-bold leading-snug">{n.label}</span>
                <span className="block text-sm text-muted">{n.sub}{n.external ? " ↗" : ""}</span>
              </>
            );
            return (
              <li key={n.href}>
                {n.external ? (
                  <a href={n.href} target="_blank" rel="noopener" className="group card block h-full p-4 hover:border-primary">{inner}</a>
                ) : (
                  <Link href={n.href} className="group card block h-full p-4 hover:border-primary">{inner}</Link>
                )}
              </li>
            );
          })}
        </ul>
      </Section>

      <Section className="!pt-0" title="Libreng benepisyo" intro="What free members can use today. Each one is labeled honestly: Live, Beta or Coming soon.">
        <Grid>{BENEFITS.map((b) => <FeatureCard key={b.title} {...b} />)}</Grid>
        <Link href="/membership/free-benefits" className="mt-6 inline-flex min-h-11 items-center font-semibold text-mph underline">See all free benefits →</Link>
      </Section>

      <section className="bg-bg-soft">
        <div className="container-x grid items-center gap-8 py-12 lg:grid-cols-2">
          <div>
            <p className="font-display font-bold text-flame-strong">The FLAME Principle</p>
            <h2 className="mt-1 text-2xl font-extrabold sm:text-3xl">&ldquo;{TAGLINES.principle}&rdquo;</h2>
            <p className="mt-4 text-muted">
              Small businesses often pay more for supplies, delivery, training and services because they buy alone. FLAME PH brings MSMEs together so they can learn together, share costs and open doors as a group.
            </p>
            <p className="mt-3 font-semibold">{TAGLINES.notAlone}</p>
            <Link href="/join" className="btn btn-flame mt-6 text-lg">Join for Free Today!</Link>
          </div>
          <PrincipleDiagram />
        </div>
      </section>

      <HowWeHelp />

      <Section title="Paano makakatulong ang FLAME PH?" intro="Four example scenarios showing how a member could use the platform. These are illustrations, not real members.">
        <Grid cols={4}>
          {SCENARIOS.map((s) => (
            <div key={s.name} className="card p-5">
              <span className="inline-block rounded-full bg-warn-soft px-2.5 py-0.5 text-xs font-bold uppercase text-warn">Example scenario</span>
              <h3 className="mt-3 text-lg font-bold">{s.name}</h3>
              <p className="mt-1 text-[15px] text-muted">{s.text}</p>
            </div>
          ))}
        </Grid>
      </Section>

      <StatsStrip />

      {(upcoming.length > 0 || posts.length > 0) && (
        <Section title="Pinakabago" intro="Upcoming events and news from FLAME PH.">
          <Grid>
            {upcoming.map((e) => (
              <Link key={e.id} href={e.type === "workshop" ? "/workshops" : e.type === "expo" || e.type === "summit" ? "/expos-summits" : "/trainings-webinars"} className="card block p-5 hover:border-primary">
                <p className="text-sm font-bold uppercase text-flame-strong">{e.type}</p>
                <h3 className="mt-1 text-lg font-bold">{e.title}</h3>
                <p className="mt-1 text-sm text-muted">{new Date(e.starts_at).toLocaleDateString("en-PH", { dateStyle: "long", timeZone: "Asia/Manila" })}{e.city ? ` · ${e.city}` : ""}</p>
              </Link>
            ))}
            {posts.map((p) => (
              <Link key={p.id} href={`/news/${p.slug}`} className="card block p-5 hover:border-primary">
                <p className="text-sm font-bold uppercase text-mph">News</p>
                <h3 className="mt-1 text-lg font-bold">{p.title}</h3>
                {p.excerpt && <p className="mt-1 text-sm text-muted">{p.excerpt}</p>}
              </Link>
            ))}
          </Grid>
        </Section>
      )}

      <Section title="Meet the founders" intro="FLAME PH was founded by practicing Filipino entrepreneurs.">
        <Grid cols={4}>
          {FOUNDERS.map((f) => (
            <Link key={f.name} href="/about/founders" className="card flex items-center gap-4 p-4 hover:border-primary">
              <Initials name={f.name} size={56} />
              <span><span className="block font-bold leading-snug">{f.name}</span><span className="block text-sm text-muted">{f.title}</span></span>
            </Link>
          ))}
        </Grid>
      </Section>

      <section aria-labelledby="together-h" className="bg-gradient-to-br from-primary via-[#0047b3] to-[#0a2f6b] text-white">
        <div className="container-x py-16 text-center sm:py-20">
          <p className="font-display text-sm font-bold uppercase tracking-wider text-gold">Growing Filipino MSMEs together</p>
          <h2 id="together-h" className="mx-auto mt-3 max-w-5xl text-3xl font-extrabold leading-tight sm:text-5xl lg:text-6xl">
            Hindi mo kailangang mag-isa. Sumama na sa pinakamalaking komunidad ng negosyanteng Pilipino.
          </h2>
          <p className="mx-auto mt-6 max-w-3xl text-lg leading-relaxed text-white/90">
            Thousands of sari-sari owners, food manufacturers, creators, and enterprise builders are already collaborating inside FLAME PH to negotiate better, learn faster, and grow sustainably.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/join" className="btn rounded-full bg-[#c00a0a] px-7 text-lg text-white shadow-lg hover:bg-[#a30808]">Join FLAME PH Free →</Link>
            <Link href="/membership/more-benefits" className="btn rounded-full bg-white/15 px-7 text-lg text-white hover:bg-white/25">Get More MSME Benefits</Link>
          </div>
          <p className="mt-6 text-sm font-semibold text-white/75">No credit card required • 100% Filipino-Owned Ecosystem • Instant Digital Member Pass</p>
        </div>
      </section>
    </>
  );
}
