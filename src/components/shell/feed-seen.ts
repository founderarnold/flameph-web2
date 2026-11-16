// The Home button's "unseen posts" dot: this phone remembers the newest feed time it has shown.
export const SEEN_KEY = "fl-feed-seen";
export const SEEN_EVENT = "fl-feed-seen";

export function readSeen(): number {
  try { return Number(localStorage.getItem(SEEN_KEY)) || 0; } catch { return 0; }
}

export function markSeen(latest: string | null) {
  const t = latest ? new Date(latest).getTime() : Date.now();
  try { if (t > readSeen()) localStorage.setItem(SEEN_KEY, String(t)); } catch { /* private mode: the dot just stays off after this visit */ }
  window.dispatchEvent(new Event(SEEN_EVENT));
}

export const hasUnseen = (latest: string | null, seen: number) => Boolean(latest) && new Date(latest as string).getTime() > seen;
