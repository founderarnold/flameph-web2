import Link from "next/link";
import { getStats, type Stats } from "@/lib/stats";
import { getSettings } from "@/lib/settings";

const fmt = (n: number) => new Intl.NumberFormat("en-PH").format(n);

export function StatValue({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return <span title="temporarily unavailable">—</span>;
  return <>{fmt(value)}</>;
}

export async function StatsStrip() {
  const [stats, settings] = await Promise.all([getStats(), getSettings()]);
  const threshold = settings.stat_thresholds?.founding_members ?? 50;
  const items: { key: keyof Stats; label: string }[] = [
    { key: "members", label: "Registered members" },
    { key: "provinces", label: "Provinces reached" },
    { key: "businesses", label: "Businesses listed" },
    { key: "ai_answers", label: "Ka-FLAME AI questions answered" },
  ];
  return (
    <section aria-labelledby="stats-h" className="bg-primary text-white">
      <div className="container-x py-10">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="stats-h" className="text-2xl font-extrabold">Live sa database, hindi hula</h2>
          <p className="text-sm text-white/80">
            {stats ? <>Updated {new Date(stats.generated_at).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" })}</> : "Statistics temporarily unavailable"}
          </p>
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {items.map((it) => (
            <div key={it.key} className="rounded-xl bg-white/10 p-4">
              <dt className="text-sm text-white/85">{it.label}</dt>
              <dd className="mt-1 font-display text-3xl font-extrabold sm:text-4xl">
                <StatValue value={stats ? (stats[it.key] as number) : null} />
              </dd>
            </div>
          ))}
        </dl>
        {stats && stats.members < threshold && (
          <p className="mt-4 font-display text-lg font-bold text-gold">Be one of our founding members.</p>
        )}
        <Link href="/impact" className="mt-4 inline-flex min-h-11 items-center font-semibold underline">See all live statistics →</Link>
      </div>
    </section>
  );
}
