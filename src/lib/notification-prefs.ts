// Notification choices, per type and per channel. Shared by Settings, the server notifier, the unsubscribe page and tests.
// The database table is notification_prefs (0021; records_* added in 0022). No row means the defaults below.
// The weekly email ("digest") keeps using the existing "News and offers" consent (switch 5), as before.

export const NOTIFY_TYPES = {
  messages: { label: "Messages from members", help: "When a member sends you a message." },
  leads: { label: "Leads and inquiries", help: "When a buyer sends an inquiry from your listing or mini-website." },
  quotes: { label: "Quote requests", help: "When a buyer asks your business for a quote." },
  requests: { label: "Friend requests", help: "When a member asks to be your Friend." },
  records: { label: "Requests, quotes and records", help: "When a member sends you a request or a quote, accepts your quote, confirms or disputes a record." },
} as const;
export type NotifyType = keyof typeof NOTIFY_TYPES;
export const NOTIFY_KEYS = Object.keys(NOTIFY_TYPES) as NotifyType[];
export const isNotifyType = (v: unknown): v is NotifyType => typeof v === "string" && v in NOTIFY_TYPES;

export type Channel = "push" | "email";
export type Prefs = Record<`${NotifyType}_${Channel}`, boolean>;

/** Same defaults as the database. Email for Friend requests is off unless the member turns it on. */
export const DEFAULT_PREFS: Prefs = {
  messages_push: true, messages_email: true,
  leads_push: true, leads_email: true,
  quotes_push: true, quotes_email: true,
  requests_push: true, requests_email: false,
  records_push: true, records_email: true,
};
export const PREF_COLUMNS = Object.keys(DEFAULT_PREFS) as (keyof Prefs)[];

/** The member's saved row merged over the defaults. */
export function mergePrefs(row: Partial<Record<string, unknown>> | null | undefined): Prefs {
  const out = { ...DEFAULT_PREFS };
  for (const k of PREF_COLUMNS) if (typeof row?.[k] === "boolean") out[k] = row[k] as boolean;
  return out;
}

/** What one email can be unsubscribed from: a type, the weekly email, or every FLAME PH email. */
export const UNSUB_TOPICS = { ...Object.fromEntries(NOTIFY_KEYS.map((k) => [k, NOTIFY_TYPES[k].label])), digest: "The weekly FLAME PH email", all: "All FLAME PH emails" } as Record<NotifyType | "digest" | "all", string>;
export type UnsubTopic = keyof typeof UNSUB_TOPICS;
export const isUnsubTopic = (v: unknown): v is UnsubTopic => typeof v === "string" && v in UNSUB_TOPICS;

/** The columns an unsubscribe turns off (the weekly email is handled through the consent log instead). */
export function columnsOff(topic: UnsubTopic): (keyof Prefs)[] {
  if (topic === "all") return NOTIFY_KEYS.map((k) => `${k}_email` as keyof Prefs);
  if (topic === "digest") return [];
  return [`${topic}_email` as keyof Prefs];
}
