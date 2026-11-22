// The signed-in member app shell: the Home feed, the five action tabs and the rules for getting back to the feed.

/** The Home feed: the landing screen after sign-in and the place every finished action returns to. */
export const FEED = "/home";

export type Tab = { key: "group-order" | "fulfillment" | "new-post" | "pos" | "more"; href: string; label: string; visitorHref: string };

/**
 * Bottom bar, in the owner's order. Each is a top-level tab: the phone's back button from any of them returns to the feed.
 * Phones show this bar to visitors too (owner, 22 Nov 2026). `visitorHref` is where a tab goes before sign-in: the public
 * page when there is one, otherwise sign-up. Visitors' More opens the full site menu instead of a page.
 */
export const TABS: Tab[] = [
  { key: "group-order", href: "/group-order", label: "Group Order", visitorHref: "/deals" },
  { key: "fulfillment", href: "/fulfillment", label: "Fulfillment", visitorHref: "/fulfillment" },
  { key: "new-post", href: "/new-post", label: "New Post", visitorHref: "/join?next=%2Fnew-post" },
  { key: "pos", href: "/pos", label: "Flame POS", visitorHref: "/pos" },
  { key: "more", href: "/more", label: "More", visitorHref: "/more" },
];

/** For signed-in members these public addresses show the member version (same URL; visitors keep the public page). */
export const MEMBER_REWRITES: Record<string, string> = { "/fulfillment": "/m/fulfillment", "/pos": "/m/pos", "/bizconsult-ai": "/m/ai", "/academy": "/m/academy", "/volunteering": "/m/volunteering" };

/** The tab a page belongs to. The member pages behind /fulfillment and /pos (/m/...) count as those tabs. */
export const activeTab = (pathname: string) => {
  const p = Object.entries(MEMBER_REWRITES).find(([, to]) => pathname === to)?.[0] ?? pathname;
  return TABS.find((t) => p === t.href || p.startsWith(`${t.href}/`)) ?? null;
};

/** Kinds of finished action the feed can scroll to and confirm. */
export type FeedDone = "posted" | "post-held" | "post-deleted" | "commented" | "comment-held" | "group-order-started" | "group-order-joined" | "group-order-left" | "deal-confirmed" | "profile" | "consents" | "onboarded";

/** Where a finished action sends the member: the feed, scrolled to the result (an element id on the feed). */
export function feedResult(done: FeedDone, focusId?: string) {
  const q = new URLSearchParams({ done });
  if (focusId) q.set("focus", focusId);
  return `${FEED}?${q.toString()}`;
}

export const DONE_TEXT: Record<FeedDone, string> = {
  posted: "Your post is live. Here it is in your feed.",
  "post-held": "Your post is waiting for a check by a FLAME PH moderator because it mentions guaranteed or fixed returns, or a recruitment or pyramid structure. Only you can see it for now.",
  "post-deleted": "Your post was deleted.",
  commented: "Your comment is posted.",
  "comment-held": "Your comment is waiting for a check by a FLAME PH moderator before other members can see it.",
  "group-order-started": "Your group order is open. Here it is in your feed.",
  "group-order-joined": "You joined the group order. Here it is in your feed.",
  "group-order-left": "You left the group order.",
  "deal-confirmed": "Deal confirmed. Here is the record in your feed.",
  profile: "Profile saved.",
  consents: "Your choices are saved. You can change them anytime in Settings.",
  onboarded: "You're all set. Welcome to FLAME PH!",
};

/** The same page with ?focus=<id> set, so the feed (or a post page) scrolls back to the thing the member just acted on. */
export function withFocus(back: string, focusId: string, done?: FeedDone) {
  const [path, query = ""] = back.split("?");
  const q = new URLSearchParams(query.split("#")[0]);
  q.set("focus", focusId);
  q.delete("done");
  if (done) q.set("done", done);
  return `${path}?${q.toString()}`;
}
