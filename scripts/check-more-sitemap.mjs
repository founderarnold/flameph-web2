// Fails the build when an existing page of flameph.org is missing from the More page (src/content/more.json).
// Runs before every build (npm "prebuild") and in the test suite. Prints the More-vs-sitemap result.
//
// A page is "covered" when More links to it, or when more.json says why it is not listed (notListed / notListedPrefixes).
// Detail pages such as /news/[slug] are covered by their parent (/news), which must be listed.
// It also fails when More links to a page that does not exist, or misses a menu or sitemap link.

import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appDir = path.join(root, "src", "app");

/** Every URL path that has a page.tsx (route groups like "(member)" removed). */
export async function pageRoutes(dir = appDir, prefix = "") {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (e.name.startsWith("_")) continue; // private folders
      const seg = e.name.startsWith("(") && e.name.endsWith(")") ? "" : `/${e.name}`;
      out.push(...(await pageRoutes(path.join(dir, e.name), prefix + seg)));
    } else if (/^page\.(tsx|ts|jsx|js|mdx)$/.test(e.name)) {
      out.push(prefix || "/");
    }
  }
  return out;
}

const clean = (href) => href.replace(/[?#].*$/, "") || "/";

export async function checkMore() {
  const more = JSON.parse(await readFile(path.join(root, "src", "content", "more.json"), "utf8"));
  const nav = JSON.parse(await readFile(path.join(root, "src", "content", "nav.json"), "utf8"));
  const navTs = await readFile(path.join(root, "src", "lib", "nav.ts"), "utf8");
  const routes = (await pageRoutes()).sort();
  const listed = new Set(more.groups.flatMap((g) => g.items).filter((i) => !i.external).map((i) => clean(i.href)));
  const listedExternal = new Set(more.groups.flatMap((g) => g.items).filter((i) => i.external).map((i) => i.href.replace(/\/$/, "")));
  const reasons = more.notListed ?? {};
  const prefixes = Object.keys(more.notListedPrefixes ?? {});

  const missing = [];
  const covered = [];
  for (const r of routes) {
    if (listed.has(r)) { covered.push([r, "listed"]); continue; }
    if (reasons[r]) { covered.push([r, `not listed: ${reasons[r]}`]); continue; }
    const pre = prefixes.find((p) => r.startsWith(p));
    if (pre) { covered.push([r, `not listed: ${more.notListedPrefixes[pre]}`]); continue; }
    const dyn = r.indexOf("/[");
    if (dyn > 0 && listed.has(r.slice(0, dyn))) { covered.push([r, `detail page of ${r.slice(0, dyn)}`]); continue; }
    if (r === "/" && listed.has("/")) continue;
    missing.push(r);
  }
  // "/" is listed as "/?view=public".
  if (missing.includes("/") && more.groups.some((g) => g.items.some((i) => i.href.startsWith("/?")))) missing.splice(missing.indexOf("/"), 1);

  // Links in More must point at real pages (internal) — no dead links.
  const routeSet = new Set(routes);
  const dead = [...listed].filter((h) => !routeSet.has(h));

  // Everything in the site menus and the footer legal links must also be in More.
  const menuLinks = nav.flatMap((g) => g.items);
  const legal = [...navTs.matchAll(/href: "([^"]+)"/g)].map((m) => m[1]);
  const menuMissing = [
    ...menuLinks.filter((i) => (i.external || /^https?:/.test(i.href) ? !listedExternal.has(i.href.replace(/\/$/, "")) : !listed.has(clean(i.href)) && !reasons[clean(i.href)])),
    ...legal.filter((h) => !listed.has(clean(h))).map((href) => ({ href })),
  ].map((i) => i.href)
    // "/login?next=/account/business" in the menu is the "List your business" link; More lists /account/business.
    .filter((h) => !(h.startsWith("/login?next=") && listed.has(decodeURIComponent(h.split("next=")[1]))));

  return { routes, covered, missing, dead, menuMissing: [...new Set(menuMissing)] };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const r = await checkMore();
  const ok = !r.missing.length && !r.dead.length && !r.menuMissing.length;
  console.log(`[more-vs-sitemap] ${r.routes.length} pages found; ${r.covered.filter(([, w]) => w === "listed").length} listed in More, ${r.covered.length - r.covered.filter(([, w]) => w === "listed").length} covered with a reason.`);
  if (r.missing.length) console.error(`[more-vs-sitemap] MISSING from More: ${r.missing.join(", ")}`);
  if (r.dead.length) console.error(`[more-vs-sitemap] More links to pages that don't exist: ${r.dead.join(", ")}`);
  if (r.menuMissing.length) console.error(`[more-vs-sitemap] Menu or footer links missing from More: ${r.menuMissing.join(", ")}`);
  if (!ok) {
    console.error("[more-vs-sitemap] Build stopped: add the page to src/content/more.json (or a reason under notListed).");
    process.exit(1);
  }
  console.log("[more-vs-sitemap] OK: every page is in More.");
}
