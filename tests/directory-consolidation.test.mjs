import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Benefits exposes the Pages directory and keeps RideSafe last", async () => {
  const nav = JSON.parse(await readFile(new URL("../src/content/nav.json", import.meta.url), "utf8"));
  const benefits = nav.find((group) => group.key === "benefits");
  assert.ok(benefits, "Benefits menu must exist");

  const directory = benefits.items.find((item) => item.label === "Free Business Directory");
  assert.deepEqual(directory, {
    label: "Free Business Directory",
    href: "https://pages.flameph.org/directory",
    external: true,
  });
  const builder = benefits.items.find((item) => item.label === "Free Mini-Website/Landing Pages");
  assert.deepEqual(builder, {
    label: "Free Mini-Website/Landing Pages",
    href: "/login?next=%2Faccount%2Fbusiness",
  });
  assert.equal(benefits.items.at(-1)?.label, "RideSafe");
});

test("legacy directory routes permanently forward to the Pages directory", async () => {
  const config = await readFile(new URL("../next.config.ts", import.meta.url), "utf8");
  assert.match(config, /source: "\/directory", destination: "https:\/\/pages\.flameph\.org\/directory", permanent: true/);
  assert.match(config, /source: "\/directory\/:path\*", destination: "https:\/\/pages\.flameph\.org\/directory", permanent: true/);
});

test("the main sitemap no longer publishes duplicate directory pages", async () => {
  const sitemap = await readFile(new URL("../src/app/sitemap.ts", import.meta.url), "utf8");
  assert.doesNotMatch(sitemap, /paths\.add\(`\/directory\/\$\{/);
  assert.doesNotMatch(sitemap, /publicBusinesses/);
});
