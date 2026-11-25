import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");

test("business share: signed server call, owner's own listings only, fixed fields, logged", async () => {
  const r = await read("src/app/api/ecosystem/my-businesses/route.ts");
  assert.match(r, /readSiteCall\(admin, req, "business-share"\)/, "only a signed, single-use call with its own purpose");
  assert.match(r, /userForSub\(admin, call\.client, String\(call\.claims\.sub \?\? ""\)\)/, "member comes from the site's pairwise sub");
  assert.match(r, /\.from\("businesses"\)\.select\("\*"\)\.eq\("owner_id", userId\)/, "only that member's own businesses");
  assert.doesNotMatch(r, /verification_docs|verification_note|owner_id:/, "no verification documents, notes or owner ids leave");
  assert.match(r, /lifecycle_status !== "suspended" && b\.lifecycle_status !== "rejected" && b\.risk_level !== "high"/);
  assert.match(r, /await log\(admin, call\.client, userId, "business_share"/);
  assert.doesNotMatch(r, /\.update\(|\.insert\(|\.delete\(/, "read only");
  assert.doesNotMatch(r, /Access-Control-Allow-Origin/, "server-to-server only");
});

test("business share does not change any sign-in code", async () => {
  const sso = await read("src/lib/ecosystem-sso.ts");
  assert.doesNotMatch(sso, /business-share|business_share/);
});

test("migration only widens the log purposes and has an undo file", async () => {
  const up = await read("supabase/migrations/0039_ecosystem_business_share.sql");
  const down = await read("supabase/rollback/0039_ecosystem_business_share_undo.sql");
  assert.match(up, /'switch_change', 'business_share'\)\)/);
  assert.doesNotMatch(up, /drop table|delete from|truncate/i);
  assert.match(down, /'switch_change'\)\);/);
});
