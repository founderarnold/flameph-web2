import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");

test("Follow switches to Following at once and saves in the background, still a plain form without JavaScript", async () => {
  const b = await read("src/components/shell/FollowButton.tsx");
  assert.match(b, /"use client"/);
  assert.match(b, /e\.preventDefault\(\);\s*const next = !on;\s*setOn\(next\);/, "label flips before the server answers");
  assert.match(b, /if \(!res\.ok\) \{ setOn\(!next\); setError\(true\)/, "switches back if saving fails");
  assert.match(b, /<form action=\{toggleFollow\}/, "works without JavaScript");
  const a = await read("src/app/account/onboarding-actions.ts");
  const fn = a.slice(a.indexOf("export async function setFollow"), a.indexOf("export async function toggleFollow"));
  assert.doesNotMatch(fn, /redirect\(/, "no page reload");
  assert.match(fn, /target === user\.id\) return \{ ok: false \}/, "cannot follow yourself");
});

test("member cards show photo, business, place, followers and verified badge", async () => {
  const c = await read("src/components/shell/MemberCard.tsx");
  assert.match(c, /mediaUrl\(b\.avatar_url \?\? null\) \?\? mediaUrl\(b\.logo_url\)/, "photo, else business logo, else initials");
  assert.match(c, /b\.business_name/);
  assert.match(c, /\[b\.city, b\.province\]/);
  assert.match(c, /followers/);
  assert.match(c, /b\.verified &&/);
  const s = await read("src/lib/suggestions.ts");
  assert.match(s, /supabase\.rpc\("member_cards_v2", \{ ids \}\)/);
  assert.match(s, /v2\.error \? supabase\.rpc\("member_cards", \{ ids \}\)/, "old cards until the update is applied");
});

test("photo upload accepts only the member's own folder", async () => {
  const a = await read("src/app/account/onboarding-actions.ts");
  assert.match(a, /value\.startsWith\(`\$\{user\.id\}\/`\)/);
  const up = await read("src/components/shell/AvatarUploader.tsx");
  assert.match(up, /const p = `\$\{userId\}\/avatar-/);
  assert.match(up, /image\/jpeg", "image\/png", "image\/webp"/);
});

test("follow step has industry and province filters", async () => {
  const w = await read("src/app/(member)/welcome/page.tsx");
  assert.match(w, /name="industry"/);
  assert.match(w, /name="province"/);
  assert.match(w, /filteredPeople\(supabase, \{ industry, province \}, following, 12\)/);
});

test("migration 0040 is additive, never exposes contact details, and has an undo", async () => {
  const up = await read("supabase/migrations/0040_member_cards_photos_follow.sql");
  const down = await read("supabase/rollback/0040_member_cards_photos_follow_undo.sql");
  assert.doesNotMatch(up, /drop table|delete from|truncate|drop column/i);
  assert.doesNotMatch(up, /contact_|mobile|email/i);
  assert.match(up, /not public\.is_blocked_between\(p\.id, auth\.uid\(\)\)/);
  assert.match(down, /drop function if exists public\.member_cards_v2/);
});
