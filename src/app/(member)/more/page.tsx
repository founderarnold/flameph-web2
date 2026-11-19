import Link from "next/link";
import { viaGo } from "@/lib/ecosystem";
import { requireUser, isStaffRole } from "@/lib/auth";
import MORE from "@/content/more.json";
import { TabShell } from "@/components/shell/TabShell";
import { InstallApp } from "@/components/InstallApp";

export const metadata = { title: "More" };

type Item = { label: string; href: string; external?: boolean };
type Group = { key: string; title: string; staffOnly?: boolean; items: Item[] };

/** More: every page of flameph.org, grouped. The list is src/content/more.json; the build fails if a page is missing from it. */
export default async function MoreTab() {
  const { roles } = await requireUser("/more");
  const groups = (MORE.groups as Group[]).filter((g) => !g.staffOnly || isStaffRole(roles));
  return (
    <TabShell title="More" intro="Everything on FLAME PH, in one place.">
      <div className="mb-5"><InstallApp /></div>
      <nav aria-label="All FLAME PH pages" className="space-y-5">
        <ul className="flex flex-wrap gap-2" aria-label="Jump to a group">
          {groups.map((g) => (
            <li key={g.key}><a href={`#more-${g.key}`} className="inline-flex min-h-11 items-center rounded-full border border-line px-3 text-sm font-semibold hover:bg-bg-soft">{g.title}</a></li>
          ))}
        </ul>
        {groups.map((g) => (
          <section key={g.key} id={`more-${g.key}`} aria-labelledby={`more-h-${g.key}`} className="card scroll-mt-20 p-4">
            <h2 id={`more-h-${g.key}`} className="text-lg font-bold">{g.title}</h2>
            <ul className="mt-2 grid gap-x-4 sm:grid-cols-2">
              {g.items.map((it) => (
                <li key={it.href}>
                  {it.external && viaGo(it.href, it.label) === it.href ? (
                    <a href={it.href} target="_blank" rel="noopener" className="flex min-h-11 items-center justify-between gap-2 border-b border-line py-2 text-[15px] hover:text-primary">
                      {it.label}<span aria-hidden className="text-muted">↗</span><span className="sr-only">(opens a new tab)</span>
                    </a>
                  ) : (
                    <Link href={viaGo(it.href, it.label)} className="flex min-h-11 items-center justify-between gap-2 border-b border-line py-2 text-[15px] hover:text-primary">
                      {it.label}<span aria-hidden className="text-muted">›</span>
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
        <form action="/auth/logout" method="post">
          <button className="btn btn-outline w-full">Log out</button>
        </form>
      </nav>
    </TabShell>
  );
}
