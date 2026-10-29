import { HERO_POSITION, heroSceneForPath } from "@/lib/hero-pages";

export function HeroArtwork({ path }: { path: string }) {
  const scene = heroSceneForPath(path);
  if (!scene) return null;
  return (
    <div className="mx-auto w-full max-w-[430px] lg:mx-0 lg:justify-self-end">
      <div
        role="img"
        aria-label={scene.alt}
        className="aspect-square w-full rounded-[2rem] border border-white/70 bg-cover bg-no-repeat shadow-[0_24px_70px_-28px_rgba(0,53,130,0.38)]"
        style={{ backgroundImage: `url(/hero-scenes/hero-scenes-${scene.sheet}.webp)`, backgroundPosition: HERO_POSITION[scene.quadrant], backgroundSize: "200% 200%" }}
      />
    </div>
  );
}
