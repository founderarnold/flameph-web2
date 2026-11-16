import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");
const ui = await readFile(new URL("../src/components/ui.tsx", import.meta.url), "utf8");

// ---- token helpers ------------------------------------------------------
const block = (selectorRe) => {
  const m = css.match(selectorRe);
  assert.ok(m, `block not found: ${selectorRe}`);
  return m[1];
};
const vars = (text) => Object.fromEntries([...text.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{3,6})\s*;/gi)].map((m) => [m[1], m[2]]));
const light = vars(block(/:root\s*\{([^}]*)\}/));
const dark = { ...light, ...vars(block(/prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([^}]*)\}/)) };

const lum = (hex) => {
  const h = hex.length === 4 ? hex.slice(1).split("").map((c) => c + c).join("") : hex.slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// Text pairs used by the member layer. 4.5:1 for text.
const TEXT_PAIRS = [
  ["fg", "bg"], ["fg", "card"], ["fg", "bg-soft"], ["fg-muted", "bg"], ["fg-muted", "card"], ["fg-muted", "bg-soft"],
  ["primary", "bg"], ["primary", "primary-soft"], ["primary-fg", "primary"], ["mph", "bg"],
  ["ok", "ok-soft"], ["warn", "warn-soft"], ["danger", "bg"], ["danger", "danger-soft"], ["on-danger", "danger"], ["on-flame", "flame-strong"],
];

for (const [mode, t] of [["light", light], ["dark", dark]]) {
  test(`${mode} mode: member-layer text pairs meet WCAG AA (4.5:1)`, () => {
    for (const [fg, bg] of TEXT_PAIRS) {
      assert.ok(t[fg] && t[bg], `missing token ${fg} or ${bg} in ${mode}`);
      const r = ratio(t[fg], t[bg]);
      assert.ok(r >= 4.5, `${mode}: --${fg} on --${bg} is ${r.toFixed(2)}:1`);
    }
  });
  test(`${mode} mode: focus ring is visible against the page (3:1)`, () => {
    assert.ok(ratio(t.focus, t.bg) >= 3, `${mode}: focus ring ${ratio(t.focus, t.bg).toFixed(2)}:1`);
  });
}

// ---- no restyle of existing public styles -------------------------------
// Exact rules the public site depends on. If one of these changes, every public page changes: that needs owner approval.
const FROZEN = [
  ".btn { display: inline-flex; align-items: center; justify-content: center; gap: .5rem; min-height: 44px; padding: .625rem 1.125rem; border-radius: 10px; font-weight: 700; text-decoration: none; transition: background-color .15s, color .15s, border-color .15s; }",
  ".btn-primary { background: var(--primary); color: var(--primary-fg); }",
  ".btn-flame { background: var(--flame-strong); color: #fff; }",
  ".btn-outline { border: 2px solid var(--primary); color: var(--primary); background: transparent; }",
  ".card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; }",
  ".input { width: 100%; min-height: 44px; padding: .625rem .75rem; border: 1.5px solid var(--border); border-radius: 10px; background: var(--card); color: var(--fg); font-size: 16px; }",
  ".label { display: block; font-weight: 600; margin-bottom: .25rem; }",
  ":focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; border-radius: 6px; }",
  ".container-x { width: 100%; max-width: 1200px; margin-inline: auto; padding-inline: 16px; }",
];
test("existing public styles are unchanged", () => {
  for (const rule of FROZEN) assert.ok(css.includes(rule), `changed or missing: ${rule.slice(0, 60)}…`);
});

const FROZEN_TOKENS = { bg: "#ffffff", fg: "#14161c", "fg-muted": "#4b5262", border: "#e3e6ee", primary: "#003289", mph: "#0b4fd1", flame: "#e8501a", "flame-strong": "#c63d0c", gold: "#f5b31a", ok: "#0f7a3d", warn: "#8a5a00", focus: "#0b4fd1" };
test("existing light colour tokens are unchanged", () => {
  for (const [k, v] of Object.entries(FROZEN_TOKENS)) assert.equal(light[k], v, `--${k}`);
});

// ---- design system contract ---------------------------------------------
test("new classes exist for every documented piece", () => {
  for (const cls of [".btn-danger", ".btn-sm", ".btn-lg", ".btn-block", ".btn-icon", ".btn-spinner", ".field-help", ".field-error", ".check", ".switch", ".chip", ".count-badge", ".unseen-dot", ".ds-avatar", ".card-raised", ".card-interactive"]) {
    assert.ok(css.includes(`${cls} `) || css.includes(`${cls}{`) || css.includes(`${cls}:`) || css.includes(`${cls}[`), `${cls} missing`);
  }
  assert.match(css, /\.btn-ds:disabled, \.btn-ds\[aria-disabled="true"\]/);
  assert.match(css, /\.field \.input\[aria-invalid="true"\]/);
});

test("new state styles never target bare existing classes (no public restyle)", () => {
  // A disabled public button (e.g. a form waiting for Turnstile) must look exactly as before.
  assert.doesNotMatch(css, /\.btn(:disabled|\[aria-(disabled|busy))/);
  assert.doesNotMatch(css, /(?<!\.field )\.input(:disabled|\[aria-invalid)/);
});

test("tap targets stay at least 44px", () => {
  assert.match(css, /--tap-min:\s*44px/);
  assert.match(css, /\.switch-row \{[^}]*min-height: var\(--tap-min\)/);
  assert.match(css, /\.btn-icon \{ width: var\(--tap-min\)/);
  assert.doesNotMatch(css, /\.btn-sm \{[^}]*min-height/, "btn-sm must keep the 44px minimum from .btn");
});

test("components follow the accessibility baseline", () => {
  assert.match(ui, /export function Button\(/);
  assert.match(ui, /aria-busy=\{loading \|\| undefined\}/);
  assert.match(ui, /export function Field\(/);
  assert.match(ui, /"aria-describedby": describedBy/);
  assert.match(ui, /"aria-invalid": error \? true : undefined/);
  assert.match(ui, /role="alert"/);
  assert.match(ui, /export function Switch\([^)]*defaultChecked = false/);
  assert.match(ui, /role="switch"/);
  assert.match(ui, /export function CountBadge\([\s\S]*?className="sr-only"/);
  assert.match(ui, /export function UnseenDot\([\s\S]*?className="sr-only"/);
  assert.match(ui, /opens in a new tab/);
});

test("design system reference page is staff-only and not indexed", async () => {
  const page = await readFile(new URL("../src/app/admin/design-system/page.tsx", import.meta.url), "utf8");
  assert.match(page, /await requireStaff\(\)/);
  assert.match(page, /robots: \{ index: false \}/);
});
