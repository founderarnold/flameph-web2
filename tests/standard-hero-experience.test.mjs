import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("shared hero pages use contextual artwork while the homepage remains outside the mapping", () => {
  const map = read("src/lib/hero-pages.ts");
  const hero = read("src/components/ui.tsx");
  assert.match(map, /"\/membership\/free-benefits"/);
  assert.match(map, /"\/get-involved\/mentor"/);
  assert.match(map, /"\/get-involved\/professional-services"/);
  assert.match(map, /path\.startsWith\("\/news\/"\)/);
  assert.match(map, /path\.startsWith\("\/resources\/"\)/);
  assert.doesNotMatch(map, /EXACT_SCENES[^]*"\/"\s*:/);
  assert.match(hero, /<HeroArtwork path=\{path\}/);
  for (let sheet = 1; sheet <= 12; sheet += 1) {
    assert.equal(existsSync(new URL(`../public/hero-scenes/hero-scenes-${sheet}.webp`, import.meta.url)), true);
  }
});

test("hero page sharing is rendered before the footer instead of inside the hero", () => {
  const hero = read("src/components/ui.tsx");
  const layout = read("src/app/layout.tsx");
  const footerShare = read("src/components/PageShareBar.tsx");
  assert.doesNotMatch(hero, /ShareButtons/);
  assert.match(layout, /<PageShareBar \/>\s*<Footer \/>/);
  assert.match(footerShare, /section\[data-page-share="true"\]/);
  assert.match(footerShare, /<ShareButtons path=\{page\.path\}/);
});

test("signed-out visitors can always reach Join free on desktop and mobile", () => {
  const header = read("src/components/Header.tsx");
  const mobile = read("src/components/MobileMenu.tsx");
  assert.match(header, /!signedIn && <Link href="\/join"/);
  assert.match(mobile, /<Link href="\/join" className="btn btn-flame w-full">/);
  assert.match(mobile, /<Link href="\/login" className="btn btn-outline w-full">/);
});
