import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PageHero, Section } from "@/components/ui";
import { Markdown } from "@/components/Markdown";
import { list, mediaUrl } from "@/lib/content";

type Post = { id: string; title: string; slug: string; excerpt: string | null; body: string | null; cover_path: string | null; cover_is_real_photo: boolean; published_at: string | null };
const get = async (slug: string) => (await list<Post>({ table: "posts", filters: { slug }, limit: 1 }))[0];

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await get((await params).slug);
  return p ? { title: p.title, description: p.excerpt ?? undefined, alternates: { canonical: `/news/${p.slug}` } } : { title: "Not found" };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const p = await get((await params).slug);
  if (!p) notFound();
  return (
    <>
      <PageHero title={p.title} intro={p.published_at ? new Date(p.published_at).toLocaleDateString("en-PH", { dateStyle: "long" }) : undefined} path={`/news/${p.slug}`} />
      <Section>
        <article className="prose-flame mx-auto max-w-2xl">
          {p.cover_path && (
            <figure>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaUrl(p.cover_path)!} alt="" className="w-full rounded-xl" />
              {!p.cover_is_real_photo && <figcaption className="mt-1 text-sm text-muted">Illustration</figcaption>}
            </figure>
          )}
          {p.body && <Markdown text={p.body} />}
        </article>
      </Section>
    </>
  );
}
