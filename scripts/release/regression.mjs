// Phase 13: live regression and device matrix for flameph.org. Read-only: it opens pages, it never submits a form
// (the one exception is the "Continue to my account" button on the sign-in link page for the test member).
//
// Run on a PC that has Playwright:   node scripts/release/regression.mjs
// Member-only screens (bottom bar at 320px, top bar, Messages count) are checked by scripts/release/member-shell.mjs
// against a local copy with sample data, because this script never signs in to the live site.
//   BASE=https://www.flameph.org      the site to check (default)
//   OUT=./regression-out              where the report goes (results.json + report.md)
//   BROWSERS=chromium,firefox,webkit,msedge   which engines to use (msedge = installed Microsoft Edge)
//   QUICK=1                           only the core pages on every pair
//
// Checks per page: final status < 400, the expected redirect (to /login for signed-out member pages), a marker element
// that proves the feature rendered, no uncaught script error, and no sideways scrolling at that screen width.
// Also: every More link (src/content/more.json) and every sitemap.xml address loads; the visitor logo returns Home.

import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FEATURES, CORE } from "./features.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = (process.env.BASE || "https://www.flameph.org").replace(/\/$/, "");
const OUT = path.resolve(process.env.OUT || "regression-out");
const QUICK = process.env.QUICK === "1";
const WANT = (process.env.BROWSERS || "chromium,firefox,webkit,msedge").split(",").map((s) => s.trim()).filter(Boolean);

import { loadPlaywright } from "./load-playwright.mjs";
const { chromium, firefox, webkit, devices } = await loadPlaywright();

/** The device matrix: mid-range Android, iPhone, tablet, desktop, across Chrome, Safari (WebKit), Firefox and Edge. */
const MATRIX = [
  { id: "android-chrome", label: "Mid-range Android, Chrome", engine: "chromium", ctx: { ...devices["Moto G4"] }, full: true },
  { id: "iphone-safari", label: "iPhone, Safari (WebKit)", engine: "webkit", ctx: { ...devices["iPhone 12"] } },
  { id: "tablet-safari", label: "iPad, Safari (WebKit)", engine: "webkit", ctx: { ...devices["iPad (gen 7)"] } },
  { id: "tablet-chrome", label: "Android tablet, Chrome", engine: "chromium", ctx: { ...devices["Galaxy Tab S4"] } },
  { id: "desktop-chrome", label: "Desktop, Chrome", engine: "chromium", ctx: { viewport: { width: 1366, height: 768 } }, full: true },
  { id: "desktop-edge", label: "Desktop, Edge", engine: "msedge", ctx: { viewport: { width: 1366, height: 768 } } },
  { id: "desktop-firefox", label: "Desktop, Firefox", engine: "firefox", ctx: { viewport: { width: 1366, height: 768 } } },
  { id: "phone-firefox", label: "Phone width, Firefox", engine: "firefox", ctx: { viewport: { width: 360, height: 740 } } },
  { id: "desktop-safari", label: "Desktop, Safari (WebKit)", engine: "webkit", ctx: { viewport: { width: 1366, height: 768 } } },
].filter((m) => WANT.includes(m.engine));

const launchers = {
  chromium: () => chromium.launch(),
  msedge: () => chromium.launch({ channel: "msedge" }),
  firefox: () => firefox.launch(),
  webkit: () => webkit.launch(),
};

const results = [];
const record = (r) => { results.push(r); if (!r.pass) console.log(`FAIL ${r.device} ${r.check} ${r.path ?? ""} ${r.note ?? ""}`); };

async function checkPage(context, device, p, signedIn) {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message || e).slice(0, 200)));
  let status = 0, finalPath = "", note = "";
  try {
    const res = await page.goto(p.path.startsWith("http") ? p.path : BASE + p.path, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    status = res?.status() ?? 0;
    finalPath = new URL(page.url()).pathname;
    const expect = p.expect ?? "ok";
    let pass = status > 0 && status < 400;
    if (expect === "login") { pass = finalPath.startsWith("/login"); note = `went to ${finalPath}`; }
    else if (expect === "member" && finalPath.startsWith("/login")) { pass = false; note = "sent to sign-in (test member not signed in)"; }
    if (pass && p.marker && expect !== "login") {
      const n = await page.locator(p.marker).count();
      if (n < (p.count ?? 1)) { pass = false; note = `found ${n} of ${p.count ?? 1} ${p.marker}`; }
      else if (p.count) note = `${n} found`;
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 1) { pass = false; note += ` sideways scroll ${overflow}px`; }
    if (errors.length) { pass = false; note += ` script error: ${errors[0]}`; }
    record({ device, check: p.feature ?? "page", path: p.path, signedIn, status, finalPath, pass, note: note.trim() });
    return page;
  } catch (e) {
    record({ device, check: p.feature ?? "page", path: p.path, signedIn, status, finalPath, pass: false, note: `did not load: ${String(e.message).split("\n")[0]}` });
    return page;
  }
}

/** Every goal card opens a page that loads (MarketplacePH/NegosyoDepot cards open the /go screen first). */
async function checkGoalCards(context, device) {
  const page = await context.newPage();
  await page.goto(`${BASE}/?view=public`, { waitUntil: "domcontentloaded" });
  const cards = await page.$$eval("#choose-a-goal .grid > a", (as) => as.map((a) => ({ title: a.querySelector("span.text-lg")?.textContent?.trim() ?? a.textContent.trim().slice(0, 40), href: a.getAttribute("href") })));
  record({ device, check: "goal cards count", path: "/", pass: cards.length === 28, note: `${cards.length} cards` });
  for (const c of cards) {
    const url = c.href.startsWith("http") ? c.href : BASE + c.href;
    const r = await page.request.get(url, { maxRedirects: 5 }).catch(() => null);
    record({ device, check: `goal card: ${c.title}`, path: c.href, status: r?.status() ?? 0, pass: !!r && r.status() < 400 });
  }
  await page.close();
}

/** More-vs-sitemap on the live site: every More link and every sitemap address loads. */
async function checkMoreAndSitemap(context, device) {
  const more = JSON.parse(await readFile(path.join(root, "src/content/more.json"), "utf8"));
  const links = [...new Set(more.groups.flatMap((g) => g.items).filter((i) => !i.external).map((i) => i.href.replace(/#.*$/, "")))];
  const page = await context.newPage();
  for (const href of links) {
    const r = await page.request.get(BASE + href, { maxRedirects: 5 }).catch(() => null);
    record({ device, check: "More link", path: href, status: r?.status() ?? 0, pass: !!r && r.status() < 400 });
  }
  const sm = await page.request.get(`${BASE}/sitemap.xml`);
  const locs = [...(await sm.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  record({ device, check: "sitemap.xml", path: "/sitemap.xml", status: sm.status(), pass: sm.ok() && locs.length > 0, note: `${locs.length} addresses` });
  const listed = new Set(links);
  for (const loc of locs) {
    const u = new URL(loc);
    const r = await page.request.get(BASE + u.pathname + u.search, { maxRedirects: 5 }).catch(() => null);
    record({ device, check: "sitemap address", path: u.pathname, status: r?.status() ?? 0, pass: !!r && r.status() < 400, note: listed.has(u.pathname) ? "in More" : "" });
  }
  await page.close();
}

/** Signed-out top bar: the logo returns to the home page. */
async function checkPublicLogo(context, device) {
  const page = await context.newPage();
  await page.goto(`${BASE}/news`, { waitUntil: "domcontentloaded" });
  const href = await page.evaluate(() => document.querySelector("header a[href='/'], header a[href='/?view=public']")?.getAttribute("href") ?? null);
  record({ device, check: "visitor top bar: logo returns Home", path: "/news", pass: href === "/" || href === "/?view=public", note: `goes to ${href}` });
  await page.close();
}

await mkdir(OUT, { recursive: true });
const started = new Date().toISOString();
const engines = {};
for (const m of MATRIX) {
  let browser = engines[m.engine];
  if (!browser) {
    try { browser = engines[m.engine] = await launchers[m.engine](); }
    catch (e) { record({ device: m.label, check: "browser start", pass: false, note: String(e.message).split("\n")[0] }); continue; }
  }
  console.log(`== ${m.label}`);
  const context = await browser.newContext(m.ctx);
  const pages = FEATURES.flatMap((f) => f.pages.map((p) => ({ ...p, feature: f.name })))
    .filter((p) => (p.expect ?? "ok") !== "member") // member screens: scripts/release/member-shell.mjs
    .filter((p) => (m.full && !QUICK) || CORE.includes(p.path) || p.expect === "login");
  for (const p of pages) {
    const page = await checkPage(context, m.label, p, false);
    if (p.firstDetail && m.full) {
      const href = await page.locator(p.firstDetail).first().getAttribute("href").catch(() => null);
      if (href) { const dp = await checkPage(context, m.label, { path: href.replace(BASE, ""), marker: "h1", feature: `${p.feature}: first listing` }, false); await dp.close(); }
      else record({ device: m.label, check: `${p.feature}: first listing`, pass: false, note: "no listing link found on /directory" });
    }
    await page.close();
  }
  if (m.full) { await checkGoalCards(context, m.label); await checkPublicLogo(context, m.label); }
  if (m.id === "desktop-chrome") await checkMoreAndSitemap(context, m.label);
  await context.close();

}
for (const b of Object.values(engines)) await b.close();

const failed = results.filter((r) => !r.pass);
await writeFile(path.join(OUT, "results.json"), JSON.stringify({ base: BASE, started, finished: new Date().toISOString(), total: results.length, failed: failed.length, results }, null, 2));
const byDevice = {};
for (const r of results) { byDevice[r.device] ??= { pass: 0, fail: 0 }; byDevice[r.device][r.pass ? "pass" : "fail"]++; }
const md = [
  `# Live regression: ${BASE}`, "", `Run ${started}. ${results.length} checks, ${failed.length} failed.`, "",
  "| Device and browser | Passed | Failed |", "|---|---|---|",
  ...Object.entries(byDevice).map(([d, c]) => `| ${d} | ${c.pass} | ${c.fail} |`), "",
  failed.length ? "## Failed checks" : "## No failures", "",
  ...failed.map((r) => `- ${r.device}: ${r.check} ${r.path ?? ""} (status ${r.status ?? "-"}) ${r.note ?? ""}`),
].join("\n");
await writeFile(path.join(OUT, "report.md"), md);
console.log(`\n${results.length} checks, ${failed.length} failed. Report: ${path.join(OUT, "report.md")}`);
process.exit(failed.length ? 1 : 0);
