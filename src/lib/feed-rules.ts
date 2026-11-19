// Rules for member posts on the Home feed and the forum. Pure functions, shared by the composer, the feed and the tests.
// The database (0017_community_feed.sql) applies the same limits on its own, so no route can skip them.
import { INDUSTRY_NAMES, subsOf } from "@/lib/industries";

export const POST_KINDS = {
  update: { label: "Update", help: "News about your business" },
  question: { label: "Question", help: "Ask other members" },
  offer: { label: "Offer", help: "A product, service or promo" },
  request: { label: "Looking for", help: "A supplier, partner or service you need" },
  fulfillment: { label: "Fulfillment offer", help: "You can produce, pack or deliver for other members" },
  investor: { label: "Investor or funder", help: "Offering or asking for investment, funding or loans" },
} as const;
export type PostKind = keyof typeof POST_KINDS;
export const isPostKind = (v: unknown): v is PostKind => typeof v === "string" && v in POST_KINDS;

export const REACTIONS = {
  like: { label: "Like", emoji: "👍" },
  love: { label: "Love", emoji: "❤️" },
  helpful: { label: "Helpful", emoji: "💡" },
} as const;
export type ReactionKind = keyof typeof REACTIONS;
export const isReaction = (v: unknown): v is ReactionKind => typeof v === "string" && v in REACTIONS;

export const POST_MAX = 2000;
export const COMMENT_MAX = 1000;
export const PAGE_SIZE = 10;

export const AUDIENCES = {
  members: { label: "All members", help: "Every signed-in FLAME PH member" },
  friends: { label: "Friends only", help: "Only members you are Friends with" },
} as const;
export type Audience = keyof typeof AUDIENCES;
export const isAudience = (v: unknown): v is Audience => typeof v === "string" && v in AUDIENCES;

/** Same words as public.feed_text_flags() in the database (0017, extended in 0026_investor_funder.sql). */
const INVESTOR_RE = /\b(invest|investing|investment|investments|investor|investors|funder|funders|funding|capital|roi|loans?|lending|pautang|paluwagan|equity|shares? of stock|interest rate|interest per month)\b/i;
const RETURNS_RE = [
  /(guarantee[ds]?|guaranteed|assured|sure|fixed|risk[- ]?free|no[- ]risk|walang risk|siguradong|garantisadong)\W+(\w+\W+){0,3}(returns?|profits?|income|interest|kita|tubo)/i,
  /(returns?|profits?|income|interest|kita|tubo)\W+(\w+\W+){0,3}(guaranteed|assured|garantisado|sigurado)/i,
  /(double|triple|doblehin|doble) (your |ang |nyo ang |mo ang )?(money|pera|investment|puhunan)/i,
];
/** Only held when the post is also about investing or funding. */
const RISK_FREE_RE = /(risk[- ]?free|no[- ]risk|zero[- ]risk|walang (risk|lugi)|hindi (ka )?malulugi|sure ?(ball|win)|surebol|100% safe)/i;
const PCT_PERIOD_RE = /[0-9]+(\.[0-9]+)? ?% ?(a |per |every |kada |bawat |\/ ?)?(day|daily|week|weekly|month|monthly|araw|linggo|buwan)/i;
const SCHEME_RE = /(pyramid|ponzi|downline|upline|multi[- ]?level marketing|networking (business|income|opportunity)|recruit(ment)? (bonus|income|commission)|referral (bonus|income|commission)|(invite|recruit|refer) [0-9]+ (people|persons|friends|members|tao)|binary (plan|system)|matrix (plan|system)|pay[- ]?in|(^|[^a-z])mlm([^a-z]|$))/i;

export type HoldReason = "promises_returns" | "recruitment_scheme";
/** Plain words for moderators and the poster. */
export const HOLD_REASONS: Record<HoldReason, string> = {
  promises_returns: "Promises fixed, guaranteed or risk-free returns",
  recruitment_scheme: "Pyramid, MLM or recruitment structure",
};

/** Why the database will hold this text for a moderator, or null. Same order as the database: returns first. */
export function holdReason(body: string): HoldReason | null {
  const investor = INVESTOR_RE.test(body);
  if (RETURNS_RE.some((r) => r.test(body)) || (investor && (RISK_FREE_RE.test(body) || PCT_PERIOD_RE.test(body)))) return "promises_returns";
  if (SCHEME_RE.test(body)) return "recruitment_scheme";
  return null;
}

/** What the database will do with a post: mark it as an investor/funder post, or hold it for review. */
export function classifyPost(body: string, kind: PostKind, authorInvestor = false): { kind: PostKind; held: boolean } {
  const investor = authorInvestor || kind === "investor" || INVESTOR_RE.test(body);
  return { kind: investor ? "investor" : kind, held: holdReason(body) !== null };
}

export const linkCount = (t: string) => (t.match(/(https?:\/\/|www\.)/gi) ?? []).length;

/** Plain-language messages for the database's refusals. */
export const POST_ERRORS: Record<string, string> = {
  new_account_friend_limit: "New accounts can send 10 Friend requests on their first day. You can send more tomorrow.",
  duplicate_post: "You posted the same thing in the last day. Try changing the words, or reply to your earlier post.",
  duplicate_comment: "You just wrote the same comment.",
  post_rate_limit: "You've posted a lot in the last hour. Please wait a little before posting again.",
  comment_rate_limit: "You've commented a lot in the last hour. Please wait a little.",
  new_account_limit: "New accounts can post 3 times on their first day. You can post more tomorrow.",
  new_account_links: "New accounts can add links after their first day. Please post without the link for now.",
  too_many_links: "Please keep it to 3 links or fewer (2 in a comment).",
  not_active_member: "Your account can't post right now. Please contact FLAME PH.",
  too_short: "Please write a little more.",
  too_long: "That's too long. Please shorten it.",
  category: "Please choose an industry for your post.",
  unavailable: "Posting opens after FLAME PH finishes a database update. Please try again later.",
  join_group_first: "Join this group first, then you can post in it.",
  group_posts_are_for_members: "Group posts are for all members of the group. Choose \"All members\" or post outside the group.",
  request_exists: "This member already sent you a Friend request. Accept it in Friends.",
  blocked: "You can't connect with this member.",
  friend_rate_limit: "You've sent a lot of Friend requests today. Please try again tomorrow.",
  no_such_group: "That group doesn't exist.",
  moderator_mute: "A moderator has paused your posting for now. See Notices from moderators in your account.",
  blocked_words: "Your post uses words that aren't allowed in the community. Please change them and try again.",
  bad_media: "One of the files didn't upload properly. Please remove it and add it again.",
  too_many_photos: "You can add up to 4 photos.",
  one_video: "You can add one video per post: either an upload or a link.",
  bad_video_link: "Video links must be from YouTube, Facebook or TikTok.",
  feed_posts_video_url: "Video links must be from YouTube, Facebook or TikTok.",
  failed: "Something went wrong. Please try again.",
};
export const postErrorCode = (message?: string | null) => {
  const m = message ?? "";
  return Object.keys(POST_ERRORS).find((k) => m.includes(k)) ?? (/feed_(posts|comments|reactions)|friendships|member_(mutes|blocks)|group|audience|schema cache|does not exist/.test(m) ? "unavailable" : "failed");
};

/** Category select: "Industry" or "Industry › Specific industry", both from the taxonomy. */
export function parseCategory(v: string): { category: string; subcategory: string | null } | null {
  const [category, sub] = v.split("||");
  if (!INDUSTRY_NAMES.includes(category)) return null;
  if (!sub) return { category, subcategory: null };
  return subsOf(category).includes(sub) ? { category, subcategory: sub } : null;
}

/** URL-safe name for an industry, used by the forum (/forum/food-beverage). */
export const industrySlug = (name: string) => name.toLowerCase().replace(/&/g, " ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const industryFromSlug = (slug: string) => INDUSTRY_NAMES.find((n) => industrySlug(n) === slug) ?? null;

/** Feed pages go back in time with a cursor: the exact time (to the microsecond) and id of the last post shown. */
export function encodeCursor(at: string, id: string) {
  return `${at}~${id}`;
}
export function decodeCursor(v?: string | null): { at: string; id: string } | null {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:?\d{2}))~([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(v ?? "");
  return m ? { at: m[1], id: m[2] } : null;
}

/** Feed filters from the address. Unknown values are ignored. */
export function feedFilters(sp: { industry?: string; chapter?: string; who?: string }, chapterIds: string[]) {
  return {
    industry: INDUSTRY_NAMES.includes(sp.industry ?? "") ? sp.industry! : null,
    chapter: chapterIds.includes(sp.chapter ?? "") ? sp.chapter! : null,
    following: sp.who === "following",
  };
}

/** Text with web addresses turned into links (everything else stays plain text). */
export function splitLinks(text: string): { text: string; href?: string }[] {
  const out: { text: string; href?: string }[] = [];
  const re = /\b(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const raw = m[0].replace(/[.,!?)]+$/, "");
    if (m.index! > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: raw, href: raw.startsWith("www.") ? `https://${raw}` : raw });
    last = m.index! + raw.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

export function timeAgo(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric" });
}
