import { PageHero, Section } from "@/components/ui";
import { PersonCard } from "@/components/PersonCard";
import { getFounders } from "@/lib/founders";
import { meta } from "@/lib/meta";

export const metadata = meta("Meet the Founders", "The founders and leaders of FLAME PH.", "/about/founders");

export default async function Page() {
  const founders = await getFounders();
  return (
    <>
      <PageHero status="live" fil="Ang mga nagtatag" title="Meet the Founders" path="/about/founders" intro="FLAME PH was founded by practicing Filipino entrepreneurs." />
      <Section>
        <div className="grid gap-4 lg:grid-cols-2">
          {founders.map((f) => <PersonCard key={f.name} name={f.name} title={f.title} bio={f.bio} photo={f.photo_path} links={[{ label: "LinkedIn", url: f.linkedin_url ?? null }, { label: "Facebook", url: f.facebook_url ?? null }]} />)}
        </div>
      </Section>
    </>
  );
}
