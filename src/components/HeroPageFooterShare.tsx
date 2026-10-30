"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { showStandardHeroShare } from "@/lib/hero-pages";
import { ShareButtons } from "./ShareButtons";

export function HeroPageFooterShare() {
  const pathname = usePathname();
  const [title, setTitle] = useState("FLAME PH");
  useEffect(() => setTitle(document.title.replace(/ · FLAME PH$/, "")), [pathname]);
  if (!showStandardHeroShare(pathname)) return null;
  return <aside className="pre-footer-share mt-12 border-t border-line bg-bg-warm/60" aria-label="Share this page"><div className="container-x py-7"><ShareButtons path={pathname} title={title} /></div></aside>;
}
