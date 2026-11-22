import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const js = ts.transpileModule(await read("src/lib/db-errors.ts"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { friendlyDbError, isSignedOutError, SIGNED_OUT_MESSAGE } = await import(`data:text/javascript,${encodeURIComponent(js)}`);

const editor = await read("src/components/BusinessEditor.tsx");
const products = await read("src/components/listing/ProductsEditor.tsx");
const action = await read("src/app/account/business/actions.ts");

test("the raw row-level security error becomes a plain 'please log in again' message", () => {
  const raw = { code: "42501", message: 'new row violates row-level security policy for table "businesses"' };
  assert.equal(isSignedOutError(raw), true);
  assert.equal(friendlyDbError(raw), SIGNED_OUT_MESSAGE);
  assert.doesNotMatch(friendlyDbError(raw), /row-level|policy|businesses/);
  assert.equal(friendlyDbError({ code: "PGRST301", message: "JWT expired" }), SIGNED_OUT_MESSAGE);
});

test("other database errors never show raw text", () => {
  for (const e of [
    { code: "23505", message: 'duplicate key value violates unique constraint "businesses_slug_key"' },
    { code: "23514", message: 'new row for relation "businesses" violates check constraint "x"' },
    { code: "22001", message: "value too long for type character varying(80)" },
    { code: "42703", message: 'column "logo_url" does not exist' },
    { code: "XX000", message: "internal error at relation businesses" },
    { message: "TypeError: Failed to fetch" },
  ]) {
    const text = friendlyDbError(e, "your listing");
    assert.doesNotMatch(text, /relation|constraint|column|varying|internal error|TypeError/, text);
  }
  assert.equal(friendlyDbError({ code: "P0001", message: "A business must be approved before publication." }), "A business must be approved before publication.");
  assert.doesNotMatch(friendlyDbError({ code: "P0001", message: "not_signed_in" }), /not_signed_in/);
});

test("the listing is saved on the server as the member signed in at that moment", () => {
  assert.match(action, /^"use server";/);
  assert.match(action, /auth\.getUser\(\)/);
  assert.match(action, /owner_id: user\.id/);
  assert.doesNotMatch(action, /createAdminClient|service_role/, "row level security must still apply");
  assert.match(action, /\.eq\("owner_id", user\.id\)/);
  assert.match(editor, /saveBusinessListing\(/);
  assert.doesNotMatch(editor, /from\("businesses"\)\.(insert|update)/, "the browser no longer writes the listing row itself");
  assert.doesNotMatch(editor, /text: error\.message|text: res\.error\.message/);
});

test("unsaved listing details survive an expired sign-in", () => {
  assert.match(editor, /localStorage\.setItem\(draftKey\(userId\)/);
  assert.match(editor, /Log in again/);
});

test("product and photo saves check the sign-in first and show friendly errors", () => {
  assert.match(products, /stillSignedIn\(\)/);
  assert.doesNotMatch(products, /text: (res\.)?error\.message/);
  assert.match(editor, /who\.user\?\.id !== userId/);
});
