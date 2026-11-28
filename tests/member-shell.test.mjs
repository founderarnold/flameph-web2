// Phase 3: the member shell, the Home feed and More.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { checkMore, pageRoutes } from "../scripts/check-more-sitemap.mjs";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const load = async (p) => {
  const js = ts.transpileModule(await read(p), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
};

const shell = await load("src/lib/member-shell.ts");
const layout = await read("src/app/layout.tsx");
const middleware = await read("src/middleware.ts");
const tabsNav = await read("src/components/shell/MemberTabsNav.tsx");
const homeButton = await read("src/components/shell/HomeButton.tsx");
const topBar = await read("src/components/Header.tsx");
const actions = await read("src/app/account/actions.ts");
const feed = await read("src/app/(member)/home/page.tsx");

// ---- More vs sitemap -----------------------------------------------------------
test("More lists every page of flameph.org (the build check passes)", async () => {
  const r = await checkMore();
  assert.ok(r.routes.length > 80, `found only ${r.routes.length} pages`);
  assert.deepEqual(r.missing, [], `missing from More: ${r.missing.join(", ")}`);
  assert.deepEqual(r.dead, [], `More links to pages that don't exist: ${r.dead.join(", ")}`);
  assert.deepEqual(r.menuMissing, [], `menu links missing from More: ${r.menuMissing.join(", ")}`);
});

test("the sitemap check finds pages in route groups and nested folders", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "more-"));
  for (const d of ["(member)/home", "news/[slug]", "_private/x", "a/b"]) await mkdir(path.join(dir, d), { recursive: true });
  for (const f of ["page.tsx", "(member)/home/page.tsx", "news/[slug]/page.tsx", "_private/x/page.tsx", "a/b/page.tsx"]) await writeFile(path.join(dir, f), "");
  assert.deepEqual((await pageRoutes(dir)).sort(), ["/", "/a/b", "/home", "/news/[slug]"]);
});

test("the build runs the More check before building", async () => {
  const pkg = JSON.parse(await read("package.json"));
  assert.match(pkg.scripts.prebuild, /check-more-sitemap\.mjs/);
  const script = await read("scripts/check-more-sitemap.mjs");
  assert.match(script, /process\.exit\(1\)/);
});

test("More has the groups the owner asked for", async () => {
  const more = JSON.parse(await read("src/content/more.json"));
  const titles = more.groups.map((g) => g.title.toLowerCase()).join(" | ");
  for (const g of ["community", "workspace", "academy", "directory and mini-sites", "calculators", "ridesafe", "ka-flame ai", "member id", "chapters", "events", "volunteer", "settings", "legal"]) {
    assert.ok(titles.includes(g), `group "${g}" missing`);
  }
  assert.equal(more.groups.find((g) => g.key === "admin")?.staffOnly, true);
});

// ---- Home feed and tabs -----------------------------------------------------------
test("five tabs in the owner's order (owner chose the new tabs on 28 Nov 2026)", () => {
  assert.deepEqual(shell.TABS.map((t) => t.label), ["Home", "Workspace", "Create", "Inbox", "Menu"]);
  assert.deepEqual(shell.VISITOR_TABS.map((t) => t.label), ["Home", "Explore", "Join Free", "Free Tools", "Menu"]);
  assert.equal(shell.FEED, "/home");
  assert.equal(shell.activeTab("/home")?.key, "home");
  assert.equal(shell.activeTab("/workspace/inbox")?.key, "inbox");
  assert.equal(shell.activeTab("/workspace/calculators")?.key, "workspace");
  assert.equal(shell.activeTab("/group-order"), null);
  // The old tab pages keep "back goes to the feed".
  for (const p of ["/group-order", "/fulfillment", "/new-post", "/pos", "/more", "/workspace", "/workspace/inbox"]) assert.ok(shell.TOP_LEVEL.includes(p), p);
});

test("finished actions return to the feed, scrolled to the result", async () => {
  assert.equal(shell.feedResult("group-order-joined", "deal-1"), "/home?done=group-order-joined&focus=deal-1");
  assert.equal(shell.feedResult("posted"), "/home?done=posted");
  assert.match(actions, /redirect\(feedResult\(fd\.get\("leave"\) === "1" \? "group-order-left" : "group-order-joined", `deal-\$\{deal\}`\)\)/);
  assert.match(actions, /redirect\(feedResult\("profile"\)\)/);
  // Every feed item carries an id the result can scroll to: posts (post-<id>) and activity cards (deal-<id>, member-<id>…).
  assert.match(feed, /<ActivityCard card=\{e\.card\}/);
  assert.match(await read("src/components/feed/ActivityCard.tsx"), /id=\{card\.id\}/);
  assert.match(await read("src/components/feed/PostCard.tsx"), /id=\{`post-\$\{post\.id\}`\}/);
  assert.match(await read("src/lib/feed-data.ts"), /id: `deal-\$\{d\.id\}`/);
});

test("signed-in members land on the feed; visitors keep the public site", () => {
  assert.match(middleware, /const MEMBER_HOME = FEED;/);
  assert.match(middleware, /NextResponse\.rewrite\(new URL\(memberTab/);
  // One header and one phone bar for everyone (owner, 22 Nov 2026); members get their own items in them.
  assert.match(layout, /<Header member=\{member \? \{ unread, inbox, latest, staff: !!menu\?\.staff \} : undefined\} \/>/);
  assert.match(layout, /<MemberBottomBar menu=\{barMenu\} member=\{member && menu \? \{ inbox, menu \} : null\} \/>/);
  // No Supabase call for visitors: the session is only checked when the sign-in cookie is there.
  assert.match(layout, /const member = signedIn \? Boolean\(\(await shellSession\(\)\)\.user\) : false;/);
});

test("Home is never more than one tap away", () => {
  // a. the Home button goes to the feed (and scrolls to the top on the feed)
  assert.match(homeButton, /href=\{FEED\}/);
  assert.match(homeButton, /<span>Home<\/span>/);
  assert.match(homeButton, /window\.scrollTo\(\{ top: 0/);
  // b. tapping the active tab goes to the feed
  assert.match(tabsNav, /if \(current\?\.href !== href\) return;\s*e\.preventDefault\(\);[\s\S]*else router\.push\(FEED\);/);
  // c. back from a top-level tab goes to the feed
  assert.match(tabsNav, /window\.history\.pushState\(\{ \.\.\.state, \[GUARD\]: true \}/);
  assert.match(tabsNav, /router\.replace\(FEED\)/);
});

test("top bar: Home, search and Messages with an unread count; Home dot for unseen posts", () => {
  assert.match(topBar, /<SiteSearch audience=\{\{ signedIn: !!member/);
  assert.match(topBar, /href="\/messages"/);
  assert.match(topBar, /href="\/workspace\/inbox"/);
  assert.match(topBar, /CountBadge count=\{member\.unread\}/);
  assert.match(topBar, /sticky top-0/);
  assert.match(homeButton, /UnseenDot/);
});

test("tab labels never wrap", () => {
  assert.match(tabsNav, /whitespace-nowrap/);
  assert.match(tabsNav, /min-h-14/);
});
