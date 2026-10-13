import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { TAGLINES } from "@/lib/site";
import save from "@/assets/help/save-together.webp";
import connect from "@/assets/help/connect.webp";
import learn from "@/assets/help/learn.webp";
import visibility from "@/assets/help/visibility.webp";

type Card = { title: string; body: string; quote: string; cta: string; href: string; img: StaticImageData; alt: string };

const CARDS: Card[] = [
  {
    title: "Save together",
    body: "Find group-buying opportunities, member deals, shared services, and negotiated partner offers.",
    quote: "Mahal ang supplies kapag solo—kaya naghahanap ako ng kasama para mas tipid.",
    cta: "Explore member benefits",
    href: "/membership/free-benefits",
    img: save,
    alt: "Save together: Mas tipid kapag may kasama. Small business owners pooling coins into a piggy bank beside supply boxes.",
  },
  {
    title: "Connect with the right people",
    body: "Meet Filipino entrepreneurs, suppliers, professionals, mentors, chapters, and potential business partners.",
    quote: "Hindi ko alam kung sino ang mapagkakatiwalaan—one right connection can change everything.",
    cta: "Browse the directory",
    href: "/directory",
    img: connect,
    alt: "Connect with the right people: Buy, refer, supply, support, grow. A supplier hands a box to a store owner while others talk business.",
  },
  {
    title: "Learn and operate better",
    body: "Access practical learning resources, business templates, consultations, POS tools, and AI-assisted guidance.",
    quote: "Busy ako sa araw-araw na operations, pero kailangan ko ring matutong magplano at mag-track.",
    cta: "Explore the Learning Hub",
    href: "/resources",
    img: learn,
    alt: "Learn and operate better: Practical learning, real next steps. A mentor guides an entrepreneur on a laptop next to a plan, source, market, manage, grow checklist.",
  },
  {
    title: "Grow your visibility",
    body: "Create a business profile, appear in the member directory, promote your products or services, join events, and discover market opportunities.",
    quote: "Maganda ang produkto ko, pero paano ako mapapansin ng mas maraming customers?",
    cta: "Join the directory",
    href: "/account/business",
    img: visibility,
    alt: "Grow your visibility: Start local. Grow together. Scale global. A store owner shows her products with social media and online shop icons around her.",
  },
];

export function HowWeHelp() {
  return (
    <section aria-labelledby="help-h" className="container-x py-12 lg:py-16">
      <div className="mx-auto max-w-2xl text-center">
        <p className="inline-block rounded-full bg-primary-soft px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-primary">How FLAME PH helps</p>
        <h2 id="help-h" className="mt-4 text-2xl font-extrabold sm:text-4xl">How will FLAME PH help my business today?</h2>
        <p className="mt-3 text-muted">Whether you are starting, selling, or growing, FLAME PH helps you save, connect, learn, and become more visible.</p>
        <p className="mt-4 inline-block rounded-full bg-primary-soft px-4 py-1.5 text-xs font-semibold text-primary">💡 The FLAME Principle: {TAGLINES.principle}</p>
      </div>
      <ul className="mt-10 grid gap-6 md:grid-cols-2">
        {CARDS.map((c) => (
          <li key={c.title}>
            <Link href={c.href} className="group flex h-full flex-col rounded-2xl border border-line bg-primary-soft/40 p-4 transition-shadow hover:shadow-lg focus-visible:shadow-lg">
              <div className="overflow-hidden rounded-xl bg-white p-2 shadow-sm">
                <Image src={c.img} alt={c.alt} placeholder="blur" sizes="(min-width:768px) 560px, calc(100vw - 64px)" className="h-auto w-full rounded-lg transition-transform duration-300 group-hover:scale-[1.02]" />
              </div>
              <h3 className="mt-4 text-lg font-bold">{c.title}</h3>
              <p className="mt-1 text-[15px] text-muted">{c.body}</p>
              <p className="mt-3 text-[15px] italic text-primary">&ldquo;{c.quote}&rdquo;</p>
              <span className="mt-auto pt-4 text-sm font-bold text-primary group-hover:underline">{c.cta} →</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
