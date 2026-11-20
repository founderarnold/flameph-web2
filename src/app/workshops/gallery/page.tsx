import Link from "next/link";
import { PageHero, Section, EmptyState } from "@/components/ui";
import { Faq } from "@/components/Faq";
import { eventsByType, mediaUrl } from "@/lib/content";
import { youtubeId } from "@/lib/post-media";
import { meta } from "@/lib/meta";

export const metadata = meta("Workshop Gallery", "Photos and videos from FLAME PH entrepreneurship workshops held with LGUs, national government agencies and partner institutions.", "/workshops/gallery");

const FAQ_PARTICIPANTS = [
  { q: "Who can attend?", a: "Anyone who wants to start or grow a small business: aspiring entrepreneurs, sari-sari store owners, home-based sellers, farmers, OFW families, students and existing MSMEs." },
  { q: "How much does it cost?", a: "Sugpuin ang Kahirapan Through Entrepreneurship workshops are free. Some partner-hosted trainings may ask for a small fee for materials or food; this is always announced before you register." },
  { q: "What will I learn?", a: "Practical lessons on starting small, budgeting, pricing, selling and managing a business, plus simple AI and digital tools for marketing and planning." },
  { q: "Do I need a laptop?", a: "No. A notebook is enough. A phone helps for the AI tools part, but it is not required." },
];

const FAQ_SPEAKERS = [
  { q: "Who can be a speaker or facilitator?", a: "Seasoned entrepreneurs and professional experts from any industry: food, retail, agriculture, finance, legal, marketing, IT and more." },
  { q: "Is it paid?", a: "Most speaking slots are volunteer. FLAME PH covers coordination, and LGU or partner hosts often provide meals. Any allowance is agreed before the event." },
  { q: "How long is a talk?", a: "Usually 30 to 60 minutes, followed by questions. We share the program and audience profile ahead of time." },
  { q: "Can I promote my business?", a: "You may introduce your business briefly. The talk itself should teach, not sell." },
];

const FAQ_VENUES = [
  { q: "What does an LGU or partner venue provide?", a: "A venue with chairs (a session hall, gym, barangay hall or training room), help inviting participants, and ideally a projector or TV and sound system." },
  { q: "What does FLAME PH provide?", a: "Speakers, the workshop program, materials, attendance records and photos, and follow-up through a local FLAME PH chapter." },
  { q: "How far ahead should we request?", a: "At least 3 weeks before your preferred date, so we can line up speakers and materials." },
  { q: "Can we choose the topics?", a: "Yes. Tell us what your community needs. We match topics and speakers to your participants." },
];

export default async function Page() {
  const { past } = await eventsByType(["workshop", "training"]);
  const videos = past.flatMap((e) => { const id = youtubeId(e.online_url); return id ? [{ id, title: e.title }] : []; });
  return (
    <>
      <PageHero status="live" fil="Mga larawan at video ng aming mga workshop" title="Workshop Gallery" path="/workshops/gallery"
        intro="Real photos and videos from Sugpuin ang Kahirapan Through Entrepreneurship workshops and AI Tools for Business trainings, held in cooperation with LGUs, national government agencies (NGAs) and partner institutions.">
        <Link href="/workshops/join" className="btn btn-flame rounded-full">Join as participant, speaker or venue</Link>
        <Link href="/workshops/request" className="btn btn-outline rounded-full">Request a workshop in your area</Link>
      </PageHero>

      <Section title="Photo gallery" intro="Each workshop below shows only real photos taken on the day, with the partner LGUs, agencies and institutions who made it possible.">
        {past.length === 0 ? (
          <EmptyState title="Photos from our past workshops are being added." text="Check back soon, or request a workshop for your own community." cta={{ href: "/workshops/request", label: "Request a workshop" }} />
        ) : (
          <div className="space-y-6">
            {past.map((e) => (
              <article key={e.id} className="card overflow-hidden p-4 sm:p-5">
                <h3 className="text-xl font-extrabold text-primary">{e.title}</h3>
                <p className="mt-1 text-sm text-muted">
                  {new Date(e.starts_at).toLocaleDateString("en-PH", { dateStyle: "long", timeZone: "Asia/Manila" })}
                  {[e.venue, e.city, e.province].filter(Boolean).length > 0 && ` · ${[e.venue, e.city, e.province].filter(Boolean).join(", ")}`}
                  {e.attendance_actual != null && ` · ${e.attendance_actual} participants`}
                </p>
                {e.description && <p className="mt-3 whitespace-pre-line text-[15px] leading-6">{e.description}</p>}
                {e.photos?.length > 0 && (
                  <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                    {e.photos.map((p, i) => (
                      <li key={p}>
                        <a href={mediaUrl(p)!} target="_blank" rel="noopener" className="block overflow-hidden rounded-xl">
                          {/* Real photos uploaded by admins only. */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={mediaUrl(p)!} alt={`Photo ${i + 1} from ${e.title}`} loading="lazy" className="aspect-[4/3] w-full object-cover transition-transform hover:scale-105" />
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>
        )}
      </Section>

      <Section title="Workshop videos" intro="Watch talks and highlights from our entrepreneurship workshops.">
        {videos.length === 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="grid min-h-44 w-full min-w-0 place-items-center rounded-2xl border border-dashed border-line bg-bg-soft p-4 text-center sm:aspect-video">
                <span>
                  <span aria-hidden className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#e20b24] text-2xl text-white">▶</span>
                  <span className="mt-3 block font-bold">Workshop video coming soon</span>
                  <span className="mt-1 block text-sm text-muted">Videos from our workshops will appear here.</span>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {videos.map((v) => (
              <figure key={v.id}>
                <div className="aspect-video overflow-hidden rounded-2xl bg-black">
                  <iframe src={`https://www.youtube-nocookie.com/embed/${v.id}`} title={v.title} loading="lazy" className="size-full"
                    allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
                </div>
                <figcaption className="mt-2 font-semibold">{v.title}</figcaption>
              </figure>
            ))}
          </div>
        )}
      </Section>

      <Section title="In cooperation with our partners" intro="Our workshops happen because LGUs, national government agencies (NGAs), schools, cooperatives, NGOs and companies open their venues and invite their communities. Want to bring a workshop to your area?">
        <div className="flex flex-wrap gap-3">
          <Link href="/workshops/request" className="btn btn-flame rounded-full">Request a workshop</Link>
          <Link href="/workshops/join" className="btn btn-outline rounded-full">Volunteer as speaker or mentor</Link>
        </div>
      </Section>

      <Section title="Frequently asked questions">
        <div className="grid gap-8 lg:grid-cols-3">
          <Faq title="For participants" items={FAQ_PARTICIPANTS} />
          <Faq title="For speakers and facilitators" items={FAQ_SPEAKERS} />
          <Faq title="For LGU and venue partners" items={FAQ_VENUES} />
        </div>
      </Section>
    </>
  );
}
