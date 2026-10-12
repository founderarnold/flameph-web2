import { PageHero, Section, EmptyState } from "@/components/ui";
import { SubmissionForm } from "@/components/SubmissionForm";
import { FORMS } from "@/lib/forms";
import { list } from "@/lib/content";
import { meta } from "@/lib/meta";

export const metadata = meta("FLAME PH NegosyoTalks", "Talks and conversations with Filipino entrepreneurs about starting and growing a business.", "/negosyo-talks");

type Episode = { id: string; title: string; description: string | null; guest: string | null; video_url: string | null; aired_on: string | null };

function embedUrl(url: string | null) {
  if (!url) return null;
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  if (url.includes("facebook.com")) return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false`;
  return null;
}

export default async function Page() {
  const eps = await list<Episode>({ table: "episodes", order: "aired_on" });
  return (
    <>
      <PageHero status={eps.length ? "live" : "soon"} fil="Kwentuhan tungkol sa negosyo" title="FLAME PH NegosyoTalks" path="/negosyo-talks"
        intro="Real conversations with Filipino entrepreneurs, mentors and experts. Episodes appear here as they are released." />
      <Section title="Episodes">
        {eps.length === 0 ? (
          <EmptyState title="Wala pang episode." text="Suggest a topic or volunteer to be a guest below." />
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {eps.map((e) => {
              const src = embedUrl(e.video_url);
              return (
                <article key={e.id} className="card overflow-hidden">
                  {src && <iframe src={src} title={e.title} loading="lazy" allowFullScreen className="aspect-video w-full" />}
                  <div className="p-5">
                    <h3 className="text-lg font-bold">{e.title}</h3>
                    {e.guest && <p className="text-sm font-semibold text-muted">with {e.guest}</p>}
                    {e.description && <p className="mt-2 text-muted">{e.description}</p>}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Section>
      <Section><div className="max-w-xl"><SubmissionForm def={FORMS["talk-topic"]} /></div></Section>
    </>
  );
}
