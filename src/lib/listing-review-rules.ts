// Automatic directory check (no database or network here, so it can be tested on its own).
//
// Owner's rule (25 Nov 2026): a member's listing goes on the public business directory automatically. A mini website
// and verification documents are optional (documents only earn the Verified badge). A listing waits for an admin ONLY
// when the member's email is not real or not confirmed, or their personal or business details look unusual or
// unreadable (random letters, test text, spam, odd characters). Older listings the 2026 safety check marked as
// suspicious, and listings an admin hid, rejected or held, never publish on their own.

export type ReviewSignal = { code: string; hold: boolean };

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

// Same patterns as src/lib/business-moderation.ts, for a person's name and place.
const repeated = (s: string) => /([\p{L}\p{N}])\1{3,}/iu.test(s);
const keyboardOrTest = (s: string) => /(?:^|\b)(?:qwerty|asdf(?:gh)?|zxcv(?:bn)?|lorem\s*ipsum|dummy|sample|test(?:ing)?|xxx+|fake|n\/?a|none|null|undefined)(?:\b|$)/i.test(s);
const consonantHeavy = (s: string, min = 8) => {
  const letters = s.toLowerCase().replace(/[^a-z]/g, "");
  if (letters.length < min) return false;
  const vowels = letters.match(/[aeiouy]/g)?.length ?? 0;
  return vowels / letters.length < 0.15 || /[bcdfghjklmnpqrstvwxz]{6,}/.test(letters);
};
const randomMixedCase = (s: string) => s.split(/\s+/).some((w) => w.length >= 8 && /^[A-Za-z]+$/.test(w) && (w.slice(1).match(/[A-Z]/g)?.length ?? 0) >= 3);
/** Characters a real name or place does not use: emoji, symbols, long runs of punctuation. */
const oddCharacters = (s: string, allowed: RegExp) => {
  const chars = [...s];
  if (!chars.length) return false;
  const odd = chars.filter((c) => !allowed.test(c)).length;
  return odd >= 3 || odd / chars.length > 0.15;
};
const PERSON_OK = /[\p{L}\p{M}\s.'’,-]/u;
const BUSINESS_OK = /[\p{L}\p{M}\p{N}\s.'’,&()\/+!#:;@-]/u;

/** Checks the member's own profile (personal details). */
export function personSignals(p: { full_name?: unknown; city?: unknown; mobile?: unknown }): ReviewSignal[] {
  const out: ReviewSignal[] = [];
  const name = text(p.full_name);
  if (name.length < 2) out.push({ code: "owner_name_missing", hold: true });
  else {
    if (/\d/.test(name) || /https?:|www\./i.test(name)) out.push({ code: "owner_name_odd_characters", hold: true });
    else if (oddCharacters(name, PERSON_OK)) out.push({ code: "owner_name_odd_characters", hold: true });
    if (keyboardOrTest(name) || repeated(name) || consonantHeavy(name) || randomMixedCase(name)) out.push({ code: "owner_name_unreadable", hold: true });
  }
  const city = text(p.city);
  if (city && (keyboardOrTest(city) || repeated(city) || consonantHeavy(city, 10))) out.push({ code: "owner_place_unreadable", hold: true });
  const mobile = text(p.mobile).replace(/\D/g, "");
  if (mobile.length >= 7 && (/(\d)\1{6,}/.test(mobile) || /1234567|9876543/.test(mobile))) out.push({ code: "owner_mobile_fake", hold: true });
  return out;
}

/** Extra business checks on top of moderateBusinessContent: odd characters and unreadable place names. */
export function businessExtraSignals(b: { name?: unknown; city?: unknown; sector?: unknown; province?: unknown }): ReviewSignal[] {
  const out: ReviewSignal[] = [];
  if (oddCharacters(text(b.name), BUSINESS_OK)) out.push({ code: "business_name_odd_characters", hold: true });
  const city = text(b.city);
  if (city && (keyboardOrTest(city) || repeated(city) || consonantHeavy(city, 10) || oddCharacters(city, PERSON_OK))) out.push({ code: "business_place_unreadable", hold: true });
  const missing = [!text(b.name) && "business name", !text(b.sector) && "category", !text(b.city) && "city", !text(b.province) && "province"].filter(Boolean);
  if (missing.length) out.push({ code: `missing_basics:${missing.join("|")}`, hold: true });
  return out;
}

// Throwaway inbox services. Short list of the common ones; a domain that cannot receive mail is caught by the mail check.
export const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "yopmail.com", "guerrillamail.com", "guerrillamail.net", "sharklasers.com", "10minutemail.com", "10minutemail.net",
  "temp-mail.org", "tempmail.com", "tempmail.net", "tempmailo.com", "temp-mail.io", "trashmail.com", "getnada.com", "nada.email",
  "maildrop.cc", "dispostable.com", "throwawaymail.com", "fakeinbox.com", "mohmal.com", "emailondeck.com", "mintemail.com",
  "burnermail.io", "tempail.com", "mailnesia.com", "spamgourmet.com", "mytemp.email", "moakt.com", "emailfake.com", "fakemail.net",
]);

/** Checks the member's sign-in email. `domainAcceptsMail` is null when the mail check could not run (then it is ignored). */
export function emailSignals(e: { email?: string | null; confirmed: boolean; domainAcceptsMail: boolean | null }): ReviewSignal[] {
  const out: ReviewSignal[] = [];
  const email = text(e.email).toLowerCase();
  const domain = email.split("@")[1] ?? "";
  if (!email || !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) out.push({ code: "email_invalid", hold: true });
  else {
    if (/^(?:test|fake|dummy|asdf|qwerty|sample|noreply|no-reply)\d*@/.test(email) || /@(?:example|test|invalid|localhost)\.[a-z.]+$/.test(email)) out.push({ code: "email_fake_pattern", hold: true });
    if (DISPOSABLE_DOMAINS.has(domain)) out.push({ code: "email_disposable", hold: true });
    if (e.domainAcceptsMail === false) out.push({ code: "email_domain_dead", hold: true });
  }
  if (!e.confirmed) out.push({ code: "email_not_verified", hold: true });
  return out;
}

/** Content codes from moderateBusinessContent that only note something and never hold a listing (same rule as 0041). */
export const NOTE_ONLY = new Set(["description_too_short", "duplicate_contact", "excessive_links", "rapid_resubmission"]);

/** Admin decisions in audit_log that keep a listing off the directory until an admin changes it. */
export const ADMIN_HOLD_ACTIONS = new Set(["business_hide", "business_keep_quarantined", "business_reject", "business_suspend", "business_ban_owner", "business_unpublish"]);
export const ADMIN_RELEASE_ACTIONS = new Set(["business_restore", "business_approve_legitimate", "business_request_correction"]);

export type ReviewInput = {
  lifecycle: string;
  ownerActive: boolean;
  legacyState: "none" | "pending" | "cleared" | "confirmed";
  legacyClass?: string | null;
  lastAdminAction: string | null;
  content: { riskLevel: "low" | "needs_review" | "high"; reasonCategories: string[]; signals: { category: string; strong: boolean }[] };
  extra: ReviewSignal[];
};

export type ReviewDecision = {
  outcome: "publish" | "hold" | "high" | "skip";
  riskLevel: "low" | "needs_review" | "high";
  codes: string[];      // every finding, stored on the listing so admins see why
  holdCodes: string[];  // the findings that keep it waiting
};

export function decide(i: ReviewInput): ReviewDecision {
  const contentHolds = i.content.signals.filter((s) => s.strong || s.category === "duplicate_business_name").map((s) => s.category);
  const codes = [...new Set([...i.content.reasonCategories, ...i.extra.map((s) => s.code)])];
  const holdCodes = [...new Set([...contentHolds, ...i.extra.filter((s) => s.hold).map((s) => s.code)])];
  if (i.legacyState === "pending" || i.legacyState === "confirmed") holdCodes.push(i.legacyClass === "obviously_suspicious" ? "legacy_high_suspicion" : "legacy_review");
  if (i.lastAdminAction && ADMIN_HOLD_ACTIONS.has(i.lastAdminAction)) holdCodes.push("admin_hold");
  if (!i.ownerActive) holdCodes.push("owner_not_active");
  for (const c of holdCodes) if (!codes.includes(c)) codes.push(c);
  // Decisions only an admin can undo: never touched by the automatic check.
  if (["rejected", "suspended"].includes(i.lifecycle) || holdCodes.includes("admin_hold") || holdCodes.includes("owner_not_active") || holdCodes.some((c) => c.startsWith("legacy_"))) {
    return { outcome: "skip", riskLevel: i.content.riskLevel, codes, holdCodes };
  }
  if (i.content.riskLevel === "high") return { outcome: "high", riskLevel: "high", codes, holdCodes };
  // An admin already approved this listing: the findings stay visible as notes, only "high" can take it down again.
  if (i.lastAdminAction === "business_approve_legitimate" || i.lastAdminAction === "business_restore") return { outcome: "publish", riskLevel: "low", codes, holdCodes: [] };
  if (holdCodes.length) return { outcome: "hold", riskLevel: "needs_review", codes, holdCodes };
  return { outcome: "publish", riskLevel: "low", codes, holdCodes };
}

/** Plain-language reason for each code, for the admin page. */
const LABELS: Record<string, string> = {
  email_not_verified: "Email not confirmed yet: the member has not clicked the link in the confirmation email.",
  email_invalid: "The email address is not a valid address.",
  email_fake_pattern: "The email address looks made up (for example test@… or …@example.com).",
  email_disposable: "The email is from a throwaway inbox service, so it may not be a real contact.",
  email_domain_dead: "The email's domain cannot receive mail, so the address is probably not real.",
  owner_name_missing: "The member has no real name on their profile.",
  owner_name_odd_characters: "The member's name has numbers, links or unusual symbols.",
  owner_name_unreadable: "The member's name looks like random letters or test text.",
  owner_place_unreadable: "The member's city looks like random letters or test text.",
  owner_mobile_fake: "The member's mobile number looks fake (for example 1234567 or all the same digit).",
  business_name_odd_characters: "The business name has many unusual symbols or emoji.",
  business_place_unreadable: "The business city looks like random letters or test text.",
  random_business_name: "The business name looks like random letters.",
  test_or_keyboard_name: "The business name looks like test or keyboard text (for example 'test' or 'asdf').",
  repeated_name_characters: "The business name repeats the same letter many times.",
  url_used_as_name: "A web address was used as the business name.",
  meaningless_description: "The description is not readable (random letters, repeated words or test text).",
  suspicious_product_text: "The products text looks like test or random text.",
  spam_terms: "Spam words were found (for example casino, free crypto, adult content).",
  invalid_contact_pattern: "The listing's phone or email looks fake.",
  duplicate_business_name: "Another listing already uses this business name (possible copy or impersonation).",
  duplicate_description: "The description is copied word for word from another listing.",
  description_too_short: "Note only: the description is short (under 80 characters).",
  duplicate_contact: "Note only: the same contact is used by another listing.",
  excessive_links: "Note only: the listing has many web links.",
  rapid_resubmission: "Note only: saved several times within a few minutes.",
  legacy_high_suspicion: "Older listing that the safety check marked as high suspicion. It stays here until an admin decides.",
  legacy_review: "Older listing from before the safety check. It stays here until an admin decides.",
  admin_hold: "An admin hid, rejected or held this listing before, so it only goes public when an admin restores it.",
  owner_not_active: "The member's account is suspended or closed.",
  // Older listings (safety check of 30 Oct 2026, business_legacy_assessments.reason_codes)
  random_name_token: "Business name looks like random letters.",
  random_description_token: "Description looks like random letters.",
  random_products_token: "Products text looks like random letters.",
  missing_core_fields: "Basic details are missing.",
  possible_duplicate_name: "Another listing has the same name.",
  no_contact_channel: "No way for customers to contact them.",
  no_media: "Note only: no photo or logo.",
};

export function reasonLabel(code: string): string {
  if (code.startsWith("missing_basics:")) return `Missing basic details: ${code.slice(15).split("|").join(", ")}.`;
  return LABELS[code] ?? code.replace(/_/g, " ");
}

export const isNoteOnly = (code: string) => NOTE_ONLY.has(code) || code === "no_media";
