// Easier sign-in journey: home chapter from the profile, member suggestions, photos and videos in posts,
// business news headlines in the feed and the weekly email.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const toUrl = (js) => `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
const load = async (p) => import(toUrl(ts.transpileModule((await read(p)).replace(/^import "server-only";$/m, ""), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText));
const M = await load("src/lib/post-media.ts");
const N = await load("src/lib/news-feeds.ts");
const S = await load("src/lib/suggest-reasons.ts");
const sql = await read("supabase/migrations/0023_member_journey.sql");
const UID = "11111111-2222-3333-4444-555555555555";

test("new tables have row level security; members can't write headlines or provinces", () => {
  for (const t of [...sql.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1])) {
    assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security`), t);
    assert.match(sql, new RegExp(`revoke all on public\\.${t} from authenticated`), t);
  }
  assert.doesNotMatch(sql, /grant (insert|delete)[^;]*news_headlines/);
  assert.doesNotMatch(sql, /grant (insert|update|delete)[^;]*ph_provinces/);
  assert.match(sql, /revoke all on function public\.orphan_post_media\(int\) from public, anon, authenticated;/);
  // Additive only.
  assert.doesNotMatch(sql, /\bdrop (table|column)\b/i);
  assert.doesNotMatch(sql, /\brename\b/i);
});

test("home chapter comes from the member's own profile and only opens a chapter for a real province", () => {
  assert.match(sql, /from public\.profiles p where p\.id = me/);
  assert.match(sql, /from public\.ph_provinces v where lower\(v\.name\)/);
  assert.match(sql, /'forming', true/);
  assert.equal((sql.match(/\('[^']+', '[^']+'\)/g) ?? []).length >= 83, true);
});

test("member suggestions exclude self, blocked, followed, muted and Friends, and need a name", () => {
  for (const rule of [/p\.id <> me\.id/, /not public\.is_blocked_between\(p\.id, me\.id\)/, /member_follows f where f\.follower_id = me\.id/, /member_mutes m where m\.muter_id = me\.id/, /from public\.friendships f/, /nullif\(btrim\(p\.full_name\), ''\) is not null/])
    assert.match(sql, rule);
  assert.equal(S.reasonLabel({ reason: "city", detail: "San Fernando" }), "Near you in San Fernando");
  assert.equal(S.reasonLabel({ reason: "mutual", detail: "1" }), "1 mutual connection");
  assert.equal(S.reasonLabel({ reason: "industry", detail: "Food & beverage" }), "Also in Food & beverage");
});

test("post media: only the member's own post files, at most 4 photos and 1 video", () => {
  const own = (n, type = "image") => ({ type, path: `${UID}/post-a-${n}.jpg` });
  const list = [own(1), own(2), own(3), own(4), own(5), own(6, "video"), own(7, "video"), { type: "image", path: `99999999-2222-3333-4444-555555555555/post-x.jpg` }, { type: "image", path: `${UID}/../x.jpg` }, { type: "exe", path: `${UID}/post-z.exe` }];
  const got = M.parseMedia(JSON.stringify(list), UID);
  assert.equal(got.filter((m) => m.type === "image").length, 4);
  assert.equal(got.filter((m) => m.type === "video").length, 1);
  assert.ok(got.every((m) => m.path.startsWith(`${UID}/post-`)));
  assert.deepEqual(M.parseMedia("not json", UID), []);
  assert.match(M.mediaPath(UID, "video/mp4", 0), new RegExp(`^${UID}/post-[A-Za-z0-9._-]+\\.mp4$`));
  assert.equal(M.fileProblem({ type: "image/jpeg", size: 1000 }, "image"), null);
  assert.match(M.fileProblem({ type: "image/gif", size: 1000 }, "image"), /JPG, PNG or WEBP/);
  assert.match(M.fileProblem({ type: "video/mp4", size: 21 * 1024 * 1024 }, "video"), /20 MB/);
  // The database checks the same sizes against the stored file.
  assert.match(sql, /size > 5242880/);
  assert.match(sql, /size > 20971520/);
  assert.match(sql, /'\^' \|\| new\.author_id::text \|\| '\/post-/);
  assert.match(sql, /create trigger feed_posts_qmedia before insert/); // runs after feed_posts_prepare sets the author
});

test("video links: YouTube, Facebook and TikTok only; YouTube plays in the privacy-enhanced player", () => {
  assert.equal(M.videoLink("youtu.be/dQw4w9WgXcQ"), "https://youtu.be/dQw4w9WgXcQ");
  assert.equal(M.videoLink("https://www.facebook.com/watch/?v=123"), "https://www.facebook.com/watch/?v=123");
  assert.equal(M.videoLink("https://www.tiktok.com/@shop/video/1"), "https://www.tiktok.com/@shop/video/1");
  assert.equal(M.videoLink("https://evil.example.com/youtube.com"), null);
  assert.equal(M.videoLink("https://youtube.com.evil.example/x"), null);
  assert.equal(M.videoLink("javascript:alert(1)"), null);
  assert.equal(M.youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(M.youtubeId("https://youtube.com/shorts/abcdefghijk"), "abcdefghijk");
  assert.equal(M.youtubeId("https://www.tiktok.com/@a/video/1"), null);
});

test("news feeds: headlines with https links, newest first, PNA filtered to business", async () => {
  const now = Date.parse("2026-11-18T00:00:00Z");
  const rss = `<rss><channel>
    <item><title><![CDATA[DTI opens MSME loan window &amp; training]]></title><link>http://www.pna.gov.ph/articles/1</link><pubDate>Mon, 17 Nov 2026 08:00:00 +0800</pubDate></item>
    <item><title>Typhoon update for Bicol</title><link>https://www.pna.gov.ph/articles/2</link><pubDate>Mon, 17 Nov 2026 09:00:00 +0800</pubDate></item>
    <item><title>Old business news item</title><link>https://www.pna.gov.ph/articles/3</link><pubDate>Mon, 01 Sep 2026 09:00:00 +0800</pubDate></item>
    <item><title>Peso closes stronger</title><link>javascript:alert(1)</link></item>
  </channel></rss>`;
  const got = N.parseFeed(rss, "Philippine News Agency", { filter: true, now });
  assert.deepEqual(got.map((h) => h.title), ["DTI opens MSME loan window & training"]);
  assert.equal(got[0].url, "https://www.pna.gov.ph/articles/1");
  const atom = `<feed><entry><title>Exports rise in October</title><link href="https://example.ph/a"/><updated>2026-11-17T01:00:00Z</updated></entry></feed>`;
  assert.equal(N.parseFeed(atom, "X", { now })[0].url, "https://example.ph/a");
  // The cron job runs daily and only the server writes headlines.
  assert.match(await read("vercel.json"), /"\/api\/cron\/news"/);
  assert.match(await read("src/app/api/cron/news/route.ts"), /Bearer \$\{secret\}/);
});

test("weekly email adds business news, FLAME PH posts, chapter events and group activity", async () => {
  const d = await read("src/app/api/cron/digest/route.ts");
  for (const part of ["Business news this week:", "From FLAME PH:", "New in your chapter and groups:", "(your chapter)"]) assert.ok(d.includes(part), part);
  assert.match(d, /eq\("consent_marketing", true\)/); // still only members who said yes to updates
});

test("welcome: chapter step starts from the profile's province and city and offers industry chapters", async () => {
  const w = await read("src/app/(member)/welcome/page.tsx");
  assert.match(w, /rpc\("home_chapter"\)/);
  assert.match(w, /Industry chapters/);
  assert.match(w, /suggestedPeople\(/);
  const a = await read("src/app/account/onboarding-actions.ts");
  assert.match(a, /export async function saveLocation/);
  assert.match(a, /join_group/);
});
