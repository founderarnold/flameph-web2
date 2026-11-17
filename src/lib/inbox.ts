// Business inbox: how leads and quote requests are told apart. Shared by the inbox, the Leads page and the tests.
// Quote requests have kind = 'quote' (0021). Before that database update they are saved as inquiries whose text
// starts with "[Quote request]", so both are recognised.

export type InquiryKind = "inquiry" | "quote";
export const QUOTE_PREFIX = "[Quote request] ";
export const inquiryKind = (q: { kind?: string | null; message?: string | null }): InquiryKind =>
  q.kind === "quote" || (q.message ?? "").startsWith(QUOTE_PREFIX) ? "quote" : "inquiry";
export const KIND_LABEL: Record<InquiryKind, string> = { inquiry: "Inquiry", quote: "Quote request" };
