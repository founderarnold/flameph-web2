import Link from "next/link";
import { Logo } from "./Logo";
import { NewsletterForm } from "./NewsletterForm";
import { NAV, LEGAL_LINKS } from "@/lib/nav";
import { ORG, PURPOSE, REGISTRATION_LINE, TAGLINES } from "@/lib/site";
import { getDict, getLang } from "@/lib/i18n";
import { getSettings } from "@/lib/settings";

export async function Footer() {
  const [t, lang, settings] = await Promise.all([getDict(), getLang(), getSettings()]);
  const socials = Object.entries(settings.social_links ?? {}).filter(([, url]) => typeof url === "string" && url.startsWith("http"));
  const year = new Date().getFullYear();
  return (
    <footer className="mt-16 border-t border-line bg-bg-soft pb-24 lg:pb-0">
      <div className="container-x grid gap-10 py-12 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <div className="inline-block rounded-xl bg-white p-3"><Logo height={48} className="h-12 w-auto" /></div>
          <p className="mt-4 font-display text-lg font-extrabold text-primary">{TAGLINES.main}</p>
          <p className="mt-2 max-w-prose text-muted">{PURPOSE}</p>
          {socials.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2" aria-label="Social media">
              {socials.map(([name, url]) => (
                <li key={name}><a href={url} target="_blank" rel="noopener" className="btn btn-outline min-h-11 px-3 py-1 text-sm capitalize">{name}</a></li>
              ))}
            </ul>
          )}
        </div>
        <div className="card p-5">
          <h2 className="text-lg font-extrabold">{t.newsletterTitle}</h2>
          <p className="mt-1 text-sm text-muted">{t.newsletterText}</p>
          <NewsletterForm labels={{ subscribe: t.subscribe, consent: t.consentPrivacy, sending: t.sending }} />
        </div>
      </div>
      <div className="container-x grid grid-cols-1 gap-x-6 gap-y-8 border-t border-line py-10 sm:grid-cols-2 lg:grid-cols-5">
        {NAV.map((g) => (
          <div key={g.key}>
            <h2 className="font-display text-base font-extrabold">{lang === "fil" ? g.fil : g.label}</h2>
            <ul className="mt-2 space-y-0.5">
              {g.items.map((it) => (
                <li key={it.href}>
                  {it.external ? (
                    <a href={it.href} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center text-[15px] text-muted hover:text-fg hover:underline lg:min-h-9">{it.label} ↗</a>
                  ) : (
                    <Link href={it.href} className="inline-flex min-h-11 items-center text-[15px] text-muted hover:text-fg hover:underline lg:min-h-9">{it.label}</Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="container-x space-y-3 py-8 text-sm text-muted">
          <ul className="flex flex-wrap gap-x-5 gap-y-1">
            {LEGAL_LINKS.map((l) => (
              <li key={l.href}><Link href={l.href} className="inline-flex min-h-11 items-center font-semibold text-fg hover:underline">{l.label}</Link></li>
            ))}
          </ul>
          <p>{REGISTRATION_LINE.replace(ORG.emailPrimary, "")}<a className="underline" href={`mailto:${ORG.emailPrimary}`}>{ORG.emailPrimary}</a></p>
          <p>© {year} FLAME PH. {TAGLINES.growth}</p>
          <p className="rounded-lg bg-warn-soft px-3 py-2 text-warn">{t.betaNote}</p>
        </div>
      </div>
    </footer>
  );
}
