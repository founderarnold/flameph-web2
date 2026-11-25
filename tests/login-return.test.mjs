import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const middleware = await readFile(new URL("../src/middleware.ts", import.meta.url), "utf8");

test("signed-out visitors to a My account or Admin page come back to that page after signing in", () => {
  assert.match(middleware, /!data\.user && request\.method === "GET" && \/\^\\\/\(account\|admin\)/);
  assert.match(middleware, /searchParams\.set\("next", path \+ request\.nextUrl\.search\)/);
  assert.match(middleware, /"\/account\/:path\*"/);
  assert.match(middleware, /"\/admin\/:path\*"/);
});
