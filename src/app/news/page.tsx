import Link from "next/link";
import { PageHero, Section, EmptyState } from "@/components/ui";
import { list, mediaUrl } from "@/lib/content";
import { meta } from "@/lib/meta";

export const metadata = meta("News & Updates", "News and updates from FLAME PH.", "/news");

type Post = { id: string; title: string; slug: string; excerpt: string | null; cover_path: string | null; published_at: string | null };

export default async function Page() {
  const posts = await list<Post>({ table: "posts", select: "id,title,slug,excerpt,cover_path,published_at", order: "published_at" });
  return (
    <>
      <PageHero status="live" fil="Balita" title="News & Updates" path="/news" intro="What FLAME PH is working on." />
      <Section>
        {posts.length === 0 ? (
          <EmptyState title="Wala pang balita." text="Our first update is coming. Subscribe to the MSME Bulletin at the bottom of this page so you don't miss it." />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((p) => (
              <li key={p.id}>
                <Link href={`/news/${p.slug}`} className="card block h-full overflow-hidden hover:border-primary">
                  {p.cover_path && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={mediaUrl(p.cover_path)!} alt="" loading="lazy" className="aspect-video w-full object-cover" />
                  )}
                  <div className="p-5">
                    {p.published_at && <p className="text-sm text-muted">{new Date(p.published_at).toLocaleDateString("en-PH", { dateStyle: "long" })}</p>}
                    <h2 className="mt-1 text-lg font-bold">{p.title}</h2>
                    {p.excerpt && <p className="mt-1 text-[15px] text-muted">{p.excerpt}</p>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
