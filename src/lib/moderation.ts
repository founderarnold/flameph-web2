// Moderation rules shared by the report form, the queue, the member's notices and the tests.
// The database (0019_moderation.sql) enforces every rule on its own; this file only labels and orders things.

/** Roles, from public.roles. Member is everyone without a role. */
export const ROLE_LABELS: Record<string, string> = {
  super_admin: "Founder",
  admin: "Admin",
  chapter_leader: "Chapter head",
  editor: "Editor",
};
export const LEVEL_NAMES = ["Member", "Chapter head", "Admin", "Founder"] as const;
export type ModLevel = 0 | 1 | 2 | 3;

export const TARGETS = {
  post: "post",
  comment: "comment",
  member: "member",
  listing: "business listing",
} as const;
export type ReportTarget = keyof typeof TARGETS;
export const isReportTarget = (v: unknown): v is ReportTarget => typeof v === "string" && v in TARGETS;

export const REASONS = {
  spam: { label: "Spam or ads", help: "Repeated posts, unrelated selling, link farming" },
  scam: { label: "Scam or fraud", help: "Asks for money first, fake offers, promised returns" },
  harassment: { label: "Harassment or hate", help: "Insults, threats, attacks on a person or group" },
  false_info: { label: "False information", help: "Fake business details, false claims" },
  inappropriate: { label: "Inappropriate", help: "Adult content, violence, gambling" },
  other: { label: "Something else", help: "Tell us below" },
} as const;
export type ReportReason = keyof typeof REASONS;
export const isReason = (v: unknown): v is ReportReason => typeof v === "string" && v in REASONS;

/** Actions each role may take on a report. The database checks the same list (moderate()). */
export const ACTIONS = {
  dismiss: { label: "No action needed", help: "Close the report; nothing breaks the rules.", level: 1, needs: [] as string[] },
  hide_in_group: { label: "Hide in group", help: "Removes the post or comment from its group.", level: 1, needs: ["post", "comment"] },
  warn: { label: "Warn", help: "The member sees your note in their Notices.", level: 1, needs: [] },
  mute_7d: { label: "Mute 7 days", help: "The member can't post or comment for 7 days.", level: 1, needs: [] },
  hide: { label: "Hide", help: "Hides the post or comment everywhere.", level: 2, needs: ["post", "comment"] },
  mute: { label: "Mute (choose days)", help: "1 to 30 days without posting or commenting.", level: 2, needs: [] },
  suspend: { label: "Suspend", help: "The account and its listings are switched off until reactivated.", level: 2, needs: [] },
  verify: { label: "Verify", help: "Checked and genuine. A listing gets the verified mark.", level: 2, needs: [] },
  remove_listing: { label: "Remove listing", help: "Takes the business listing down.", level: 2, needs: ["listing"] },
  ban: { label: "Ban", help: "Permanent. Account suspended and muted until a founder lifts it.", level: 3, needs: [] },
} as const;
export type ModAction = keyof typeof ACTIONS;
export const isModAction = (v: unknown): v is ModAction => typeof v === "string" && v in ACTIONS;
/** The actions shown for one report, for this moderator. */
export const actionsFor = (level: number, target: string) =>
  (Object.keys(ACTIONS) as ModAction[]).filter((a) => ACTIONS[a].level <= level && (!ACTIONS[a].needs.length || (ACTIONS[a].needs as readonly string[]).includes(target)));

/** Every entry in the audit log, in plain words. */
export const LOG_LABELS: Record<string, string> = {
  ...Object.fromEntries(Object.entries(ACTIONS).map(([k, v]) => [k, v.label])),
  auto_hold: "Held automatically",
  escalate: "Moved to admin queue (24 hours)",
  override: "Undone by founder",
  policy: "Policy change",
  appeal_upheld: "Appeal: decision kept",
  appeal_overturned: "Appeal: decision reversed",
};

/** What a member reads about an action on their account or content. */
export const NOTICE_TEXT: Record<string, string> = {
  warn: "A moderator sent you a warning.",
  hide_in_group: "A moderator removed your post or comment from its group.",
  hide: "A moderator hid your post or comment.",
  auto_hold: "Your post or comment is waiting for a moderator to check it.",
  mute_7d: "You can't post or comment for 7 days.",
  mute: "You can't post or comment for a while.",
  suspend: "Your account is suspended.",
  ban: "Your account is banned.",
  remove_listing: "Your business listing was taken down.",
};

export const MOD_ERRORS: Record<string, string> = {
  own_content: "You can't report your own post, listing or account.",
  own_business: "You can't act on a report about your own business. Another moderator will handle it.",
  out_of_scope: "This report is outside your chapter.",
  not_allowed_for_role: "Your role can't take that action.",
  not_moderator: "Only moderators can do that.",
  not_in_a_group: "That post isn't in a group. Use Warn or Mute, or leave it for an admin.",
  not_a_post: "That action is for posts and comments.",
  not_a_listing: "That action is for business listings.",
  report_rate_limit: "You've sent a lot of reports today. Please try again tomorrow.",
  duplicate: "You already reported this. A moderator will look at it.",
  not_found: "We couldn't find that. It may have been removed.",
  not_available_yet: "Reporting this isn't available yet.",
  appeal_exists: "You already appealed this decision.",
  appeal_too_late: "Appeals must be sent within 30 days.",
  cannot_override: "That action can't be undone.",
  not_active_member: "Your account can't do that right now.",
  unavailable: "Reporting opens after FLAME PH finishes a database update. Please try again later.",
  failed: "Something went wrong. Please try again.",
};
export const modErrorCode = (message?: string | null) => {
  const m = message ?? "";
  if (/duplicate key|moderation_reports_once/.test(m)) return "duplicate";
  return Object.keys(MOD_ERRORS).find((k) => m.includes(k)) ?? (/schema cache|does not exist|moderation_|function/.test(m) ? "unavailable" : "failed");
};

/** Time left on the 24-hour clock, in words ("5h left", "overdue 2h"). */
export function clockText(dueIso: string, now = Date.now()) {
  const mins = Math.round((new Date(dueIso).getTime() - now) / 60000);
  const h = Math.floor(Math.abs(mins) / 60), m = Math.abs(mins) % 60;
  const t = h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
  return mins >= 0 ? `${t} left` : `overdue ${t}`;
}

export type QueueItem = { id: string; chapter_id: string | null; group_id: string | null; escalated_at: string | null; due_at: string; created_at: string };
/** Queue order. Chapter heads: their own chapter first, then the industry groups. Admins: escalated first. Then by the clock. */
export function sortQueue<T extends QueueItem>(items: T[], level: number, myChapters: string[], chapterGroups: string[] = []): T[] {
  const rank = (r: T) => level === 1
    ? (r.chapter_id && myChapters.includes(r.chapter_id) && !r.group_id) || (r.group_id && chapterGroups.includes(r.group_id)) ? 0 : r.group_id ? 1 : 2
    : r.escalated_at ? 0 : 1;
  return [...items].sort((a, b) => rank(a) - rank(b) || a.due_at.localeCompare(b.due_at));
}
