import Link from "next/link";
import { POINTS } from "@/lib/growth";
import { SectionLink } from "@/components/listing/ListingSections";
import type { SectionKey } from "@/lib/listing-sections";

// Points reminders and the "Level up" journey on My business listing (owner, 25 Nov 2026). Every reward is a growth
// milestone worth POINTS.milestone, saved once, and shown on the member's flameph.org Rewards.

type Row = { key: string; label: string; earned: boolean };
const P = POINTS.milestone;

function Rewards({ rows }: { rows: Row[] }) {
  return (
    <ul className="mt-2 space-y-1.5 text-sm">
      {rows.map((r) => (
        <li key={r.key} className="flex gap-2">
          <span aria-hidden className={r.earned ? "font-bold text-ok" : "text-flame-strong"}>{r.earned ? "✓" : "＋"}</span>
          <span className={r.earned ? "text-muted" : ""}>{r.label} <strong className={r.earned ? "text-ok" : "text-flame-strong"}>{r.earned ? `· ${P} earned` : `· +${P}`}</strong></span>
        </li>
      ))}
    </ul>
  );
}

/** Top of the page: points for the 6 steps and for publishing. Collapsible, so phones see the steps quickly. */
export function ListingPoints({ rewards }: { rewards: Row[] }) {
  const earned = rewards.filter((r) => r.earned).length * P;
  const total = rewards.length * P;
  const done = earned === total;
  return (
    <details className="group mt-5 rounded-2xl border border-gold/50 bg-bg-warm p-4 sm:p-5">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block text-lg font-extrabold">{done ? "⭐ Your listing earned all its points" : `⭐ Earn up to ${total} points for your listing`}</span>
          <span className="mt-1 block text-sm text-muted">{earned} of {total} points earned. A complete listing with your logo and photos looks more trustworthy, is easier to find and gets more leads.</span>
        </span>
        <span aria-hidden className="mt-1 text-sm font-bold text-primary group-open:hidden">Show</span>
        <span aria-hidden className="mt-1 hidden text-sm font-bold text-primary group-open:inline">Hide</span>
      </summary>
      <Rewards rows={rewards} />
      <p className="mt-2 text-sm"><Link href="/account/rewards" className="font-bold text-primary underline">See my points and rewards</Link></p>
    </details>
  );
}

/**
 * After the 6 steps: more ways to grow online, each with points. The mini-website becomes the member's landing page and
 * sales funnel link; the MarketplacePH store lets buyers order.
 */
export function LevelUp({ query, current, published, rewards, store }: { query: string; current: SectionKey; published: boolean; rewards: Row[]; store: Row[] }) {
  const pts = (rows: Row[], keys: string[]) => rows.filter((r) => keys.includes(r.key));
  const left = (rows: Row[]) => rows.filter((r) => !r.earned).length * P;
  const cards: { key: SectionKey; title: string; text: string; rows: Row[] }[] = [
    { key: "website", title: "Your mini-website: a landing page that sells", text: "A free one-page website with its own link. Put it in your Facebook bio, ads and chats as your sales funnel: visitors see your offer and send inquiries straight to you.", rows: pts(rewards, ["storefront:website"]) },
    { key: "marketplace", title: "Your MarketplacePH store", text: "Let buyers order online. Each finished part of your store adds points to your FLAME PH account, with extra points at more than 5 and more than 10 products or services.", rows: store },
    { key: "details", title: "More details", text: "Your specific industry and chapter help the right members and buyers find you.", rows: pts(rewards, ["storefront:directory"]) },
  ];
  return (
    <section aria-labelledby="levelup-h" className="mt-8 rounded-2xl border-2 border-primary/20 bg-primary-soft/40 p-4 sm:p-5">
      <h2 id="levelup-h" className="text-xl font-extrabold text-primary">🚀 Level up your online presence</h2>
      <p className="mt-1 text-sm text-muted">{published ? "Your listing is live. Keep promoting your business, services and products: each of these earns more points and brings more leads." : "Next, after your 6 steps: each of these earns more points and brings more leads."}</p>
      <ul className="mt-3 grid gap-3">
        {cards.map((c) => (
          <li key={c.key}>
            <SectionLink to={c.key} query={query} className={`block rounded-xl border bg-card p-4 hover:border-primary ${current === c.key ? "border-primary" : "border-line"}`}>
              <span className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-bold">{c.title}</span>
                <span className="text-sm font-bold text-flame-strong">{left(c.rows) ? `+${left(c.rows)} points` : "✓ points earned"}</span>
              </span>
              <span className="mt-1 block text-sm text-muted">{c.text}</span>
              <span className="mt-2 block text-sm font-bold text-primary">{current === c.key ? "You're here ↑" : "Open →"}</span>
            </SectionLink>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** MarketplacePH store points: what each part earns and what is done (read when the member presses Sync). */
export function StorePoints({ rewards, listingCount, linked, storeName, compact }: { rewards: Row[]; listingCount: number; linked?: boolean; storeName?: string | null; compact?: boolean }) {
  const earned = rewards.filter((r) => r.earned).length * P;
  return (
    <section aria-labelledby="store-pts-h" className="card mt-4 p-4 sm:p-5">
      <h2 id="store-pts-h" className="text-lg font-bold">{compact ? "Your MarketplacePH store points" : "Your MarketplacePH store"}</h2>
      <p className="mt-1 text-sm text-muted">
        {storeName ? <>Store: <strong>{storeName}</strong> · {listingCount} product{listingCount === 1 ? "" : "s"} or service{listingCount === 1 ? "" : "s"} · </> : null}
        {earned} of {rewards.length * P} points earned. Points are added to your FLAME PH account when you press Sync on step 6, and show on your Rewards for more credibility.
      </p>
      <Rewards rows={rewards} />
      {!compact && (
        <div className="mt-3 flex flex-wrap gap-2">
          <a href={storeName ? "https://www.marketplaceph.com/business" : "https://www.marketplaceph.com/sell/new"} target="_blank" rel="noopener" className="btn btn-primary min-h-11">{storeName ? "Add products on MarketplacePH ↗" : "Open my free store ↗"}</a>
          <SectionLink to="hours" className="btn btn-outline min-h-11">Sync on step 6</SectionLink>
        </div>
      )}
      {!compact && !linked && <p className="mt-2 text-sm text-muted">Sign in to marketplaceph.com with your FLAME PH account (the same email), open your store, then come back and press Sync.</p>}
    </section>
  );
}

/** Tips for using the mini-website as a landing page and sales funnel. */
export function WebsiteTips() {
  return (
    <section aria-labelledby="site-tips-h" className="card mt-4 p-4 sm:p-5">
      <h2 id="site-tips-h" className="text-lg font-bold">Make your mini-website your sales funnel</h2>
      <p className="mt-1 text-sm text-muted">Your mini-website has its own link (flameph.org/business/your-name). Use it as the one link you share everywhere. Publishing it earns +{P} points.</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        <li>Put the link in your Facebook page bio, TikTok and Instagram profile, and Viber or WhatsApp status.</li>
        <li>Use it as the button link in your Facebook or Google ads, so every click lands on your offer.</li>
        <li>Show one clear offer at the top (for example a bundle or a first-order discount) with your logo and real photos.</li>
        <li>Inquiries from its contact form come to your Inquiries here, so you can follow up fast.</li>
      </ul>
    </section>
  );
}
