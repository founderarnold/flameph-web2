// Phase 13: member screens on a LOCAL copy, signed in as a sample member against scripts/release/mock-supabase.mjs.
// Checks the bottom bar at 320-740px (phones and folding phones; from 768px the site header menus take over) (five labels, no cut-off, no wrapping, tap targets >= 44px), the top bar (logo goes
// Home, Messages button shows its unread count) and that every member-only feature page renders.
//
//   1. Build and start the copy pointed at the stand-in:
//        NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=sample npm run build && npx next start -p 3100
//   2. node scripts/release/member-shell.mjs        (BASE=http://127.0.0.1:3100, BROWSERS=chromium,firefox,webkit,msedge)

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { FEATURES } from "./features.mjs";
import { startMock, sessionCookie, UNREAD } from "./mock-supabase.mjs";

const BASE = (process.env.BASE || "http://127.0.0.1:3100").replace(/\/$/, "");
const MOCK_PORT = Number(process.env.MOCK_PORT || 54321);
const OUT = path.resolve(process.env.OUT || "member-shell-out");
const WANT = (process.env.BROWSERS || "chromium").split(",").map((s) => s.trim());
import { loadPlaywright } from "./load-playwright.mjs";
const { chromium, firefox, webkit } = await loadPlaywright();
const launch = { chromium: () => chromium.launch(), msedge: () => chromium.launch({ channel: "msedge" }), firefox: () => firefox.launch(), webkit: () => webkit.launch() };
const NAME = { chromium: "Chrome", msedge: "Edge", firefox: "Firefox", webkit: "Safari (WebKit)" };

const mock = await startMock(MOCK_PORT);
const results = [];
const record = (r) => { results.push(r); console.log(`${r.pass ? "ok  " : "FAIL"} ${r.device} ${r.check} ${r.note ?? ""}`); };

async function signedInContext(browser, engine, viewport) {
  const mobile = engine !== "firefox" && viewport.width < 1024;
  const ctx = await browser.newContext({ viewport, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  const c = sessionCookie(new URL(BASE).port);
  await ctx.addCookies([{ name: c.name, value: c.value, url: BASE }]);
  return ctx;
}

async function shell(browser, engine, width) {
  const device = `${NAME[engine]} @${width}px`;
  const ctx = await signedInContext(browser, engine, { width, height: 640 });
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(String(e.message)));
  await page.goto(`${BASE}/home`, { waitUntil: "networkidle" });
  const bar = await page.evaluate(() => {
    const nav = document.querySelector("[data-shell='bottom-bar']");
    if (!nav) return null;
    return [...nav.querySelectorAll("a")].map((a) => {
      const label = a.querySelector("[data-tab-label]") ?? a;
      const r = a.getBoundingClientRect(), lr = label.getBoundingClientRect();
      const cs = getComputedStyle(label);
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.25;
      return { text: label.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height), font: cs.fontSize,
        cut: label.scrollWidth > label.clientWidth + 1 || lr.left < r.left - 1 || lr.right > r.right + 1, lines: Math.round(lr.height / lh), onScreen: r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1 };
    });
  });
  if (!bar) record({ device, check: "bottom bar", pass: false, note: `not found (page ${new URL(page.url()).pathname})` });
  else {
    record({ device, check: "bottom bar: five tabs", pass: bar.length === 5, note: bar.map((b) => b.text).join(" | ") });
    for (const b of bar) record({ device, check: `bottom bar: ${b.text}`, pass: !b.cut && b.lines <= 1 && b.w >= 44 && b.h >= 44 && b.onScreen, note: `${b.w}x${b.h}px, ${b.font}${b.cut ? ", CUT OFF" : ""}${b.lines > 1 ? ", WRAPS" : ""}` });
  }
  const top = await page.evaluate(() => {
    const home = document.querySelector("[data-shell='home']"), msg = document.querySelector("[data-shell='messages']");
    const r = msg?.getBoundingClientRect(), badge = msg?.querySelector(".count-badge > span[aria-hidden]");
    const br = badge?.getBoundingClientRect();
    return { home: home?.getAttribute("href"), msg: !!r && r.width >= 44 && r.height >= 44 && r.right <= innerWidth + 1, label: msg?.getAttribute("aria-label"), badge: badge?.textContent?.trim() ?? null, badgeOn: !!br && br.width > 0 && br.right <= innerWidth + 1 && br.top >= -1 };
  });
  record({ device, check: "top bar: logo returns Home", pass: top.home === "/home", note: `links to ${top.home}` });
  record({ device, check: "top bar: Messages unread count visible", pass: top.msg && top.badgeOn && top.badge === String(UNREAD), note: `${top.label}; badge "${top.badge}"` });
  await page.goto(`${BASE}/more`, { waitUntil: "networkidle" });
  await page.locator("[data-shell='home']").first().click();
  await page.waitForURL((u) => u.pathname === "/home", { timeout: 15000 }).catch(() => {});
  record({ device, check: "top bar: tap logo on More goes Home", pass: new URL(page.url()).pathname === "/home", note: new URL(page.url()).pathname });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  record({ device, check: "no sideways scroll on Home", pass: overflow <= 1, note: `${overflow}px` });
  if (errors.length) record({ device, check: "no script errors", pass: false, note: errors[0].slice(0, 160) });
  await ctx.close();
}

async function memberPages(browser, engine, viewport) {
  const device = `${NAME[engine]} @${viewport.width}px`;
  const ctx = await signedInContext(browser, engine, viewport);
  for (const f of FEATURES) for (const p of f.pages.filter((x) => x.expect === "member")) {
    const page = await ctx.newPage();
    const errors = []; page.on("pageerror", (e) => errors.push(String(e.message)));
    const res = await page.goto(BASE + p.path, { waitUntil: "networkidle" }).catch(() => null);
    const n = res ? await page.locator(p.marker).count() : 0;
    const fin = new URL(page.url()).pathname;
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth).catch(() => 0);
    record({ device, check: `${f.name} (member) ${p.path}`, pass: !!res && res.status() < 400 && n > 0 && !fin.startsWith("/login") && overflow <= 1 && !errors.length, note: `status ${res?.status()}, ${fin}${overflow > 1 ? `, sideways ${overflow}px` : ""}${errors.length ? `, error ${errors[0].slice(0, 120)}` : ""}` });
    await page.close();
  }
  await ctx.close();
}

for (const engine of WANT) {
  let browser;
  try { browser = await launch[engine](); } catch (e) { record({ device: NAME[engine] ?? engine, check: "browser start", pass: false, note: String(e.message).split("\n")[0] }); continue; }
  for (const w of [320, 360, 390, 740]) await shell(browser, engine, w);
  await memberPages(browser, engine, { width: 360, height: 740 });
  await memberPages(browser, engine, { width: 1366, height: 768 });
  await browser.close();
}
mock.close();
await mkdir(OUT, { recursive: true });
const failed = results.filter((r) => !r.pass);
await writeFile(path.join(OUT, "results.json"), JSON.stringify({ base: BASE, total: results.length, failed: failed.length, results }, null, 2));
console.log(`\n${results.length} checks, ${failed.length} failed.`);
process.exit(failed.length ? 1 : 0);
