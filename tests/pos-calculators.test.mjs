// Phase 6: Flame POS tab and the 15 business calculators in Workspace.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const toUrl = (js) => `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
const load = async (p) => import(toUrl(ts.transpileModule(await read(p), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText));

const P = await load("src/lib/pos.ts");
const C = await load("src/lib/calculators.ts");
const more = JSON.parse(await read("src/content/more.json"));

// The 15 calculators were checked in a browser in Phase 6 (sample numbers and a second set of numbers, before and after:
// identical). If any calculator file changes, this fails so the results are checked again before the hash is updated.
const CHECKED = {
  "break-even": "d8f374d80531366cd5050d6236396ed00fd70f060efac40ef0889a456556f9bd",
  "capacity-planning": "63a9f05f3b6b127da9e9dfeeb75be7a4550eeaf63bc9515f078a635b65c5ae97",
  "cash-flow": "e2529ed09d70f18b3021949a0d5df1a67799734bc169d78d80ea77f41810f109",
  "customer-acquisition-cost": "19da06bbd38fa00d0f465cabbbfef3885b3aa6191f03ae6e0fa7c3e0de197c4d",
  "employee-cost": "4c528e39354bb7f7540247dbd519cba0db00e3edf746b0b319957bc174232f17",
  "expansion-readiness": "2e07346960930ebbc61959bac12d07a9cc1eaa3592ddfa22c54aa9899c3ad230",
  "fleet-cost": "09f04fcc5bae89ae789ab669e4d77fa89e32bcae9d7d01b343b85195fc7094f6",
  "franchise-unit-economics": "91fd876e46da63f846ea0d59fac348b842fa374fcf54a6d7687e86adfb509e65",
  "inventory-turnover": "f6cfd252442d61fe277011d6c18dcd1456d07b7e17326f14759fcb162921bf6d",
  "job-service-pricing": "7ccb3833f588e577bbbea0eda8fed15fd72443481a457c9877958858372e11b7",
  "markup-margin": "406eab09239531d6fe83b6b1c940a9c70847a63e0efb48fc4357da65140ab701",
  "payroll": "c4714ab90cafc3ee673ffb68d8ab76b8a52f0ea86adde1426d1c848d69b8ade0",
  "receivables-aging": "bd2aa93fc95d5a89359920cebf3435db2f21a79b764d7b8954d47bdd7704bd75",
  "roi": "2f7f1f67d24068b4c9386bf0fb4fd281f86e6520c6260a8f67a7c60dbf4fb7a2",
  "working-capital": "2d3d294b071718c098a80848b960ee64fafed8f25791787353e83fbe6df999b4",
};

test("all 15 calculator files are unchanged since their results were checked", async () => {
  const files = (await readdir(new URL("../src/calculators/", import.meta.url))).filter((f) => f.endsWith(".html")).map((f) => f.slice(0, -5)).sort();
  assert.deepEqual(files, Object.keys(CHECKED).sort());
  for (const id of files) {
    const hash = createHash("sha256").update(await readFile(new URL(`../src/calculators/${id}.html`, import.meta.url))).digest("hex");
    assert.equal(hash, CHECKED[id], `${id}.html changed: re-check its results, then update the hash`);
  }
});

test("Workspace lists exactly the 15 existing calculators, each opening its own file", () => {
  assert.equal(C.CALCULATORS.length, 15);
  assert.deepEqual(C.CALCULATORS.map((c) => c.id).sort(), Object.keys(CHECKED).sort());
  assert.equal(C.calculatorHref("roi"), "/workspace/calculators?calc=roi");
});

test("More → Workspace has Flame POS and Business calculators; the calculators group lists all 15", () => {
  const ws = more.groups.find((g) => g.key === "workspace").items.map((i) => i.href);
  assert.ok(ws.includes("/pos") && ws.includes("/workspace/calculators"));
  const calc = more.groups.find((g) => g.key === "calculators").items.map((i) => i.href);
  for (const id of Object.keys(CHECKED)) assert.ok(calc.includes(`/workspace/calculators?calc=${id}`), id);
  assert.ok(calc.includes("/business-calculators"), "the public calculators page stays listed");
});

test("Flame POS opens through the FLAME PH sign-in hub on the same site, so members don't sign in again", () => {
  const href = P.posHref();
  assert.ok(href.startsWith("/sso/authorize?client=flamepos&return="), href);
  assert.equal(decodeURIComponent(href.split("return=")[1]), "https://pos.flameph.org/organizations");
  for (const p of P.POS_PLACES) assert.ok(decodeURIComponent(P.posHref(p.path)).endsWith(`https://pos.flameph.org${p.path}`));
});

test("the Flame POS tab and public page use the shared link; no hard-coded sign-in addresses remain", async () => {
  const tab = await read("src/app/(member)/m/pos/page.tsx");
  assert.match(tab, /requireUser\("\/pos"\)/);
  assert.match(tab, /posHref\(/);
  for (const f of ["src/app/(member)/m/pos/page.tsx", "src/app/pos/page.tsx", "src/app/(member)/workspace/page.tsx"])
    assert.doesNotMatch(await read(f), /www\.flameph\.org\/sso/, f);
});

test("the existing FLAME POS sign-in client and callback are unchanged", async () => {
  const sso = await read("src/lib/sso.ts");
  assert.match(sso, /callback: "https:\/\/pos\.flameph\.org\/auth\/flame"/);
  assert.match(sso, /origins: \["https:\/\/pos\.flameph\.org"\]/);
});

test("the calculators page in Workspace is for signed-in members and reuses the existing picker", async () => {
  const page = await read("src/app/(member)/workspace/calculators/page.tsx");
  assert.match(page, /requireUser\("\/workspace\/calculators"\)/);
  assert.match(page, /CalculatorPicker/);
});
