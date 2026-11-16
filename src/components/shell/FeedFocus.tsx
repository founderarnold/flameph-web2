"use client";
import { useEffect } from "react";
import { markSeen } from "./feed-seen";

/** On the feed: scrolls to the result of a finished action (?focus=<id>) and highlights it, and clears the Home dot. */
export function FeedFocus({ focus, latest }: { focus?: string; latest: string | null }) {
  useEffect(() => {
    markSeen(latest);
  }, [latest]);
  useEffect(() => {
    if (!focus || !/^[\w-]{1,80}$/.test(focus)) return;
    const el = document.getElementById(focus);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.add("feed-focus");
    el.setAttribute("tabindex", "-1");
    el.focus({ preventScroll: true });
    const t = setTimeout(() => el.classList.remove("feed-focus"), 4000);
    return () => clearTimeout(t);
  }, [focus]);
  return null;
}
