import Link from "next/link";
import { buttonClass } from "@/components/ui";

/** Common frame for a member tab: title, a short line on what is coming, and the page content. */
export function TabShell({ title, fil, intro, soon, children }: { title: string; fil?: string; intro: React.ReactNode; soon?: string; children?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <header>
        {fil && <p className="text-sm font-semibold text-flame-strong">{fil}</p>}
        <h1 className="text-2xl font-extrabold sm:text-3xl">{title}</h1>
        <p className="mt-1 text-muted">{intro}</p>
        {soon && <p className="mt-2 inline-block rounded-full bg-bg-soft px-3 py-1 text-xs font-bold text-muted">{soon}</p>}
      </header>
      {children}
    </div>
  );
}

/** The primary way out of any finished action or confirmation screen. */
export function BackToFeed({ label = "Back to feed", href = "/home" }: { label?: string; href?: string }) {
  return <Link href={href} className={buttonClass({ variant: "primary", block: true })}>{label}</Link>;
}
