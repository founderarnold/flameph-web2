// Finds Playwright: installed in this project, in PLAYWRIGHT_FROM (a folder with node_modules/playwright,
// for example Documents\flameph-tests on the owner's PC), or installed globally.
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import path from "node:path";

export async function loadPlaywright() {
  try { return await import("playwright"); } catch { /* not in this project */ }
  const tries = [process.env.PLAYWRIGHT_FROM, execSync("npm root -g").toString().trim()].filter(Boolean);
  for (const dir of tries) {
    try { return createRequire(path.join(dir, "noop.js"))("playwright"); } catch { /* next */ }
    try { return createRequire(path.join(dir, "noop.js"))(path.join(dir, "playwright")); } catch { /* next */ }
  }
  throw new Error("Playwright not found. Set PLAYWRIGHT_FROM to the folder where it is installed.");
}
