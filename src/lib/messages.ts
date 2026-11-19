// Member-to-member messages: plain-word errors and small helpers shared by the pages, actions and tests.
// The database (0021_messenger.sql) enforces every rule: only the two members can read a conversation, and sending
// checks sign-in, active account, moderator mute, block (either way), the keyword filter and the rate limits.

export const MESSAGE_MAX = 2000;

export const MSG_ERRORS: Record<string, string> = {
  new_account_conversation_limit: "New accounts can start a few conversations a day (3 on the first day, 10 a day in the first week). Please try again tomorrow.",
  new_account_message_limit: "New accounts can send 50 messages on their first day. You can send more tomorrow.",
  new_account_links: "New accounts can't send links on their first day. Please send it without the link, or try again tomorrow.",
  blocked: "You can't message this member. One of you has blocked the other.",
  moderator_mute: "A moderator paused your posting and messaging for a while. See Notices in your account.",
  not_active_member: "Your account can't send messages right now.",
  not_available: "This member's account isn't active, so they can't get messages.",
  blocked_words: "Your message has words FLAME PH doesn't allow. Please change it and try again.",
  message_rate_limit: "You're sending messages very fast. Please wait a few minutes.",
  new_conversation_limit: "You've started many new conversations today. Please try again tomorrow, or reply in an existing one.",
  empty: "Please write a message first.",
  not_found: "We couldn't find that conversation or member.",
  unavailable: "Messages open after FLAME PH finishes a database update. Please try again later.",
  failed: "Your message didn't send. Please try again.",
};
export const msgErrorCode = (message?: string | null) => {
  const m = message ?? "";
  if (/direct_messages_body_check/.test(m)) return "empty";
  // Longest first, so "blocked_words" is not read as "blocked".
  return Object.keys(MSG_ERRORS).sort((a, b) => b.length - a.length).find((k) => m.includes(k)) ?? (/schema cache|does not exist|function public\.|Could not find/.test(m) ? "unavailable" : "failed");
};

export type Conversation = {
  id: string; member_a: string; member_b: string; created_at: string;
  last_message_at: string | null; last_sender_id: string | null; last_preview: string | null;
  a_read_at: string | null; b_read_at: string | null;
};

export const otherMember = (c: Pick<Conversation, "member_a" | "member_b">, me: string) => (c.member_a === me ? c.member_b : c.member_a);
export const myReadAt = (c: Conversation, me: string) => (c.member_a === me ? c.a_read_at : c.b_read_at);
export const theirReadAt = (c: Conversation, me: string) => (c.member_a === me ? c.b_read_at : c.a_read_at);

/** True when the newest message is from the other member and arrived after I last opened the conversation. */
export function hasUnread(c: Conversation, me: string): boolean {
  if (!c.last_message_at || !c.last_sender_id || c.last_sender_id === me) return false;
  const read = myReadAt(c, me);
  return !read || new Date(c.last_message_at) > new Date(read);
}

/** Short time for lists: "3:05 PM" today, "Mon" this week, else "Nov 3". Manila time. */
export function shortTime(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const tz = "Asia/Manila";
  const day = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: tz });
  if (day(d) === day(now)) return d.toLocaleTimeString("en-PH", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  if (now.getTime() - d.getTime() < 6 * 86400000) return d.toLocaleDateString("en-PH", { timeZone: tz, weekday: "short" });
  return d.toLocaleDateString("en-PH", { timeZone: tz, month: "short", day: "numeric" });
}
