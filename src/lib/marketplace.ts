import "server-only";
import { unstable_cache } from "next/cache";

/** Reads sample products from our sister site MarketplacePH (www.marketplaceph.com) to show under FLAME AI answers. */

export const MARKETPLACE = "https://www.marketplaceph.com";

export type MarketProduct = { id: string; name: string; description: string; price: string; image: string | null; url: string; store: { name: string; url: string | null } };

const STOP = new Set(`
a an and are as at be but by can do does for from get go have how i if in into is it its make me my of on or our so than that the their then there these this to too was we what when where which who why will with you your
about after also any best business businesses could each even good help just know like more most much need only other some start starting such them they want way well work would
ako akin aking ako'y ano anong ang ano-ano bakit dito doon gaano gusto hindi iba ibang ikaw ito iyan iyon kami kayo kaya kami kung lang mag mga may mayroon meron naman namin nang natin negosyo negosyante niya nila ninyo pag paano para pero po saan sila siya tayo tungkol yung yan yun walang wala
magkano magsimula pwede puwede kailangan dapat paraan maliit malaki puhunan online selling sell seller sellers buyer buyers customer customers price prices pricing presyo benta kita profit tips step steps
`.trim().split(/\s+/));

/** Search words, most specific first: the member's question, then words the answer keeps repeating. */
export function keywords(question: string, answer = "", max = 5): string[] {
  const words = (s: string) => (s.toLowerCase().match(/[a-zñ]{4,}/g) ?? []).filter((w) => !STOP.has(w));
  const out = [...new Set(words(question))];
  const counts = new Map<string, number>();
  for (const w of words(answer)) counts.set(w, (counts.get(w) ?? 0) + 1);
  for (const [w] of [...counts].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1])) if (!out.includes(w)) out.push(w);
  return out.slice(0, max);
}

async function page(path: string): Promise<string> {
  try {
    const res = await fetch(MARKETPLACE + path, { headers: { "user-agent": "FLAMEPH-AI/1.0 (+https://www.flameph.org)" }, signal: AbortSignal.timeout(6000), next: { revalidate: 3600 } });
    return res.ok ? await res.text() : "";
  } catch {
    return "";
  }
}

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const metaOf = (html: string, prop: string) => {
  const m = html.match(new RegExp(`<meta[^>]+(?:property|name)="${prop}"[^>]+content="([^"]*)"`)) ?? html.match(new RegExp(`<meta[^>]+content="([^"]*)"[^>]+(?:property|name)="${prop}"`));
  return m ? decode(m[1]) : "";
};
const listingIds = (html: string) => [...new Set([...html.matchAll(/\/listing\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/g)].map((m) => m[1]))];

async function product(id: string): Promise<MarketProduct | null> {
  const html = await page(`/listing/${id}`);
  const name = metaOf(html, "og:title");
  if (!name) return null;
  // The listing page describes itself as "<price> · <store> — <description>".
  const [price = "", rest = ""] = metaOf(html, "og:description").split(/ · ([\s\S]*)/);
  const [storeName = "", desc = ""] = rest.split(/ — ([\s\S]*)/);
  const description = desc.trim() === name.trim() ? "" : desc;
  const slug = html.match(/href="\/store\/([a-z0-9-]+)"/)?.[1];
  return {
    id, name, price: price.trim(), description: description.trim(), image: metaOf(html, "og:image") || null,
    url: `${MARKETPLACE}/listing/${id}`,
    store: { name: storeName.trim() || "MarketplacePH seller", url: slug ? `${MARKETPLACE}/store/${slug}` : null },
  };
}

const productCached = unstable_cache(product, ["mp-product"], { revalidate: 3600 });

/** Up to `limit` products matching the words; falls back to the products featured on MarketplacePH's home page. */
export const findProducts = unstable_cache(async (words: string[], limit = 2): Promise<MarketProduct[]> => {
  const ids: string[] = [];
  for (const w of words) {
    if (ids.length >= limit) break;
    for (const id of listingIds(await page(`/search?q=${encodeURIComponent(w)}`))) if (!ids.includes(id)) ids.push(id);
  }
  if (ids.length === 0) ids.push(...listingIds(await page("/")));
  const found = await Promise.all(ids.slice(0, limit + 2).map((id) => productCached(id)));
  return found.filter((p): p is MarketProduct => !!p).slice(0, limit);
}, ["mp-find"], { revalidate: 3600 });
