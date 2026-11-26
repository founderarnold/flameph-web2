// Member profile: province and city or municipality are picked from drop-down lists and both are required.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const load = async (p, deps = {}) => {
  let src = await read(p);
  for (const [spec, url] of Object.entries(deps)) src = src.replaceAll(`"${spec}"`, `"${url}"`);
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const url = `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
  return { mod: await import(url), url };
};
const psgc = await load("src/content/ph-psgc.ts");
const provinces = await load("src/content/ph-provinces.ts");
const towns = (await load("src/lib/ph-towns.ts", { "@/content/ph-psgc": psgc.url, "@/content/ph-provinces": provinces.url })).mod;

test("every profile province has its cities and municipalities, 1,642 in all", () => {
  for (const p of provinces.mod.PROVINCES) assert.ok(towns.TOWNS[p]?.length > 0, `no towns for ${p}`);
  assert.equal(Object.values(towns.TOWNS).flat().length, psgc.mod.PH_PLACES.length);
  assert.ok(towns.TOWNS.Pampanga.includes("San Fernando City"));
  assert.ok(towns.TOWNS["Metro Manila"].includes("Quezon City"));
  assert.ok(towns.TOWNS.Basilan.includes("Isabela City"), "City of Isabela goes with Basilan");
});

test("a city must be in the chosen province", () => {
  assert.equal(towns.validPlace("Pampanga", "San Fernando City"), true);
  assert.equal(towns.validPlace("Pampanga", "Makati City"), false);
  assert.equal(towns.validPlace("Pampanga", ""), false);
  assert.equal(towns.validPlace("", "Makati City"), false);
  assert.equal(towns.validPlace("Atlantis", "San Fernando City"), false);
});

test("cities typed on older profiles are matched to the list where clear", () => {
  assert.equal(towns.matchTown("Pampanga", "san fernando"), "San Fernando City");
  assert.equal(towns.matchTown("Pampanga", "City of San Fernando"), "San Fernando City");
  assert.equal(towns.matchTown("Metro Manila", "Las Pinas"), "Las Piñas City");
  assert.equal(towns.matchTown("Pampanga", "Sto Tomas"), "Sto. Tomas");
  assert.equal(towns.matchTown("Pampanga", "somewhere else"), null);
  assert.equal(towns.provinceOfTown("Makati"), "Metro Manila");
  assert.equal(towns.provinceOfTown("San Fernando"), null, "two provinces have one");
  for (const [p, list] of Object.entries(towns.TOWNS)) for (const t of list) assert.equal(towns.matchTown(p, t.toLowerCase()), t, `${p}: ${t}`);
});

test("profile page and both welcome forms use the required drop-downs; saves are checked on the server", async () => {
  const picker = await read("src/components/ProvinceCityPicker.tsx");
  assert.equal((picker.match(/required/g) ?? []).length >= 2, true);
  assert.match(picker, /name="province"/);
  assert.match(picker, /name="city"/);
  const profile = await read("src/app/account/profile/page.tsx");
  assert.match(profile, /<ProvinceCityPicker/);
  assert.doesNotMatch(profile, /name="city"/, "no free-text city box left");
  const welcome = await read("src/app/(member)/welcome/page.tsx");
  assert.equal((welcome.match(/<ProvinceCityPicker/g) ?? []).length, 2);
  assert.doesNotMatch(welcome, /id="(ob|loc)-city" name="city"/);
  const actions = await read("src/app/account/actions.ts");
  assert.match(actions, /if \(!validPlace\(province, city\)\) redirect\("\/account\/profile\?error=place"\)/);
  const onboarding = await read("src/app/account/onboarding-actions.ts");
  assert.equal((onboarding.match(/if \(!validPlace\(province, city\)\) redirect\(/g) ?? []).length, 2);
  // Only the profile forms ask: the rest of the site stays open to members without a place.
  assert.doesNotMatch(await read("src/middleware.ts").catch(() => ""), /validPlace/);
});
