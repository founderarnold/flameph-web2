// Ka-FLAME AI cost rules in one place: what one question can cost at most, what one member can cost at most in a month,
// and the simple estimate used in the Phase 7 report. Prices are the model's list prices in USD per million tokens
// (Claude Haiku 5.5: $0.10 in, $0.50 out); they can be changed with AI_PRICE_INPUT_PER_MTOK / AI_PRICE_OUTPUT_PER_MTOK.

/** Default for Admin → Settings → "Most one member can use per month" (USD). About ₱115. 0 turns the per-member limit off. */
export const DEFAULT_MEMBER_MONTHLY_CAP_USD = 2;

/**
 * The largest question the app can send (see buildMessages in run.ts): the Ka-FLAME instructions (~1,000 tokens),
 * up to 4 earlier turns (2,000 + 4,000 characters each), 3 FLAME PH guides (1,500-character excerpts) and a
 * 2,000-character question. About 34,000 characters, so at most ~10,000 tokens in. Answers stop at 4,000 tokens.
 */
export const WORST_CASE_TOKENS = { input: 10_000, output: 4_000 } as const;

export type Prices = { inputPerMTok: number; outputPerMTok: number };
export const HAIKU_PRICES: Prices = { inputPerMTok: 0.1, outputPerMTok: 0.5 };

export const questionCost = (inputTokens: number, outputTokens: number, p: Prices = HAIKU_PRICES) =>
  (inputTokens * p.inputPerMTok + outputTokens * p.outputPerMTok) / 1_000_000;

/** The most one question can cost: $0.003 at Haiku prices. */
export const worstCaseQuestionCost = (p: Prices = HAIKU_PRICES) => questionCost(WORST_CASE_TOKENS.input, WORST_CASE_TOKENS.output, p);

/**
 * The most one member can cost in a month: the smaller of (daily question limit × 30 days × worst-case question)
 * and the per-member monthly allowance. A cap of 0 means only the daily limit applies.
 */
export function memberMonthlyCeiling(dailyLimit: number, memberCapUsd: number, p: Prices = HAIKU_PRICES) {
  const byDailyLimit = dailyLimit * 30 * worstCaseQuestionCost(p);
  return memberCapUsd > 0 ? Math.min(byDailyLimit, memberCapUsd) : byDailyLimit;
}

/** Expected monthly bill: members × share who use AI × questions each per month × average cost per question. */
export function monthlyEstimate(o: { members: number; activeShare: number; questionsPerActiveMember: number; costPerQuestion: number }) {
  return o.members * o.activeShare * o.questionsPerActiveMember * o.costPerQuestion;
}
