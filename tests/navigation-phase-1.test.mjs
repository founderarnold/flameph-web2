// Navigation Phase 1 (owner GO 28 Nov 2026): the phone menu, the new bottom bar, Create, menu search and the platform switcher.
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { pageRoutes } from "../scripts/check-more-sitemap.mjs";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");

/** Loads a src/ TypeScript or JSON module with its "@/..." imports (no Next.js needed). */
const cache = new Map();
async function load(p) {
  if (cache.has(p)) return cache.get(p);
  let file = p, src;
  for (const ext of ["", ".ts", ".json"]) { try { src = await read(p + ext); file = p + ext; break; } catch {} }
  let js;
  if (file.endsWith(".json")) js = `export default ${src};`;
  else {
    js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    for (const m of [...js.matchAll(/from "(@\/[^"]+)"/g)]) js = js.replace(`"${m[1]}"`, `"${await load(m[1].replace("@/", "src/"))}"`);
  }
  const url = `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
  cache.set(p, url);
  return url;
}
const M = await import(await load("src/lib/mobile-menu.ts"));
const S = await import(await load("src/lib/site-search.ts"));
const shell = await import(await load("src/lib/member-shell.ts"));
const E = await import(await load("src/lib/ecosystem.ts"));
const routes = new Set(await pageRoutes());
const REDIRECTS = ["/directory"];
const menuShell = await read("src/components/MobileMenu.tsx");
const menuFile = menuShell + await read("src/components/MobileMenuBody.tsx");
const dialog = await read("src/components/shell/useDialog.ts");
const bar = await read("src/components/shell/MemberTabsNav.tsx");
const door = await read("src/components/EcosystemFrontDoor.tsx");
const nav = JSON.parse(await read("src/content/nav.json"));

const path = (h) => h.replace(/[?#].*$/, "") || "/";

test("bottom bar: the owner's new tabs, members and visitors", () => {
  assert.deepEqual(shell.TABS.map((t) => t.key), ["home", "workspace", "create", "inbox", "menu"]);
  assert.deepEqual(shell.VISITOR_TABS.map((t) => [t.label, t.href]), [["Home", "/"], ["Explore", "/explore"], ["Join Free", "/join"], ["Free Tools", "/benefits"], ["Menu", null]]);
  for (const t of [...shell.TABS, ...shell.VISITOR_TABS]) if (t.href) assert.ok(routes.has(t.href), t.href);
  assert.match(bar, /<CreateSheet trigger=/);
  assert.match(bar, /aria-controls="site-menu" aria-haspopup="dialog"/);
  assert.match(bar, /aria-controls="create-sheet" aria-haspopup="dialog"/);
  assert.match(bar, /CountBadge count=\{inbox\}/, "Inbox tab shows the inbox count");
});

test("Group Order, Fulfillment and Flame POS stay one tap from the menu, and Group Order is in Create", () => {
  assert.deepEqual(M.QUICK_SHORTCUTS.map((s) => s.label), ["Group Order", "Fulfillment", "Flame POS"]);
  assert.equal(M.hrefFor(M.QUICK_SHORTCUTS[0], true), "/group-order");
  assert.equal(M.hrefFor(M.QUICK_SHORTCUTS[0], false), "/deals");
  assert.ok(M.CREATE_ACTIONS.some((a) => a.href === "/group-order/new"));
  assert.match(menuFile, /QUICK_SHORTCUTS\.map/);
});

test("every menu, Create and workspace link opens a real page (or an allow-listed ecosystem page)", () => {
  for (const { link } of M.allMenuLinks()) {
    for (const h of [link.href, link.memberHref].filter(Boolean)) {
      if (/^https?:/.test(h)) {
        const host = new URL(h).hostname.replace(/^www\./, "");
        if (host === "marketplaceph.com" || host === "negosyodepot.com") assert.notEqual(E.viaGo(h), h, `${h} must be on the /go/ allow-list`);
        else assert.ok(["managerspizza.com", "pages.flameph.org"].includes(host), h);
      } else assert.ok(routes.has(path(h)) || REDIRECTS.includes(path(h)), `${link.label}: ${h} is not a page`);
    }
  }
  for (const r of M.roleLinks({ roles: ["super_admin", "chapter_tester", "finance"], accredited: true })) assert.ok(routes.has(path(r.href)), r.href);
  assert.ok(routes.has("/more") && routes.has("/start") && routes.has("/contact"));
});

test("no page is lost: every site-menu link is also in the phone menu", () => {
  const inMenu = new Set(M.allMenuLinks().flatMap(({ link }) => [link.href, link.memberHref].filter(Boolean)).map((h) => h.replace(/\/$/, "")));
  for (const p of M.PLATFORMS) inMenu.add(p.href.replace(/\/$/, ""));
  for (const extra of ["/start", "/"]) inMenu.add(extra);
  for (const g of nav) for (const it of g.items) {
    const h = it.href.startsWith("/login?next=") ? decodeURIComponent(it.href.split("next=")[1]) : it.href.replace(/\/$/, "");
    assert.ok(inMenu.has(h), `${g.label} > ${it.label} (${it.href}) is missing from the phone menu`);
  }
});

test("two levels at most, labels at a readable size, rows at least 48px", () => {
  for (const s of M.SECTIONS) for (const l of s.links) assert.equal(l.links, undefined, `${s.label} > ${l.label} must not open a third level`);
  assert.equal(M.GOAL_GROUPS.length, 4);
  assert.deepEqual(M.GOAL_GROUPS.map((g) => g.label), ["Increase Sales", "Reduce Expenses", "Start a Business", "Earn Extra Income"]);
  assert.match(menuFile, /min-h-12/);
  assert.doesNotMatch(menuFile, /min-h-11/);
  assert.match(menuFile, /text-\[15px\]/);
  assert.match(menuFile, /text-base font-bold/);
});

test("goal shortcuts reuse the 28 homepage goal cards (no second discovery system)", () => {
  const titles = [...door.matchAll(/\{ title: "([^"]+)", text:/g)].map((m) => m[1]);
  assert.equal(titles.length, 28);
  const used = M.GOAL_GROUPS.flatMap((g) => g.cards);
  for (const t of used) assert.ok(titles.includes(t), `${t} is not a goal card`);
  assert.equal(new Set(used).size, 28, "each of the 28 cards appears in exactly one goal shortcut");
  assert.match(menuFile, /import \{ ACTIONS \} from "\.\/EcosystemFrontDoor"/);
  assert.match(menuShell, /dynamic\(loadBody, \{ ssr: false/, "the menu's content loads on its own, not with every page");
});

test("one section open at a time, with aria-expanded and aria-controls", () => {
  assert.match(menuFile, /const \[openKey, setOpenKey\] = useState<string \| null>\(null\)/);
  assert.match(menuFile, /setOpenKey\(\(cur\) => \(cur === k \? null : k\)\)/);
  assert.match(menuFile, /aria-expanded=\{isOpen\} aria-controls=\{`menu-\$\{k\}`\}/);
});

test("dialog: labelled, closes with Escape and Back, keeps focus inside, returns focus, locks page scroll", () => {
  assert.match(menuFile, /role="dialog" aria-modal="true" aria-labelledby="site-menu-title"/);
  assert.match(menuFile, /aria-label=\{`\$\{labels\.close\} menu`\}/);
  assert.match(dialog, /e\.key === "Escape"/);
  assert.match(dialog, /e\.key !== "Tab"/);
  assert.match(dialog, /window\.addEventListener\("popstate", onPop\)/);
  assert.match(dialog, /window\.history\.pushState\(\{ \.\.\.state, \[key\]: true \}/);
  assert.match(dialog, /opener\.current\?\.focus\?\.\(/);
  assert.match(dialog, /body\.style\.overflow = "hidden"/);
  assert.match(dialog, /body\.style\.overflow = before/);
  assert.match(menuFile, /env\(safe-area-inset-top\)/);
  assert.match(menuFile, /overscroll-contain/);
  assert.match(menuFile, /min-\[480px\]:w-\[90vw\]/, "90% wide on larger phones, full width on narrow ones");
});

test("no database call when the menu opens; member data comes with the page", async () => {
  assert.doesNotMatch(menuFile, /supabase|fetch\(/i);
  assert.doesNotMatch(dialog, /supabase|fetch\(/i);
  const data = await read("src/lib/member-shell-data.ts");
  assert.match(data, /export async function menuMember\(\)/);
  assert.match(await read("src/app/layout.tsx"), /Promise\.all\(\[unreadMessages\(\), inboxCount\(\), latestFeedAt\(\), menuMember\(\)\]\)/);
});

test("role dashboards only for roles that exist, and never for ordinary members", async () => {
  assert.deepEqual(M.roleLinks({ roles: [], accredited: false }), []);
  assert.deepEqual(M.roleLinks({ roles: ["chapter_tester"], accredited: false }).map((l) => l.href), ["/partner-us/samples"]);
  assert.deepEqual(M.roleLinks({ roles: [], accredited: true }).map((l) => l.href), ["/partner-us/offers"]);
  assert.ok(M.roleLinks({ roles: ["admin"], accredited: false }).some((l) => l.href === "/admin"));
  assert.ok(M.roleLinks({ roles: ["chapter_leader"], accredited: false }).some((l) => l.href === "/admin/moderation"));
  const auth = await read("src/lib/auth.ts");
  for (const r of ["super_admin", "admin", "chapter_leader", "editor", "chapter_coordinator", "chapter_tester", "national_reviewer", "finance"]) assert.ok(auth.includes(`"${r}"`), r);
  const src = await read("src/lib/mobile-menu.ts");
  for (const r of [...src.matchAll(/has\("([a-z_]+)"\)/g)].map((m) => m[1])) assert.ok(auth.includes(`"${r}"`), `${r} is not a real role`);
});

test("menu search: Filipino words, parent category, and permissions", () => {
  const find = (q, a) => S.searchSite(q, 20, a).map((r) => r.href);
  assert.ok(find("puhunan").includes("/opportunities"), "Puhunan -> financing");
  assert.ok(find("trabaho").includes("https://www.marketplaceph.com/jobs"), "Trabaho -> jobs");
  assert.ok(find("libre").includes("/benefits"), "Libre -> free benefits");
  assert.ok(find("tipid").includes("/deals"), "Tipid -> group ordering");
  assert.ok(find("benta").some((h) => h.includes("/sell/new") || h === "/pos"), "Benta -> sell");
  assert.ok(find("kita").includes("/get-involved/affiliate"), "Kita -> income and referral");
  assert.ok(find("supplier").some((h) => h.includes("#/find") || h === "/partner-us"), "Supplier -> suppliers");
  assert.ok(find("negosyo").length > 0, "Negosyo -> business opportunities");
  assert.ok(S.searchSite("jobs", 5)[0].section, "results show their parent category");
  // Visitors don't see member-only or staff-only pages; members and staff do.
  assert.ok(!find("transaction records").includes("/records"));
  assert.ok(find("transaction records", { signedIn: true }).includes("/records"));
  assert.ok(!find("admin console", { signedIn: true }).includes("/admin"));
  assert.ok(find("admin console", { signedIn: true, staff: true }).includes("/admin"));
});

test("platform switcher: four platforms with logos; one-account wording only where sign-in is in place", async () => {
  assert.deepEqual(M.PLATFORMS.map((p) => p.name), ["FLAMEPH.org", "MarketplacePH.com", "NegosyoDepot.com", "ManagersPizza.com"]);
  for (const p of M.PLATFORMS) await access(new URL(`../public${p.logo}`, import.meta.url));
  assert.equal(M.PLATFORMS.find((p) => p.key === "managerspizza").sharedSignIn, undefined);
  assert.match(menuFile, /signs you in on MarketplacePH and NegosyoDepot\./);
  assert.doesNotMatch(menuFile, /signs you in on[^"]*Manager/);
  assert.doesNotMatch(menuFile, /token=|\?code=/, "no sign-in pass is put in a link");
});

test("menu header: official logo and tagline; guests get Join and Log in, members their name, tier and workspace", () => {
  assert.match(menuFile, /<Logo link=\{false\}/);
  assert.match(menuFile, /\{TAGLINES\.main\}/);
  assert.match(menuFile, />Join for Free</);
  assert.match(menuFile, /\{member\.tier\} member/);
  assert.match(menuFile, />My FLAME Workspace</);
  assert.match(menuFile, /<form action="\/auth\/logout" method="post"/);
});

test("statuses only where the page itself shows them", async () => {
  const flagged = M.SECTIONS.flatMap((s) => s.links).filter((l) => l.status).map((l) => [l.href, l.status]);
  assert.deepEqual(flagged, [["/fulfillment", "Coming soon"], ["/trainings-webinars", "Beta"], ["/ridesafe", "Beta"]]);
  assert.match(await read("src/app/fulfillment/page.tsx"), /PageHero status="soon"/);
  assert.match(await read("src/app/benefits/page.tsx"), /title: "RideSafe"[^\n]*status: "beta"/);
  assert.match(await read("src/components/QuickLook.tsx"), /title: "AI Tools for Business"[^\n]*status: "beta"/);
});

test("site menu: Jobs and Sell open the right MarketplacePH pages", () => {
  const opp = nav.find((g) => g.key === "opportunities").items;
  assert.equal(opp.find((i) => i.label === "Jobs & Hiring on MarketplacePH").href, "https://www.marketplaceph.com/jobs");
  assert.equal(opp.find((i) => i.label === "Sell Products or Find Customers").href, "https://www.marketplaceph.com/sell/new");
  assert.notEqual(E.viaGo("https://www.marketplaceph.com/jobs"), "https://www.marketplaceph.com/jobs");
});

test("desktop menus are unchanged: same 6 groups and labels", () => {
  assert.deepEqual(nav.map((g) => g.label), ["Explore", "Benefits", "Opportunities", "Get Involved", "Partner With Us", "About"]);
  assert.equal(nav.reduce((n, g) => n + g.items.length, 0), 52);
});
