import { EmptyState } from "./ui";
import { mediaUrl } from "@/lib/content";

export type Product = { id: string; name: string; description: string | null; price_php: number | null; photo_path: string | null; maker: string | null };

export function ProductGrid({ items, empty, messenger }: { items: Product[]; empty: { title: string; text: string; cta?: { href: string; label: string } }; messenger?: string | null }) {
  if (items.length === 0) return <EmptyState {...empty} />;
  return (
    <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {items.map((p) => (
        <li key={p.id} className="card overflow-hidden">
          {p.photo_path ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl(p.photo_path)!} alt={p.name} loading="lazy" className="aspect-square w-full object-cover" />
          ) : <div className="aspect-square bg-bg-soft" />}
          <div className="p-3">
            <h3 className="font-bold leading-snug">{p.name}</h3>
            {p.maker && <p className="text-sm text-muted">by {p.maker}</p>}
            {p.price_php != null && <p className="mt-1 font-semibold">₱{Number(p.price_php).toLocaleString("en-PH")}</p>}
            {p.description && <p className="mt-1 line-clamp-3 text-sm text-muted">{p.description}</p>}
            {messenger && <a href={`${messenger}?text=${encodeURIComponent(`Hi! I'd like to ask about: ${p.name}`)}`} target="_blank" rel="noopener" className="btn btn-outline mt-3 min-h-11 w-full px-2 text-sm">Inquire via Messenger</a>}
          </div>
        </li>
      ))}
    </ul>
  );
}
