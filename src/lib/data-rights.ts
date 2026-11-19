// Phase 12: members' data-protection rights (Data Privacy Act of 2012, sections 16 to 18) and the requests that go to
// FLAME PH's Data Protection Officer. Used by the member page (/account/privacy) and the DPO tools (/admin/privacy).

export type RequestKind = "access" | "correction" | "erasure" | "objection" | "portability" | "closure";
export type RequestStatus = "open" | "in_progress" | "done" | "refused" | "withdrawn";

export const REQUEST_KINDS: Record<RequestKind, { label: string; right: string }> = {
  access: { label: "See my data", right: "Right to access" },
  portability: { label: "Get a copy of my data", right: "Right to data portability" },
  correction: { label: "Correct my data", right: "Right to correct" },
  objection: { label: "Object to a use of my data", right: "Right to object" },
  erasure: { label: "Delete my account and data", right: "Right to erasure or blocking" },
  closure: { label: "Close my account", right: "Withdrawing consent 1" },
};

export const STATUS_LABEL: Record<RequestStatus, string> = {
  open: "Received", in_progress: "Being handled", done: "Done", refused: "Answered: not done", withdrawn: "Withdrawn",
};

export const isRequestKind = (v: unknown): v is RequestKind => typeof v === "string" && v in REQUEST_KINDS;

/** Days a member has to change their mind after asking for erasure (the account is closed straight away). */
export const ERASURE_COOL_OFF_DAYS = 7;
/** Working days to answer a request (Privacy Notice, section 6). */
export const ANSWER_WORKING_DAYS = 15;

/** Same rule as the database's add_working_days(): count Monday to Friday in Manila time. */
export function addWorkingDays(from: Date, n: number): Date {
  const d = new Date(from);
  let left = n;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = new Date(d.getTime() + 8 * 3600 * 1000).getUTCDay(); // Manila is UTC+8 all year
    if (dow !== 0 && dow !== 6) left -= 1;
  }
  return d;
}

/** Plain messages for the database's error codes. */
export const PRIVACY_ERRORS: Record<string, string> = {
  details_needed: "Please tell us a little more (at least 10 characters), so we know what to change.",
  details_too_long: "That's too long. Please keep it under 2,000 characters.",
  already_open: "You already have a request like this open. We'll answer it first.",
  already_closed: "Your account is already closed.",
  privacy_rate_limit: "You've sent several requests today. Please try again tomorrow, or email our Data Protection Officer.",
  not_closed: "Your account is open.",
  not_found: "We couldn't find that request.",
  rate: "You've downloaded your data several times today. Please try again tomorrow.",
  confirm: "Please tick the box to confirm.",
  unavailable: "This opens after FLAME PH finishes a database update. Until then, email our Data Protection Officer.",
  failed: "That didn't go through. Please try again.",
};

export function privacyError(message?: string | null): string {
  const m = message ?? "";
  for (const code of Object.keys(PRIVACY_ERRORS)) if (m.includes(code)) return code;
  if (/privacy_request|schema cache|does not exist|Could not find the function/.test(m)) return "unavailable";
  return "failed";
}

const manila = (iso: string | Date) => new Date(iso).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" });
export const day = manila;
