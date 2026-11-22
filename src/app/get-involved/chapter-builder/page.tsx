import Link from "next/link";
import { PageHero, Section } from "@/components/ui";
import { SubmissionForm } from "@/components/SubmissionForm";
import { Faq } from "@/components/Faq";
import { FORMS } from "@/lib/forms";
import { meta } from "@/lib/meta";
import { getSession } from "@/lib/auth";

export const metadata = meta("Build a Chapter or Host Meetups", "Volunteer as a FLAME PH chapter builder or chapter leader in your city or town, or offer your place as a meetup venue for MSMEs.", "/get-involved/chapter-builder");

const ROLES = [
  {
    id: "builder", title: "Volunteer as Chapter Builder in Your City/Town",
    text: "Gather local MSMEs, suppliers, professionals and leaders. Hold regular meetups, help organize free workshops and group orders, and connect members with opportunities. The FLAME PH team trains and supports you.",
  },
  {
    id: "venue", title: "Volunteer as Meetup Venue for MSMEs",
    text: "Offer your café, store, office, function room or barangay hall for chapter meetups and workshops. You choose the schedule. In return, your place is introduced to local entrepreneurs and their customers.",
  },
];

// Two FAQs (owner, 22 Nov 2026): one for Chapter Builders and Leaders, one for Meetup Venue volunteers, each with perks.
const BUILDER_FAQ = [
  { q: "What is a FLAME PH chapter?", a: "A local group of entrepreneurs and supporters in one city or town. Members meet, learn together, buy supplies together and refer customers to each other, with tools and support from FLAME PH." },
  { q: "What do I get as a Chapter Builder or Chapter Leader?", a: "Free training and coaching from the FLAME PH team, ready-made meetup and workshop materials, resource speakers for your workshops, and a chapter page on flameph.org with your name as builder or leader. You also get a certificate of recognition for active chapter building, a chance to be featured on the FLAME PH home page and social media, and a nomination path to the FLAME PH Annual Awards." },
  { q: "Are there perks for my own business?", a: "Yes. You meet many local MSMEs, suppliers and partners first-hand, you are the first to hear about group orders, workshops and opportunities in your area, and your own business gains visibility as the person who brought FLAME PH to your town. Your free member mini-website and directory listing help people find you." },
  { q: "Do I need to own a big business to be a chapter builder?", a: "No. Small business owners, professionals, cooperative leaders, teachers and community organizers can all apply. What matters is that you care about local MSMEs and can gather a small core group." },
  { q: "How much time does it take?", a: "You decide. Most chapter builders start with one meetup a month and a few hours of messaging and planning. You can stop anytime by telling us." },
  { q: "Is it paid?", a: "Chapter building is volunteer work. There is no salary and no fee to become a chapter builder. The perks above are how FLAME PH thanks and supports you." },
  { q: "Do I need to sign anything?", a: "Yes. Before you can send the form you accept the Chapter Builder and Meetup Venue Non-Disclosure and Non-Compete Agreement. You can read it from the form, next to the box you tick." },
  { q: "What happens after I apply?", a: "Our team contacts you for a short call, helps you form a core group of at least 5 people, and helps you plan your first meetup." },
  { q: "Can overseas Filipinos build a chapter?", a: "Yes. Filipino communities abroad can apply. Write your city and country in the City and Province fields." },
];

const VENUE_FAQ = [
  { q: "What do I get as a Meetup Venue?", a: "New customers and visibility. Every meetup brings local entrepreneurs, suppliers and their networks to your place, and many buy food, drinks or services while there. Your venue is introduced at the meetup and named in FLAME PH chapter event posts, and you get a certificate of appreciation as a FLAME PH Meetup Venue partner." },
  { q: "Are there other perks for my business?", a: "Yes. Your venue can be featured on the FLAME PH home page and social media, you hear first about workshops and group orders in your area, and you can join the workshops held at your place for free. You may also be nominated for the FLAME PH Annual Awards as a partner. Your free member mini-website and directory listing help new customers find you." },
  { q: "What does a meetup venue need?", a: "A safe, clean space where 10 or more people can sit and talk, ideally with a table and an outlet. A TV or projector and Wi-Fi help but are not required." },
  { q: "Will I be charged anything as a venue? Will I be paid?", a: "No one charges you. You choose whether the space is free, free if participants buy food or drinks, or available for a small fee to cover costs. Any fee is agreed before the meetup." },
  { q: "Who is responsible for the meetup?", a: "The chapter builder runs the meetup and follows the FLAME PH code of conduct. The venue owner only provides the space and agrees on the rules of the place." },
  { q: "How often will meetups happen at my place?", a: "You decide. Most venues host once a month. You can change the schedule or stop anytime by telling the chapter team." },
  { q: "Do I need to sign anything?", a: "Yes. Before you can send the form you accept the Chapter Builder and Meetup Venue Non-Disclosure and Non-Compete Agreement. You can read it from the form, next to the box you tick." },
];

// What a chapter builder or leader does (from the former Chapter Leader page, now part of this one page).
const LEADER = [
  { title: "Responsibilities", items: ["Gather local entrepreneurs and hold regular meetups", "Organize workshops with the FLAME PH team", "Represent the chapter and connect members with opportunities"] },
  { title: "Requirements", items: ["A practicing entrepreneur or professional in the area", "Willing to volunteer time and follow FLAME PH's code of conduct", "Able to gather an initial core group", "A FLAME PH member who accepts the Non-Disclosure and Non-Compete Agreement in the form"] },
  { title: "Steps to launch", items: ["Sign up or log in, then apply using the form below", "Talk with the FLAME PH team", "Form your core group", "Launch your chapter with a first meetup"] },
];

/** Visitors see what each role does, then sign up or log in. Both forms are for signed-in members only. */
function SignInFirst({ id, title, back }: { id: string; title: string; back: string }) {
  const next = encodeURIComponent(back);
  return (
    <section aria-labelledby={`${id}-signin`} className="card space-y-4 border-2 border-flame p-5 sm:p-6">
      <h2 id={`${id}-signin`} className="text-xl font-extrabold">{title}</h2>
      <p className="text-[15px] leading-6"><strong>This form is for FLAME PH members.</strong> Sign up for free or log in, and the form opens for you right here.</p>
      <p className="text-sm text-muted" lang="fil">Mag-sign up nang libre o mag-log in para mabuksan ang form.</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link href={`/join?next=${next}`} className="btn btn-flame w-full sm:w-auto">Sign up free</Link>
        <Link href={`/login?next=${next}`} className="btn btn-outline w-full sm:w-auto">Log in</Link>
      </div>
    </section>
  );
}

export default async function Page() {
  const { user } = await getSession();
  return (
    <>
      <PageHero status="live" fil="Itayo at pamunuan ang chapter sa inyong lugar" title="Build a Chapter or Host Meetups" path="/get-involved/chapter-builder"
        intro="Help us build a FLAME PH chapter in every city and municipality, here and abroad. Volunteer as a chapter builder or leader, offer your place as a meetup venue, or both.">
        <a href="#builder" className="btn btn-flame rounded-full">Chapter Builder form ↓</a>
        {/* Both forms need sign-in (owner, 22 Nov 2026). */}
        <a href="#venue" className="btn btn-outline rounded-full">Meetup Venue form ↓</a>
      </PageHero>
      <Section>
        <div className="grid gap-4 md:grid-cols-2">
          {ROLES.map((r) => (
            <a key={r.id} href={`#${r.id}`} className="card block p-5 hover:border-primary">
              <h2 className="text-lg font-extrabold text-primary">{r.title}</h2>
              <p className="mt-2 text-[15px] leading-6 text-muted">{r.text}</p>
            </a>
          ))}
        </div>
        <section aria-labelledby="leader-h" className="mt-10">
          <h2 id="leader-h" className="text-2xl font-extrabold">Becoming a Chapter Builder or Chapter Leader</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {LEADER.map((g) => (
              <div key={g.title} className="card p-5">
                <h3 className="font-extrabold text-primary">{g.title}</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px] leading-6 text-muted">{g.items.map((it) => <li key={it}>{it}</li>)}</ul>
              </div>
            ))}
          </div>
        </section>
        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          <div id="builder" className="scroll-mt-24">{user ? <SubmissionForm def={FORMS["chapter-builder"]} />
            : <SignInFirst id="builder" title="Volunteer as Chapter Builder in Your City/Town" back="/get-involved/chapter-builder#builder" />}</div>
          <div id="venue" className="scroll-mt-24">{user ? <SubmissionForm def={FORMS["meetup-venue"]} title="Volunteer as Meetup Venue for MSMEs" />
            : <SignInFirst id="venue" title="Volunteer as Meetup Venue for MSMEs" back="/get-involved/chapter-builder#venue" />}</div>
        </div>
        <div className="mt-12 grid gap-10 lg:grid-cols-2">
          <section id="builder-faq" aria-label="Chapter Builder questions"><Faq title="Chapter Builder and Leader: questions and perks" items={BUILDER_FAQ} /></section>
          <section id="venue-faq" aria-label="Meetup Venue questions"><Faq title="Meetup Venue: questions and perks" items={VENUE_FAQ} /></section>
        </div>
        <p className="mt-6 text-sm text-muted">Want to see existing chapters first? <Link href="/chapters" className="font-semibold text-primary underline">Find a chapter near you</Link>.</p>
      </Section>
    </>
  );
}
