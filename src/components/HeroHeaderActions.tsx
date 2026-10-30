"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Lang } from "@/lib/i18n";
import { isStandardHeroPath } from "@/lib/hero-pages";
import { AccountMenu } from "./AccountMenu";
import { LangToggle } from "./LangToggle";

export function HeroHeaderActions({ lang, signedIn, account, login, joinFree }: { lang: Lang; signedIn: boolean; account: string; login: string; joinFree: string }) {
  const heroPage = isStandardHeroPath(usePathname());
  return (
    <>
      <div className="hidden lg:block">{heroPage ? <Link href="/join" className="btn btn-flame px-4">{joinFree}</Link> : <LangToggle lang={lang} />}</div>
      {signedIn ? <AccountMenu label={account} /> : <Link href="/login" className="btn btn-ghost hidden lg:inline-flex">{login}</Link>}
      {!signedIn && !heroPage && <Link href="/join" className="btn btn-flame px-3 text-sm lg:px-4 lg:text-base">{joinFree}</Link>}
    </>
  );
}
