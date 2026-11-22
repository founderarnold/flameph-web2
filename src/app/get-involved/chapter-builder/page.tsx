import Link from "next/link";
import { PageHero, Section } from "@/components/ui";
import { SubmissionForm } from "@/components/SubmissionForm";
import { Faq } from "@/components/Faq";
import { FORMS } from "@/lib/forms";
import { meta } from "@/lib/meta";
import { getSession } from "@/lib/auth";
import { CHAPTER_BUILDER_AGREEMENT } from "@/lib/policy";

export const metadata = meta("Build a Chapter or Host Meetups", "Volunteer as a FLAME PH chapter builder in your city or town, or offer your place as a meetup venue for MSMEs.", "/get-involved/chapter-builder");

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

const FAQ = [
  { q: "What is a FLAME PH chapter?", a: "A local group of entrepreneurs and supporters in one city or town. Members meet, learn together, buy supplies together and refer customers to each other, with tools and support from FLAME PH." },
  { q: "Do I need to own a big business to be a chapter builder?", a: "No. Small business owners, professionals, cooperative leaders, teachers and community organizers can all apply. What matters is that you care about local MSMEs and can gather a small core group." },
  { q: "How much time does it take?", a: "You decide. Most chapter builders start with one meetup a month and a few hours of messaging and planning. You can stop anytime by telling us." },
  { q: "Is it paid?", a: "Chapter building is volunteer work. FLAME PH gives you training, materials, speakers for workshops and a chapter page on the website. There is no fee to become a chapter builder." },
  { q: "What happens after I apply?", a: "Our team contacts you for a short call, helps you form a core group of at least 5 people, and helps you plan your first meetup." },
  { q: "What does a meetup venue need?", a: "A safe, clean space where 10 or more people can sit and talk, ideally with a table and an outlet. A TV or projector and Wi-Fi help but are not required." },
  { q: "Will I be charged anything as a venue? Will I be paid?", a: "No one charges you. You choose whether the space is free, free if participants buy food or drinks, or available for a small fee to cover costs. Any fee is agreed before the meetup." },
  { q: "Who is responsible for the meetup?", a: "The chapter builder runs the meetup and follows the FLAME PH code of conduct. The venue owner only provides the space and agrees on the rules of the place." },
  { q: "Can overseas Filipinos build a chapter?", a: "Yes. Filipino communities abroad can apply. Write your city and country in the City and Province fields." },
];

const BACK = "/get-involved/chapter-builder#builder";

/** Visitors see what a Chapter Builder does, then sign up or log in. The form itself is for signed-in members only. */
function SignInFirst() {
  const next = encodeURIComponent(BACK);
  return (
    <section aria-labelledby="builder-signin" className="card space-y-4 border-2 border-flame p-5 sm:p-6">
      <h2 id="builder-signin" className="text-xl font-extrabold">Volunteer as Chapter Builder in Your City/Town</h2>
      <p className="text-[15px] leading-6"><strong>The Chapter Builder form is for FLAME PH members.</strong> Sign up for free or log in, and this form opens for you right here.</p>
      <p className="text-sm text-muted" lang="fil">Mag-sign up nang libre o mag-log in para mabuksan ang form.</p>
      <p className="text-sm text-muted">Chapter Builders accept the <Link href={CHAPTER_BUILDER_AGREEMENT.href} className="font-semibold text-primary underline">{CHAPTER_BUILDER_AGREEMENT.title}</Link>. You can read it now.</p>
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
      <PageHero status="live" fil="Itayo ang chapter sa inyong lugar" title="Build a Chapter or Host Meetups" path="/get-involved/chapter-builder"
        intro="Help us build a FLAME PH chapter in every city and municipality, here and abroad. Volunteer as a chapter builder, offer your place as a meetup venue, or both.">
        <a href="#builder" className="btn btn-flame rounded-full">Chapter Builder form ↓</a>
        {/* The Chapter Builder form needs sign-in; the Meetup Venue form stays open to everyone. */}
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
        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          <div id="builder" className="scroll-mt-24">{user ? <SubmissionForm def={FORMS["chapter-builder"]} /> : <SignInFirst />}</div>
          <div id="venue" className="scroll-mt-24"><SubmissionForm def={FORMS["meetup-venue"]} title="Volunteer as Meetup Venue for MSMEs" /></div>
        </div>
        <div className="mt-12 max-w-3xl"><Faq items={FAQ} /></div>
        <p className="mt-6 text-sm text-muted">Want to see existing chapters first? <Link href="/chapters" className="font-semibold text-primary underline">Find a chapter near you</Link>.</p>
      </Section>
    </>
  );
}
