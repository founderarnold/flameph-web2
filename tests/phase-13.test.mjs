// Phase 13: staged release and post-release verification.
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const exists = (p) => access(new URL(`../${p}`, import.meta.url)).then(() => true, () => false);
const toUrl = (js) => `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
const load = async (p) => import(toUrl(ts.transpileModule(await read(p), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText));
const SQL = () => read("supabase/migrations/0030_release_monitor.sql");

/** The page file behind an address (route groups like "(member)" and dynamic segments allowed). */
async function pageFor(path) {
  const clean = path.replace(/[?#].*$/, "");
  const segs = clean.split("/").filter(Boolean);
  const tries = [`src/app/${segs.join("/")}/page.tsx`, `src/app/(member)/${segs.join("/")}/page.tsx`];
  if (segs[0] === "calculators") tries.push(`src/calculators/${segs[1]}.html`);
  if (segs[0] === "chapters" && segs[1]) tries.push("src/app/chapters/[region]/page.tsx");
  if (!segs.length) tries.push("src/app/page.tsx");
  for (const t of tries) if (await exists(t)) return t;
  return null;
}

test("regression list: every preserved feature the owner named has pages, and every page exists", async () => {
  const { FEATURES, CALCULATORS, CORE } = await import("../scripts/release/features.mjs");
  const names = FEATURES.map((f) => f.name.toLowerCase()).join(" | ");
  for (const want of ["goal cards", "academy", "flame pos", "15 business calculators", "mini-sites", "directory", "ridesafe", "ka-flame", "fulfillment", "opportunities", "forum", "blog", "events", "chapters", "volunteer", "member id"]) assert.ok(names.includes(want), want);
  // The 15 calculators are exactly the ones in the app.
  const calc = await read("src/lib/calculators.ts");
  assert.deepEqual([...calc.matchAll(/id: "([a-z-]+)"/g)].map((m) => m[1]).sort(), [...CALCULATORS].sort());
  assert.equal(CALCULATORS.length, 15);
  for (const f of FEATURES) for (const p of f.pages) assert.ok(await pageFor(p.path), `${f.name}: ${p.path}`);
  for (const p of CORE) assert.ok(FEATURES.some((f) => f.pages.some((x) => x.path === p)), `core page listed: ${p}`);
  // 28 goal cards on the home page.
  assert.equal([...(await read("src/components/EcosystemFrontDoor.tsx")).matchAll(/^\s+\{ title: "/gm)].length, 28);
});

test("live check scripts: read-only, the device matrix, More-vs-sitemap, and the 320px bar rules", async () => {
  const live = await read("scripts/release/regression.mjs");
  for (const d of ["Moto G4", "iPhone 12", "iPad (gen 7)", "Galaxy Tab S4"]) assert.ok(live.includes(d), d);
  for (const e of ['engine: "chromium"', 'engine: "webkit"', 'engine: "firefox"', 'engine: "msedge"']) assert.ok(live.includes(e), e);
  assert.ok(live.includes("checkMoreAndSitemap"));
  assert.doesNotMatch(live, /SERVICE_ROLE|password|\.fill\(/i, "never signs in or fills a form on the live site");
  const shell = await read("scripts/release/member-shell.mjs");
  assert.match(shell, /for \(const w of \[320, 360, 390, 740\]\)/);
  assert.match(shell, /b\.w >= 44 && b\.h >= 44/);
  assert.match(shell, /!b\.cut && b\.lines <= 1/);
  assert.match(shell, /top\.home === "\/home"/);
  assert.match(shell, /top\.badge === String\(UNREAD\)/);
  // The stand-in database is only for a local copy.
  assert.match(await read("scripts/release/mock-supabase.mjs"), /Never point the live site at this/);
  // Bar itself: five tabs, labels never wrap, at least 44px tall (min-h-14 = 56px).
  const nav = await read("src/components/shell/MemberTabsNav.tsx");
  assert.match(nav, /min-h-14/); assert.match(nav, /whitespace-nowrap/);
  const { TABS } = await load("src/lib/member-shell.ts");
  assert.deepEqual(TABS.map((t) => t.label), ["Group Order", "Fulfillment", "New Post", "Flame POS", "More"]);
});

test("release monitor: server-only, capped, anonymous, with retention in the Privacy Notice", async () => {
  const sql = await SQL();
  for (const t of ["site_errors", "web_vitals"]) {
    assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security;`), t);
    assert.match(sql, new RegExp(`revoke all on public\\.${t} from anon, authenticated;`), t);
  }
  for (const f of ["site_error_log(text, text, text)", "web_vitals_log(text, double precision, text, text)", "release_monitor_cleanup()", "release_health(integer)"]) assert.ok(sql.includes(`'public.${f}'`), f);
  assert.match(sql, /\) >= 1000 then return; end if;/);
  assert.match(sql, /\) >= 20000 then return; end if;/);
  assert.doesNotMatch(sql, /user_id|ip_hash/, "no member id or IP in the monitor tables");
  // Retention matches the Privacy Notice table.
  const { RETENTION, MONITOR_RETENTION_KEYS } = await load("src/lib/retention.ts");
  assert.deepEqual(MONITOR_RETENTION_KEYS, ["site_errors", "web_vitals"]);
  assert.equal(RETENTION.find((r) => r.key === "site_errors").days, 90);
  assert.equal(RETENTION.find((r) => r.key === "web_vitals").days, 30);
  assert.match(sql, /day < \(now\(\) at time zone 'Asia\/Manila'\)::date - 90/);
  assert.match(sql, /at < now\(\) - interval '30 days'/);
  assert.match(await read("src/lib/data-rights-server.ts"), /admin\.rpc\("release_monitor_cleanup"\)/);

  const lib = await load("src/lib/release.ts");
  assert.equal(lib.pagePattern("https://www.flameph.org/messages/0b6d3f5e-1c2a-4b7e-9f00-123456789abc?x=1"), "/messages/:id");
  assert.equal(lib.pagePattern("/verify/FLM-2026-0042"), "/verify/:id");
  assert.equal(lib.cleanMessage("Failed for juan@example.com token eyJabc.def.ghi id 0b6d3f5e-1c2a-4b7e-9f00-123456789abc 09171234567"), "Failed for [email] token [token] id :id #");

  const route = await read("src/app/api/monitor/route.ts");
  assert.match(route, /pagePattern\(/); assert.match(route, /cleanMessage\(/);
  assert.match(await read("src/app/layout.tsx"), /<SiteMonitor \/>/);
  assert.match(await read("src/instrumentation.ts"), /export async function onRequestError/);
});

test("staged rollout: four stages by region, go/no-go gates, rollback with the shared sign-in flag, admins only", async () => {
  const lib = await load("src/lib/release.ts");
  assert.deepEqual(lib.STAGES.map((s) => s.key), ["internal", "ncr", "calabarzon", "central_luzon", "all"]);
  for (const s of lib.STAGES) {
    assert.ok(s.rollback.some((r) => /Sign in with FLAME PH on the other sites/.test(r)), `${s.key}: shared sign-in flag`);
    assert.ok(s.rollback.some((r) => /Instant Rollback/.test(r)), `${s.key}: Vercel rollback`);
    assert.ok(s.rollback.some((r) => /backup/.test(r)), `${s.key}: backup restore`);
    if (s.key !== "all") assert.ok(s.start.some((x) => /backup/i.test(x)), `${s.key}: backup before the stage`);
  }
  const empty = { days: [], now: { members: 1, reports_open: 0, reports_overdue: 0, oldest_open_report_hours: null, appeals_open: 0, privacy_open: 0, privacy_overdue: 0, alerts_critical: 0, alerts_warning: 0, incidents_open: 0, ai_month_usd: 0, db_bytes: 20e6, storage_bytes: 3e6, last_security_scan: null, last_retention_run: null }, top_errors: [], cross_site: [], provinces: [] };
  assert.ok(lib.gates(empty, 10).every((g) => g.ok));
  const late = { ...empty, days: [{ day: "2026-11-20", errors_browser: 0, errors_server: 0, distinct_errors: 0, lcp_p75_mobile: 3500, lcp_p75_desktop: null, inp_p75: null, cls_p75: null, speed_samples: 4, ai_cost_usd: 0, ai_questions: 0, new_members: 0, reports_new: 2, reports_in_24h: 1, reports_late: 1, cross_site_events: 0, cross_site_refused: 0 }] };
  const bad = lib.gates(late, 10).filter((g) => !g.ok).map((g) => g.key).sort();
  assert.deepEqual(bad, ["lcp", "reports_24h"]);
  assert.match(lib.inviteText("ncr"), /Metro Manila/); assert.match(lib.inviteText("ncr"), /Sumali/);
  assert.match(await read("src/app/admin/release/page.tsx"), /adminContext\(\["super_admin", "admin"\]\)/);
  assert.match(await read("src/app/admin/release/actions.ts"), /adminContext\(\["super_admin", "admin"\]\)/);
  assert.match(await read("src/app/admin/release/actions.ts"), /c\.audit\("release_stage"/);
  const cron = JSON.parse(await read("vercel.json")).crons;
  assert.ok(cron.some((c) => c.path === "/api/cron/release" && c.schedule === "0 0 * * *"));
  assert.match(await read("src/app/api/cron/release/route.ts"), /Bearer \$\{secret\}/);
  assert.match(await read("supabase/migrations/0030_release_monitor.sql"), /'stage', 'internal'/);
});
