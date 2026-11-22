/**
 * Plain-language messages for database and storage errors, so members never see raw text such as
 * `new row violates row-level security policy for table "businesses"`.
 *
 * Works in the browser and on the server (no server-only imports). Use it wherever a form shows a save error:
 *   if (error) setMsg({ ok: false, text: friendlyDbError(error) });
 */

export type DbErrorLike =
  | { code?: string | null; message?: string | null; status?: number | string | null; statusCode?: number | string | null; name?: string | null }
  | Error
  | string
  | null
  | undefined;

const parts = (e: DbErrorLike) => {
  if (!e) return { code: "", message: "", status: "" };
  if (typeof e === "string") return { code: "", message: e, status: "" };
  const o = e as { code?: unknown; message?: unknown; status?: unknown; statusCode?: unknown };
  return { code: String(o.code ?? ""), message: String(o.message ?? ""), status: String(o.status ?? o.statusCode ?? "") };
};

export const SIGNED_OUT_MESSAGE =
  "Your sign-in has expired or changed (for example, you signed out or into another account in another tab). Please log in again, then press Save. Your typed details are kept on this page.";

/** True when the database refused because the browser is no longer signed in as this member. */
export function isSignedOutError(e: DbErrorLike): boolean {
  const { code, message, status } = parts(e);
  return (
    code === "42501" ||
    code === "PGRST301" ||
    code === "PGRST302" ||
    status === "401" ||
    status === "403" ||
    /row-level security|jwt|not authenticated|authentication required|not_signed_in|session (missing|expired)|invalid claim|refresh token/i.test(message)
  );
}

/** One plain sentence or two for a member, never raw database text. `what` names what was being saved. */
export function friendlyDbError(e: DbErrorLike, what = "your changes"): string {
  const { code, message, status } = parts(e);
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "You seem to be offline. Check your internet connection and try again.";
  if (/failed to fetch|network|load failed|fetch failed|timeout/i.test(message)) return "We couldn't reach FLAME PH just now. Check your internet connection and try again.";
  if (isSignedOutError(e)) return SIGNED_OUT_MESSAGE;
  if (status === "413" || /payload too large|too large|exceeded the maximum/i.test(message)) return "That file is too large. Please use a file under 5 MB.";
  if (/mime|file type|invalid_mime/i.test(message)) return "That file type isn't allowed. Please use a photo (JPG, PNG or WebP) or a PDF.";
  if (code === "23505" || /duplicate key|already exists/i.test(message)) return `This was already saved. Refresh the page to see the latest version of ${what}.`;
  if (code === "23502") return "Please fill in all the required fields, then press Save again.";
  if (code === "22001" || code === "23514" || code === "22P02" || /violates check constraint|too long|invalid input/i.test(message))
    return "One of the fields is too long or not in the expected format. Please check what you typed and try again.";
  if (code === "23503") return "Something this depends on was removed. Refresh the page and try again.";
  if (code === "PGRST116") return "We couldn't find this item any more. Refresh the page and try again.";
  if (code === "42703" || code === "42P01" || code === "PGRST204" || code === "PGRST205" || /schema cache|does not exist/i.test(message))
    return "FLAME PH is finishing a website update. Please try again in a few minutes.";
  if (code === "429" || status === "429" || /rate limit|too many/i.test(message)) return "That was a lot of saves in a short time. Please wait a minute and try again.";
  // Our own database rules raise short, readable sentences (for example "A business must be approved before publication.").
  if (code === "P0001" && /^[A-Z][^_]*[.!]$/.test(message.trim()) && message.length <= 200) return message.trim();
  return `We couldn't save ${what}. Please try again. If it keeps happening, send FLAME PH a screenshot of this page.`;
}
