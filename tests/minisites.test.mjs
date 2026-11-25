// Phase 5: business identity, mini-sites, directory and leads.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const toUrl = (js) => `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
const transpile = (src) => ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const load = async (p, swap = {}) => {
  let src = (await read(p)).replace(/^import "server-only";$/m, "");
  for (const [from, to] of Object.entries(swap)) src = src.replace(from, to);
  return import(toUrl(transpile(src)));
};
const sql = await read("supabase/migrations/0020_minisites_leads.sql");
const M = await load("src/lib/minisites.ts");
const regions = toUrl(transpile(await read("src/content/ph-regions.ts")));
const industries = toUrl(transpile(await read("src/lib/industries.ts")));
const D = await load("src/lib/directory-search.ts", { '"@/content/ph-regions"': JSON.stringify(regions), '"@/lib/industries"': JSON.stringify(industries) });

test("database update 0020 only adds: new table with row-level security, new inquiry columns, nothing removed", () => {
  const code = sql.replace(/--.*$/gm, "");
  assert.doesNotMatch(code, /drop table|drop column|truncate|delete from|rename/i);
  assert.match(sql, /alter table public\.member_minisites enable row level security/);
  assert.match(sql, /revoke all on public\.member_minisites from anon, authenticated/);
  assert.doesNotMatch(sql, /grant [^;]*(insert|update|delete)[^;]* on public\.member_minisites to [^;]*(anon|authenticated)/);
  assert.match(sql, /grant select, insert, update on public\.member_minisites to service_role;/);
  assert.match(sql, /using \(published or owner_id = auth\.uid\(\) or public\.is_admin\(\)\)/);
  assert.match(sql, /add column if not exists source text not null default 'listing'/);
  assert.match(sql, /business_inquiries_external on public\.business_inquiries \(external_id\) where external_id is not null/);
  assert.match(sql, /check \(source <> 'listing' or business_id is not null\)/);
  // The email lookup is for the server only, and needs a proven email.
  assert.match(sql, /revoke all on function public\.member_id_for_verified_email\(text\) from public, anon, authenticated/);
  assert.match(sql, /p\.email_verified_at is not null/);
});

test("every existing mini-site address keeps working: /business forwarding and /directory redirect unchanged", async () => {
  const cfg = await read("next.config.ts");
  assert.match(cfg, /\{ source: "\/business", destination: "https:\/\/flameph-pages\.vercel\.app\/business" \}/);
  assert.match(cfg, /\{ source: "\/business\/:path\*", destination: "https:\/\/flameph-pages\.vercel\.app\/business\/:path\*" \}/);
  assert.match(cfg, /\{ source: "\/directory", destination: "https:\/\/pages\.flameph\.org\/directory", permanent: true \}/);
  assert.equal(M.minisiteUrl("kape-ni-juan"), "https://www.flameph.org/business/kape-ni-juan");
});

test("the builder opens through the existing sign-in hub, on the Pages app only", async () => {
  assert.equal(M.builderHref(), "/sso/authorize?client=flamephpages&return=https%3A%2F%2Fpages.flameph.org%2Fdashboard");
  assert.match(M.builderHref("/build"), /return=https%3A%2F%2Fpages\.flameph\.org%2Fbuild$/);
  const sso = await read("src/lib/sso.ts");
  assert.match(sso, /origins: \["https:\/\/pages\.flameph\.org"\]/);
});

test("Pages messages: signed over '<purpose>.<body>', never accepted as a sign-in token, and a sign-in token is never a message", async () => {
  process.env.SSO_SECRET_FLAMEPHPAGES = "s".repeat(40);
  const S = await load("src/lib/sso.ts");
  const now = Math.floor(Date.now() / 1000);
  const sign = (purpose, claims, over = purpose) => {
    const body = Buffer.from(JSON.stringify({ iss: "flamephpages", aud: "flameph", typ: purpose, iat: now, exp: now + 300, ...claims })).toString("base64url");
    return `v1.${body}.${createHmac("sha256", "s".repeat(40)).update(over ? `${over}.${body}` : body).digest("base64url")}`;
  };
  const lead = sign("lead", { owner_email: "a@b.co" });
  assert.equal(S.verifySiteMessage("flamephpages", "lead", lead)?.owner_email, "a@b.co");
  assert.equal(S.verifySiteMessage("flamephpages", "sites", lead), null, "purpose is part of the signature");
  assert.equal(S.verifyToken(lead, { iss: "flamephpages", aud: "flameph" }), null, "never a sign-in");
  const signIn = sign("lead", { email: "a@b.co" }, "");
  assert.equal(S.verifySiteMessage("flamephpages", "lead", signIn), null, "a sign-in token is never a message");
  assert.equal(S.verifySiteMessage("flamephpages", "lead", sign("lead", { exp: now - 1 })), null, "expired");
  assert.equal(S.verifySiteMessage("flamephpages", "lead", sign("lead", { exp: now + 3600 })), null, "too long-lived");
  assert.equal(S.verifySiteMessage("flamepos", "lead", lead), null, "another site's secret");
});

test("lead and site messages are checked field by field", () => {
  const good = { owner_email: "Owner@Example.com", lead_id: "0b7c6c2e-6a2b-4b7e-9d3c-1f2e3d4c5b6a", site_slug: "kape-ni-juan", name: "Ana", email: "", mobile: "0917 123 4567", message: "" };
  const l = M.parseLeadMessage(good);
  assert.equal(l.ownerEmail, "owner@example.com");
  assert.equal(l.email, null);
  assert.match(l.message, /No message/);
  assert.equal(M.parseLeadMessage({ ...good, mobile: "" }), null, "needs a way to reply");
  assert.equal(M.parseLeadMessage({ ...good, site_slug: "../x" }), null);
  const s = M.parseSitesMessage({ owner_email: "a@b.co", sites: [{ site_id: good.lead_id, slug: "kape-ni-juan", name: "Kape", category: "food", published: true }] });
  assert.equal(s.sites[0].published, true);
  assert.equal(M.parseSitesMessage({ owner_email: "a@b.co", sites: [{ site_id: "x", slug: "y" }] }), null);
  assert.equal(M.parseSitesMessage({ owner_email: "a@b.co", sites: Array(51).fill({}) }), null);
  assert.equal(M.sourceLabel({ source: "minisite", minisite_slug: "kape" }), "From your mini-website (/business/kape)");
});

test("sync endpoint: matched by proven email, saves leads once into the existing inbox, never deletes mini-sites", async () => {
  const r = await read("src/app/api/pages/sync/route.ts");
  assert.match(r, /rpc\("member_id_for_verified_email"/);
  assert.match(r, /source: "minisite", external_id: `pages:\$\{lead\.leadId\}`/);
  assert.match(r, /insErr\.code !== "23505"/);
  assert.match(r, /update\(\{ published: false/);
  assert.doesNotMatch(r, /\.delete\(/);
});

test("directory filters: industry, chapter, region (from the province when not saved), mini-website, name or place", () => {
  const f = D.readFilters({ q: "  Kape ", industry: "Food & beverage", chapter: "c1", region: "Region III (Central Luzon)", minisite: "1" }, ["c1"]);
  assert.deepEqual(f, { q: "kape", industry: "Food & beverage", chapter: "c1", region: "Region III (Central Luzon)", minisite: true, category: "", verified: false });
  assert.deepEqual(D.readFilters({ industry: "Nope", chapter: "evil", region: "Mars", category: "Evil" }, ["c1"]), { q: "", industry: "", chapter: "", region: "", minisite: false, category: "", verified: false });
  const rows = [
    { owner_id: "u1", name: "Kape ni Juan", city: "San Fernando", province: "Pampanga", region: null, sector: "Food & beverage", chapter_id: "c1" },
    { owner_id: "u2", name: "Kape Cebu", city: "Cebu City", province: "Cebu", region: "Region VII (Central Visayas)", sector: "Food & beverage", chapter_id: "c2" },
    { owner_id: "u3", name: "Tela", city: "Angeles", province: "Pampanga", region: null, sector: "Crafts & fashion", chapter_id: "c1" },
  ];
  assert.deepEqual(D.filterDirectory(rows, f, new Set(["u1"])).map((r) => r.owner_id), ["u1"]);
  assert.deepEqual(D.filterDirectory(rows, { ...f, minisite: true }, new Set()).map((r) => r.owner_id), []);
  assert.deepEqual(D.filterDirectory(rows, { q: "", industry: "", chapter: "", region: "Region III (Central Luzon)", minisite: false }, new Set()).map((r) => r.owner_id), ["u1", "u3"]);
  assert.equal(D.filtersQuery(f), "?q=kape&industry=Food+%26+beverage&chapter=c1&region=Region+III+%28Central+Luzon%29&minisite=1");
  assert.ok(D.REGIONS.includes("NCR") && D.REGIONS.includes("BARMM"));
});

test("member profile, My business, Workspace and Inquiries connect to the mini-site", async () => {
  const profile = await read("src/components/listing/BusinessProfile.tsx");
  assert.match(profile, /from\("member_minisites"\)/);
  assert.match(profile, /Visit mini-website/);
  assert.match(await read("src/app/account/business/page.tsx"), /<MinisiteCard /);
  const ws = await read("src/app/(member)/workspace/page.tsx");
  assert.match(ws, /title: "My mini-website"/);
  assert.match(ws, /title: "Leads and inquiries"/);
  const inbox = await read("src/app/account/inquiries/page.tsx");
  assert.match(inbox, /sourceLabel\(q\)/);
  assert.match(inbox, /!biz && all\.length === 0/);
  const members = await read("src/app/members/page.tsx");
  for (const n of ["industry", "chapter", "region", "minisite"]) assert.match(members, new RegExp(`name="${n}"`));
});
