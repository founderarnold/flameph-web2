import Link from "next/link";
import { cookies } from "next/headers";
import { Logo } from "./Logo";
import { DesktopNav } from "./DesktopNav";
import { MobileMenu } from "./MobileMenu";
import { LangToggle } from "./LangToggle";
import { NAV } from "@/lib/nav";
import { getDict, getLang } from "@/lib/i18n";

export async function Header() {
  const [t, lang, c] = await Promise.all([getDict(), getLang(), cookies()]);
  // Cheap signed-in hint from the Supabase auth cookie; pages that need the user verify it server side.
  const signedIn = c.getAll().some((x) => x.name.startsWith("sb-") && x.name.includes("auth-token"));
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/95 backdrop-blur supports-[backdrop-filter]:bg-bg/85">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-card focus:p-2">Skip to content</a>
      <div className="container-x flex h-16 items-center gap-3 lg:h-[72px]">
        <Logo priority height={40} className="h-9 w-auto lg:h-11" />
        <DesktopNav groups={NAV} lang={lang} />
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden lg:block"><LangToggle lang={lang} /></div>
          {signedIn ? (
            <Link href="/account" className="btn btn-ghost hidden lg:inline-flex">{t.account}</Link>
          ) : (
            <Link href="/login" className="btn btn-ghost hidden lg:inline-flex">{t.login}</Link>
          )}
          {!signedIn && <Link href="/join" className="btn btn-flame px-3 text-sm lg:px-4 lg:text-base">{t.joinFree}</Link>}
          <MobileMenu groups={NAV} lang={lang} signedIn={signedIn} labels={{ menu: t.menu, close: t.close, login: t.login, account: t.account, joinFree: t.joinFree }} />
        </div>
      </div>
    </header>
  );
}
