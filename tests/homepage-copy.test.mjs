import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const frontDoor = await readFile(new URL("../src/components/EcosystemFrontDoor.tsx", import.meta.url), "utf8");
const home = await readFile(new URL("../src/app/page.tsx", import.meta.url), "utf8");
const benefits = await readFile(new URL("../src/app/benefits/page.tsx", import.meta.url), "utf8");
const nav = await readFile(new URL("../src/content/nav.json", import.meta.url), "utf8");

test("homepage uses the approved Filipino-first hero message", () => {
  assert.match(frontDoor, /Ano Ang Gusto Mong Gawin /);
  assert.match(frontDoor, /For Your Business: Increase Sales and\/or Minimize Expenses\?/);
  assert.match(frontDoor, /Micro Fulfillment by MSMEs/);
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

test("quick look sits right below the hero on the home page only, and links to real pages", async () => {
  const quick = await readFile(new URL("../src/components/QuickLook.tsx", import.meta.url), "utf8");
  const start = await readFile(new URL("../src/app/start/page.tsx", import.meta.url), "utf8");
  assert.match(home, /<EcosystemFrontDoor afterHero=\{<QuickLook \/>\} \/>/);
  assert.match(start, /<EcosystemFrontDoor \/>/);
  assert.ok(frontDoor.indexOf("{afterHero}") > frontDoor.indexOf("flameph-msme-hero.png"));
  assert.ok(frontDoor.indexOf("{afterHero}") < frontDoor.indexOf('id="choose-a-goal"'));
  for (const href of ["/deals", "/business-calculators", "/pos", "/fulfillment", "/workshops", "/real-estate-for-msmes", "/join", "/get-involved/chapter-builder#builder", "/get-involved/chapter-builder#venue", "/fulfillment/waitlist", "/manager-ceo-training", "/workshops/gallery", "/workshops/join", "/workshops/request", "/get-involved/speaker-mentor", "/get-involved/workshop-partner", "/chapters"]) {
    assert.match(quick, new RegExp(`"${href}"`));
  }
  assert.match(quick, /goHref\("marketplaceph"/);
  assert.match(quick, /goHref\("negosyodepot"/);
  assert.match(quick, /Sugpuin ang Kahirapan Through Entrepreneurship/);
  assert.match(quick, /never holds your money/);
  assert.doesNotMatch(quick, /guarantee|returns|passive income/i);
  for (const text of ["Volunteer as Meetup Venue for MSMEs", "Volunteer as Chapter Builder in Your City/Town", "Volunteer as FLAME PH Meetup Venue", "Core features of the FLAME PH ecosystem for MSMEs", "Manager/CEO Training Program", "Learn More to Earn More", "Teach people to fish", "Request workshop in our community/area", "Sama-sama sa pag-asenso.", "Volunteer as Resource Speaker/Mentor for MSMEs", "Join as Partner or Sponsor a Workshop", "FLAME PH Authorized Partner", "consolidates group orders", "pasalo", "commissary"]) assert.ok(quick.includes(text), text);
});

test("new sign-up pages use the shared form system with plain-language help on every typed field", async () => {
  const forms = await readFile(new URL("../src/lib/forms.ts", import.meta.url), "utf8");
  for (const [type, page] of [["meetup-venue", "get-involved/chapter-builder"], ["fulfillment-waitlist", "fulfillment/waitlist"], ["manager-trainee", "manager-ceo-training"], ["workshop-join", "workshops/join"], ["workshop-request", "workshops/request"], ["speaker-mentor-waitlist", "get-involved/speaker-mentor"], ["workshop-partner", "get-involved/workshop-partner"]]) {
    assert.match(forms, new RegExp(`"${type}": \\{`));
    const src = await readFile(new URL(`../src/app/${page}/page.tsx`, import.meta.url), "utf8");
    assert.match(src, /<SubmissionForm def=\{FORMS\[/);
    assert.match(src, /<Faq items=\{FAQ\} \/>/);
  }
});

test("FLAME Principle has a blue Join Group Ordering button to the Group Order page", () => {
  assert.match(home, /href="\/group-order" className="btn btn-primary[^"]*">Join Group Ordering</);
});
