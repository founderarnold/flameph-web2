// Phase 9: Academy in the member app (with progress), region chapter and events pages, member volunteering,
// and the 28 goal cards on the front door.
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
const growthUrl = await js("src/lib/growth.ts");
const A = await import(await js("src/lib/academy.ts", { "@/lib/growth": growthUrl }));
const R = await import(await js("src/lib/regions.ts", { "@/content/ph-regions": await js("src/content/ph-regions.ts") }));
const shell = await import(await js("src/lib/member-shell.ts"));
const ID1 = "a9000000-0000-4000-8000-000000000001", ID2 = "a9000000-0000-4000-8000-000000000002";

test("Academy and Volunteering open the member version for signed-in members, at the same address", async () => {
  assert.equal(shell.MEMBER_REWRITES["/academy"], "/m/academy");
  assert.equal(shell.MEMBER_REWRITES["/volunteering"], "/m/volunteering");
  // Existing tabs keep working.
  assert.equal(shell.MEMBER_REWRITES["/bizconsult-ai"], "/m/ai");
  assert.equal(shell.activeTab("/m/academy"), null);
  // The public pages are kept.
  await access(new URL("../src/app/academy/page.tsx", import.meta.url));
  await access(new URL("../src/app/volunteering/page.tsx", import.meta.url));
});

test("course progress is saved as a private growth milestone, only for real course ids", () => {
  assert.equal(A.courseKey(ID1), `course:${ID1}`);
  assert.equal(A.courseKey(ID1.toUpperCase()), `course:${ID1}`);
  assert.equal(A.courseKey("idea_validated"), null);
  assert.equal(A.courseKey("x' or 1=1"), null);
  assert.ok(`course:${ID1}`.length <= 60, "fits member_milestones.key");
  const courses = [{ id: ID1, title: "Pricing", stage: "start", summary: null, url: null }, { id: ID2, title: "Books", stage: "build", summary: null, url: null }];
  const p = A.academyProgress(courses, [`course:${ID1}`, "dti_registered"], "start");
  assert.equal(p.total, 2);
  assert.equal(p.finished, 1);
  assert.deepEqual(p.tracks.map((t) => [t.key, t.items.length, t.done, t.here]), [["discover", 0, 0, false], ["start", 1, 1, true], ["build", 1, 0, false], ["grow", 0, 0, false], ["scale", 0, 0, false]]);
  assert.deepEqual(p.stage, { label: "Start", done: 1, of: 4 });
  assert.equal(A.academyProgress([], [], null).stage, null);
  assert.equal(A.pct(1, 3), 33);
  assert.equal(A.pct(0, 0), 0);
});

test("the course action checks the course is published and the member is signed in; admin editing is unchanged", async () => {
  const actions = await read("src/app/account/actions.ts");
  const fn = actions.slice(actions.indexOf("export async function toggleCourse"), actions.indexOf("/** Join or leave a buy-together deal"));
  assert.match(fn, /requireUser\("\/academy"\)/);
  assert.match(fn, /from\("courses"\)\.select\("id"\)\.eq\("id", id\)\.eq\("published", true\)/);
  assert.match(fn, /eq\("user_id", user\.id\)/);
  const config = await read("src/lib/admin/config.ts");
  assert.match(config, /table: "courses", label: "Academy courses"/);
  const page = await read("src/app/(member)/m/academy/page.tsx");
  assert.match(page, /\/admin\/content\/courses/);
  assert.match(page, /\/account\/growth/);
});

test("region pages: NCR, Calabarzon and Central Luzon match chapters and events by region, province or city", () => {
  assert.deepEqual(R.FOCUS_REGIONS.map((r) => r.slug), ["ncr", "calabarzon", "central-luzon"]);
  const ncr = R.regionBySlug("ncr"), cal = R.regionBySlug("calabarzon"), cl = R.regionBySlug("central-luzon");
  assert.equal(R.regionBySlug("visayas"), null);
  assert.deepEqual(R.provincesOf(cal).sort(), ["Batangas", "Cavite", "Laguna", "Quezon", "Rizal"]);
  assert.equal(R.provincesOf(cl).length, 7);
  assert.ok(R.inRegion({ province: "Pampanga" }, cl));
  assert.ok(R.inRegion({ region: "Region III (Central Luzon)" }, cl));
  assert.ok(R.inRegion({ region: "Region IV-A (CALABARZON)" }, cal));
  assert.ok(!R.inRegion({ region: "Region IV-A (CALABARZON)" }, cl));
  assert.ok(!R.inRegion({ region: "Region III (Central Luzon)" }, cal));
  assert.ok(R.inRegion({ province: "Metro Manila" }, ncr));
  assert.ok(R.inRegion({ city: "Quezon City" }, ncr));
  assert.ok(!R.inRegion({ city: "Quezon City", province: "Quezon" }, ncr), "Quezon province is Calabarzon");
  assert.ok(R.inRegion({ city: "Lucena", province: "Quezon" }, cal));
  assert.ok(!R.inRegion({ province: "Cebu" }, ncr) && !R.inRegion({ province: "Cebu" }, cal) && !R.inRegion({ province: "Cebu" }, cl));
  assert.equal(R.focusRegionOf("Bulacan")?.slug, "central-luzon");
  assert.equal(R.focusRegionOf("Davao del Sur"), null);
});

test("region page reuses chapters, events, event registration and chapter group joining", async () => {
  const page = await read("src/app/chapters/[region]/page.tsx");
  for (const reuse of [/<EventList /, /<JoinLeave /, /chapterGroupSlug\(c\)/, /table: "chapters"/, /table: "events"/, /notFound\(\)/, /limit: 500/])
    assert.match(page, reuse);
  const chapters = await read("src/app/chapters/page.tsx");
  assert.match(chapters, /FOCUS_REGIONS\.map/);
});

test("member volunteering reuses the existing Get involved pages and forms", async () => {
  const page = await read("src/app/(member)/m/volunteering/page.tsx");
  for (const slug of ["mentor", "resource-speaker", "professional-services", "chapter-leader"]) {
    await access(new URL(`../src/app/get-involved/${slug}/page.tsx`, import.meta.url));
    assert.ok(page.includes(`"${slug}"`), slug);
  }
  assert.match(page, /FORMS\.volunteer/);
});

test("all 28 goal cards are still on the front door, each with its image file and a working link", async () => {
  const src = await read("src/components/EcosystemFrontDoor.tsx");
  const block = src.slice(src.indexOf("const ACTIONS"), src.indexOf("const ECOSYSTEM"));
  const cards = [...block.matchAll(/\{ title: "([^"]+)", text: "[^"]+", href: "([^"]+)",(?: external: true,)? accent: "#[0-9a-f]{6}", image: "([^"]+)" \}/g)];
  assert.equal(cards.length, 28);
  assert.equal(new Set(cards.map((c) => c[1])).size, 28, "titles are unique");
  for (const [, title, href, image] of cards) {
    await access(new URL(`../public${image}`, import.meta.url));
    if (href.startsWith("/")) await access(new URL(`../src/app${href === "/" ? "" : href}/page.tsx`, import.meta.url)).catch(() => assert.fail(`${title}: ${href} has no page`));
    else assert.match(href, /^https:\/\//, title);
  }
  for (const p of ["src/app/page.tsx", "src/app/start/page.tsx"]) assert.match(await read(p), /<EcosystemFrontDoor(?: afterHero=\{<QuickLook \/>\})? \/>/);
});
