// Partner accreditation (Step 5): sample tests, complaints, corrective actions, proposed penalties and sanctions.
// Pure rules and plain words, shared by /partner-us/samples, /partner-us/complaints, Admin > Partners and the tests.
// The database (0035_partner_samples_complaints.sql) enforces the same statuses, limits and access rules.

// ------------------------------------------------------------------------------------------------------------------
// Sample tests (chapter testers and, during the pilot, the national team). Testers never see prices.
// ------------------------------------------------------------------------------------------------------------------
export const SAMPLE_STATUS = {
  draft: { label: "Draft (not sent yet)", tone: "info" },
  submitted: { label: "Sent, waiting for the national team", tone: "info" },
  reviewed: { label: "Reviewed by the national team", tone: "ok" },
} as const;
export type SampleStatus = keyof typeof SAMPLE_STATUS;

export const ARRIVAL = {
  good: "Good condition",
  minor_issues: "Small problems (dents, scuffs)",
  damaged: "Damaged",
  incomplete: "Incomplete (parts or pieces missing)",
} as const;
export const YES_PARTLY_NO = { yes: "Yes", partly: "Partly", no: "No" } as const;
export const RECOMMEND = { yes: "Yes, I would recommend it to members", maybe: "Maybe, with changes", no: "No" } as const;

/** Five standard scores, 1 (very poor) to 5 (excellent). Total out of 25. */
export const SAMPLE_SCORES = [
  { key: "score_packaging", label: "Packaging", fil: "Balot at lalagyan", help: "Sturdy, clean, safe for delivery." },
  { key: "score_appearance", label: "Look and finish", fil: "Itsura", help: "Colour, size and finish match the photos and description." },
  { key: "score_quality", label: "Quality", fil: "Kalidad", help: "Materials, taste, smell or feel. Would a member be happy with it?" },
  { key: "score_performance", label: "Does what it says", fil: "Gumagana ayon sa sinabi", help: "Try it as a member would: hold, use, cook, wash, apply." },
  { key: "score_labeling", label: "Label and information", fil: "Label at impormasyon", help: "Name, maker, contents, expiry date, FDA number where needed." },
] as const;
export type SampleScoreKey = (typeof SAMPLE_SCORES)[number]["key"];
export const SCORE_WORDS = ["", "1 Very poor", "2 Poor", "3 OK", "4 Good", "5 Excellent"] as const;
export const SAMPLE_MAX = 25;

export const FEEDBACK_TAGS = {
  good_value_look: "Looks worth the price",
  well_packed: "Well packed",
  clear_label: "Clear, complete label",
  consistent: "All pieces the same",
  durable: "Strong, durable",
  tastes_good: "Tastes or smells good",
  works_as_described: "Works as described",
  poor_packaging: "Poor packaging",
  leaking_or_broken: "Leaking or broken",
  missing_label_info: "Label info missing",
  short_expiry: "Short expiry date",
  inconsistent: "Pieces not the same",
  weak_or_flimsy: "Weak or flimsy",
  off_taste_or_smell: "Off taste or smell",
  not_as_described: "Not as described",
  too_small_or_short: "Smaller or less than stated",
} as const;
export type FeedbackTag = keyof typeof FEEDBACK_TAGS;
export const isFeedbackTag = (v: unknown): v is FeedbackTag => typeof v === "string" && v in FEEDBACK_TAGS;

export const MAX_SAMPLE_PHOTOS = 6;
export const MAX_EVIDENCE_FILES = 8;

/** Score as words: "20/25 (80%)". */
export const sampleTotal = (t: number | null) => (t === null ? "—" : `${t}/${SAMPLE_MAX} (${Math.round((t / SAMPLE_MAX) * 100)}%)`);

export type SampleRow = {
  id: string; ref_no: string; status: SampleStatus; partner_name: string; product_name: string; offer_id: string | null; item_id: string | null;
  batch_lot: string | null; received_on: string | null; expiry_on: string | null; arrival_condition: keyof typeof ARRIVAL | null;
  matches_description: keyof typeof YES_PARTLY_NO | null; label_complete: keyof typeof YES_PARTLY_NO | null;
  score_packaging: number | null; score_appearance: number | null; score_quality: number | null; score_performance: number | null; score_labeling: number | null;
  total: number | null; would_recommend: keyof typeof RECOMMEND | null; feedback_tags: FeedbackTag[]; feedback: string | null;
  safety_concern: boolean; safety_note: string | null; submitted_at: string | null; reviewed_at: string | null; created_at: string;
};
export const SAMPLE_COLS = "id, ref_no, status, partner_name, product_name, offer_id, item_id, batch_lot, received_on, expiry_on, arrival_condition, matches_description, label_complete, score_packaging, score_appearance, score_quality, score_performance, score_labeling, total, would_recommend, feedback_tags, feedback, safety_concern, safety_note, submitted_at, reviewed_at, created_at";

/** What is still missing before a sample test can be sent. */
export function sampleMissing(t: Pick<SampleRow, "received_on" | "arrival_condition" | "matches_description" | "label_complete" | SampleScoreKey | "would_recommend" | "safety_concern" | "safety_note">, photos: number): string[] {
  const m: string[] = [];
  if (!t.received_on) m.push("Date the sample was received");
  if (!t.arrival_condition) m.push("Condition when it arrived");
  if (!t.matches_description) m.push("Does it match the description?");
  if (!t.label_complete) m.push("Is the label complete?");
  for (const s of SAMPLE_SCORES) if (!t[s.key]) m.push(`Score: ${s.label}`);
  if (!t.would_recommend) m.push("Would you recommend it?");
  if (t.safety_concern && !t.safety_note) m.push("What is the safety concern?");
  if (photos < 1) m.push("At least one photo of the sample");
  return m;
}

// ------------------------------------------------------------------------------------------------------------------
// Complaints
// ------------------------------------------------------------------------------------------------------------------
export const ISSUES = {
  late: { label: "Late delivery", fil: "Huli ang dating" },
  missing: { label: "Missing items", fil: "Kulang ang dumating" },
  damaged: { label: "Damaged items", fil: "Sira ang dumating" },
  defective: { label: "Defective product", fil: "Depektibo ang produkto" },
  unsatisfactory_service: { label: "Unsatisfactory service", fil: "Hindi maayos ang serbisyo" },
  safety: { label: "Safety problem (someone could get hurt or sick)", fil: "Delikado sa kaligtasan o kalusugan" },
  other: { label: "Something else", fil: "Iba pa" },
} as const;
export type Issue = keyof typeof ISSUES;

export const REMEDIES = {
  replacement: "Replace the missing or damaged items",
  credit: "Credit on my next order",
  refund: "Refund",
  re_performance: "Do the service again, properly",
  proportionate_refund: "Partial refund for the part of the service not done well",
  explanation: "An explanation and an apology",
  other: "Something else (write it below)",
} as const;
export type Remedy = keyof typeof REMEDIES;

export const SEVERITY = {
  critical: { label: "Critical", tone: "danger", help: "Safety: someone could get hurt or sick." },
  high: { label: "High", tone: "warn", help: "Missing, damaged or defective goods." },
  medium: { label: "Medium", tone: "info", help: "Late delivery or service problems." },
  low: { label: "Low", tone: "info", help: "Other problems." },
} as const;
export type Severity = keyof typeof SEVERITY;
export const SEVERITY_KEYS = Object.keys(SEVERITY) as Severity[];
/** The severity a complaint starts with (same rule as complaint_default_severity() in the database). */
export const defaultSeverity = (i: Issue): Severity =>
  i === "safety" ? "critical" : i === "missing" || i === "damaged" || i === "defective" ? "high" : i === "late" || i === "unsatisfactory_service" ? "medium" : "low";

export const COMPLAINT_STATUS = {
  draft: { label: "Draft (not sent yet)", fil: "Hindi pa naipapadala", tone: "info" },
  open: { label: "Sent, waiting for the national team", fil: "Naipadala na", tone: "info" },
  investigating: { label: "Being looked into", fil: "Sinusuri", tone: "warn" },
  corrective_action: { label: "Partner is fixing it", fil: "Inaayos ng partner", tone: "warn" },
  resolved: { label: "Resolved", fil: "Naayos na", tone: "ok" },
  appealed: { label: "Appealed, waiting for the founder", fil: "Inapela", tone: "warn" },
  closed: { label: "Closed", fil: "Sarado na", tone: "info" },
} as const;
export type ComplaintStatus = keyof typeof COMPLAINT_STATUS;
/** The steps shown on the case page, in order. */
export const CASE_STEPS: ComplaintStatus[] = ["open", "investigating", "corrective_action", "resolved", "closed"];

export const CLOSE_REASONS = {
  resolved: "Resolved",
  withdrawn: "Withdrawn by the member",
  not_valid: "Not a valid complaint",
  duplicate: "Duplicate of another complaint",
  appeal_decided: "Appeal decided by the founder",
  other: "Other reason",
} as const;
export type CloseReason = keyof typeof CLOSE_REASONS;

/** The moves the national team can make from each status (the database checks the same list). */
export const TEAM_MOVES: Partial<Record<ComplaintStatus, ComplaintStatus[]>> = {
  open: ["investigating", "closed"],
  investigating: ["corrective_action", "resolved", "closed"],
  corrective_action: ["investigating", "resolved", "closed"],
  resolved: ["closed"],
  appealed: ["investigating", "closed"],
};
export const MOVE_LABEL: Record<ComplaintStatus, string> = {
  draft: "Back to draft", open: "Open", investigating: "Start looking into it", corrective_action: "Ask the partner to fix it",
  resolved: "Mark resolved", appealed: "Appeal", closed: "Close the case",
};
export const APPEAL_DAYS = 7;
export const RESPONSE_DAYS = 7;   // the partner's time to answer a proposed penalty or sanction

export const CONSENT_VERSION = "1.0";
export const COMPLAINT_CONSENT = {
  en: "I agree that FLAME PH may share this complaint, my name and my evidence with the partner and the national review team, only to look into it and fix it. The facts I gave are true. I understand that flameph.org does not collect or hold money: any refund or credit is handled by MarketplacePH Online Store or the partner.",
  tl: "Pumapayag akong ibahagi ng FLAME PH ang reklamong ito, ang pangalan ko at ang aking ebidensya sa partner at sa national review team para lang ito masuri at maayos. Totoo ang mga sinabi ko.",
} as const;
export const COMPLAINT_PRIVACY = "Only you, the partner and the FLAME PH national team see this complaint. Your email and phone number are not shown to the partner. Nothing is published.";

export type ComplaintRow = {
  id: string; ref_no: string; complainant_id: string | null; partner_user_id: string | null; partner_name: string; partner_category: string | null;
  order_reference: string | null; order_date: string | null; product_or_service: string | null; issue: Issue | null; description: string | null;
  desired_remedy: Remedy | null; remedy_note: string | null; affected_value: number | null; consent_at: string | null; severity: Severity;
  status: ComplaintStatus; close_reason: CloseReason | null; outcome_note: string | null; submitted_at: string | null; first_response_due_at: string | null;
  resolve_due_at: string | null; first_responded_at: string | null; resolved_at: string | null; appealed_at: string | null; appeal_by: "member" | "partner" | null;
  appeal_reason: string | null; closed_at: string | null; partner_response: string | null; partner_responded_at: string | null; created_at: string; updated_at: string;
};
export const COMPLAINT_COLS = "id, ref_no, complainant_id, partner_user_id, partner_name, partner_category, order_reference, order_date, product_or_service, issue, description, desired_remedy, remedy_note, affected_value, consent_at, severity, status, close_reason, outcome_note, submitted_at, first_response_due_at, resolve_due_at, first_responded_at, resolved_at, appealed_at, appeal_by, appeal_reason, closed_at, partner_response, partner_responded_at, created_at, updated_at";

/** What is still missing before a complaint can be sent. */
export function complaintMissing(c: Pick<ComplaintRow, "order_reference" | "issue" | "description" | "desired_remedy" | "remedy_note">): string[] {
  const m: string[] = [];
  if (!c.order_reference) m.push("Order or service reference number");
  if (!c.issue) m.push("What went wrong");
  if (!c.description) m.push("What happened, in your own words");
  if (!c.desired_remedy) m.push("What you would like to happen");
  if (c.desired_remedy === "other" && !c.remedy_note) m.push("Describe what you would like to happen");
  return m;
}

/** Is a due time passed (and the step not yet done)? */
export function overdue(c: Pick<ComplaintRow, "status" | "first_response_due_at" | "resolve_due_at">, now = Date.now()): "first_response" | "resolution" | null {
  if (c.status === "open" && c.first_response_due_at && Date.parse(c.first_response_due_at) < now) return "first_response";
  if (["open", "investigating", "corrective_action", "appealed"].includes(c.status) && c.resolve_due_at && Date.parse(c.resolve_due_at) < now) return "resolution";
  return null;
}
/** Can this side still appeal (within 7 days of the resolution, once)? */
export const canAppeal = (c: Pick<ComplaintRow, "status" | "resolved_at" | "appealed_at">, now = Date.now()) =>
  c.status === "resolved" && !c.appealed_at && !!c.resolved_at && now - Date.parse(c.resolved_at) <= APPEAL_DAYS * 86400_000;

export const EVIDENCE_TYPES = {
  evidence_photo: { label: "Photo of the problem", help: "The box, the damaged item, the label, the delivery." },
  receipt: { label: "Receipt, invoice or order screenshot", help: "Shows the order number, date and amount." },
  other: { label: "Other proof", help: "Chat messages, delivery tracking, a PDF." },
} as const;
export type EvidenceType = keyof typeof EVIDENCE_TYPES;
export const isEvidenceType = (v: unknown): v is EvidenceType => typeof v === "string" && v in EVIDENCE_TYPES;

// ------------------------------------------------------------------------------------------------------------------
// Corrective actions, penalties and sanctions
// ------------------------------------------------------------------------------------------------------------------
export const ACTION_KINDS = {
  replacement: "Replacement of missing or damaged goods",
  credit: "Credit on a next order",
  refund: "Refund",
  re_performance: "Re-performance of the service",
  proportionate_refund: "Proportionate refund (per the scope of work)",
  explanation: "Written explanation",
  process_fix: "Fix in the partner's process (packing, courier, staff)",
  other: "Other",
} as const;
export type ActionKind = keyof typeof ACTION_KINDS;
export const MONEY_ACTIONS: ActionKind[] = ["credit", "refund", "proportionate_refund"];
/** Which remedies fit which problem (shown as a hint to the national team). */
export const REMEDY_HINT: Record<Issue, ActionKind[]> = {
  late: ["explanation", "credit", "process_fix"],
  missing: ["replacement", "credit", "refund"],
  damaged: ["replacement", "credit", "refund"],
  defective: ["replacement", "refund", "process_fix"],
  unsatisfactory_service: ["re_performance", "proportionate_refund"],
  safety: ["refund", "process_fix", "explanation"],
  other: ["explanation", "other"],
};

export const ACTION_STATUS = {
  open: "Waiting for the partner",
  done_by_partner: "Partner says it is done (team to check)",
  verified: "Done and checked",
  not_done: "Not done",
  cancelled: "Cancelled",
} as const;
export type ActionStatus = keyof typeof ACTION_STATUS;

export const PENALTY_STATUS = {
  proposed: "Proposed (not final)",
  approved: "Approved, for MarketplacePH Online Store to settle",
  settled: "Settled by MarketplacePH Online Store",
  waived: "Waived",
  cancelled: "Cancelled",
} as const;
export type PenaltyStatus = keyof typeof PENALTY_STATUS;

/** Late goods: affected net (delayed) value x rate per day x days late, never more than the cap. Same as partner_late_penalty(). */
export function latePenalty(value: number, ratePerDay: number, days: number, capPct: number): number {
  const raw = (value * ratePerDay / 100) * days;
  const cap = (value * capPct) / 100;
  return Math.round(Math.min(raw, cap) * 100) / 100;
}
export const DEFAULT_TERMS = { ratePerDay: 0.5, capPct: 5 } as const;
export const PENALTY_RULES = [
  "Late goods, when the delay is the partner's fault: 0.5% of the net value of the delayed items for each day late, up to 5% (or the rate in the partner's signed agreement).",
  "Missing or damaged goods: replacement, credit or refund.",
  "Services not done well: do it again, or a refund in proportion to the scope of work.",
  "Every penalty is a proposal first. The partner can answer within 7 days. A second national team member approves it only after a legal review.",
] as const;

export const SANCTIONS = {
  warning: { label: "Warning", help: "A written warning. No change to the accreditation." },
  probation: { label: "Probation", help: "Watched closely until the end date. Another problem may lead to a hold." },
  hold: { label: "Hold", help: "Accreditation suspended until the end date or until lifted: no new offers, territories or rates." },
  downgrade: { label: "Downgrade", help: "Loses a Best Offer, an exclusive territory or a higher level, as written in the reason." },
  termination: { label: "Termination", help: "Accreditation ends. Only the founder approves. The partner may apply again later." },
} as const;
export type SanctionLevel = keyof typeof SANCTIONS;
export const SANCTION_STATUS = { proposed: "Proposed (the partner may answer)", active: "Active", lifted: "Lifted", cancelled: "Cancelled" } as const;
export type SanctionStatus = keyof typeof SANCTION_STATUS;

export const peso = (n: number | string | null | undefined) =>
  n === null || n === undefined || n === "" ? "—" : `₱${Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const when = (s: string | null | undefined) => (s ? new Date(s).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }) : "—");
export const day = (s: string | null | undefined) => (s ? new Date(s.length === 10 ? `${s}T00:00:00+08:00` : s).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" }) : "—");
/** Today in Manila, as YYYY-MM-DD. */
export const manilaToday = (now = Date.now()) => new Date(now + 8 * 3600_000).toISOString().slice(0, 10);
/** Money typed by a person: "1,250.50" → 1250.5. Blank → null. Not a number → NaN. */
export function parseAmount(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").replace(/[₱,\s]/g, "");
  if (!s) return null;
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(s)) return NaN;
  return Number(s);
}

// ------------------------------------------------------------------------------------------------------------------
// Messages after a step (?done=… / ?error=…)
// ------------------------------------------------------------------------------------------------------------------
export const CASE_DONE: Record<string, string> = {
  started: "Your complaint is started. Fill in the details; it saves as you go.",
  saved: "Saved.",
  sent: "Sent. The national team will reply by the time shown. You will get a message in your Inbox and by email.",
  uploaded: "File added.",
  deleted: "File removed.",
  note: "Your note was added to the case.",
  response: "Your response was added. The member and the national team can read it.",
  action_done: "Thank you. The national team will check it.",
  appealed: "Your appeal was sent. The founder decides appeals.",
  withdrawn: "The complaint was withdrawn.",
  removed: "The draft was deleted.",
  answered: "Your answer was recorded. The national team reads it before deciding.",
  sample_started: "Sample test started. Fill in the form; it saves as you go.",
  sample_sent: "Sample test sent to the national team. Thank you!",
};
export const CASE_ERRORS: Record<string, string> = {
  unavailable: "This part opens after the database update. Please try again later.",
  failed: "That didn't go through. Please try again.",
  locked: "This can no longer be changed.",
  missing: "Some answers are still missing. See the list.",
  consent: "Please tick the consent box to send.",
  partner: "Choose the partner from the list.",
  ref: "Type the order or service reference (2 to 120 characters).",
  date: "Check the date.",
  amount: "Type the amount in pesos, like 1250 or 1,250.50.",
  empty: "Choose a file first.",
  size: "That file is too big. The limit is 4 MB per file.",
  format: "Only PDF, JPG, PNG or WEBP files.",
  too_many: "This case already has the most files allowed.",
  total: "Your files have reached the 50 MB limit for your account.",
  doc_type: "Choose what kind of file it is.",
  note: "Write something first.",
  limit: "You have too many unsent drafts. Send or delete one first.",
  rate: "Too many tries. Please wait a few minutes.",
  appeal: "Appeals are allowed once, within 7 days of the resolution, with a reason.",
  self: "You can't send a complaint about your own business.",
  not_tester: "Only chapter testers and the national team record sample tests.",
  scores: "Choose a score from 1 to 5.",
  safety: "Describe the safety concern.",
};

/** Messages on the admin pages (?done=… / ?error=…; ?why= carries the database's plain-words refusal). */
export const ADMIN_CASE_MSG: Record<string, string> = {
  moved: "The case moved. Both sides were told.",
  details: "Saved.",
  note: "Note added.",
  note_err: "Write something first.",
  action: "Fix requested. The partner was told.",
  checked: "Fix updated.",
  penalty: "Penalty proposed. The partner was told and may answer within 7 days.",
  penalty_step: "Penalty updated.",
  sanction: "Sanction proposed. The partner was told and may answer.",
  sanction_step: "Sanction updated.",
  targets: "Response targets saved.",
  terms: "Penalty terms written. A second national team member makes them active.",
  terms_step: "Penalty terms updated.",
  reviewed: "Review saved.",
  own: "You can't act on a case, test or notice about your own business.",
  move: "That move is not allowed from this status.",
  founder: "Appeals are decided by the founder.",
  outcome: "Write the outcome before resolving.",
  close_reason: "Choose why the case is closed.",
  close_note: "Write the reason for closing.",
  severity: "Choose a severity.",
  note_empty: "Write something first.",
  action_bad: "Choose the kind of fix and describe it.",
  date: "Check the date (it can't be in the past).",
  amount: "Type the amount in pesos. Amounts go only on a credit, refund or partial refund.",
  penalty_bad: "Type the affected value and the basis (agreement clause, what happened).",
  penalty_late: "For a late-delivery penalty: days late, and tick that the delay was the partner's fault.",
  settle: "Type the MarketplacePH Online Store reference and the date it was settled.",
  sanction_bad: "Choose the partner, the level and write the reason.",
  terms_bad: "Check the rate (0.001 to 5% a day), the cap (up to 50%, not below the rate) and, for an agreement, the partner, contract number and date.",
  targets_bad: "Hours must be 1 to 720 and days 1 to 365.",
  missing: "Not found.",
  status: "That can't be done in this status.",
  op: "Unknown step.",
  failed: "That didn't go through.",
  db: "The database refused it:",
};
/** The flash line on an admin page. */
export function adminFlash(sp: { done?: string; error?: string; why?: string }): { tone: "ok" | "danger"; text: string } | null {
  if (sp.done) return { tone: "ok", text: ADMIN_CASE_MSG[sp.done] ?? "Done." };
  if (sp.error) return { tone: "danger", text: `${ADMIN_CASE_MSG[sp.error] ?? ADMIN_CASE_MSG.failed}${sp.why ? ` ${String(sp.why).slice(0, 200)}` : ""}` };
  return null;
}
