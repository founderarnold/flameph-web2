// Business news headlines for the feed and the weekly email: title, source and link only, from public Philippine news feeds.
// Fetched once a day by /api/cron/news. We never copy the article text or images; members open the source to read it.

export type NewsSource = { name: string; url: string; filter?: boolean };

/** Business sections of national news outlets, each checked live on 18 Nov 2026. (The Philippine News Agency no longer
 *  publishes a feed.) `filter: true` keeps only business topics, for a source that mixes all news. */
export const NEWS_SOURCES: NewsSource[] = [
  { name: "BusinessWorld", url: "https://www.bworldonline.com/feed/" },
  { name: "Inquirer Business", url: "https://business.inquirer.net/feed" },
  { name: "Philstar Business", url: "https://www.philstar.com/rss/business" },
  { name: "GMA Money", url: "https://data.gmanetwork.com/gno/rss/money/feed.xml" },
];

/** For an all-topics feed: keep only business, trade, jobs and government programs for MSMEs. */
const BUSINESS_RE = /\b(msmes?|smes?|business(es)?|negosyo|dti|trade|export|import|invest\w*|economy|economic|gdp|inflation|peso|bsp|loans?|credit|tax|bir|sec|jobs?|employment|dole|tourism|agri\w*|farmers?|fisher\w*|manufactur\w*|retail|prices?|startups?|entrepreneur\w*|market|supply|tariff|budget|infrastructure|energy|power rates?|digital)\b/i;

export type Headline = { url: string; title: string; source: string; published_at: string };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", hellip: "…" };
export const decode = (t: string) => t
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/<[^>]+>/g, "")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
  .replace(/\s+/g, " ").trim();

const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"))?.[1] ?? null;

/** Headlines from one RSS or Atom document: newest first, https links only, at most `max`. */
export function parseFeed(xml: string, source: string, opts: { max?: number; filter?: boolean; now?: number } = {}): Headline[] {
  const now = opts.now ?? Date.now();
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  const out: Headline[] = [];
  for (const b of blocks) {
    const title = decode(tag(b, "title") ?? "");
    let link = decode(tag(b, "link") ?? "");
    if (!link) link = b.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? "";
    const when = new Date(decode(tag(b, "pubDate") ?? tag(b, "published") ?? tag(b, "updated") ?? tag(b, "dc:date") ?? ""));
    let url: URL;
    try { url = new URL(link.replace(/^http:\/\//i, "https://")); } catch { continue; }
    if (url.protocol !== "https:" || title.length < 5) continue;
    const at = Number.isNaN(when.getTime()) || when.getTime() > now + 3600000 ? new Date(now) : when;
    if (now - at.getTime() > 14 * 86400000) continue;
    if (opts.filter && !BUSINESS_RE.test(title)) continue;
    out.push({ url: url.toString().slice(0, 600), title: title.slice(0, 300), source, published_at: at.toISOString() });
  }
  return out.sort((a, b) => b.published_at.localeCompare(a.published_at)).slice(0, opts.max ?? 12);
}

/** The source's name and how long ago, for the feed card and the email. */
export const headlineSub = (h: { source: string; published_at: string }) =>
  `${h.source} · ${new Date(h.published_at).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" })}`;
