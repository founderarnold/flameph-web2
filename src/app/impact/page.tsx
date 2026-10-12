import { PageHero, Section, Notice } from "@/components/ui";
import { StatValue } from "@/components/StatsStrip";
import { getGrowth, getProvinces, getStats, type Stats } from "@/lib/stats";
import { getSettings } from "@/lib/settings";
import { list } from "@/lib/content";
import { meta } from "@/lib/meta";

export const metadata = meta("Impact", "Live FLAME PH statistics, counted automatically from our member database.", "/impact");

const ROWS: { key: keyof Stats; label: string }[] = [
  { key: "members", label: "Registered members" },
  { key: "members_this_month", label: "New members this month" },
  { key: "provinces", label: "Provinces reached" },
  { key: "cities", label: "Cities / municipalities reached" },
  { key: "businesses", label: "Businesses in directory" },
  { key: "verified_businesses", label: "Verified businesses" },
  { key: "active_chapters", label: "Active chapters" },
  { key: "events_held", label: "Events held" },
  { key: "event_attendees", label: "Event attendees (from sign-in sheets)" },
  { key: "ai_answers", label: "Ka-FLAME AI questions answered" },
  { key: "resource_downloads", label: "Resources downloaded" },
];

type Story = { id: string; member_name: string; business_name: string | null; city: string | null; story: string };

export default async function Page() {
  const [stats, growth, provinces, settings, stories] = await Promise.all([getStats(), getGrowth(), getProvinces(), getSettings(), list<Story>({ table: "stories_public", order: "created_at" })]);
  const minRatings = settings.stat_thresholds?.ai_helpful_min_ratings ?? 20;
  const max = Math.max(1, ...(growth ?? []).map((g) => Number(g.total)));
  const launch = settings.launch_date ? new Date(settings.launch_date).toLocaleDateString("en-PH", { dateStyle: "long" }) : null;
  return (
    <>
      <PageHero status="live" fil="Totoong bilang" title="Impact" path="/impact" intro="Every number here is counted live from the FLAME PH database. On launch day they started at zero." />
      <Section>
        {!stats && <Notice>Statistics are temporarily unavailable. We never show estimated numbers in their place.</Notice>}
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {ROWS.map((r) => (
            <div key={r.key} className="card p-4">
              <dt className="text-sm text-muted">{r.label}</dt>
              <dd className="mt-1 font-display text-3xl font-extrabold text-primary"><StatValue value={stats ? (stats[r.key] as number) : null} /></dd>
            </div>
          ))}
          <div className="card p-4">
            <dt className="text-sm text-muted">Ka-FLAME AI helpful rate</dt>
            <dd className="mt-1 font-display text-3xl font-extrabold text-primary">
              {stats && stats.ai_ratings >= minRatings && stats.ai_helpful_rate != null ? `${Math.round(stats.ai_helpful_rate * 100)}%` : "—"}
            </dd>
            {stats && stats.ai_ratings < minRatings && <p className="text-xs text-muted">Shown after {minRatings} ratings ({stats.ai_ratings} so far)</p>}
          </div>
        </dl>
        {stats && <p className="mt-3 text-sm text-muted">Updated {new Date(stats.generated_at).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" })}. Refreshes every 5 minutes.</p>}
      </Section>
      <Section title="Member growth by week">
        {growth && growth.length > 0 ? (
          <figure className="card p-4">
            <svg viewBox={`0 0 ${Math.max(growth.length * 28, 280)} 180`} role="img" aria-label="Weekly total members since launch" className="h-48 w-full" preserveAspectRatio="none">
              {growth.map((g, i) => {
                const h = (Number(g.total) / max) * 150;
                return <rect key={g.week} x={i * 28 + 4} y={160 - h} width="20" height={Math.max(h, 1)} rx="3" fill="var(--primary)"><title>{`Week of ${g.week}: ${g.total} members (+${g.new_members})`}</title></rect>;
              })}
              <line x1="0" y1="160.5" x2="100%" y2="160.5" stroke="var(--border)" />
            </svg>
            <figcaption className="text-sm text-muted">Total verified members at the end of each week. Hover or tap a bar for details.</figcaption>
          </figure>
        ) : <p className="text-muted">The chart appears once members start signing up.</p>}
      </Section>
      <Section title="Provinces reached">
        {provinces && provinces.length > 0 ? (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {provinces.map((p) => <li key={p.province} className="card flex justify-between p-3"><span>{p.province}</span><b>{p.members}</b></li>)}
          </ul>
        ) : <p className="text-muted">No provinces yet. Be the first from yours!</p>}
      </Section>
      {stories.length > 0 && (
        <Section title="Member stories" intro="Shared with written consent.">
          <div className="grid gap-4 lg:grid-cols-2">
            {stories.map((s) => (
              <blockquote key={s.id} className="card p-5">
                <p>&ldquo;{s.story}&rdquo;</p>
                <footer className="mt-3 text-sm font-semibold">{s.member_name}{s.business_name ? `, ${s.business_name}` : ""}{s.city ? ` · ${s.city}` : ""}</footer>
              </blockquote>
            ))}
          </div>
        </Section>
      )}
      <Section>
        <Notice tone="info">All figures are counted automatically from our member database. {launch ? `FLAME PH launched this platform on ${launch}.` : "The launch date will be shown here once the platform officially launches."}</Notice>
      </Section>
    </>
  );
}
