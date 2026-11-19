// Phase 11: installable app, offline page, consented push, query limits, indexes and lighter pages.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const toUrl = (js) => `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
const load = async (p) => import(toUrl(ts.transpileModule(await read(p), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText));

test("installable app: manifest with id, scope, standalone, icons (incl. maskable) and shortcuts", async () => {
  const m = (await load("src/app/manifest.ts")).default();
  assert.equal(m.id, "/");
  assert.equal(m.start_url, "/");
  assert.equal(m.scope, "/");
  assert.equal(m.display, "standalone");
  assert.ok(m.icons.some((i) => i.sizes === "192x192") && m.icons.some((i) => i.sizes === "512x512") && m.icons.some((i) => i.purpose === "maskable"));
  assert.deepEqual(m.shortcuts.map((s) => s.url), ["/home", "/new-post", "/messages"]);
  const more = await read("src/app/(member)/more/page.tsx");
  assert.match(more, /<InstallApp \/>/);
});

test("app worker: offline page only, never saves a page, keeps push", async () => {
  const sw = await read("public/push-sw.js");
  assert.match(sw, /const PRECACHE = \["\/offline", "\/icons\/icon-192\.png", "\/icons\/icon-512\.png"\];/);
  assert.match(sw, /if \(req\.mode === "navigate"\) \{\n\s+\/\/ Always the live page; the saved offline page only when the network fails\.\n\s+e\.respondWith\(fetch\(req\)\.catch\(\(\) => caches\.match\("\/offline"/);
  assert.match(sw, /if \(url\.origin !== self\.location\.origin\) return;/);
  assert.match(sw, /url\.pathname\.startsWith\("\/_next\/static\/"\)/);
  assert.match(sw, /if \(req\.method !== "GET"\) return;/);
  // The only cache.put is for /_next/static files.
  assert.equal((sw.match(/\.put\(/g) ?? []).length, 1);
  assert.match(sw, /self\.addEventListener\("push"/);
  assert.match(sw, /self\.addEventListener\("notificationclick"/);

  // Simulate the worker: a page request that fails shows /offline; a page that loads is never stored.
  const listeners = {}; const stored = []; const cachesApi = {
    open: async (name) => ({ addAll: async () => {}, match: async () => null, put: async (r) => stored.push([name, r.url]), keys: async () => [], delete: async () => {} }),
    keys: async () => [], delete: async () => {}, match: async (u) => (u === "/offline" ? { offline: true } : null),
  };
  const ctx = { self: { addEventListener: (t, f) => (listeners[t] = f), location: { origin: "https://www.flameph.org" }, skipWaiting: () => {}, clients: { claim: () => {} }, registration: {} }, caches: cachesApi, URL, Response: { error: () => ({ error: true }) } };
  let online = true;
  ctx.fetch = async (req) => { if (!online) throw new Error("offline"); return { ok: true, clone: () => ({}), url: req.url }; };
  vm.runInNewContext(sw, ctx);
  const run = async (req) => { let p; listeners.fetch({ request: req, respondWith: (x) => (p = x) }); return p ? await p : undefined; };
  const page = { method: "GET", mode: "navigate", url: "https://www.flameph.org/messages/abc" };
  assert.equal((await run(page)).url, page.url);
  online = false;
  assert.deepEqual(await run(page), { offline: true });
  online = true;
  await run({ method: "GET", mode: "no-cors", url: "https://www.flameph.org/api/me" });
  await run({ method: "GET", mode: "cors", url: "https://ltkvrqaihkmpsdmcwhtg.supabase.co/rest/v1/profiles" });
  await run({ method: "GET", mode: "no-cors", url: "https://www.flameph.org/_next/static/chunks/app-123.js" });
  assert.deepEqual(stored.map((s) => s[1]), ["https://www.flameph.org/_next/static/chunks/app-123.js"]);

  const reg = await read("src/components/RegisterSW.tsx");
  assert.match(reg, /const WORKER = "\/push-sw\.js";/);
  assert.match(reg, /navigator\.serviceWorker\.register\(WORKER\)/);
  assert.match(reg, /if \(!url\.endsWith\(WORKER\)\) r\.unregister\(\);/);
});

test("push only where consented: browser permission, the member's own switch, and their per-type choices", async () => {
  const toggle = await read("src/components/PushToggle.tsx");
  assert.match(toggle, /Notification\.requestPermission\(\)\) !== "granted"\) return setState\("blocked"\)/);
  assert.match(toggle, /onClick=\{state === "on" \? turnOff : turnOn\}/);       // only after the member taps
  assert.match(await read("src/lib/notify.ts"), /if \(prefs\[`\$\{type\}_push`\]\) push = /);
  assert.match(await read("src/lib/push.ts"), /from\("push_subscriptions"\)\.select\("endpoint, p256dh, auth"\)\.eq\("user_id", userId\)/);
});

test("query audit: lists that grow are read page by page, every public list is bounded", async () => {
  const paging = await load("src/lib/paging.ts");
  // fetchAll keeps asking until a short page, never past the ceiling.
  const calls = [];
  const rows = await paging.fetchAll(async (a, b) => { calls.push([a, b]); return { data: a < 2000 ? Array(1000).fill(0) : Array(5).fill(0), error: null }; });
  assert.equal(rows.length, 2005);
  assert.deepEqual(calls, [[0, 999], [1000, 1999], [2000, 2999]]);
  assert.equal((await paging.fetchAll(async () => ({ data: Array(1000).fill(0), error: null }), 3000)).length, 3000);

  const digest = await read("src/app/api/cron/digest/route.ts");
  for (const t of ["profiles", "businesses", "business_inquiries", "business_stats", "group_members"]) assert.match(digest, new RegExp(`fetchAll\\(\\(a, b\\) => admin\\.from\\("${t}"\\)`), t);
  const exp = await read("src/app/admin/export/[kind]/route.ts");
  assert.equal((exp.match(/fetchAll/g) ?? []).length >= 5, true);
  const guard = await read("src/lib/ai/guard.ts");
  assert.match(guard, /admin\.rpc\("ai_month_spend", \{ p_user: userId \}\)/);
  assert.doesNotMatch(guard, /const \{ data \} = await admin\.from\("ai_messages"\)\.select\("cost_usd"\)/);
  assert.match(await read("src/app/admin/ai/page.tsx"), /db\.rpc\("ai_usage_daily", \{ p_days: 30 \}\)/);
  const content = await read("src/lib/content.ts");
  assert.match(content, /req = req\.limit\(Math\.min\(q\.limit \?\? LIST_DEFAULT_LIMIT, 1000\)\);/);
  assert.match(await read("src/components/listing/BusinessProfile.tsx"), /filters: \{ \.\.\.PUBLIC_BUSINESS_FILTERS, sector: b\.sector \}, order: "created_at", limit: 24/);
  assert.match(await read("src/app/account/group-order-actions.ts"), /for \(let i = 0; i < members\.length; i \+= 10\)/);
});

test("database update 0027: additive indexes and server-only totals", async () => {
  const sql = await read("supabase/migrations/0027_performance.sql");
  assert.doesNotMatch(sql, /drop |alter table|delete from|truncate|update public/i);
  assert.ok((sql.match(/create index if not exists/g) ?? []).length >= 18);
  for (const ix of ["businesses (owner_id)", "ai_messages (created_at desc)", "push_subscriptions (user_id)", "deal_participants (user_id)"]) assert.ok(sql.includes(ix), ix);
  assert.match(sql, /revoke all on function public\.ai_month_spend\(uuid\) from public, anon, authenticated;/);
  assert.match(sql, /grant execute on function public\.ai_month_spend\(uuid\) to service_role;/);
  assert.match(sql, /revoke all on function public\.ai_usage_daily\(int\) from public, anon, authenticated;/);
});

test("lighter pages: the Supabase library no longer loads up front on sign-in and business pages", async () => {
  assert.doesNotMatch(await read("src/components/listing/ListingTracker.tsx"), /supabase\/browser/);
  const auth = await read("src/components/AuthForm.tsx");
  assert.doesNotMatch(auth, /^import .*supabase\/browser/m);
  assert.match(auth, /const loadAuth = \(\) => import\("@\/lib\/supabase\/browser"\);/);
  const link = await read("src/components/EmailLinkSignIn.tsx");
  assert.doesNotMatch(link, /^import .*supabase\/browser/m);
  assert.match(link, /import\("@\/lib\/supabase\/browser"\)/);
});

test("faster first paint: security check waits for the form, hero pictures are small and fetched first", async () => {
  const t = await read("src/components/Turnstile.tsx");
  assert.match(t, /\{wanted && <Script src="https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js\?render=explicit"/);
  assert.match(t, /const events = \["focusin", "pointerdown", "touchstart", "keydown"\] as const;/);
  const hero = await read("src/components/HeroArtwork.tsx");
  assert.match(hero, /src=\{`\/hero-scenes\/q\/\$\{scene\.sheet\}-\$\{scene\.quadrant\}\.webp`\}/);
  assert.match(hero, /fetchPriority="high"/);
  const { existsSync, statSync } = await import("node:fs");
  for (let s = 1; s <= 12; s++) for (const q of ["top-left", "top-right", "bottom-left", "bottom-right"]) {
    const f = new URL(`../public/hero-scenes/q/${s}-${q}.webp`, import.meta.url);
    assert.ok(existsSync(f), `${s}-${q}`);
    assert.ok(statSync(f).size < 120_000, `${s}-${q} is small`);
  }
});
