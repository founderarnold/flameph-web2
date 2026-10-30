import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const DIRECTORY_URL = "https://pages.flameph.org/directory";

test("Membership sends visitors to the single Pages directory and keeps RideSafe last", async () => {
  const nav = JSON.parse(await readFile(new URL("../src/content/nav.json", import.meta.url), "utf8"));
  const membership = nav.find((group) => group.key === "membership");
  assert.ok(membership, "Membership menu must exist");

  const directory = membership.items.find((item) => item.label === "Free Micro Website/Business Directory");
  assert.deepEqual(directory, {
    label: "Free Micro Website/Business Directory",
    href: DIRECTORY_URL,
    external: true,
  });
  assert.equal(membership.items.at(-1)?.label, "Free RideSafe App");
  assert.equal(membership.items.some((item) => item.href === "/directory"), false);
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
