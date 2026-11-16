/** Where a member goes after signing in when no other page was asked for: the Home feed (see FEED in member-shell). */
export const AFTER_SIGN_IN = "/home";

/** Only same-site paths: blocks "//evil.com", "/\\evil.com" and absolute URLs. */
export function safeNext(v: string | null | undefined, fallback = AFTER_SIGN_IN): string {
  return typeof v === "string" && v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : fallback;
}
