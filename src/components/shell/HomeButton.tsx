"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { FEED } from "@/lib/member-shell";
import { UnseenDot } from "@/components/ui";
import { SEEN_EVENT, hasUnseen, readSeen } from "./feed-seen";

/** FLAME PH mark + the word "Home", as one labelled button. From anywhere it returns to the feed; on the feed it scrolls back to the top. */
export function HomeButton({ latest }: { latest: string | null }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const [unseen, setUnseen] = useState(false);
  useEffect(() => {
    const update = () => setUnseen(hasUnseen(latest, readSeen()));
    update();
    window.addEventListener(SEEN_EVENT, update);
    window.addEventListener("storage", update);
    return () => { window.removeEventListener(SEEN_EVENT, update); window.removeEventListener("storage", update); };
  }, [latest]);
  const onFeed = pathname === FEED;
  return (
    <Link
      href={FEED}
      data-shell="home"
      aria-current={onFeed ? "page" : undefined}
      aria-label={unseen ? "Home, new posts" : "Home"}
      onClick={(e) => {
        if (onFeed && !search.toString()) { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }
      }}
      className="relative -ml-2 inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-2 font-display text-lg font-extrabold text-fg hover:bg-bg-soft"
    >
      <Image src="/brand/flameph-icon.png" alt="" width={32} height={32} priority className="h-8 w-8" />
      <span>Home</span>
      {unseen && <span className="absolute left-7 top-1.5 leading-none"><UnseenDot label="New posts in your feed" /></span>}
    </Link>
  );
}
