/** Only same-site paths: blocks "//evil.com", "/\\evil.com" and absolute URLs. */
export function safeNext(v: string | null | undefined, fallback = "/account"): string {
  return typeof v === "string" && v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : fallback;
}
