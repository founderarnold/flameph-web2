import Link from "next/link";
import { StatusBadge, type Status } from "./StatusBadge";
import { HeroArtwork } from "./HeroArtwork";

export function PageHero({ title, fil, intro, status, children, path }: {
  title: string; fil?: string; intro?: React.ReactNode; status?: Status; children?: React.ReactNode; share?: boolean; path?: string;
}) {
  return (
    <section className="border-b border-line bg-bg-warm">
      <div className="container-x grid items-center gap-8 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(300px,430px)] lg:gap-12 lg:py-14">
        <div>
          {status && <StatusBadge status={status} className="mb-3" />}
          {fil && <p className="font-display text-base font-bold text-flame-strong">{fil}</p>}
          <h1 className="mt-1 max-w-3xl text-3xl font-extrabold text-primary sm:text-4xl lg:text-5xl">{title}</h1>
          {intro && <div className="mt-4 max-w-2xl text-lg text-muted">{intro}</div>}
          {children && <div className="mt-6 flex flex-wrap gap-3">{children}</div>}
        </div>
        {path && <HeroArtwork path={path} />}
      </div>
    </section>
  );
}

export function Section({ title, fil, intro, children, className = "", id }: { title?: string; fil?: string; intro?: React.ReactNode; children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`container-x py-10 lg:py-14 ${className}`}>
      {fil && <p className="font-display font-bold text-flame-strong">{fil}</p>}
      {title && <h2 className="text-2xl font-extrabold sm:text-3xl">{title}</h2>}
      {intro && <div className="mt-2 max-w-2xl text-muted">{intro}</div>}
      <div className={title || intro ? "mt-6" : ""}>{children}</div>
    </section>
  );
}

export function EmptyState({ title, text, cta }: { title: string; text?: string; cta?: { href: string; label: string } }) {
  return (
    <div className="card flex flex-col items-start gap-3 border-dashed bg-bg-soft p-6 sm:p-8">
      <svg aria-hidden width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-flame"><path d="M12 3c1 3 4 4.5 4 8.5A4 4 0 018 11.5C8 9 10 8 10 6c1.5 1 2 2 2 2s0-3 0-5zM6 21h12" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <p className="text-lg font-bold">{title}</p>
      {text && <p className="text-muted">{text}</p>}
      {cta && <Link href={cta.href} className="btn btn-primary">{cta.label}</Link>}
    </div>
  );
}

export function FeatureCard({ title, text, status, href, icon, external }: { title: string; text: string; status?: Status; href?: string; icon?: React.ReactNode; external?: boolean }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        {icon && <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">{icon}</span>}
        {status && <StatusBadge status={status} />}
      </div>
      <h3 className="mt-3 text-lg font-bold">{title}</h3>
      <p className="mt-1 text-[15px] text-muted">{text}</p>
    </>
  );
  return href ? external ? (
    <a href={href} target="_blank" rel="noopener" className="card block p-5 transition-colors hover:border-primary">{body}</a>
  ) : (
    <Link href={href} className="card block p-5 transition-colors hover:border-primary">{body}</Link>
  ) : (
    <div className="card p-5">{body}</div>
  );
}

export function Grid({ children, cols = 3 }: { children: React.ReactNode; cols?: 2 | 3 | 4 }) {
  const c = cols === 2 ? "sm:grid-cols-2" : cols === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-3";
  return <div className={`grid grid-cols-1 gap-4 ${c}`}>{children}</div>;
}

export function Initials({ name, size = 72 }: { name: string; size?: number }) {
  const initials = name.replace(/^(Dr\.|Mr\.|Ms\.|Mrs\.)\s*/i, "").split(/[\s,]+/).filter((w) => /^[A-Z]/.test(w) && !/^(ECE|MBA)$/.test(w)).slice(0, 2).map((w) => w[0]).join("");
  return (
    <span aria-hidden style={{ width: size, height: size }} className="grid shrink-0 place-items-center rounded-full bg-primary font-display text-xl font-extrabold text-primary-fg">
      {initials}
    </span>
  );
}

export function Notice({ children, tone = "warn" }: { children: React.ReactNode; tone?: "warn" | "info" | "ok" }) {
  const cls = tone === "ok" ? "bg-ok-soft text-ok" : tone === "info" ? "bg-primary-soft text-primary" : "bg-warn-soft text-warn";
  return <div className={`rounded-xl px-4 py-3 text-[15px] font-medium ${cls}`}>{children}</div>;
}

export function VerifyWithAgency({ agencies }: { agencies: { name: string; url: string }[] }) {
  return (
    <Notice tone="info">
      Paki-verify sa official agency bago mag-decide:{" "}
      {agencies.map((a, i) => (
        <span key={a.name}>{i > 0 && " · "}<a className="underline" href={a.url} target="_blank" rel="noopener">{a.name}</a></span>
      ))}
    </Notice>
  );
}
