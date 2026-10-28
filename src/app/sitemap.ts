import type { MetadataRoute } from "next";
import { NAV, LEGAL_LINKS } from "@/lib/nav";
import { ORG } from "@/lib/site";
import { list } from "@/lib/content";
import { publicBusinesses } from "@/lib/directory";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const paths = new Set<string>(["/", "/join", "/login", "/get-involved", "/news", ...LEGAL_LINKS.map((l) => l.href)]);
  NAV.forEach((g) => g.items.forEach((i) => !i.external && paths.add(i.href)));
  const [biz, posts, res] = await Promise.all([
    publicBusinesses<{ id: string; owner_id: string; slug: string }>(),
    list<{ slug: string }>({ table: "posts", select: "slug" }),
    list<{ slug: string }>({ table: "resources", select: "slug" }),
  ]);
  biz.forEach((b) => paths.add(`/directory/${b.slug}`));
  posts.forEach((p) => paths.add(`/news/${p.slug}`));
  res.forEach((r) => paths.add(`/resources/${r.slug}`));
  return [...paths].map((p) => ({ url: `${ORG.url}${p}`, changeFrequency: "weekly", priority: p === "/" ? 1 : 0.6 }));
}
