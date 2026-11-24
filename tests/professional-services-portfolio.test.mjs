import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");

const proForm = async () => {
  const forms = await read("src/lib/forms.ts");
  const start = forms.indexOf('"professional-services": {');
  const end = forms.indexOf('"workshop-request": {');
  assert.ok(start > 0 && end > start, "professional-services form is defined");
  return forms.slice(start, end);
};

test("page is titled Build Your Portfolio and the hero explains value first without promising income", async () => {
  const involved = await read("src/content/involved.ts");
  assert.match(involved, /title: "Build Your Portfolio: Volunteer Professional Services"/);
  const intro = involved.match(/slug: "professional-services"[\s\S]*?intro: "([^"]+)"/)[1];
  const sentences = intro.split(/(?<=\.)\s+/).filter(Boolean);
  assert.ok(sentences.length >= 2 && sentences.length <= 4, `hero has 2–4 sentences, got ${sentences.length}`);
  assert.match(intro, /Give value first/);
  assert.match(intro, /proof of concept/);
  assert.doesNotMatch(intro, /guarantee|sure income|assured/i);
  // Metadata uses the same title (meta(page.title, ...)).
  assert.match(await read("src/app/get-involved/professional-services/page.tsx"), /meta\(page\.title, page\.description/);
});

test("every skill and industry has an easy example, and the industries cover MSME sectors", async () => {
  const involved = await read("src/content/involved.ts");
  const block = involved.slice(involved.indexOf('slug: "professional-services"'));
  for (const title of ["Skills we need", "MSME industries you can help"]) {
    const sec = block.slice(block.indexOf(`title: "${title}"`));
    const items = sec.slice(sec.indexOf("items: ["), sec.indexOf("] }")).match(/"[^"]+"/g).slice(0);
    assert.ok(items.length >= 18, `${title} has many entries`);
    for (const i of items) assert.match(i, / — e\.g\. /, `${i} has an example`);
  }
  for (const sector of ["Food and beverage", "sari-sari", "Agriculture", "Manufacturing", "salon, repair, laundry", "Tourism", "Logistics", "Real estate", "Construction", "Health", "Education", "Creative", "Tech", "Finance", "DTI, BIR, permits", "Human resources", "Marketing", "Customer service", "Operations", "Sustainability"]) {
    assert.ok(block.includes(sector), `industry ${sector} listed`);
  }
});

test("volunteer form asks what MSMEs need to decide, grouped in steps, with few required fields", async () => {
  const form = await proForm();
  for (const f of ["profession", "years_experience", "service", "secondary_skills", "industries", "value_pitch", "portfolio_links", "certifications", "tools", "education", "hours", "days", "start_date", "work_setup", "province", "engagement_length", "languages", "references", "references_consent", "hoped_gain", "conduct_accepted", "confidentiality_accepted"]) {
    assert.match(form, new RegExp(`name: "${f}"`), `field ${f}`);
  }
  assert.equal((form.match(/section: "/g) ?? []).length, 5, "five steps");
  assert.match(form, /markOptional: true/);
  const required = (form.match(/required: true/g) ?? []).length;
  assert.ok(required <= 10, `required fields stay minimal (${required} + name/email/city)`);
  // The Data Privacy Act consent is on every public form and checked by the API.
  assert.match(await read("src/components/SubmissionForm.tsx"), /Data Privacy Act of 2012 \(RA 10173\)/);
  assert.match(await read("src/app/api/submit/route.ts"), /raw\.consent !== "yes"/);
});

test("multi-choice answers are validated against the allowed options and stored in the existing data column", async () => {
  const api = await read("src/app/api/submit/route.ts");
  assert.match(api, /f\.type === "multi"/);
  assert.match(api, /picked\.every\(\(o\) => f\.options\?\.includes\(o\)\)/);
  assert.match(api, /from\("submissions"\)\.insert/);
  const forms = await read("src/lib/forms.ts");
  const options = forms.match(/const PRO_(SKILLS|INDUSTRIES) = \[[^\]]+\]/g).join("");
  assert.doesNotMatch(options, /;/, "options never contain the separator");
});

test("long example lists collapse so the form stays reachable on phones", async () => {
  const tpl = await read("src/components/InvolvedTemplate.tsx");
  assert.match(tpl, /<details/);
  assert.match(tpl, /href="#form"/);
  assert.match(tpl, /min-h-\[44px\]/);
});
