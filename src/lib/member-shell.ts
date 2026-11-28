// The signed-in member app shell: the Home feed, the five action tabs and the rules for getting back to the feed.

/** The Home feed: the landing screen after sign-in and the place every finished action returns to. */
export const FEED = "/home";

export type TabKey = "home" | "workspace" | "create" | "inbox" | "menu" | "explore" | "join" | "tools";
/** `href` null: the tab opens a sheet (Create) or the menu drawer (Menu) instead of a page. */
export type Tab = { key: TabKey; href: string | null; label: string };

/**
 * Phone bottom bar for signed-in members (navigation Phase 1; the owner chose these tabs on 28 Nov 2026, replacing the
 * 16/22 Nov bar Group Order, Fulfillment, New Post, Flame POS, More). Group Order, Fulfillment and Flame POS stay as big
 * shortcuts at the top of the Menu, and Start a Group Order is in Create.
 */
export const TABS: Tab[] = [
  { key: "home", href: FEED, label: "Home" },
  { key: "workspace", href: "/workspace", label: "Workspace" },
  { key: "create", href: null, label: "Create" },
  { key: "inbox", href: "/workspace/inbox", label: "Inbox" },
  { key: "menu", href: null, label: "Menu" },
];

/** Phone bottom bar for visitors (not signed in). Menu opens the same drawer, with Join and Log in at the top. */
export const VISITOR_TABS: Tab[] = [
  { key: "home", href: "/", label: "Home" },
  { key: "explore", href: "/explore", label: "Explore" },
  { key: "join", href: "/join", label: "Join Free" },
  { key: "tools", href: "/benefits", label: "Free Tools" },
  { key: "menu", href: null, label: "Menu" },
];

/**
 * Top-level member pages: the phone's back button from any of them returns to the feed, not out of the app.
 * The old bottom-tab pages keep this behaviour so nothing changes for members who use them.
 */
export const TOP_LEVEL = ["/workspace", "/workspace/inbox", "/group-order", "/fulfillment", "/new-post", "/pos", "/more"];

/** For signed-in members these public addresses show the member version (same URL; visitors keep the public page). */
export const MEMBER_REWRITES: Record<string, string> = { "/fulfillment": "/m/fulfillment", "/pos": "/m/pos", "/bizconsult-ai": "/m/ai", "/academy": "/m/academy", "/volunteering": "/m/volunteering" };

/** The member tab a page belongs to. Inbox is checked before Workspace (its address is inside /workspace). */
export const activeTab = (pathname: string) => {
  if (pathname === FEED) return TABS[0];
  if (pathname === "/workspace/inbox") return TABS[3];
  if (pathname === "/new-post") return TABS[2];
  if (pathname === "/workspace" || pathname.startsWith("/workspace/")) return TABS[1];
  return null;
};

/** The visitor tab a page belongs to. */
export const activeVisitorTab = (pathname: string) =>
  VISITOR_TABS.find((t) => t.href && (t.href === "/" ? pathname === "/" : pathname === t.href || pathname.startsWith(`${t.href}/`))) ?? null;

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
