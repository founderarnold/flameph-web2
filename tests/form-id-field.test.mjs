// Guard for the "pressed button is lost" bug (first found in Directory verification, PR #56).
// A form field named "id" hides the form's own id in the browser. React then ties the pressed button
// (name/value) to a form that does not exist, so the server never learns which button was pressed.
// Any form that has a named submit button must therefore not contain a field named "id".
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (p) => readFile(new URL(p, root), "utf8");

async function tsxFiles(dir) {
  const out = [];
  for (const e of await readdir(new URL(dir, root), { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...(await tsxFiles(p)));
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/** Local components (in the same file) that render a named submit button, e.g. SaveButtons. */
function namedButtonComponents(src) {
  const names = [];
  for (const m of src.matchAll(/function ([A-Z]\w*)\([^)]*\)[^{]*\{([\s\S]*?)\n\}/g)) {
    if (/<(?:button|SubmitButton)\b[^>]*\bname=/.test(m[2])) names.push(m[1]);
  }
  return names;
}

test("no form with a named submit button also has a field named id", async () => {
  const bad = [];
  for (const f of await tsxFiles("src")) {
    const src = await read(f);
    const comps = namedButtonComponents(src);
    for (const m of src.matchAll(/<form\b/g)) {
      const end = src.indexOf("</form>", m.index);
      if (end < 0) continue;
      const block = src.slice(m.index, end);
      if (!/name=\{?"id"\}?/.test(block)) continue;
      const named = /<(?:button|SubmitButton)\b[^>]*\bname=/.test(block) || comps.some((c) => block.includes(`<${c}`));
      if (named) bad.push(`${f}:${src.slice(0, m.index).split("\n").length}`);
    }
  }
  assert.deepEqual(bad, [], `Rename the "id" field in these forms (e.g. offer_id): ${bad.join(", ")}`);
});

test("Admin > Privacy and partner save forms send their own record field", async () => {
  const pairs = [
    ["src/app/admin/privacy/page.tsx", "request_id", "src/app/admin/privacy/actions.ts"],
    ["src/app/admin/privacy/incidents/[id]/page.tsx", "incident_id", "src/app/admin/privacy/actions.ts"],
    ["src/app/partner-us/apply/[id]/page.tsx", "application_id", "src/app/partner-us/actions.ts"],
    ["src/app/partner-us/offers/[id]/page.tsx", "offer_id", "src/app/partner-us/offers/actions.ts"],
    ["src/app/partner-us/offers/[id]/ServiceOffer.tsx", "offer_id", "src/app/partner-us/offers/service-actions.ts"],
    ["src/app/partner-us/offers/[id]/SignatureOffer.tsx", "offer_id", "src/app/partner-us/offers/signature-actions.ts"],
    ["src/app/partner-us/complaints/[id]/page.tsx", "complaint_id", "src/app/partner-us/complaints/actions.ts"],
    ["src/app/partner-us/samples/[id]/page.tsx", "sample_id", "src/app/partner-us/samples/actions.ts"],
  ];
  for (const [page, field, actions] of pairs) {
    assert.match(await read(page), new RegExp(`name="${field}"`), page);
    assert.match(await read(actions), new RegExp(`"${field}"`), actions);
  }
});
