import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const frontDoor = await readFile(new URL("../src/components/EcosystemFrontDoor.tsx", import.meta.url), "utf8");
const home = await readFile(new URL("../src/app/page.tsx", import.meta.url), "utf8");
const benefits = await readFile(new URL("../src/app/benefits/page.tsx", import.meta.url), "utf8");
const nav = await readFile(new URL("../src/content/nav.json", import.meta.url), "utf8");

test("homepage uses the approved Filipino-first hero message", () => {
  assert.match(frontDoor, /Ano Ang Gusto Mong Gawin Ngayon/);
  assert.match(frontDoor, /For Your Business\?/);
  assert.match(frontDoor, /Hindi mo kailangang mag-business nang mag-isa\./);
  assert.match(frontDoor, /Ang <strong>FLAME PH<\/strong> ang iyong digital workspace/);
});

test("hero value cards have meaningful icons", () => {
  assert.match(frontDoor, /<I\.IconUsers \/>[\s\S]*Connect with MSMEs/);
  assert.match(frontDoor, /<I\.IconHands \/>[\s\S]*Access opportunities/);
  assert.match(frontDoor, /<I\.IconStore \/>[\s\S]*Grow your business/);
});

test("ecosystem and free-benefit labels are consistent across key surfaces", () => {
  for (const source of [frontDoor, nav]) assert.match(source, /Easy Startup for Aspiring Managers/);
  for (const source of [home, benefits, nav]) {
    assert.match(source, /Free Mini-Website\/Landing Pages/);
    assert.match(source, /Free Basic POS for MSMEs/);
  }
});

test("every goal card uses a generated image and a Tagalog example", () => {
  const actionBlock = frontDoor.slice(frontDoor.indexOf("const ACTIONS"), frontDoor.indexOf("const ECOSYSTEM"));
  assert.equal((actionBlock.match(/image: "\/goal-cards\//g) ?? []).length, 28);
  assert.equal((actionBlock.match(/Halimbawa:/g) ?? []).length, 28);
  assert.match(actionBlock, /title: "Build Portfolio"/);
  assert.match(actionBlock, /href: "\/get-involved\/professional-services"/);
  assert.doesNotMatch(actionBlock, /Join My Local Chapter/);
  for (const title of ["Find Cargo Movers", "Find Import Assistance", "Find Tax Compliance Assistance", "Find Legal Assistance", "Work From Home Jobs", "Find Financing Assistance", "Buy a Business", "Sell a Business", "Pasalo a Business", "Franchise a Business", "Find Partners or Joint Venture", "Find Vehicle Dealers", "Find Investment Opportunities", "Find Digital Marketing Experts"]) {
    assert.match(actionBlock, new RegExp(`title: "${title}"`));
  }
});
