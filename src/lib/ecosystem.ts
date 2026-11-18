// One FLAME PH ecosystem: flameph.org (community, learning, support), MarketplacePH (buying, selling, delivery, jobs)
// and NegosyoDepot (business packages, suppliers, Fulfillment by MSMEs). One FLAME PH account works on all three.
// Links from flameph.org into the other two go through /go/<app>, a short "opening the focused app" screen,
// and only to the addresses listed here (no open redirects).

export type AppKey = "flameph" | "marketplaceph" | "negosyodepot";

export type EcoApp = { key: AppKey; name: string; url: string; focus: string; fil: string; paths: RegExp };

export const ECO_APPS: Record<AppKey, EcoApp> = {
  flameph: { key: "flameph", name: "FLAME PH", url: "https://www.flameph.org", focus: "Community, learning, tools and support", fil: "Komunidad at suporta", paths: /^\/[a-z0-9/-]*$/ },
  marketplaceph: {
    key: "marketplaceph", name: "MarketplacePH", url: "https://www.marketplaceph.com", focus: "Buy, sell, delivery, jobs and hiring", fil: "Bilihan at bentahan",
    paths: /^\/(|search|categories|looking-for|looking-for\/new|sell|sell\/new|sell\/verify|delivery|delivery\/new|delivery\/register|jobs|jobs\/post|jobs\/profile|business|business\/suppliers|my\/listings|faq|flame)$/,
  },
  negosyodepot: {
    key: "negosyodepot", name: "NegosyoDepot", url: "https://www.negosyodepot.com", focus: "Business packages, suppliers and Fulfillment by MSMEs", fil: "Negosyo packages at supplier",
    paths: /^\/(#\/(|explore|find|post|looking-for|partners|grow|scale|sell-business|funder-finder|investor-funder|ecosystem|faq|fulfillment(\/(network|providers|provider-register|provider-list|cost-estimator|start|order-fulfillment|self-fulfill|partner-onboarding|pricing|quote-checklist|trust|guides|b2b|online-selling|optional-services|costs))?))?$/,
  },
};

export const OTHER_APPS: AppKey[] = ["marketplaceph", "negosyodepot"];

const isOther = (k: string): k is "marketplaceph" | "negosyodepot" => k === "marketplaceph" || k === "negosyodepot";

/** The full address on the other app, or null when the path is not one we send members to. */
export function ecoTarget(app: string, to: string | null | undefined): string | null {
  if (!isOther(app)) return null;
  const path = to && to.length <= 80 ? to : "/";
  if (path.includes("//") || !ECO_APPS[app].paths.test(path)) return null;
  return `${ECO_APPS[app].url}${path === "/" ? "/" : path}`;
}

/** The flameph.org link that opens a page of MarketplacePH or NegosyoDepot, with why the member is going there. */
export function goHref(app: "marketplaceph" | "negosyodepot", to = "/", why?: string) {
  const q = new URLSearchParams({ to });
  if (why) q.set("why", why);
  return `/go/${app}?${q.toString()}`;
}

/** For an existing absolute link (goal cards, menus): the /go link when it is one of the two apps, else the link unchanged. */
export function viaGo(href: string, why?: string): string {
  let u: URL;
  try { u = new URL(href); } catch { return href; }
  const host = u.hostname.replace(/^www\./, "");
  const app = host === "marketplaceph.com" ? "marketplaceph" : host === "negosyodepot.com" ? "negosyodepot" : null;
  if (!app || u.protocol !== "https:") return href;
  const to = `${u.pathname}${u.search}${u.hash}` || "/";
  return ecoTarget(app, to) ? goHref(app, to, why) : href;
}

/** Why the member is going there, in a few words ("to sell your products"). Only plain short text is shown. */
export const cleanWhy = (why?: string | null) => (why && /^[\p{L}\p{N} ,.'&()-]{3,80}$/u.test(why) ? why : null);
