// Phase 10: one FLAME PH ecosystem (/go redirects and the ecosystem footer), Group Order, and the Fulfillment tab
// on the existing Fulfillment by MSMEs feature.
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const toUrl = (js) => `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
const js = async (p, map = {}) => {
  let src = ts.transpileModule(await read(p), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const [from, to] of Object.entries(map)) src = src.replaceAll(`"${from}"`, `"${to}"`);
  return toUrl(src);
};
const industries = await js("src/lib/industries.ts");
const records = await js("src/lib/records.ts", { "@/lib/industries": industries });
const E = await import(await js("src/lib/ecosystem.ts"));
const G = await import(await js("src/lib/group-order.ts", { "@/lib/records": records }));
const F = await import(await js("src/lib/fulfillment.ts"));
const sql = await read("supabase/migrations/0024_group_orders.sql");

test("/go only opens listed pages of MarketplacePH and NegosyoDepot (no open redirect)", () => {
  assert.equal(E.ecoTarget("marketplaceph", "/sell/new"), "https://www.marketplaceph.com/sell/new");
  assert.equal(E.ecoTarget("marketplaceph", "/"), "https://www.marketplaceph.com/");
  assert.equal(E.ecoTarget("marketplaceph", undefined), "https://www.marketplaceph.com/");
  assert.equal(E.ecoTarget("negosyodepot", "/#/fulfillment/providers"), "https://www.negosyodepot.com/#/fulfillment/providers");
  for (const bad of ["//evil.com", "/sell/new/../../x", "https://evil.com", "/admin", "/@evil.com", "/sell/new?x=1"]) assert.equal(E.ecoTarget("marketplaceph", bad), null, bad);
  assert.equal(E.ecoTarget("negosyodepot", "/#/fulfillment/../../x"), null);
  assert.equal(E.ecoTarget("flameph", "/"), null);
  assert.equal(E.ecoTarget("evil", "/"), null);
  assert.equal(E.goHref("negosyodepot", "/#/find", "Find suppliers"), "/go/negosyodepot?to=%2F%23%2Ffind&why=Find+suppliers");
  assert.equal(E.viaGo("https://www.marketplaceph.com/jobs", "Find a Job"), "/go/marketplaceph?to=%2Fjobs&why=Find+a+Job");
  assert.equal(E.viaGo("https://www.managerspizza.com"), "https://www.managerspizza.com", "other sites are unchanged");
  assert.equal(E.viaGo("/academy"), "/academy");
  assert.equal(E.cleanWhy("Sell My Products"), "Sell My Products");
  assert.equal(E.cleanWhy("<script>"), null);
});

test("the go page frames the other app as part of the same ecosystem and refuses unlisted addresses", async () => {
  const page = await read("src/app/go/[app]/page.tsx");
  assert.match(page, /if \(!target\) notFound\(\)/);
  assert.match(page, /One FLAME PH ecosystem/);
  assert.match(page, /Same FLAME PH account/);
  assert.match(page, /robots: \{ index: false/);
});

test("goal cards, menus and More send MarketplacePH and NegosyoDepot links through /go; all 28 cards stay", async () => {
  const door = await read("src/components/EcosystemFrontDoor.tsx");
  assert.match(door, /viaGo\(action\.href, action\.title\)/);
  for (const f of ["src/components/DesktopNav.tsx", "src/components/Footer.tsx", "src/app/(member)/more/page.tsx"]) assert.match(await read(f), /viaGo\(it\.href, it\.label\)/, f);
  // The phone menu (navigation Phase 1) and its Create sheet do the same.
  assert.match(await read("src/components/MobileMenuBody.tsx"), /link\.external \? viaGo\(target, link\.label\)/);
  assert.match(await read("src/components/shell/CreateSheet.tsx"), /a\.external \? viaGo\(a\.href, a\.label\)/);
  const footer = await read("src/components/Footer.tsx");
  assert.match(footer, /<EcosystemFooter here="flameph" \/>/);
  for (const m of door.matchAll(/href: "(https:\/\/www\.(marketplaceph|negosyodepot)\.com[^"]*)"/g)) assert.notEqual(E.viaGo(m[1]), m[1], `${m[1]} is a listed page`);
});

test("group order stages, deadline and minimum", () => {
  const now = Date.parse("2026-11-18T08:00:00Z"); // 4 PM in Manila
  assert.equal(G.manilaToday(Date.parse("2026-11-18T17:00:00Z")), "2026-11-19", "Manila is UTC+8");
  assert.equal(G.daysLeft("2026-11-25", now), 7);
  assert.equal(G.daysLeft("2026-11-18", now), 0);
  const d = { status: "open", sent_at: null, deadline: "2026-11-25" };
  assert.equal(G.stage(d, null, now), "open");
  assert.equal(G.stage({ ...d, deadline: "2026-11-17" }, null, now), "deadline_passed");
  assert.equal(G.stage({ ...d, sent_at: "x" }, { request_status: "open", quotes: 0, record_status: null }, now), "sent");
  assert.equal(G.stage({ ...d, sent_at: "x" }, { request_status: "open", quotes: 2, record_status: null }, now), "quoted");
  assert.equal(G.stage({ ...d, sent_at: "x" }, { request_status: "accepted", quotes: 1, record_status: "in_progress" }, now), "accepted");
  assert.equal(G.stage({ ...d, sent_at: "x", status: "closed" }, { request_status: "accepted", quotes: 1, record_status: "confirmed" }, now), "confirmed");
  assert.equal(G.stage({ ...d, status: "closed" }, null, now), "closed");
  assert.ok(G.canJoin("open") && !G.canJoin("sent") && !G.canJoin("deadline_passed"));
  assert.ok(G.minimumReached(10, 10) && !G.minimumReached(9, 10) && G.minimumReached(1, null));
});

test("starting a group order checks the form the same way the database does", () => {
  const form = (o) => (k) => ({ title: "Kraft boxes", category: "Food & beverage", deadline: "2026-11-25", target_members: "10", min_quantity: "100", quantity: "5", price: "₱1,250.50", unit: "pcs", description: "", supplier: "" , ...o })[k] ?? "";
  const ok = G.parseStart(form({}), "2026-11-18");
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.value.p_price, 1250.5);
  assert.equal(ok.value.p_min_qty, 100);
  assert.equal(G.parseStart(form({ min_quantity: "" }), "2026-11-18").value.p_min_qty, null);
  assert.deepEqual(G.parseStart(form({ deadline: "2026-11-18" }), "2026-11-18").errors, ["bad_deadline"]);
  assert.deepEqual(G.parseStart(form({ deadline: "2027-02-01" }), "2026-11-18").errors, ["bad_deadline"]);
  assert.deepEqual(G.parseStart(form({ target_members: "1" }), "2026-11-18").errors, ["bad_target"]);
  assert.deepEqual(G.parseStart(form({ quantity: "0" }), "2026-11-18").errors, ["bad_quantity"]);
  assert.deepEqual(G.parseStart(form({ price: "abc" }), "2026-11-18").errors, ["bad_amount"]);
  assert.deepEqual(G.parseStart(form({ title: "ab" }), "2026-11-18").errors, ["bad_input"]);
  assert.equal(G.groupOrderErrorCode('ERROR: below_minimum'), "below_minimum");
  assert.equal(G.groupOrderErrorCode('blocked_words'), "blocked_words");
  assert.equal(G.groupOrderErrorCode('Could not find the function public.start_group_order'), "unavailable");
});

test("0024 is additive, members start group orders only through checked functions, visitors never see them", () => {
  assert.doesNotMatch(sql, /\bdrop (table|column|function)\b/i);
  assert.doesNotMatch(sql, /\brename\b/i);
  assert.doesNotMatch(sql, /\b(payment|checkout|escrow|wallet|paymongo)\b/i);
  assert.match(sql, /create policy deals_public on public\.deals for select\s+using \(published and \(not members_only or public\.viewer_is_active_member\(\)\)\)/);
  assert.match(sql, /grant execute on function public\.viewer_is_active_member\(\) to anon, authenticated/);
  for (const fn of ["start_group_order", "group_order_members", "group_order_progress", "send_group_order", "close_group_order"]) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon;`), fn);
    assert.match(sql, new RegExp(`create or replace function public\\.${fn}\\([\\s\\S]*?security definer set search_path = public`), fn);
  }
  // Joining closes at the deadline (Manila) and when the order is sent; never across a block.
  assert.match(sql, /d\.sent_at is null\s+and \(d\.deadline is null or d\.deadline >= \(now\(\) at time zone 'Asia\/Manila'\)::date\)/);
  assert.match(sql, /not public\.is_blocked_between\(d\.created_by, auth\.uid\(\)\)/);
  assert.match(sql, /if total < coalesce\(d\.min_quantity, 1\) then raise exception 'below_minimum'/);
  assert.match(sql, /public\.moderation_text_check\(txt\) is not null then raise exception 'blocked_words'/);
  // The record id is shown only to its two members.
  assert.match(sql, /case when t\.requester_id = auth\.uid\(\) or t\.provider_id = auth\.uid\(\) then t\.id end/);
});

test("the no-money reminder shows on a group order confirmed as a record", async () => {
  const page = await read("src/app/(member)/group-order/[id]/page.tsx");
  assert.match(page, /st === "confirmed" && \(\s*<section aria-label="Reminder"><FixedNotice><p>\{NO_MONEY_EN\}<\/p><p lang="fil">\{NO_MONEY_TL\}<\/p>/);
  const card = await read("src/components/group-order/GroupOrderCard.tsx");
  assert.match(card, /st === "confirmed" && !detail[\s\S]*NO_MONEY_EN[\s\S]*NO_MONEY_TL/);
  const legal = await read("src/lib/legal-text.ts");
  assert.match(legal, /FLAME PH only records that this deal happened\. No money passes through FLAME PH\. Payment and delivery are between you and the other member\./);
});

test("Fulfillment tab builds on the existing Fulfillment by MSMEs feature and keeps every route", async () => {
  assert.equal(F.fulfillmentTitle("pack", "  300 gift   boxes "), "Fulfillment: Pack or label · 300 gift boxes");
  assert.equal(F.fulfillmentTitle("hack", "300 boxes"), null);
  assert.equal(F.fulfillmentTitle("pack", "ab"), null);
  assert.ok(F.fulfillmentTitle("deliver", "x".repeat(200)).length <= 120);
  assert.ok(F.isFulfillmentRequest("Fulfillment: Deliver to customers · 20 trays"));
  for (const l of F.FULFILLMENT_LINKS) assert.ok(E.ecoTarget("negosyodepot", l.to), l.to);
  for (const p of ["src/app/fulfillment/page.tsx", "src/app/(member)/m/fulfillment/page.tsx"]) await access(new URL(`../${p}`, import.meta.url));
  const shell = await read("src/lib/member-shell.ts");
  assert.match(shell, /"\/fulfillment": "\/m\/fulfillment"/);
  const tab = await read("src/app/(member)/m/fulfillment/page.tsx");
  assert.match(tab, /Fulfillment by MSMEs/);
  assert.match(tab, /FORMS\.fulfillment/);
  assert.match(tab, /kind", "fulfillment"/);
  const pub = await read("src/app/fulfillment/page.tsx");
  assert.match(pub, /title="Fulfillment by MSMEs"/);
});
