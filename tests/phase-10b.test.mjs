// Phase 10B: investor and funder features. LEGALLY SENSITIVE: these tests guard the warning, the holds, the
// "label, not endorsement" wording and the no-money rule. The database rules were also run on a scratch Postgres.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const toUrl = (js) => `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
const load = async (p, deps = {}) => {
  let src = (await read(p)).replace(/^import "server-only";$/m, "");
  for (const [spec, url] of Object.entries(deps)) src = src.replaceAll(`"${spec}"`, `"${url}"`);
  const url = toUrl(ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
  return { mod: await import(url), url };
};

const sql = await read("supabase/migrations/0026_investor_funder.sql");
const legal = await load("src/lib/legal-text.ts");
const industries = await load("src/lib/industries.ts");
const R = (await load("src/lib/feed-rules.ts", { "@/lib/industries": industries.url })).mod;
const I = (await load("src/lib/investor.ts", { "@/lib/legal-text": legal.url })).mod;
const L = legal.mod;

test("database update: additive, row-level security on the new table, visitors blocked, nothing stores money", () => {
  assert.doesNotMatch(sql, /drop table|drop column|truncate|alter table [^;]* drop /i);
  assert.match(sql, /alter table public\.investor_registrations enable row level security/);
  assert.match(sql, /revoke all on public\.investor_registrations from anon/);
  assert.match(sql, /revoke all on public\.investor_registrations from authenticated/);
  assert.match(sql, /grant select on public\.investor_registrations to authenticated/);   // read only; writes go through checked functions
  assert.match(sql, /using \(user_id = auth\.uid\(\) or public\.mod_level\(\) >= 2\)/);
  assert.doesNotMatch(sql, /grant (insert|update|delete)[^;]*investor_registrations/i);
  assert.doesNotMatch(sql, /\b(amount|price|pledge|wallet|escrow|payment)\b[^\n]*(numeric|int|text)/i);
  assert.match(sql, /add column if not exists member_type text not null default 'business'/);
  // Every new function is closed to the public and opened only to signed-in members.
  for (const f of ["report_investor_ids", "investor_registration_submit", "investor_registration_remove", "investor_registration_decide", "investor_labels"]) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${f}\\([^)]*\\) from public`), f);
    assert.doesNotMatch(sql, new RegExp(`grant execute on function public\\.${f}\\([^)]*\\) to [^;]*anon`), f);
  }
});

test("an investor or funder profile makes every post an investor post, set by the database not the poster", () => {
  assert.match(sql, /new\.author_investor := exists \(select 1 from public\.profiles p where p\.id = new\.author_id and p\.member_type = 'investor_funder'\)/);
  assert.match(sql, /if new\.author_investor then new\.kind := 'investor'; end if;/);
  // Trigger names sort after feed_posts_prepare / feed_posts_zgroup and before feed_posts_zmoderation.
  assert.ok("feed_posts_zinvestor" > "feed_posts_zgroup" && "feed_posts_zinvestor" < "feed_posts_zmoderation");
  assert.ok("feed_comments_zinvestor" > "feed_comments_prepare" && "feed_comments_zinvestor" < "feed_comments_zmoderation");
  assert.deepEqual(R.classifyPost("Happy to talk about growth plans", "update", true), { kind: "investor", held: false });
  assert.equal(R.classifyPost("Happy to talk about growth plans", "update").kind, "update");
  assert.deepEqual(Object.keys(I.MEMBER_TYPES), ["business", "investor_funder"]);
  assert.equal(I.INVESTOR_PROFILE_LABEL, "Investor or funder");
});

test("automatic holds: promised returns and recruitment structures, in posts and replies, routed to moderators", () => {
  const cases = [
    ["Guaranteed returns of 20% monthly!", "promises_returns"],
    ["Our profits are guaranteed for all partners", "promises_returns"],
    ["Invest 10k with us, earn 5% per month", "promises_returns"],
    ["Investment opportunity, risk-free!", "promises_returns"],
    ["Doblehin ang pera mo sa loob ng 30 araw", "promises_returns"],
    ["Siguradong kita sa paluwagan", "promises_returns"],
    ["Join my MLM team today", "recruitment_scheme"],
    ["Invite 5 people and earn a recruitment bonus", "recruitment_scheme"],
    ["Build your downline, passive income", "recruitment_scheme"],
    ["This is not a ponzi scheme", "recruitment_scheme"],
    // Not held:
    ["Looking for an investor for my bakery", null],
    ["10% off this week only on all bread", null],
    ["Free risk-free trial of our POS app", null],
    ["Fresh pandesal every morning", null],
    ["I sell investigation kits", null],
  ];
  for (const [text, want] of cases) assert.equal(R.holdReason(text), want, text);
  assert.equal(R.classifyPost("Join my MLM team today", "update").held, true);
  // Same patterns in the database (SQL spells them with the same characters).
  for (const p of ["double|triple|doblehin|doble", "pyramid|ponzi|downline|upline", "(invite|recruit|refer) [0-9]+ (people|persons|friends|members|tao)", "risk[- ]?free|no[- ]risk|zero[- ]risk", "(day|daily|week|weekly|month|monthly|araw|linggo|buwan)"]) {
    assert.ok(sql.includes(p), p);
  }
  // Replies are held too, and every hold becomes an automatic report in the moderation queue, with its reason.
  assert.match(sql, /if 'promises_returns' = any\(flags\) then new\.status := 'hidden'; new\.held_reason := 'promises_returns';/);
  assert.match(sql, /elsif 'recruitment_scheme' = any\(flags\) then new\.status := 'hidden'; new\.held_reason := 'recruitment_scheme';/);
  assert.match(sql, /insert into public\.moderation_reports \(target_type, target_id, reason, details\) values \('comment', new\.id, 'automatic', 'Held automatically: ' \|\| why\)/);
  assert.match(sql, /insert into public\.moderation_reports \(target_type, target_id, reason, details\) values \('post', new\.id, 'automatic', 'Held automatically: ' \|\| why\)/);
  assert.equal(R.HOLD_REASONS.recruitment_scheme, "Pyramid, MLM or recruitment structure");
});

test("the warning: owner's exact words, English and Taglish, with no way to close, hide or restyle it", async () => {
  assert.match(L.INVESTOR_WARNING_EN, /^INVESTOR \/ FUNDER POST\. .*RA 8799.*No transaction is made within FLAME PH\.$/);
  assert.match(L.INVESTOR_WARNING_TL, /^POST NG INVESTOR \/ FUNDER\. .*Walang transaksyon na ginagawa sa loob ng FLAME PH\.$/);
  const box = await read("src/components/feed/InvestorWarning.tsx");
  assert.doesNotMatch(box, /use client|onClick|useState|className=\{?[^"`]*props|hidden|<details|aria-hidden|display: ?none|dismiss/i);
  assert.match(box, /\{INVESTOR_WARNING_EN\}/);
  assert.match(box, /\{INVESTOR_WARNING_TL\}/);
  // The only prop is "compact" (smaller text). The poster's text is plain text: no HTML or styling can reach the page.
  assert.match(box, /\{ compact = false \}: \{ compact\?: boolean \}/);
  for (const f of ["src/components/feed/PostCard.tsx", "src/app/(member)/posts/[id]/page.tsx", "src/app/forum/[category]/page.tsx"]) {
    assert.doesNotMatch(await read(f), /dangerouslySetInnerHTML/, f);
  }
});

test("the warning survives every rendering path", async () => {
  const card = await read("src/components/feed/PostCard.tsx");
  assert.match(card, /const investor = post\.kind === "investor" \|\| Boolean\(post\.author_investor\);/);
  assert.match(card, /\{investor && <div className="mt-3"><InvestorWarning compact=\{!detail\} \/><\/div>\}/);               // feed card, group page, post page
  assert.match(card, /Reply to an investor or funder post\. The warning above applies\./);                                // every reply in the thread
  assert.match(card, /\{!investor && c\.author_investor && <div className="mt-2"><InvestorWarning compact \/><\/div>\}/);   // an investor's reply elsewhere
  const page = await read("src/app/(member)/posts/[id]/page.tsx");
  assert.match(page, /\{investor && <div className="mt-2"><InvestorWarning compact \/><\/div>\}/);                         // top of the reply thread
  assert.match(page, /\{investor && comments\.length > 2 && <div className="mt-3"><InvestorWarning compact \/><\/div>\}/);   // bottom of a long thread
  // Shared links: members only (sign-in first), never indexed, and no post text in the link preview.
  assert.match(page, /export const metadata = \{ title: "Post", robots: \{ index: false \} \};/);
  assert.doesNotMatch(page, /generateMetadata/);
  assert.match(await read("src/middleware.ts"), /"\/posts\/:path\*"/);
  // The share sheet and the copied link carry the full warning in both languages.
  assert.match(card, /<ShareButton path=\{`\/posts\/\$\{post\.id\}`\} title=\{investor \? `Investor or funder post by \$\{name\}` : title\} text=\{shareText\(investor\)\} \/>/);
  const share = await read("src/components/feed/ShareButton.tsx");
  assert.match(share, /navigator\.share\(text \? \{ title, text, url \} : \{ title, url \}\)/);
  assert.match(share, /navigator\.clipboard\.writeText\(text \? `\$\{text\}\\n\\n\$\{url\}` : url\)/);
  assert.equal(I.shareText(true), `${L.INVESTOR_WARNING_EN}\n\n${L.INVESTOR_WARNING_TL}`);
  assert.equal(I.shareText(false), undefined);
  // Emails: the weekly digest adds the full warning under an investor post's excerpt. Push never carries post text.
  const digest = await read("src/app/api/cron/digest/route.ts");
  assert.match(digest, /withWarning\(`- \$\{g\.author_name/);
  assert.match(digest, /g\.kind === "investor"\)/);
  assert.equal(I.withWarning("x", true), `x\n\n${L.INVESTOR_WARNING_EN}\n\n${L.INVESTOR_WARNING_TL}`);
  // Notifications: no notification is ever made from a post or reply (so post text can't travel without the warning).
  assert.doesNotMatch(await read("src/app/account/feed-actions.ts"), /notify\(|sendPush|sendEmail/);
  // Other places that show post or reply text: forum list, report form, moderation queue and report page, messages with an investor.
  assert.match(await read("src/app/forum/[category]/page.tsx"), /\{\(p\.kind === "investor" \|\| p\.author_investor\) && <div className="px-4 pb-3"><InvestorWarning compact \/><\/div>\}/);
  assert.match(await read("src/app/(member)/report/page.tsx"), /\{investor && <InvestorWarning compact \/>\}/);
  assert.match(await read("src/app/admin/moderation/page.tsx"), /\{investorIds\.has\(r\.id\) && <div className="mt-1"><InvestorWarning compact \/><\/div>\}/);
  assert.match(await read("src/app/admin/moderation/[id]/page.tsx"), /\{investorIds\.has\(id\) && <InvestorWarning compact \/>\}/);
  assert.match(await read("src/app/(member)/messages/[id]/page.tsx"), /\{investor && <InvestorWarning compact \/>\}/);
  assert.match(await read("src/app/(member)/groups/[slug]/page.tsx"), /\{investor && <InvestorWarning \/>\}/);
  // Composer: shown before posting, and always for an investor or funder.
  const composer = await read("src/components/feed/Composer.tsx");
  assert.match(composer, /classifyPost\(body, group\?\.slug === INVESTOR_GROUP \? "investor" : kind, investorAuthor\)/);
  assert.match(await read("src/app/(member)/new-post/page.tsx"), /investorAuthor=\{p\?\.member_type === "investor_funder"\}/);
});

test("registration or licence: a dated label, never an endorsement", async () => {
  const label = I.registrationLabel({ regulator: "sec", checked_at: "2026-11-19T10:00:00Z" });
  assert.equal(label, "Registration seen on SEC list, Nov 19, 2026 · Not an endorsement");
  assert.equal(I.registrationLabel({ regulator: null, checked_at: null }), null);
  assert.match(I.REGISTRATION_LABEL_MEANING, /It is not an endorsement, recommendation, approval or guarantee by FLAME PH/);
  assert.match(I.REGISTRATION_LABEL_MEANING_TL, /Hindi ito endorsement, rekomendasyon, pag-apruba o garantiya ng FLAME PH/);
  // No word that reads as approval.
  for (const t of [label, I.INVESTOR_PROFILE_LABEL]) assert.doesNotMatch(t, /verified|approved|trusted|certified|accredited|endorsed by/i);
  const admin = await read("src/app/admin/investors/page.tsx");
  assert.match(admin, /I saw it on the regulator&apos;s public list/);
  assert.match(admin, /You are not judging the person, their business or any offer\./);
  assert.match(await read("src/components/feed/PostCard.tsx"), /title=\{REGISTRATION_LABEL_MEANING\}/);
  // Database: only admins (level 2+) decide, never their own, logged; the public sees regulator + date only, 12 months.
  assert.match(sql, /if lvl < 2 then raise exception 'not_allowed'; end if;/);
  assert.match(sql, /if p_user = me then raise exception 'own_registration'; end if;/);
  assert.match(sql, /'verify', 'investor_registration'/);
  assert.match(sql, /r\.checked_at > now\(\) - interval '12 months'/);
  assert.doesNotMatch(sql.slice(sql.indexOf("function public.investor_labels")), /select[^;]*registered_name[^;]*from public\.profiles/);
});

test("no money, pledge, subscription or commitment feature for investing", async () => {
  // Requests, quotes and records can't be used to ask for, offer or record an investment or a loan.
  assert.match(sql, /create trigger service_requests_no_investment before insert on public\.service_requests/);
  assert.match(sql, /create trigger service_quotes_no_investment before insert on public\.service_quotes/);
  assert.match(sql, /raise exception 'investment_not_allowed'/);
  assert.match((await read("src/lib/records.ts")), /investment_not_allowed: "Requests, quotes and records are for products and services\./);
  // Nothing in the investor screens takes an amount or a commitment.
  for (const f of ["src/app/account/investor-actions.ts", "src/app/admin/investors/page.tsx", "src/components/feed/PostCard.tsx", "src/components/feed/Composer.tsx"]) {
    const src = await read(f);
    assert.doesNotMatch(src, /name="(amount|pledge|commit|subscribe)|pledge|paymongo|checkout|escrow|wallet/i, f);
  }
  assert.match(await read("src/app/account/profile/page.tsx"), /FLAME PH has no way to pledge, invest, pay, subscribe or commit money to anyone\./);
});
