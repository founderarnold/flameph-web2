// Phase 4: the community feed (posts, comments, reactions, sharing), filters and paging, New Post, activity cards, forum and blog.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const toUrl = (js) => `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
// Loads a TS module. "@/..." imports are swapped for already-loaded modules; the "server-only" marker is dropped.
const load = async (p, deps = {}) => {
  let src = (await read(p)).replace(/^import "server-only";$/m, "");
  for (const [spec, url] of Object.entries(deps)) src = src.replaceAll(`"${spec}"`, `"${url}"`);
  const url = toUrl(ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
  return { mod: await import(url), url };
};

const migration = await read("supabase/migrations/0017_community_feed.sql");
const industries = await load("src/lib/industries.ts");
const rules = await load("src/lib/feed-rules.ts", { "@/lib/industries": industries.url });
const growth = await load("src/lib/growth.ts");
const pub = await load("src/lib/public-business.ts");
const data = (await load("src/lib/feed-data.ts", { "@/lib/growth": growth.url, "@/lib/public-business": pub.url, "@/lib/feed-rules": rules.url })).mod;
const R = rules.mod;

test("database update: additive, row-level security on every new table, visitors blocked", () => {
  assert.doesNotMatch(migration, /drop table|drop column|delete from|truncate|alter table public\.(profiles|businesses|posts|deals)/i);
  for (const t of ["feed_posts", "feed_comments", "feed_reactions"]) {
    assert.match(migration, new RegExp(`alter table public\\.${t} enable row level security`));
    assert.match(migration, new RegExp(`revoke all on public\\.${t} from anon`));
  }
  // Only published posts by active members, plus your own; only admins moderate.
  assert.match(migration, /using \(\(status = 'published' and public\.member_is_active\(author_id\)\) or author_id = auth\.uid\(\) or public\.is_admin\(\)\)/);
  assert.match(migration, /feed_posts_moderate on public\.feed_posts for update to authenticated using \(public\.is_admin\(\)\)/);
  // Page helpers run as the member (no security definer), so row rules apply, and take at most 50 posts.
  for (const fn of ["feed_post_stats", "feed_recent_comments", "forum_categories"]) {
    const body = migration.slice(migration.indexOf(`function public.${fn}`), migration.indexOf("$$;", migration.indexOf(`function public.${fn}`)));
    assert.doesNotMatch(body, /security definer/, `${fn} must run as the member`);
  }
  assert.match(migration, /ids\[1:50\]/);
});

test("automatic checks: limits, duplicates, links, investor posts marked, promised returns held", () => {
  for (const code of ["post_rate_limit", "new_account_limit", "duplicate_post", "too_many_links", "new_account_links", "comment_rate_limit", "duplicate_comment"]) {
    assert.match(migration, new RegExp(`raise exception '${code}'`));
    assert.ok(R.POST_ERRORS[code], `no plain message for ${code}`);
  }
  assert.match(migration, /new\.kind := 'investor'/);
  assert.match(migration, /new\.status := 'held'; new\.held_reason := 'promises_returns'/);
  // The app mirrors the database words.
  assert.deepEqual(R.classifyPost("Looking for an investor for my bakery", "update"), { kind: "investor", held: false });
  assert.deepEqual(R.classifyPost("Guaranteed returns of 20% monthly!", "update"), { kind: "update", held: true });
  assert.deepEqual(R.classifyPost("Fresh pandesal every morning", "update"), { kind: "update", held: false });
  assert.equal(R.classifyPost("I sell investigation kits", "offer").kind, "offer");
  assert.equal(R.linkCount("see https://a.ph and www.b.ph"), 2);
  assert.equal(R.postErrorCode('relation "public.feed_posts" does not exist'), "unavailable");
});

test("categories come from the industry taxonomy", () => {
  assert.deepEqual(R.parseCategory("Food & beverage"), { category: "Food & beverage", subcategory: null });
  assert.deepEqual(R.parseCategory("Food & beverage||Catering"), { category: "Food & beverage", subcategory: "Catering" });
  assert.equal(R.parseCategory("Food & beverage||Hacking"), null);
  assert.equal(R.parseCategory("Gambling"), null);
  for (const n of industries.mod.INDUSTRY_NAMES) assert.equal(R.industryFromSlug(R.industrySlug(n)), n);
  assert.equal(R.industrySlug("Food & beverage"), "food-beverage");
});

test("paging: exact cursor round trip, junk ignored, bounded queries", async () => {
  const at = "2026-11-17T10:20:38.994096+00:00";
  const id = "6f1c9a52-8a3b-4c1e-9d2f-0123456789ab";
  assert.deepEqual(R.decodeCursor(R.encodeCursor(at, id)), { at, id });
  assert.equal(R.decodeCursor("1;drop table"), null);
  assert.equal(R.decodeCursor(`${at}~not-a-uuid`), null);
  const src = await read("src/lib/feed-data.ts");
  assert.match(src, /\.limit\(pageSize \+ 1\)/);
  // Every activity source is limited and windowed.
  assert.equal((src.match(/\.limit\(SOURCE_LIMIT\)/g) ?? []).length, 6);
  assert.match(src, /const SOURCE_LIMIT = 6;/);
  const w = data.pageWindow(null, [{ created_at: "2026-11-10T00:00:00Z" }], true, Date.parse("2026-11-17T00:00:00Z"));
  assert.deepEqual(w, { from: "2026-11-10T00:00:00Z", to: null });
  assert.equal(data.pageWindow(null, [], false, Date.parse("2026-11-17T00:00:00Z")).from, "2026-09-18T00:00:00.000Z");
});

test("feed mixes posts and activity newest first", () => {
  const merged = data.mergeFeed(
    [{ id: "p1", created_at: "2026-11-15T00:00:00Z" }, { id: "p2", created_at: "2026-11-13T00:00:00Z" }],
    [{ id: "deal-1", at: "2026-11-14T00:00:00Z" }, { id: "member-1", at: "2026-11-16T00:00:00Z" }],
  );
  assert.deepEqual(merged.map((e) => (e.type === "post" ? e.post.id : e.card.id)), ["member-1", "p1", "deal-1", "p2"]);
});

test("feed filters accept only known industries and chapters", () => {
  assert.deepEqual(R.feedFilters({ industry: "Agriculture", chapter: "c1", who: "following" }, ["c1"]), { industry: "Agriculture", chapter: "c1", following: true });
  assert.deepEqual(R.feedFilters({ industry: "Nope", chapter: "zzz" }, ["c1"]), { industry: null, chapter: null, following: false });
});

test("New Post opens the composer directly and returns to the feed scrolled to the new post", async () => {
  const page = await read("src/app/(member)/new-post/page.tsx");
  assert.match(page, /<Composer /);
  assert.doesNotMatch(page, /TabShell|coming soon|While you wait/i);
  const actions = await read("src/app/account/feed-actions.ts");
  assert.match(actions, /redirect\(feedResult\(data\.status === "held" \? "post-held" : "posted", `post-\$\{data\.id\}`\)\)/);
  const composer = await read("src/components/feed/Composer.tsx");
  assert.match(composer, /INDUSTRIES\.map/);
  assert.match(composer, /autoFocus/);
});

test("Home feed: posts, comments, reactions, share, filters and Show older posts", async () => {
  const home = await read("src/app/(member)/home/page.tsx");
  assert.match(home, /<FeedFilters /);
  assert.match(home, /Show older posts/);
  assert.match(home, /<PostCard /);
  assert.match(home, /<ActivityCard /);
  const card = await read("src/components/feed/PostCard.tsx");
  assert.match(card, /action=\{reactToPost\}/);
  assert.match(card, /<CommentForm /);
  assert.match(card, /<ShareButton /);
  assert.match(card, /aria-pressed=\{stats\.mine === k\}/);
});

test("investor and funder posts always show the warning, on the post and its replies", async () => {
  const card = await read("src/components/feed/PostCard.tsx");
  assert.match(card, /\{investor && <div className="mt-3"><InvestorWarning/);
  const page = await read("src/app/(member)/posts/[id]/page.tsx");
  assert.match(page, /\{investor && <div className="mt-2"><InvestorWarning compact \/><\/div>\}/);
  const warning = await read("src/components/feed/InvestorWarning.tsx");
  assert.match(warning, /INVESTOR_WARNING_EN/);
  assert.match(warning, /INVESTOR_WARNING_TL/);
  assert.doesNotMatch(warning, /onClick|<button/);
});

test("activity cards link to the tab that owns them, and the action comes back to the feed", async () => {
  const src = await read("src/lib/feed-data.ts");
  assert.match(src, /href: `\/group-order#deal-\$\{d\.id\}`/);
  assert.match(src, /href: "\/academy"/);
  assert.match(src, /href: `\/members\/\$\{b\.slug\}`/);
  assert.match(src, /kind: "New member"/);
  assert.match(await read("src/app/(member)/group-order/page.tsx"), /id=\{`deal-\$\{d\.id\}`\}/);
  // Joining from the Group Order tab returns to the feed scrolled to the same card id.
  assert.match(await read("src/app/account/actions.ts"), /`deal-\$\{deal\}`/);
  assert.match(await read("src/app/(member)/m/fulfillment/page.tsx"), /id=\{`offer-\$\{o\.id\}`\}/);
});

test("forum and blog are in Community under More; forum is in the Explore menu", async () => {
  const more = JSON.parse(await read("src/content/more.json"));
  const community = more.groups.find((g) => g.key === "community").items.map((i) => i.href);
  assert.ok(community.includes("/forum"));
  assert.ok(community.includes("/news"));
  const nav = JSON.parse(await read("src/content/nav.json"));
  assert.ok(nav.find((g) => g.key === "explore").items.some((i) => i.href === "/forum"));
  // The blog keeps its public addresses.
  await read("src/app/news/page.tsx");
  await read("src/app/news/[slug]/page.tsx");
});
