// Phase 10A: safer shared sign-in (one-time tickets bound to the browser, per-site keys, logout everywhere) and the
// cross-site badge (consent 3), enforced in the database, logged, behind an off switch.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const toUrl = (js) => `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
const compile = (src) => toUrl(ts.transpileModule(src.replace(/^import "server-only";$/m, ""), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);

const MKT_KEY = "m".repeat(40), ND_KEY = "n".repeat(40), OLD_KEY = "o".repeat(40);
process.env.SSO_SECRET = OLD_KEY;
process.env.SSO_SECRET_MARKETPLACEPH = MKT_KEY;
process.env.SSO_SECRET_NEGOSYODEPOT = ND_KEY;

const hub = await import(compile(await read("src/lib/sso.ts")));
const sql = await read("supabase/migrations/0025_ecosystem_sso_badges.sql");
const route = (p) => read(`src/app/${p}`);

// The other two sites' code, when their repositories sit next to this one (they do in the build container).
const sibling = (repo, p) => new URL(`../../founderarnold/${repo}/${p}`, import.meta.url);
const haveSites = existsSync(sibling("marketplaceph", "lib/flame-sso.ts")) && existsSync(sibling("negosyodepot", "lib/sso.ts"));
const site = async (repo, p) => import(compile(await readFile(sibling(repo, p), "utf8")));

test("0025 only adds, and every new table is closed to browsers (RLS on, visitors and members revoked)", () => {
  assert.doesNotMatch(sql, /drop table|drop column|truncate|alter table public\.(profiles|settings|member_consents) /i);
  const tables = [...sql.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1]);
  assert.deepEqual(tables, ["sso_codes", "ecosystem_links", "member_signouts", "ecosystem_request_nonces", "ecosystem_access_log"]);
  for (const t of tables) {
    assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security`), t);
    assert.match(sql, new RegExp(`revoke all on public\\.${t} from anon, authenticated`), t);
  }
  // Members may only READ their own links and their own audit rows; nobody can write the log through the API.
  assert.match(sql, /ecosystem_access_log_read on public\.ecosystem_access_log for select to authenticated using \(user_id = auth\.uid\(\) or public\.is_admin\(\)\)/);
  assert.doesNotMatch(sql, /grant (insert|update|delete)[^;]*ecosystem_access_log/);
  assert.doesNotMatch(sql, /create policy[^;]*for (insert|update|delete|all)/);
});

test("the badge function is the only way out: service role only, fixed fields, every rule checked, logged in the same step", () => {
  assert.match(sql, /revoke all on function public\.ecosystem_badges\(text, uuid\[\]\) from public, anon, authenticated;\ngrant execute on function public\.ecosystem_badges\(text, uuid\[\]\) to service_role;/);
  assert.match(sql, /returns table \(sub uuid, shown boolean, verified boolean, badge_level text, counted int, categories jsonb, member_since text\)/);
  const fn = sql.slice(sql.indexOf("create or replace function public.ecosystem_badges"), sql.indexOf("revoke all on function public.ecosystem_badges"));
  for (const rule of ["switch_off", "not_active", "consent_off", "records_consent_off", "under_3_months", "no_counted_records"]) assert.match(fn, new RegExp(`'${rule}'`), rule);
  assert.match(fn, /has_consent\(l\.user_id, 'ecosystem_badge'\)/);
  assert.match(fn, /interval '3 months'/);
  assert.match(fn, /e\.client = p_client and e\.sub = any/); // only members linked to the calling site
  assert.match(fn, /> 50 then raise exception 'too_many'/);
  assert.equal((fn.match(/perform public\.ecosystem_log/g) ?? []).length, 2); // shown and hidden are both logged
  // Never amounts, messages, documents or contact details.
  assert.doesNotMatch(fn, /amount|message|document|phone|email|mobile|address/i);
  // Badges start OFF; shared sign-in stays ON.
  assert.match(sql, /jsonb_build_object\('badges', false, 'sso', true\), false/);
  // Same badge thresholds as the site.
  assert.match(sql, /n >= 40 then 'Platinum' when n >= 15 then 'Gold' when n >= 5 then 'Silver' when n >= 1 then 'Bronze'/);
});

test("per-site keys: each site's own key, and the old shared key only until it is set", () => {
  const body = Buffer.from(JSON.stringify({ iss: "marketplaceph", aud: "flameph", typ: "badges", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 60, jti: "x".repeat(20) })).toString("base64url");
  const sign = (key, purpose) => `v1.${body}.${require_hmac(key, `${purpose}.${body}`)}`;
  assert.ok(hub.verifySiteMessage("marketplaceph", "badges", sign(MKT_KEY, "badges")));
  assert.equal(hub.verifySiteMessage("marketplaceph", "badges", sign(OLD_KEY, "badges")), null, "old shared key no longer works once the site has its own");
  assert.equal(hub.verifySiteMessage("marketplaceph", "badges", sign(ND_KEY, "badges")), null, "NegosyoDepot's key can't pass as MarketplacePH");
  assert.equal(hub.verifySiteMessage("marketplaceph", "sso-token", sign(MKT_KEY, "badges")), null, "a message for one purpose can't be used for another");
  assert.ok(hub.isV2("marketplaceph") && hub.isV2("negosyodepot") && !hub.isV2("flamepos"));
});

import { createHmac } from "node:crypto";
function require_hmac(key, data) { return createHmac("sha256", key).update(data).digest("base64url"); }

test("sign-in to a site: the hub needs state + nonce, gives only a one-time ticket, and swaps it server-to-server", async () => {
  const authorize = await route("sso/authorize/route.ts");
  assert.match(authorize, /if \(v2 && \(!validNonce\(state\) \|\| !validNonce\(nonce\)\)\) return new NextResponse\("Missing sign-in check", \{ status: 400 \}\)/);
  assert.match(authorize, /issueTicket\(admin!, \{ client, direction: "to_site", userId: user\.id, nonce: nonce! \}\)/);
  assert.match(authorize, /callback\.searchParams\.set\("error", "sso_off"\)/);
  const token = await route("api/sso/token/route.ts");
  assert.match(token, /readSiteCall\(admin, req, "sso-token"\)/);
  assert.match(token, /consumeTicket\(admin, claims\.code, client, "to_site"\)/);
  assert.match(token, /nonce: ticket\.nonce/);
  const lib = await read("src/lib/ecosystem-sso.ts");
  // Single use: one statement that only matches an unused, unexpired ticket; the second use finds nothing.
  assert.match(lib, /\.is\("used_at", null\)\.gt\("expires_at", new Date\(\)\.toISOString\(\)\)\s*\.select/);
  assert.match(lib, /export const TICKET_SECONDS = 60;/);
  // Replay guard on every signed call, and at most 5 minutes old.
  assert.match(lib, /from\("ecosystem_request_nonces"\)\.insert\(\{ client, jti: c\.jti \}\)/);
  assert.match(lib, /> 300\) return null/);
});

test("sign-in to the hub from a site needs the same browser on both sides (no login CSRF)", async () => {
  const step1 = await route("sso/establish/route.ts");
  assert.match(step1, /res\.cookies\.set\(EST_COOKIE, h/);
  assert.match(step1, /\/auth\/flame\/push\/confirm/);
  assert.match(step1, /!isV2\(c\) && token && verifyToken/); // the old token door is closed for Phase 10A sites
  const finish = await route("sso/establish/finish/route.ts");
  assert.match(finish, /!same\(cookie, h\)/);
  assert.match(finish, /same\(peek\.browser_hash, sha256\(proof\)\)/);
  assert.match(finish, /consumeTicket\(admin, code, peek\.client, "to_hub"\)/);
  assert.match(await read("src/lib/ecosystem-sso.ts"), /EST_COOKIE = "__Host-flame_est"/);
});

test("logout everywhere: signed single-use logout, global sign-out, sites re-check every 5 minutes", async () => {
  const logout = await route("sso/logout/route.ts");
  assert.match(logout, /verifySiteCall\(admin, client, "logout", sp\.get\("t"\) \?\? ""\)/);
  assert.match(logout, /recordSignout\(admin!, user\.id\)/);
  assert.match(logout, /signOut\(\{ scope: "global" \}\)/);
  assert.match(await route("auth/logout/route.ts"), /recordSignout\(admin, user\.id\)[\s\S]*signOut\(\{ scope: "global" \}\)/);
  const lib = await read("src/lib/ecosystem-sso.ts");
  assert.match(lib, /SESSION_CHECK_SECONDS = 300/);
  assert.match(lib, /signed_out_at as string\)\.getTime\(\) \/ 1000 > since\) return \{ active: false, reason: "signed_out" \}/);
  assert.match(lib, /if \(!\(await switchOn\(admin, "sso"\)\)\) return \{ active: false, reason: "switch_off" \}/);
});

test("badge API: signed, rate limited, at most 50, rebuilt field by field; no CORS", async () => {
  const api = await route("api/ecosystem/badges/route.ts");
  assert.match(api, /readSiteCall\(admin, req, "badges"\)/);
  assert.match(api, /checkRateLimit\(req, "ecosystem_api"/);
  assert.match(api, /subs\.length > 50/);
  assert.match(api, /\{ sub: r\.sub, shown: true, verified: !!r\.verified, level: r\.badge_level, counted: r\.counted \?\? 0, categories: r\.categories \?\? \{\}, memberSince: r\.member_since \}/);
  assert.doesNotMatch(api, /Access-Control-Allow|export async function GET/);
});

test("withdrawing consent 3 tells the sites at once; the promise is 15 minutes, the real worst case 10", async () => {
  assert.match(await read("src/app/account/consent-actions.ts"), /changed\.includes\("ecosystem_badge"\) && !choices\.ecosystem_badge[\s\S]*notifySites\(admin, user\.id, "consent_off_notice"\)/);
  assert.match(await read("src/lib/ecosystem-sso.ts"), /BADGE_CACHE_SECONDS = 600/);
  assert.match(await read("src/lib/policy.ts"), /removes my badge from those sites within 15 minutes/);
  assert.match(await read("src/lib/policy.ts"), /sa loob ng 15 minuto/);
  assert.match(await read("src/app/legal/privacy/page.tsx"), /within 15 minutes/);
});

test("off switches on Admin > Settings: not public, audited, badges-off tells the sites", async () => {
  const a = await read("src/app/admin/actions.ts");
  assert.match(a, /upsert\(\{ key: "ecosystem", value, is_public: false/);
  assert.match(a, /ctx\.audit\("ecosystem_switches"/);
  assert.match(a, /notifySites\(ctx\.db, null, "switch_change"\)/);
});

test("the flameph.org badge waits 1 month (Terms section 11)", async () => {
  const p = await read("src/components/listing/BusinessProfile.tsx");
  assert.match(p, /rpc\("badge_age_ok", \{ uid: b\.owner_id, p_months: 1 \}\)/);
  assert.match(p, /rep\.counted > 0 && oldEnough/);
});

test("hub notices and site calls verify across the three codebases, and only with the right key", { skip: !haveSites && "site repositories not next to this one" }, async () => {
  const m = await site("marketplaceph", "lib/flame-sso.ts");
  const n = await site("negosyodepot", "lib/sso.ts");
  // Site -> hub.
  for (const [lib, client] of [[m, "marketplaceph"], [n, "negosyodepot"]]) {
    const t = lib.signSiteCall("badges", { subs: [] });
    const c = hub.verifySiteMessage(client, "badges", t);
    assert.ok(c && typeof c.jti === "string" && c.jti.length >= 16, client);
    assert.equal(hub.verifySiteMessage(client === "marketplaceph" ? "negosyodepot" : "marketplaceph", "badges", t), null, `${client} can't pass as the other site`);
  }
  // Hub -> site.
  const notice = hub.signHubMessage("marketplaceph", "hub-notice", { what: "badge-drop", sub: "*" });
  assert.equal(m.verifyHubMessage("hub-notice", notice)?.what, "badge-drop");
  assert.equal(n.verifyHubMessage("hub-notice", notice), null, "a MarketplacePH notice is refused by NegosyoDepot");
  assert.equal(m.verifyHubMessage("sso-token", notice), null);
  // Browser binding: the state must match the cookie, and the nonce the hub returns must match too.
  assert.deepEqual(m.checkState("STATE.NONCE", "STATE"), { nonce: "NONCE" });
  assert.equal(m.checkState("STATE.NONCE", "ATTACKER"), null);
  assert.equal(m.checkState(undefined, "STATE"), null);
  assert.equal(n.checkState("A.B", "X"), null);
  assert.ok(m.nonceMatches("NONCE", "NONCE") && !m.nonceMatches("NONCE", "OTHER"));
  // Link cookie can't be edited.
  const link = m.signLink({ sub: "s", uid: "u", since: 1, chk: 1 });
  assert.equal(m.readLink(link)?.sub, "s");
  assert.equal(m.readLink(link.replace(/^[^.]+/, Buffer.from(JSON.stringify({ sub: "other", uid: "u", since: 1, chk: 1 })).toString("base64url"))), null);
  // NegosyoDepot sessions: 7 days, carry the FLAME PH code, can't be stretched by a refresh, old 30-day ones refused.
  const now = Math.floor(Date.now() / 1000);
  const s = n.signSession({ email: "a@example.test", sub: "sub-1", since: now, chk: now });
  const r = n.readSession(s);
  assert.equal(r.sub, "sub-1");
  assert.ok(r.exp - now <= 7 * 86400 && r.exp - now > 7 * 86400 - 5);
  const refreshed = n.readSession(n.signSession({ ...r, chk: now }, now + 100));
  assert.ok(refreshed.exp <= now + 100);
  const oldBody = Buffer.from(JSON.stringify({ iss: "negosyodepot", aud: "negosyodepot-session", email: "a@example.test", iat: now, exp: now + 86400 })).toString("base64url");
  assert.equal(n.readSession(`v1.${oldBody}.${require_hmac(ND_KEY, oldBody)}`), null);
});

test("the sites keep tickets out of logs and send the browser check", { skip: !haveSites && "site repositories not next to this one" }, async () => {
  const txt = (repo, p) => readFile(sibling(repo, p), "utf8");
  for (const [repo, start] of [["marketplaceph", "app/auth/flame/start/route.ts"], ["negosyodepot", "app/auth/flame/start/route.ts"]]) {
    const s = await txt(repo, start);
    assert.match(s, /&state=\$\{state\}&nonce=\$\{nonce\}/, repo);
    assert.match(s, /AUTH_COOKIE, `\$\{state\}\.\$\{nonce\}`/, repo);
    const cb = await txt(repo, "app/auth/flame/route.ts");
    assert.match(cb, /checkState\(/, repo);
    assert.match(cb, /nonceMatches\(/, repo);
    assert.doesNotMatch(cb, /verifyToken|verifyHubToken/, repo);
  }
  assert.match(await txt("marketplaceph", "proxy.ts"), /\/api\/sso\/status/);
  assert.match(await txt("negosyodepot", "app/api/me/route.ts"), /\/api\/sso\/status/);
  assert.match(await txt("marketplaceph", "lib/flame-badge.ts"), /expire: 600/);
  assert.match(await txt("negosyodepot", "app/api/me/route.ts"), /revalidate: 300/);
  for (const f of ["components/auth/login-form.tsx", "components/auth/facebook-button.tsx", "components/auth/auth-modal.tsx"]) {
    assert.doesNotMatch(await txt("marketplaceph", f), /\/sso\/authorize/, f); // always through /auth/flame/start now
  }
});
