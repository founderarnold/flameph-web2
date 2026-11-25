// Member cards (photo, business, place, followers, Verified), instant Follow, and filters for "Follow members" (0040).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");

test("0040 is additive, own-folder photos only, respects privacy, and has a rollback", async () => {
  const m = await read("supabase/migrations/0040_member_cards_photos_filters.sql");
  assert.doesNotMatch(m, /\b(drop table|delete from|truncate|drop column)\b/i);
  assert.match(m, /add column if not exists avatar_path text/);
  assert.match(m, /split_part\(avatar_path, '\/', 1\) = id::text/);
  for (const fn of ["member_cards_v2", "browse_members"]) {
    assert.match(m, new RegExp(`create or replace function public\\.${fn}`));
    assert.match(m, new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon`));
  }
  assert.match(m, /not p\.hide_from_suggestions/);
  assert.match(m, /not public\.is_blocked_between\(p\.id, me\.id\)/);
  assert.match(m, /member_mutes/);
  const undo = await read("supabase/rollback/0040_member_cards_photos_filters_undo.sql");
  assert.match(undo, /drop function if exists public\.browse_members/);
});

test("Follow turns into Following at once and saves without reloading the page", async () => {
  const b = await read("src/components/shell/FollowButton.tsx");
  assert.match(b, /^"use client";/);
  assert.match(b, /setOn\(next\)/);
  assert.match(b, /await setFollow\(memberId, next\)/);
  assert.match(b, /if \(!ok\) \{ setOn\(!next\)/);
  assert.match(b, /<form action=\{toggleFollow\}>/, "still works before JavaScript loads");
  const a = await read("src/app/account/onboarding-actions.ts");
  const fn = a.slice(a.indexOf("export async function setFollow"), a.indexOf("/** Step 4"));
  assert.doesNotMatch(fn, /redirect\(|revalidatePath\(/);
});

test("member card shows photo or logo, business, city and province, followers and Verified", async () => {
  const c = await read("src/components/shell/MemberCard.tsx");
  assert.match(c, /mediaUrl\(b\.avatar_path\) \?\? mediaUrl\(b\.logo_url\)/);
  for (const t of ["business", "place", "followersLabel", "b.verified"]) assert.ok(c.includes(t), t);
});

test("Follow members step and Find members have filters", async () => {
  const w = await read("src/app/(member)/welcome/page.tsx");
  for (const n of ["q", "industry", "category", "province", "city", "verified"]) assert.match(w, new RegExp(`name="${n}"`));
  assert.match(w, /browseMembers\(supabase, f, 24\)/);
  const m = await read("src/app/members/page.tsx");
  for (const n of ["category", "verified"]) assert.match(m, new RegExp(`name="${n}"`));
  const p = await read("src/app/account/profile/page.tsx");
  assert.match(p, /<AvatarPicker /);
});

test("0041: low-risk listings publish at once, high risk never, waiting ones published with an audit entry", async () => {
  const m = await read("supabase/migrations/0041_open_directory.sql");
  assert.match(m, /auto := business\.risk_level = 'low'/);
  assert.match(m, /lifecycle_status = 'approved', publication_status = 'published', published = true/);
  assert.match(m, /if business\.risk_level = 'high' then raise exception 'BUSINESS_HIGH_SUSPICION'/);
  assert.match(m, /'business_auto_published'/);
  assert.match(m, /grant execute on function public\.submit_business_for_review\(uuid, uuid\) to service_role/);
  assert.match(m, /revoke all on function public\.find_members\([^)]*\) from public, anon/);
  assert.match(m, /not p\.hide_from_suggestions/);
  assert.doesNotMatch(m, /\b(drop table|delete from|truncate)\b/i);
});

test("Find members lists every member, most relevant first, with quick picks and paging", async () => {
  const p = await read("src/app/members/page.tsx");
  assert.match(p, /findMembers\(supabase,/);
  assert.match(p, /most relevant to you first/);
  assert.match(p, /Show more members/);
  assert.match(p, /aria-label="Quick picks"/);
});
