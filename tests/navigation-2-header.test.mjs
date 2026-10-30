import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const nav = JSON.parse(await readFile(new URL("../src/content/nav.json", import.meta.url), "utf8"));
const header = await readFile(new URL("../src/components/Header.tsx", import.meta.url), "utf8");
const desktopNav = await readFile(new URL("../src/components/DesktopNav.tsx", import.meta.url), "utf8");
const search = await readFile(new URL("../src/components/SiteSearch.tsx", import.meta.url), "utf8");
const oldFreeBenefits = await readFile(new URL("../src/app/membership/free-benefits/page.tsx", import.meta.url), "utf8");

test("chapters are consolidated under Explore", () => {
  assert.equal(nav.some((group) => group.key === "chapters"), false);
  const explore = nav.find((group) => group.key === "explore");
  assert.ok(explore);
  for (const label of ["Find a Chapter", "Featured Chapters", "Become a Chapter Leader", "Chapter Activities & Events"]) {
    assert.ok(explore.items.some((item) => item.label === label), `${label} should be under Explore`);
  }
});

test("benefit labels use the consolidated names", () => {
  const benefits = nav.find((group) => group.key === "benefits");
  assert.ok(benefits.items.some((item) => item.label === "Free Benefits" && item.href === "/benefits"));
  assert.ok(benefits.items.some((item) => item.label === "Upgraded Benefits"));
  assert.equal(benefits.items.some((item) => ["Member Benefits", "Membership Plans"].includes(item.label)), false);
});

test("header uses expandable site search instead of language toggle", () => {
  assert.match(header, /<SiteSearch\s*\/>/);
  assert.doesNotMatch(header, /LangToggle/);
  assert.match(search, /aria-label="Search FLAME PH"/);
  assert.match(search, /action="\/search"/);
  assert.match(search, /aria-expanded=\{open\}/);
});

test("desktop header labels use one font size", () => {
  const triggerClass = desktopNav.match(/className="([^"]*font-semibold[^"]*)"/)?.[1] ?? "";
  assert.match(triggerClass, /\btext-sm\b/);
  assert.doesNotMatch(triggerClass, /text-\[/);
});

test("legacy free-benefits URL redirects to the consolidated page", () => {
  assert.match(oldFreeBenefits, /permanentRedirect\("\/benefits"\)/);
});
