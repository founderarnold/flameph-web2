import { PageHero, Section, EmptyState } from "@/components/ui";
import { PersonCard } from "@/components/PersonCard";
import { list } from "@/lib/content";
import { meta } from "@/lib/meta";

export const metadata = meta("Featured Mentors", "Volunteer mentors who help FLAME PH members.", "/about/mentors");

type M = { id: string; name: string; expertise: string | null; bio: string | null; city: string | null; photo_path: string | null; profile_url: string | null };

export default async function Page() {
  const rows = await list<M>({ table: "mentors", order: "created_at", ascending: true });
  return (
    <>
      <PageHero status="live" fil="Mga mentor" title="Featured Mentors" path="/about/mentors" intro="Volunteer mentors who agreed to be listed. Members can ask to be matched with one." />
      <Section>
        {rows.length === 0 ? <EmptyState title="Our mentor network is being formed." text="Have business experience to share? Volunteer as a mentor." cta={{ href: "/get-involved/mentor", label: "Volunteer as mentor" }} /> : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((m) => <PersonCard key={m.id} name={m.name} title={[m.expertise, m.city].filter(Boolean).join(" · ")} bio={m.bio} photo={m.photo_path} links={[{ label: "Profile", url: m.profile_url }]} />)}
          </div>
        )}
      </Section>
    </>
  );
}
