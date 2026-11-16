import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const guard = new URL("../scripts/guard-production-deploy.mjs", import.meta.url).pathname;
const run = (env) => spawnSync(process.execPath, [guard], { env: { PATH: process.env.PATH, ...env }, encoding: "utf8" });
const fromMain = { VERCEL_ENV: "production", VERCEL_GIT_PROVIDER: "github", VERCEL_GIT_REPO_OWNER: "founderarnold", VERCEL_GIT_REPO_SLUG: "flameph-web2", VERCEL_GIT_COMMIT_REF: "main" };

test("guard runs before every build", async () => {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.match(pkg.scripts.prebuild, /^node scripts\/guard-production-deploy\.mjs && /);
});

test("local and preview builds are never blocked", () => {
  assert.equal(run({}).status, 0);
  assert.equal(run({ VERCEL_ENV: "preview" }).status, 0);
});

test("production build without GitHub metadata (CLI upload) is refused", () => {
  const r = run({ VERCEL_ENV: "production" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not created from GitHub/);
});

test("production build from another branch or repository is refused", () => {
  assert.equal(run({ ...fromMain, VERCEL_GIT_COMMIT_REF: "codex-redesign" }).status, 1);
  assert.equal(run({ ...fromMain, VERCEL_GIT_REPO_SLUG: "flameph" }).status, 1);
});

test("owner override allows an emergency build", () => {
  assert.equal(run({ VERCEL_ENV: "production", ALLOW_NON_MAIN_PRODUCTION_BUILD: "1" }).status, 0);
});
