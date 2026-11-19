import { heroSceneForPath } from "@/lib/hero-pages";

/**
 * The picture at the top of a page. Phase 11: each picture is its own small file (public/hero-scenes/q, about 54 KB)
 * cut from the 2x2 sheets (about 250 KB, of which a page showed only a quarter), and the browser is told to fetch it
 * first, because it is usually the largest thing on screen (Largest Contentful Paint).
 */
export function HeroArtwork({ path }: { path: string }) {
  const scene = heroSceneForPath(path);
  if (!scene) return null;
  return (
    <div className="mx-auto w-full max-w-[430px] lg:mx-0 lg:justify-self-end">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/hero-scenes/q/${scene.sheet}-${scene.quadrant}.webp`}
        alt={scene.alt}
        width={600}
        height={600}
        fetchPriority="high"
        decoding="async"
        className="aspect-square w-full rounded-[2rem] border border-white/70 object-cover shadow-[0_24px_70px_-28px_rgba(0,53,130,0.38)]"
      />
    </div>
  );
}
