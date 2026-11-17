import { POST_ERRORS } from "@/lib/feed-rules";

/** Confirmation shown after a Friend, mute, block or group action (?note=…). */
export const NOTES: Record<string, string> = {
  "request-sent": "Friend request sent. You'll be Friends once they accept.",
  friends: "You're now Friends. You can see each other's Friend-only posts.",
  removed: "Done.",
  declined: "Request declined. They aren't told.",
  cancelled: "Request cancelled.",
  unfriended: "You're no longer Friends. You still follow each other unless you unfollow.",
  muted: "Muted. Their posts won't show in your feed. They aren't told.",
  unmuted: "Unmuted. Their posts will show in your feed again.",
  "blocked-done": "Blocked. You won't see each other's posts or comments, and any friendship or follow has ended. They aren't told.",
  unblocked: "Unblocked.",
  joined: "You joined the group. You can now post in it, and its posts show in your feed.",
  left: "You left the group.",
};
export const noteText = (note?: string | null) => (note ? NOTES[note] ?? POST_ERRORS[note] ?? null : null);
