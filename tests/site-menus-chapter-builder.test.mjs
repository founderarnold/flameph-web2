import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");

test("one header for everyone: site menus from 768px up, for visitors and members", async () => {
  const header = await read("src/components/Header.tsx");
  const nav = await read("src/components/DesktopNav.tsx");
  const layout = await read("src/app/layout.tsx");
  assert.match(header, /<DesktopNav groups=\{NAV\} lang=\{lang\} \/>/);
  assert.equal((header.match(/<DesktopNav /g) ?? []).length, 1, "the menus are shown whether or not the person is signed in");
  assert.match(nav, /hidden w-full min-w-0 pb-1 md:block/);
  assert.doesNotMatch(layout, /MemberTopBar/);
  // Members keep Home, Messages, Inbox and Account.
  assert.match(header, /<HomeButton latest=\{member\.latest\} \/>/);
  assert.match(header, /<AccountMenu label=\{t\.account\} \/>/);
  assert.match(await read("src/components/AccountMenu.tsx"), /className="relative hidden md:block"/);
});

test("one five-tab phone bar for everyone, hidden from 768px up", async () => {
  const bar = await read("src/components/shell/MemberTabsNav.tsx");
  const shell = await read("src/lib/member-shell.ts");
  assert.equal((bar.match(/md:hidden/g) ?? []).length, 2);
  assert.doesNotMatch(bar, /lg:hidden/);
  // Visitors: public pages where they exist, sign-up for New Post, and More opens the full site menu.
  assert.match(shell, /key: "group-order", href: "\/group-order", label: "Group Order", visitorHref: "\/deals"/);
  assert.match(shell, /key: "new-post", href: "\/new-post", label: "New Post", visitorHref: "\/join\?next=%2Fnew-post"/);
  assert.match(bar, /<MobileMenu groups=\{menu\.groups\}/);
  assert.match(await read("src/components/Footer.tsx"), /pb-24 md:pb-0/);
});

test("Chapter Builder form: members only, on the page and in the API", async () => {
  const page = await read("src/app/get-involved/chapter-builder/page.tsx");
  const api = await read("src/app/api/submit/route.ts");
  const forms = await read("src/lib/forms.ts");
  assert.match(page, /\{user \? <SubmissionForm def=\{FORMS\["chapter-builder"\]\} \/>\s*: <SignInFirst id="builder"/);
  assert.match(page, /\{user \? <SubmissionForm def=\{FORMS\["meetup-venue"\]\}[^}]*\/>\s*: <SignInFirst id="venue"/);
  // The agreement is read inside the member forms, not from the sign-in box.
  assert.doesNotMatch(page, /CHAPTER_BUILDER_AGREEMENT/);
  assert.match(page, /\/join\?next=\$\{next\}/);
  assert.match(page, /\/login\?next=\$\{next\}/);
  assert.match(forms, /type: "meetup-venue", title: "Volunteer as a FLAME PH Meetup Venue", membersOnly: true/);
  // One page: the old Chapter Leader address forwards here.
  assert.match(await read("src/app/get-involved/chapter-leader/page.tsx"), /permanentRedirect\("\/get-involved\/chapter-builder#builder"\)/);
  assert.match(forms, /type: "chapter-builder", title: "Volunteer as Chapter Builder in Your City\/Town", membersOnly: true/);
  assert.match(api, /if \(def\.membersOnly && !userId\) return NextResponse\.json\(\{ error: [^}]+\}, \{ status: 401 \}\)/);
});

test("NDA and non-compete: required box, linked page, version and time stored", async () => {
  const forms = await read("src/lib/forms.ts");
  const api = await read("src/app/api/submit/route.ts");
  const policy = await read("src/lib/policy.ts");
  const more = JSON.parse(await read("src/content/more.json"));
  assert.match(forms, /name: "nda_accepted", type: "checkbox", required: true, agreementVersion: CHAPTER_BUILDER_AGREEMENT\.version/);
  assert.equal((forms.match(/NDA_FIELD\]/g) ?? []).length, 2, "Chapter Builder and Meetup Venue forms both require the agreement");
  assert.match(forms, /link: \{ href: CHAPTER_BUILDER_AGREEMENT\.href/);
  assert.match(policy, /href: "\/legal\/chapter-builder-agreement",[^}]*version: "1\.1"/);
  assert.match(api, /clean\[`\$\{f\.name\}_version`\] = f\.agreementVersion; clean\[`\$\{f\.name\}_at`\] = acceptedAt;/);
  assert.match(await read("src/components/SubmissionForm.tsx"), /f\.link && /);
  assert.ok(more.notListed["/legal/chapter-builder-agreement"]);
  const agreement = await read("src/app/legal/chapter-builder-agreement/page.tsx");
  for (const s of ["San Fernando City, Pampanga", "7 years", "₱10,000,000", "FLAME Signature", "Micro Fulfillment", "spouse, relatives, siblings or friends", "free POS", "Data Privacy Act of 2012", "Mark Tomon", "What you remain free to do", "approved or disapproved", "terminated or discontinued"]) assert.ok(agreement.includes(s), s);
});

test("Chapter Builder page has separate FAQs with perks for builders and venues", async () => {
  const page = await read("src/app/get-involved/chapter-builder/page.tsx");
  assert.match(page, /<Faq title="Chapter Builder and Leader: questions and perks" items=\{BUILDER_FAQ\} \/>/);
  assert.match(page, /<Faq title="Meetup Venue: questions and perks" items=\{VENUE_FAQ\} \/>/);
  assert.match(page, /What do I get as a Chapter Builder or Chapter Leader\?/);
  assert.match(page, /What do I get as a Meetup Venue\?/);
});
