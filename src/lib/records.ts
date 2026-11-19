// Requests, quotes and transaction records: plain-word labels, rules and small helpers shared by the pages, the
// server actions and the tests. The database (0022_records.sql) enforces every rule; this file only explains them.
// There is NO payment, checkout, escrow or wallet. Amounts are typed by the members and FLAME PH never verifies them.

import { INDUSTRY_NAMES } from "@/lib/industries";

export const RECORD_CATEGORIES = INDUSTRY_NAMES;
export const TITLE_MAX = 120;
export const DETAILS_MAX = 1000;
export const TERMS_MAX = 1000;

/** Only the first 3 confirmed records between the same two members count, until BOTH businesses are vetted. */
export const PAIR_CAP = 3;

/** Endorsements a member can give the other member when confirming. Same list as valid_record_tags() in 0022. */
export const RECORD_TAGS = {
  on_time: "On time",
  good_quality: "Good quality",
  fair_price: "Fair price",
  clear_communication: "Clear communication",
  paid_on_time: "Paid on time",
  would_work_again: "Would work with again",
} as const;
export type RecordTag = keyof typeof RECORD_TAGS;
export const TAG_KEYS = Object.keys(RECORD_TAGS) as RecordTag[];
export const MAX_TAGS = 5;
export const cleanTags = (v: unknown[]): RecordTag[] => [...new Set(v.filter((t): t is RecordTag => typeof t === "string" && t in RECORD_TAGS))].slice(0, MAX_TAGS);

/** Badge levels, from counted records only (so a voided record or one over the pair limit never earns a level). */
export const BADGE_LEVELS = [
  { min: 40, name: "Platinum" },
  { min: 15, name: "Gold" },
  { min: 5, name: "Silver" },
  { min: 1, name: "Bronze" },
] as const;
export const badgeLevel = (counted: number): string | null => BADGE_LEVELS.find((b) => counted >= b.min)?.name ?? null;
export const nextBadge = (counted: number) => [...BADGE_LEVELS].reverse().find((b) => counted < b.min) ?? null;

export type RecordStatus = "in_progress" | "pending" | "confirmed" | "disputed" | "voided" | "cancelled";
export const STATUS_LABEL: Record<RecordStatus, string> = {
  in_progress: "In progress",
  pending: "Waiting for the other member",
  confirmed: "Confirmed by both",
  disputed: "On hold: disputed",
  voided: "Voided by a moderator",
  cancelled: "Cancelled",
};
export const STATUS_HELP: Record<RecordStatus, string> = {
  in_progress: "When the work is done, both of you confirm it here. Until then nothing is counted.",
  pending: "One of you confirmed. It counts only after both of you confirm.",
  confirmed: "Both of you confirmed this deal.",
  disputed: "A member disputed this record. It is on hold and not counted until a moderator reviews it.",
  voided: "A moderator voided this record. It no longer counts toward badges, reputation or points.",
  cancelled: "This deal was cancelled before anyone confirmed it.",
};

export type TxRecord = {
  id: string; request_id: string | null; quote_id: string | null; requester_id: string; provider_id: string;
  deal_date: string; category: string; description: string; status: RecordStatus; amount: number | string | null;
  requester_confirmed_at: string | null; provider_confirmed_at: string | null; confirmed_at: string | null;
  requester_rating: number | null; provider_rating: number | null; requester_tags: string[]; provider_tags: string[];
  held_status: string | null; disputed_by: string | null; disputed_at: string | null; voided_at: string | null; void_note: string | null; created_at: string;
};

export const otherParty = (r: Pick<TxRecord, "requester_id" | "provider_id">, me: string) => (r.requester_id === me ? r.provider_id : r.requester_id);
export const myConfirmedAt = (r: TxRecord, me: string) => (r.requester_id === me ? r.requester_confirmed_at : r.provider_confirmed_at);
export const theirConfirmedAt = (r: TxRecord, me: string) => (r.requester_id === me ? r.provider_confirmed_at : r.requester_confirmed_at);
/** True when this member still has to confirm (the deal is open and they haven't confirmed this version). */
export const needsMyConfirm = (r: TxRecord, me: string) => (r.status === "in_progress" || r.status === "pending") && !myConfirmedAt(r, me);
/** The tags and rating this member gave the other member. */
export const myReview = (r: TxRecord, me: string) =>
  r.requester_id === me ? { rating: r.requester_rating, tags: r.requester_tags } : { rating: r.provider_rating, tags: r.provider_tags };
/** The no-money reminder shows on every confirmed record (also while a confirmed record is disputed or voided). */
export const showsNoMoney = (r: Pick<TxRecord, "status" | "held_status">) => r.status === "confirmed" || r.held_status === "confirmed";

export const peso = (v: number | string | null | undefined) =>
  v === null || v === undefined || v === "" ? null : `PHP ${Number(v).toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/** "1,500.50" or "PHP 1500" -> 1500.5. Empty -> null. Invalid or negative -> NaN (the form shows an error). */
export function parseAmount(v: string): number | null {
  const t = v.replace(/php|₱|,|\s/gi, "");
  if (!t) return null;
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(t)) return Number.NaN;
  return Number(t);
}

export type Reputation = { counted: number; confirmed: number; rating_avg: number | null; rating_count: number; tags: Record<string, number>; categories: Record<string, number>; vetted: boolean };

export const RECORD_ERRORS: Record<string, string> = {
  records_consent: "Turn on switch 2, \"Transaction records\", in Settings first. It lets you create and confirm records with other members.",
  moderator_mute: "A moderator paused your posting for a while. See Notices in your account.",
  not_active_member: "Your account can't do this right now.",
  not_signed_in: "Please log in first.",
  not_available: "This member's account isn't active right now.",
  blocked: "You can't do this with this member. One of you has blocked the other.",
  blocked_words: "Your text has words FLAME PH doesn't allow. Please change it and try again.",
  own_request: "That's your own request.",
  request_rate_limit: "You've sent many requests today. Please try again tomorrow.",
  quote_rate_limit: "You've sent many quotes today. Please try again tomorrow.",
  service_quotes_once: "You already sent a quote for this request.",
  request_closed: "This request is closed. The member already accepted a quote or cancelled it.",
  quote_expired: "This quote's valid-until date has passed. Ask the member to send a new one.",
  record_locked: "This record can't be changed now (it is confirmed, on hold, voided or cancelled).",
  bad_rating: "Choose a rating from 1 to 5 stars.",
  bad_tags: "Choose up to 5 endorsements from the list.",
  bad_amount: "Type the amount in pesos, for example 1500 or 1,500.50, or leave it empty.",
  bad_date: "Choose the date the deal happened (today or within the past year).",
  bad_input: "Please fill in the title (3 to 120 characters) and choose a category.",
  bad_terms: "Please write your terms (3 to 1,000 characters).",
  investment_not_allowed: "Requests, quotes and records are for products and services. FLAME PH has no way to invest, lend, pledge or commit money, so investment and loan deals can't be requested or recorded here.",
  own_business: "Moderators can't act on their own records.",
  not_allowed_for_role: "Only admins and founders can do this.",
  report_rate_limit: "You've sent many reports today. Please try again tomorrow.",
  not_found: "We couldn't find that request, quote or record.",
  unavailable: "Requests and records open after FLAME PH finishes a database update. Please try again later.",
  failed: "That didn't go through. Please try again.",
};
export const recordErrorCode = (message?: string | null) => {
  const m = message ?? "";
  if (/service_requests_(title|category)_check|service_requests_check/.test(m)) return "bad_input";
  if (/service_quotes_terms_check/.test(m)) return "bad_terms";
  // Longest first, so "blocked_words" is not read as "blocked".
  return Object.keys(RECORD_ERRORS).sort((a, b) => b.length - a.length).find((k) => m.includes(k))
    ?? (/schema cache|does not exist|function public\.|Could not find/.test(m) ? "unavailable" : "failed");
};

export const DISPUTE_REASONS = {
  false_info: "The details or amount are wrong",
  scam: "The deal didn't happen, or it's a scam",
  harassment: "The other member is harassing me",
  other: "Something else",
} as const;
export type DisputeReason = keyof typeof DISPUTE_REASONS;
