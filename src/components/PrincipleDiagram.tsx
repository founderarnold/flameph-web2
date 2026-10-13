import Image from "next/image";
import Link from "next/link";
import principle from "@/assets/flame-principle.webp";

// The FLAME Principle infographic. next/image serves it as AVIF/WebP at the size each screen needs, with a blurred preview while it loads.
export function PrincipleDiagram() {
  return (
    <figure className="card overflow-hidden bg-card p-2">
      <Link href="/join" aria-label="Join FLAME PH for free" className="block transition-opacity hover:opacity-95">
        <Image
          src={principle}
          alt="The FLAME Principle. One member alone faces high costs: expensive supplies, hard marketing, expensive technology and limited connections. Thousands of FLAME PH members together share resources, buy together, refer each other, learn together, sell together and grow together. Parang GrabShare sa negosyo: kung isang tao lang ang sasagot sa gastos, mahal; kung marami ang naghahati at nagtutulungan, mas kaya."
          placeholder="blur"
          quality={70}
          sizes="(min-width: 1024px) 560px, calc(100vw - 32px)"
          className="h-auto w-full rounded-lg"
        />
      </Link>
    </figure>
  );
}
