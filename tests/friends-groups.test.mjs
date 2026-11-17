// Phase 4A: Follow, Friend, mute, block, Friend requests, suggestions with mutual connections, and industry and chapter groups.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const toUrl = (js) => `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
const load = async (p, deps = {}) => {
  let src = (await read(p)).replace(/^import "server-only";$/m, "");
  for (const [spec, url] of Object.entries(deps)) src = src.replaceAll(`"${spec}"`, `"${url}"`);
  const url = toUrl(ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
  return { mod: await import(url), url };
};

const sql = await read("supabase/migrations/0018_friends_groups.sql");
const industries = await load("src/lib/industries.ts");
const rules = await load("src/lib/feed-rules.ts", { "@/lib/industries": industries.url });
const groups = (await load("src/lib/groups.ts")).mod;
const notes = (await load("src/lib/people-rules.ts", { "@/lib/feed-rules": rules.url })).mod;

test("database update 0018 only adds, and every new table has row-level security with visitors locked out", () => {
  assert.doesNotMatch(sql, /drop table|drop column|truncate|alter table public\.(profiles|businesses|chapters) /i);
  // The only deletes are the ones a block makes (friendship and follows between the two members).
  assert.equal((sql.match(/delete from/gi) ?? []).length, 2);
  for (const t of ["friendships", "member_mutes", "member_blocks", "group_catalog", "community_groups", "group_members"]) {
    assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security`), t);
    assert.match(sql, new RegExp(`revoke all on public\\.${t} from anon`), t);
  }
});

test("Friend-only posts are unreachable by non-friends in the database, not only in the page", () => {
  const policy = sql.slice(sql.indexOf("create policy feed_posts_select"), sql.indexOf(");", sql.indexOf("create policy feed_posts_select")));
  assert.match(policy, /audience = 'members' or public\.are_friends\(author_id, auth\.uid\(\)\)/);
  assert.match(policy, /not public\.is_blocked_between\(author_id, auth\.uid\(\)\)/);
  assert.match(sql, /check \(audience in \('members', 'friends'\)\)/);
  // Comments and reactions are only reachable through a post the member can read.
  assert.match(sql, /feed_comments_select[\s\S]*exists \(select 1 from public\.feed_posts p where p\.id = post_id\)/);
  // Friend helpers can't be used to read other people's friendships.
  assert.match(sql, /function public\.are_friends\(a uuid, b uuid\)[\s\S]*?security definer/);
});

test("Friend needs both to accept; Follow stays one-way and open", () => {
  assert.match(sql, /status text not null default 'pending' check \(status in \('pending', 'accepted'\)\)/);
  assert.match(sql, /request_exists/);
  assert.match(sql, /friend_rate_limit/);
  assert.match(sql, /friendships_accept on public\.friendships for update to authenticated[\s\S]*?addressee_id = auth\.uid\(\)/);
  // Follow is only refused across a block.
  assert.match(sql, /member_follows_insert[\s\S]*?not public\.is_blocked_between\(follower_id, followee_id\)/);
});

test("block ends friendship and follows both ways; mute and block are private to the member who did it", () => {
  const fn = sql.slice(sql.indexOf("function public.member_blocks_after"), sql.indexOf("$$;", sql.indexOf("function public.member_blocks_after")));
  assert.match(fn, /delete from public\.friendships/);
  assert.match(fn, /delete from public\.member_follows/);
  assert.match(sql, /member_mutes_own on public\.member_mutes for all to authenticated using \(muter_id = auth\.uid\(\)\)/);
  assert.match(sql, /member_blocks_own on public\.member_blocks for all to authenticated using \(blocker_id = auth\.uid\(\)\)/);
});

test("the 15 priority industry groups open at launch; the rest open on demand", () => {
  const priority = ["food-and-beverage", "real-estate", "advertising", "marketing", "packaging", "ai", "systems", "accounting-services", "legal-services", "insurance", "tax-compliance", "logistics", "manufacturers", "professional-services", "suppliers"];
  for (const slug of priority) assert.match(sql, new RegExp(`\\('${slug}', '[^']+', '[^']+', true,`), slug);
  for (const slug of ["import-and-export", "investors-and-funders"]) assert.match(sql, new RegExp(`\\('${slug}', '[^']+', '[^']+', false,`), slug);
  assert.match(sql, /insert into public\.community_groups \(slug, kind, name, sector, priority\)\s+select c\.slug, 'industry', c\.name, c\.sector, true from public\.group_catalog c where c\.priority/);
  assert.match(sql, /raise exception 'no_such_group'/);
  assert.match(sql, /raise exception 'join_group_first'/);
  assert.equal(groups.chapterGroupSlug({ id: "x", slug: "pampanga" }), "chapter-pampanga");
  assert.equal(groups.isGroupSlug("food-and-beverage"), true);
  assert.equal(groups.isGroupSlug("../etc"), false);
});

test("taxonomy lets members pick every priority industry, import and export, and investors and funders", () => {
  const all = industries.mod.INDUSTRIES.flatMap((i) => [i.name, ...i.subs]);
  for (const name of ["Real estate", "Advertising", "Marketing", "AI", "Systems", "Accounting services", "Legal services", "Insurance", "Tax compliance", "Import and export services", "Investors and funders", "Suppliers"]) {
    assert.ok(all.includes(name), name);
  }
});

test("plain-language notes for every Friend, mute, block and group result", () => {
  for (const k of ["request-sent", "friends", "declined", "cancelled", "unfriended", "muted", "unmuted", "blocked-done", "unblocked", "joined", "left"]) assert.ok(notes.noteText(k), k);
  assert.match(notes.noteText("request_exists"), /Friend request/);
  assert.equal(notes.noteText("<script>"), null);
});

test("pages: Friend request inbox, groups, composer audience, profile and post buttons, Home suggestions", async () => {
  const friends = await read("src/app/(member)/friends/page.tsx");
  for (const id of ["requests", "friends", "following", "muted", "blocked"]) assert.match(friends, new RegExp(`id="${id}"`));
  assert.match(friends, /acceptFriend/);
  const actions = await read("src/components/people/RelationshipActions.tsx");
  for (const w of ["Add Friend", "Accept Friend", "Unfriend", "Unblock", "Yes, block", "Unmute"]) assert.ok(actions.includes(w), w);
  assert.match(await read("src/components/listing/BusinessProfile.tsx"), /<RelationshipActions/);
  assert.match(await read("src/app/(member)/posts/[id]/page.tsx"), /<RelationshipActions/);
  const composer = await read("src/components/feed/Composer.tsx");
  assert.match(composer, /name="audience"/);
  assert.match(composer, /name="group"/);
  assert.match(await read("src/components/feed/PostCard.tsx"), /Friends only/);
  const home = await read("src/app/(member)/home/page.tsx");
  assert.match(home, /mutualCounts/);
  assert.match(home, /muted/);
  assert.match(home, /\/friends#requests/);
  const sugg = await read("src/lib/suggestions.ts");
  assert.match(sugg, /m\.chapter_id && b\.chapter_id === m\.chapter_id \? 4/);
  assert.match(sugg, /3 \* Math\.min\(mutual\.get/);
  const group = await read("src/app/(member)/groups/[slug]/page.tsx");
  assert.match(group, /INVESTOR_GROUP/);
  assert.match(group, /<InvestorWarning/);
});

test("Friends and Groups are in Community under More, and sign-in is kept on their addresses", async () => {
  const more = JSON.parse(await read("src/content/more.json"));
  const community = more.groups.find((g) => g.key === "community").items.map((i) => i.href);
  assert.ok(community.includes("/friends"));
  assert.ok(community.includes("/groups"));
  const mw = await read("src/middleware.ts");
  for (const p of ['"/friends"', '"/groups"', '"/groups/:path*"']) assert.ok(mw.includes(p), p);
});
