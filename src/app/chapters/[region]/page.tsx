import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHero, Section, EmptyState } from "@/components/ui";
import { EventList } from "@/components/EventList";
import { JoinLeave } from "@/components/people/JoinLeave";
import { list, type EventRow } from "@/lib/content";
import { meta } from "@/lib/meta";
import { getSession } from "@/lib/auth";
import { groupDirectory } from "@/lib/groups-data";
import { chapterGroupSlug } from "@/lib/groups";
import { FOCUS_REGIONS, regionBySlug, provincesOf, inRegion } from "@/lib/regions";

type Chapter = { id: string; name: string; slug: string | null; region: string | null; province: string | null; city: string | null; leader_name: string | null; description: string | null; contact_url: string | null; status: string };

export async function generateMetadata({ params }: { params: Promise<{ region: string }> }) {
  const r = regionBySlug((await params).region);
  return r ? meta(`FLAME PH Chapters and Events in ${r.name}`, `FLAME PH chapters, business events and workshops in ${r.long}.`, `/chapters/${r.slug}`) : {};
}

const STATUS: Record<string, string> = { active: "Active", forming: "Forming", inactive: "Inactive" };

/** One region's chapters and events (NCR, Calabarzon, Central Luzon). Same data and admin editing as /chapters and the events pages. */
export default async function RegionPage({ params }: { params: Promise<{ region: string }> }) {
  const r = regionBySlug((await params).region);
  if (!r) notFound();
  const back = `/chapters/${r.slug}`;
  const [allChapters, allEvents, session] = await Promise.all([
    list<Chapter>({ table: "chapters", order: "name", ascending: true, limit: 500 }),
    list<EventRow>({ table: "events", order: "starts_at", ascending: true, limit: 500 }),
    getSession(),
  ]);
  const chapters = allChapters.filter((c) => c.status !== "inactive" && inRegion(c, r));
  const ids = new Set(chapters.map((c) => c.id));
  const events = allEvents.filter((e) => (e.chapter_id && ids.has(e.chapter_id)) || inRegion(e, r));
  const now = Date.now();
  const upcoming = events.filter((e) => e.status === "scheduled" && new Date(e.starts_at).getTime() >= now - 86400000);
  const past = events.filter((e) => e.status === "completed").reverse().slice(0, 6);
  const provinces = provincesOf(r);

  // Members can join a chapter's group from here (chapter groups are open to all members).
  const member = session.user && session.supabase ? session : null;
  const dir = member ? await groupDirectory(member.supabase!, member.user!.id) : null;
  const { data: me } = member ? await member.supabase!.from("profiles").select("chapter_id").eq("id", member.user!.id).maybeSingle() : { data: null };
  const groupOf = (c: Chapter) => dir?.groups.find((g) => g.kind === "chapter" && g.chapter_id === c.id) ?? null;

  return (
    <>
      <PageHero status="live" fil={r.fil} title={`Chapters and events in ${r.name}`} path={back}
        intro={`FLAME PH chapters, workshops, trainings and business events in ${r.long}.`} />
      <Section>
        <nav aria-label="Regions" className="flex flex-wrap gap-2">
          {FOCUS_REGIONS.map((x) => (
            <Link key={x.slug} href={`/chapters/${x.slug}`} aria-current={x.slug === r.slug ? "page" : undefined}
              className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold ${x.slug === r.slug ? "border-primary bg-primary text-white" : "border-line bg-card hover:border-primary"}`}>{x.name}</Link>
          ))}
          <Link href="/chapters" className="inline-flex min-h-11 items-center rounded-full border border-line bg-card px-4 text-sm font-semibold hover:border-primary">All chapters</Link>
        </nav>

        <h2 className="mt-8 text-2xl font-extrabold">Chapters</h2>
        <div className="mt-4">
          {chapters.length === 0 ? (
            <EmptyState title={`No chapter in ${r.name} yet.`} text="Start one and lead your local MSME community." cta={{ href: "/get-involved/chapter-leader", label: "Become a chapter leader" }} />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {chapters.map((c) => {
                const g = groupOf(c);
                const mine = me?.chapter_id === c.id;
                const joined = g ? dir!.mine.has(g.id) : false;
                return (
                  <li key={c.id} className={`card p-5 ${mine ? "border-2 border-flame" : ""}`}>
                    <p className="text-xs font-bold uppercase text-flame-strong">{STATUS[c.status] ?? c.status}{mine && " · Your chapter"}</p>
                    <h3 className="mt-1 text-lg font-bold">{c.name}</h3>
                    <p className="text-sm text-muted">{[c.city, c.province].filter(Boolean).join(", ") || r.long}</p>
                    {c.leader_name && <p className="mt-2 text-sm">Leader: <span className="font-semibold">{c.leader_name}</span></p>}
                    {c.description && <p className="mt-2 text-[15px] text-muted">{c.description}</p>}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {dir?.available && (joined && g
                        ? <Link href={`/groups/${g.slug}`} className="btn btn-outline min-h-11 px-3 text-sm">Open chapter group</Link>
                        : <JoinLeave slug={g?.slug ?? chapterGroupSlug(c)} groupId={g?.id} member={false} name={c.name} back={back} label="Join chapter group" />)}
                      {c.contact_url && <a href={c.contact_url} target="_blank" rel="noopener" className="btn btn-outline min-h-11 px-3 text-sm">Contact chapter<span className="sr-only"> (opens in a new tab)</span></a>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {!member && <p className="mt-4 text-sm">Members can join a chapter group to get its posts in their feed. <Link href={`/login?next=${encodeURIComponent(back)}`} className="font-semibold text-mph underline">Sign in</Link> or <Link href="/join" className="font-semibold text-mph underline">join FLAME PH</Link>.</p>}
        <p className="mt-4 text-sm text-muted">Provinces: {provinces.join(", ")}. Hindi mo makita ang lugar mo? <Link className="font-semibold text-mph underline" href="/get-involved/chapter-leader">Start a chapter</Link>.</p>
      </Section>

      <Section title={`Events in ${r.name}`}>
        <EventList upcoming={upcoming} past={past} emptyCta={{ href: "/workshops#request", label: "Request a free workshop" }} />
        <p className="mt-6 text-sm text-muted">Online events for everyone are on <Link href="/trainings-webinars" className="font-semibold text-mph underline">Trainings and webinars</Link>.</p>
      </Section>
    </>
  );
}
