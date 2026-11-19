// Group Order (bottom tab 1). Pure rules shared by the Group Order pages, their actions and the tests.
// The database (0024_group_orders.sql) enforces the same limits. Members pay the supplier directly: no money passes through FLAME PH.

import { RECORD_ERRORS } from "@/lib/records";

export const GO_TITLE_MAX = 120;
export const GO_DETAILS_MAX = 1000;
export const GO_MAX_DAYS = 60;
export const GO_MAX_TARGET = 500;
export const GO_MAX_QTY = 10000;

export type GroupOrder = {
  id: string; title: string; supplier: string | null; description: string | null; unit: string | null; deal_price: number | null;
  target_members: number; deadline: string | null; status: string; created_by: string | null; min_quantity: number | null;
  category: string | null; supplier_id: string | null; request_id: string | null; sent_at: string | null; created_at: string;
};
export type Progress = { deal_id: string; members: number; quantity: number; request_status: string | null; quotes: number; record_id: string | null; record_status: string | null };

export type Stage = "open" | "deadline_passed" | "sent" | "quoted" | "accepted" | "confirmed" | "closed";

/** Manila's date today, as YYYY-MM-DD. */
export const manilaToday = (now = Date.now()) => new Date(now + 8 * 3600000).toISOString().slice(0, 10);

/** Whole days left until the deadline (0 on the deadline day, negative after). */
export function daysLeft(deadline: string | null, now = Date.now()) {
  if (!deadline) return null;
  return Math.round((Date.parse(`${deadline}T00:00:00Z`) - Date.parse(`${manilaToday(now)}T00:00:00Z`)) / 86400000);
}

/** Where a group order stands, from the deal and the status of its bulk request and record. */
export function stage(d: Pick<GroupOrder, "status" | "sent_at" | "deadline">, p?: Pick<Progress, "request_status" | "quotes" | "record_status"> | null, now = Date.now()): Stage {
  if (p?.record_status === "confirmed") return "confirmed";
  if (d.status === "closed") return "closed";
  if (d.sent_at) {
    if (p?.request_status === "accepted" || p?.record_status) return "accepted";
    if ((p?.quotes ?? 0) > 0) return "quoted";
    return "sent";
  }
  const left = daysLeft(d.deadline, now);
  return left !== null && left < 0 ? "deadline_passed" : "open";
}

export const STAGE_TEXT: Record<Stage, string> = {
  open: "Open: members can join",
  deadline_passed: "Joining closed: the deadline has passed",
  sent: "Sent to the supplier: waiting for their terms",
  quoted: "The supplier sent terms",
  accepted: "The organizer accepted the supplier's terms",
  confirmed: "Confirmed as a record",
  closed: "Closed by the organizer",
};

/** Members can join only while it is open (before the deadline and before it is sent to the supplier). */
export const canJoin = (s: Stage) => s === "open";

/** The organizer can send the bulk request once the minimum quantity is reached (or there is no minimum). */
export const minimumReached = (quantity: number, min: number | null) => quantity >= (min ?? 1);

export const pct = (n: number, of: number) => (of > 0 ? Math.min(100, Math.round((n / of) * 100)) : 0);

/** Form values for a new group order, cleaned. Null fields are rejected (the page shows the error). */
export function parseStart(get: (k: string) => string, today = manilaToday()) {
  const int = (v: string) => (/^\d{1,7}$/.test(v.trim()) ? Number(v.trim()) : NaN);
  const title = get("title").trim().slice(0, GO_TITLE_MAX);
  const deadline = /^\d{4}-\d{2}-\d{2}$/.test(get("deadline")) ? get("deadline") : "";
  const target = int(get("target_members"));
  const minRaw = get("min_quantity").trim();
  const min = minRaw ? int(minRaw) : null;
  const qty = int(get("quantity") || "1");
  const priceRaw = get("price").replace(/[,₱\s]|php/gi, "");
  const price = priceRaw ? (/^\d{1,8}(\.\d{1,2})?$/.test(priceRaw) ? Number(priceRaw) : NaN) : null;
  const left = deadline ? daysLeft(deadline, Date.parse(`${today}T04:00:00Z`)) : null;
  const errors: string[] = [];
  if (title.length < 3) errors.push("bad_input");
  if (!deadline || left === null || left < 1 || left > GO_MAX_DAYS) errors.push("bad_deadline");
  if (!Number.isInteger(target) || target < 2 || target > GO_MAX_TARGET) errors.push("bad_target");
  if (min !== null && (!Number.isInteger(min) || min < 1 || min > 100000)) errors.push("bad_minimum");
  if (!Number.isInteger(qty) || qty < 1 || qty > GO_MAX_QTY) errors.push("bad_quantity");
  if (Number.isNaN(price as number)) errors.push("bad_amount");
  return {
    errors,
    value: {
      p_title: title, p_description: get("description").trim().slice(0, GO_DETAILS_MAX) || null, p_category: get("category").trim(),
      p_unit: get("unit").trim().slice(0, 30) || null, p_price: price, p_target: target, p_min_qty: min, p_deadline: deadline,
      p_supplier: get("supplier").trim().slice(0, 120) || null, p_quantity: qty,
    },
  };
}

export const GROUP_ORDER_ERRORS: Record<string, string> = {
  new_account_group_order: "You can start a group order once your account is 7 days old. You can join other members' group orders now.",
  ...RECORD_ERRORS,
  bad_input: "Please write what you want to buy (3 to 120 characters) and choose a category.",
  bad_deadline: `Choose a deadline from tomorrow up to ${GO_MAX_DAYS} days from today.`,
  bad_target: `Set a goal of 2 to ${GO_MAX_TARGET} members.`,
  bad_minimum: "The minimum quantity must be a whole number from 1 to 100,000, or leave it empty.",
  bad_quantity: `Your own quantity must be from 1 to ${GO_MAX_QTY.toLocaleString("en-PH")}.`,
  bad_amount: "Type the price in pesos, for example 150 or 1,500.50, or leave it empty.",
  bad_date: "Choose a needed-by date from today up to 6 months from now, or leave it empty.",
  group_order_limit: "You already have 3 open group orders (or started 5 today). Send or close one first.",
  below_minimum: "The minimum quantity isn't reached yet. Invite more members, or lower the minimum when you start a new one.",
  already_sent: "This group order was already sent to the supplier or closed.",
  not_found: "We couldn't find that group order, or you're not its organizer.",
  unavailable: "Starting group orders opens after FLAME PH finishes a database update. Please try again later.",
};
export const groupOrderError = (code?: string | null) => (code ? GROUP_ORDER_ERRORS[code] ?? GROUP_ORDER_ERRORS.failed : null);

/** The error code in a database message (longest first, so "blocked_words" is not read as "blocked"). */
export const groupOrderErrorCode = (message?: string | null) => {
  const m = message ?? "";
  return Object.keys(GROUP_ORDER_ERRORS).sort((a, b) => b.length - a.length).find((k) => m.includes(k))
    ?? (/schema cache|does not exist|function public\.|Could not find|column/.test(m) ? "unavailable" : "failed");
};
