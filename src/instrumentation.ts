// Phase 13: counts server errors (a page or API failing on Vercel) for Admin → Release. Only the page pattern and a
// cleaned message are kept; nothing about the member. A failure to record never affects the visitor.
export async function register() {}

export async function onRequestError(err: unknown, request: { path: string }) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { createAdminClient } = await import("@/lib/supabase/server");
    const { cleanMessage, pagePattern } = await import("@/lib/release");
    const admin = createAdminClient();
    if (!admin) return;
    const e = err as { name?: string; message?: string; digest?: string };
    // Next.js uses thrown errors for redirects and not-found pages; those are not failures.
    if (/NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR/.test(`${e.digest ?? ""} ${e.message ?? ""}`)) return;
    await admin.rpc("site_error_log", { p_kind: "server", p_path: pagePattern(request.path), p_message: cleanMessage(`${e.name ?? "Error"}: ${e.message ?? ""}`) });
  } catch { /* ignore */ }
}
