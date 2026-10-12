import type { MetadataRoute } from "next";
import { ORG } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/account", "/api", "/auth", "/verify"] }], sitemap: `${ORG.url}/sitemap.xml` };
}
