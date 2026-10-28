import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("admin tables expose a visible horizontal scrollbar", () => {
  const css = read("src/app/globals.css");
  assert.match(css, /\.admin-table-scroll/);
  assert.match(css, /scrollbar-gutter:\s*stable/);
  assert.match(css, /::-webkit-scrollbar/);
  assert.match(css, /scrollbar-color/);
});

test("members use mobile cards and a fixed-width scrollable desktop table", () => {
  const members = read("src/app/admin/members/page.tsx");
  assert.match(members, /lg:hidden/);
  assert.match(members, /admin-table-scroll card hidden lg:block/);
  assert.match(members, /min-w-\[1120px\]/);
  assert.match(members, /Scroll sideways to see every column/);
  assert.match(members, /break-all/);
});

test("mobile admin navigation starts collapsed while desktop navigation remains visible", () => {
  const layout = read("src/app/admin/layout.tsx");
  assert.match(layout, /<details className="card p-3 lg:hidden">/);
  assert.doesNotMatch(layout, /<details open/);
  assert.match(layout, /hidden max-h-\[calc\(100vh-7rem\)\].*lg:block/);
});
