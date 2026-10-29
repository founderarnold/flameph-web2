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
  const footerShare = read("src/components/HeroPageFooterShare.tsx");
  assert.doesNotMatch(hero, /ShareButtons/);
  assert.match(layout, /<HeroPageFooterShare \/>\s*<Footer \/>/);
  assert.match(footerShare, /showStandardHeroShare/);
  assert.match(footerShare, /<ShareButtons path=\{pathname\}/);
});

test("hero pages replace the desktop language toggle with Join free", () => {
  const actions = read("src/components/HeroHeaderActions.tsx");
  const mobile = read("src/components/MobileMenu.tsx");
  assert.match(actions, /heroPage \? <Link href="\/join"/);
  assert.match(actions, /: <LangToggle lang=\{lang\}/);
  assert.match(mobile, /!heroPage && <div[^]*<LangToggle lang=\{lang\}/);
});
