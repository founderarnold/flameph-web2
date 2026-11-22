// Phase 12: how long FLAME PH keeps each kind of data (Privacy Notice, section 5).
// The database enforces the same periods every day (supabase/migrations/0028_privacy_security.sql: retention_rules()
// and privacy_retention_run()). A test keeps the two lists the same. Change both together.

export type RetentionRule = { key: string; what: string; keep: string; days: number; how: string };

export const RETENTION: RetentionRule[] = [
  { key: "account", what: "Your account and profile", keep: "while your account is open, then 1 year after you close it", days: 365, how: "Erased 1 year after closing, or sooner if you ask us to erase it." },
  { key: "ai_chats", what: "Ka-FLAME AI chats and feedback", keep: "1 year", days: 365, how: "You can delete them any time in My account → FLAME AI." },
  { key: "moderation_cases", what: "Moderation cases (reports, actions, appeals)", keep: "3 years after the case closes", days: 1095, how: "Open cases are kept until they close." },
  { key: "vetting_documents", what: "Business vetting documents", keep: "until vetting is decided, plus 1 year", days: 365, how: "Deleted at once if you turn off switch 4." },
  { key: "partner_documents", what: "Partner application documents and Best Offer files", keep: "while you are an accredited partner; 1 year after an application is not approved, or an offer is not chosen, or either is withdrawn", days: 365, how: "Deleted by the same daily job as vetting documents." },
  { key: "records_unconfirmed", what: "Transaction records never confirmed", keep: "180 days", days: 180, how: "" },
  { key: "records_closed", what: "Cancelled or voided transaction records", keep: "1 year", days: 365, how: "Confirmed records stay while both accounts are open, because they make up each member's badge." },
  { key: "messages", what: "Private messages", keep: "2 years after the last message in the conversation", days: 730, how: "Messages under an open moderation report are kept until the case closes." },
  { key: "notifications", what: "In-app notices", keep: "1 year", days: 365, how: "" },
  { key: "audit_log", what: "Audit log of admin and privacy actions", keep: "3 years", days: 1095, how: "Nobody can edit it." },
  { key: "vetting_access_log", what: "Log of who opened vetting documents", keep: "3 years", days: 1095, how: "" },
  { key: "ecosystem_access_log", what: "Log of data sent to MarketplacePH and NegosyoDepot", keep: "1 year", days: 365, how: "You can ask us for your part of it." },
  { key: "security_signals", what: "Automatic security alerts", keep: "1 year", days: 365, how: "Alerts linked to an incident are kept with the incident." },
  { key: "rate_limits", what: "Rate-limit counters (hashed, no IP address)", keep: "7 days", days: 7, how: "" },
  { key: "form_messages", what: "Messages sent through our forms", keep: "2 years", days: 730, how: "" },
  { key: "newsletter_pending", what: "Newsletter sign-ups never confirmed", keep: "30 days", days: 30, how: "" },
  { key: "privacy_requests", what: "Your privacy requests and our answers", keep: "3 years after we close them", days: 1095, how: "Kept as proof of what we did, even after an erasure." },
  { key: "retention_runs", what: "Reports of these clean-ups", keep: "1 year", days: 365, how: "" },
  { key: "site_errors", what: "Anonymous error reports (page and message only)", keep: "90 days", days: 90, how: "No name, account or IP address is kept." },
  { key: "web_vitals", what: "Anonymous page-speed readings", keep: "30 days", days: 30, how: "No name, account or IP address is kept." },
];

/** Enforced by release_monitor_cleanup() (supabase/migrations/0030_release_monitor.sql), run by the same daily job. */
export const MONITOR_RETENTION_KEYS = ["site_errors", "web_vitals"];

/** Rules the daily database job enforces (the others are enforced by the account erasure and vetting jobs). */
export const DB_RETENTION_KEYS = RETENTION.map((r) => r.key).filter((k) => !["account", "vetting_documents", "partner_documents", ...MONITOR_RETENTION_KEYS].includes(k));
