// Phase 7: RideSafe and Ka-FLAME AI in the member shell; AI cost per member stated and bounded; rate limits.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const toUrl = (js) => `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
const load = async (p) => import(toUrl(ts.transpileModule((await read(p)).replace(/^import "server-only";$/m, ""), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText));
const B = await load("src/lib/ai/budget.ts");
const S = await load("src/lib/member-shell.ts");

test("one question costs at most $0.003, and a free member at most $0.90 a month; the monthly allowance caps every tier", () => {
  assert.ok(Math.abs(B.worstCaseQuestionCost() - 0.003) < 1e-9);
  assert.ok(Math.abs(B.memberMonthlyCeiling(10, 2) - 0.9) < 1e-9); // free: 10 a day × 30 × $0.003
  assert.equal(B.memberMonthlyCeiling(100, 2), 2); // champion: capped by the $2 allowance
  assert.ok(Math.abs(B.memberMonthlyCeiling(100, 0) - 9) < 1e-9); // allowance off: daily limit only
  assert.equal(B.DEFAULT_MEMBER_MONTHLY_CAP_USD, 2);
});

test("the cost price matches the model's list price used when logging each question", async () => {
  const prompt = await read("src/lib/ai/prompt.ts");
  assert.match(prompt, /AI_MODEL = process\.env\.ANTHROPIC_MODEL \|\| "claude-haiku-5-5"/);
  assert.match(prompt, /AI_PRICE_INPUT_PER_MTOK \|\| 0\.1\)/);
  assert.match(prompt, /AI_PRICE_OUTPUT_PER_MTOK \|\| 0\.5\)/);
  assert.equal(B.HAIKU_PRICES.inputPerMTok, 0.1);
  assert.equal(B.HAIKU_PRICES.outputPerMTok, 0.5);
  const run = await read("src/lib/ai/run.ts");
  assert.match(run, /max_tokens: 4000/, "the worst-case answer size in budget.ts assumes 4,000 tokens");
  assert.match(run, /slice\(-4\)/, "the worst-case question size assumes at most 4 earlier turns");
});

test("each member's monthly allowance is enforced before any AI call, with a clear message", async () => {
  const guard = await read("src/lib/ai/guard.ts");
  assert.match(guard, /ai_member_monthly_cap_usd \?\? DEFAULT_MEMBER_MONTHLY_CAP_USD/);
  assert.match(guard, /reason: "member_cap"/);
  const chat = await read("src/app/api/ai/chat/route.ts");
  assert.ok(chat.indexOf('gate.reason === "member_cap"') > 0);
  assert.ok(chat.indexOf("checkGate(") < chat.indexOf("runAi("));
  const settings = await read("src/app/admin/settings/page.tsx");
  assert.match(settings, /"ai_member_cap"/, "the allowance can be changed in Admin → Settings");
});

test("rate limits: 5 questions a minute per member; 300 a day for partner sites", async () => {
  const rl = await read("src/lib/rate-limit.ts");
  assert.match(rl, /ai_chat: \{ limit: positiveInt\("RATE_LIMIT_AI_CHAT_MAX", 5, 60\), windowSeconds: positiveInt\("RATE_LIMIT_AI_CHAT_WINDOW_SECONDS", 60,/);
  assert.match(rl, /ai_embed: \{ limit: positiveInt\("RATE_LIMIT_AI_EMBED_MAX", 300, 5000\), windowSeconds: positiveInt\("RATE_LIMIT_AI_EMBED_WINDOW_SECONDS", 86400,/);
  const chat = await read("src/app/api/ai/chat/route.ts");
  assert.match(chat, /checkRateLimit\(req, "ai_chat", \{ identifier: userId \}\)/);
  assert.ok(chat.indexOf('"ai_chat"') < chat.indexOf("runAi("));
  const embed = await read("src/app/api/ai/embed/route.ts");
  assert.match(embed, /checkRateLimit\(req, "ai_embed"/);
  assert.ok(embed.indexOf('"ai_embed"') < embed.indexOf("runAi("));
});

test("visitors: Ka-FLAME AI stays members-only as before, and RideSafe stays open to everyone", async () => {
  const chat = await read("src/app/api/ai/chat/route.ts");
  assert.match(chat, /if \(!userId\) return NextResponse\.json\(\{ error: "Please log in or join free to use FLAME AI\.", guest: true, limit: true \}, \{ status: 401 \}\)/);
  const pub = await read("src/app/bizconsult-ai/page.tsx");
  assert.match(pub, /Members only, and free to join/);
  const ride = await read("src/app/ridesafe/page.tsx");
  assert.doesNotMatch(ride, /requireUser|redirect/);
});

test("members: /bizconsult-ai opens the member Ka-FLAME page (same address); RideSafe is in Workspace and member-aware", async () => {
  assert.equal(S.MEMBER_REWRITES["/bizconsult-ai"], "/m/ai");
  assert.equal(S.MEMBER_REWRITES["/pos"], "/m/pos");
  assert.equal(S.MEMBER_REWRITES["/fulfillment"], "/m/fulfillment");
  const mw = await read("src/middleware.ts");
  assert.match(mw, /"\/bizconsult-ai"/, "middleware runs on /bizconsult-ai");
  const page = await read("src/app/(member)/m/ai/page.tsx");
  assert.match(page, /requireUser\("\/bizconsult-ai"\)/);
  assert.match(page, /<KaFlameChat \/>/);
  const ws = await read("src/app/(member)/workspace/page.tsx");
  assert.match(ws, /href: "\/ridesafe", title: "RideSafe"/);
  assert.match(ws, /href: "\/bizconsult-ai", title: "Ka-FLAME AI"/);
  const ride = await read("src/app/ridesafe/RideSafeHome.tsx");
  assert.match(ride, /setMember\(Boolean\(data\.session\)\)/);
  assert.match(ride, /href=\{member \? "\/account" : "\/login\?next=%2Fridesafe"\}/);
  const css = await read("src/app/ridesafe/ridesafe.css");
  assert.match(css, /body:has\(\[data-ridesafe-root="true"\]\) > nav\[data-shell="bottom-bar"\]/, "the member tab bar never covers RideSafe's own dock and help button");
});
