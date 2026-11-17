// The signed-in member app shell: the Home feed, the five action tabs and the rules for getting back to the feed.

/** The Home feed: the landing screen after sign-in and the place every finished action returns to. */
export const FEED = "/home";

export type Tab = { key: "group-order" | "fulfillment" | "new-post" | "pos" | "more"; href: string; label: string };

/** Bottom bar, in the owner's order. Each is a top-level tab: the phone's back button from any of them returns to the feed. */
export const TABS: Tab[] = [
  { key: "group-order", href: "/group-order", label: "Group Order" },
  { key: "fulfillment", href: "/fulfillment", label: "Fulfillment" },
  { key: "new-post", href: "/new-post", label: "New Post" },
  { key: "pos", href: "/pos", label: "Flame POS" },
  { key: "more", href: "/more", label: "More" },
];

/** For signed-in members these public addresses show the member version of the tab (same URL; visitors keep the public page). */
export const MEMBER_REWRITES: Record<string, string> = { "/fulfillment": "/m/fulfillment", "/pos": "/m/pos" };

/** The tab a page belongs to. The member pages behind /fulfillment and /pos (/m/...) count as those tabs. */
export const activeTab = (pathname: string) => {
  const p = Object.entries(MEMBER_REWRITES).find(([, to]) => pathname === to)?.[0] ?? pathname;
  return TABS.find((t) => p === t.href || p.startsWith(`${t.href}/`)) ?? null;
};

/** Kinds of finished action the feed can scroll to and confirm. */
export type FeedDone = "posted" | "group-order-started" | "group-order-joined" | "group-order-left" | "deal-confirmed" | "profile" | "consents" | "onboarded";

/** Where a finished action sends the member: the feed, scrolled to the result (an element id on the feed). */
export function feedResult(done: FeedDone, focusId?: string) {
  const q = new URLSearchParams({ done });
  if (focusId) q.set("focus", focusId);
  return `${FEED}?${q.toString()}`;
}

export const DONE_TEXT: Record<FeedDone, string> = {
  posted: "Your post is live.",
  "group-order-started": "Your group order is open. Here it is in your feed.",
  "group-order-joined": "You joined the group order. Here it is in your feed.",
  "group-order-left": "You left the group order.",
  "deal-confirmed": "Deal confirmed. Here is the record in your feed.",
  profile: "Profile saved.",
  consents: "Your choices are saved. You can change them anytime in Settings.",
  onboarded: "You're all set. Welcome to FLAME PH!",
};
