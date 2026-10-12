import { Initials } from "./ui";
import { mediaUrl } from "@/lib/content";

export function PersonCard({ name, title, bio, photo, links }: { name: string; title?: string | null; bio?: string | null; photo?: string | null; links?: { label: string; url: string | null }[] }) {
  const src = mediaUrl(photo);
  return (
    <article className="card p-5">
      <div className="flex items-center gap-4">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={name} loading="lazy" className="h-20 w-20 shrink-0 rounded-full object-cover" />
        ) : <Initials name={name} size={80} />}
        <div>
          <h3 className="text-lg font-extrabold leading-snug">{name}</h3>
          {title && <p className="text-[15px] font-semibold text-primary">{title}</p>}
        </div>
      </div>
      {bio && <p className="mt-4 text-[15px] text-muted">{bio}</p>}
      {links && links.some((l) => l.url) && (
        <p className="mt-3 flex gap-3">{links.filter((l) => l.url).map((l) => <a key={l.label} href={l.url!} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center font-semibold text-mph underline">{l.label}</a>)}</p>
      )}
    </article>
  );
}
