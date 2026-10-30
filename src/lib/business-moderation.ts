import "server-only";
import type { ModerationField } from "@/lib/business-moderation-feedback";

export type ModerationRisk = "low" | "needs_review" | "high";
export type ModerationSignal = { category: string; field: ModerationField; strong: boolean };
type Business = Record<string, unknown>;

const value = (input: unknown) => typeof input === "string" ? input.trim() : "";
export const normalizeBusinessText = (input: unknown) => value(input).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "");
const linksIn = (input: string) => input.match(/(?:https?:\/\/|www\.)/gi)?.length ?? 0;
const repeatedCharacters = (input: string) => /([a-z0-9])\1{4,}/i.test(input);
const keyboardOrTestText = (input: string) => /(?:^|\b)(?:qwerty|asdf(?:gh)?|zxcv(?:bn)?|lorem\s*ipsum|dummy|sample|test(?:ing)?\s*(?:business|store|shop)?|xxx+)(?:\b|$)/i.test(input);
const urlOnlyName = (input: string) => /^(?:https?:\/\/|www\.)\S+$/i.test(input);
const randomMixedToken = (input: string) => {
  const token = input.trim();
  if (/\s/.test(token)) return false;
  return token.length >= 14 && /^[A-Za-z]+$/.test(token) && /[a-z]/.test(token) && /[A-Z]/.test(token);
};
const consonantHeavy = (input: string) => {
  const letters = input.toLowerCase().replace(/[^a-z]/g, "");
  if (letters.length < 12) return false;
  const vowels = letters.match(/[aeiou]/g)?.length ?? 0;
  return vowels / letters.length < 0.18 || /[bcdfghjklmnpqrstvwxyz]{7,}/i.test(letters);
};
const lowWordDiversity = (input: string) => {
  const words = input.toLowerCase().match(/[a-z0-9]{2,}/g) ?? [];
  return words.length >= 10 && new Set(words).size <= 2;
};
const fakeContact = (business: Business) => {
  const phone = value(business.contact_phone || business.contact_viber).replace(/\D/g, "");
  const email = value(business.contact_email).toLowerCase();
  return (phone.length >= 7 && (/^(\d)\1+$/.test(phone) || /1234567|9876543/.test(phone)))
    || /^(?:test|fake|dummy|asdf)@|@example\.(?:com|org|net)$/i.test(email);
};

export function moderateBusinessContent(business: Business, context: { others: Business[]; recentSubmissions: number }) {
  const signals: ModerationSignal[] = [];
  const add = (category: string, field: ModerationField, strong = false) => signals.push({ category, field, strong });
  const name = value(business.name);
  const description = value(business.description);
  const products = value(business.products);

  if (randomMixedToken(name) || consonantHeavy(name)) add("random_business_name", "business_name", true);
  if (keyboardOrTestText(name)) add("test_or_keyboard_name", "business_name", true);
  if (repeatedCharacters(name)) add("repeated_name_characters", "business_name", true);
  if (urlOnlyName(name)) add("url_used_as_name", "business_name", true);

  const descriptionRandom = randomMixedToken(description) || consonantHeavy(description);
  const descriptionMeaningless = keyboardOrTestText(description) || repeatedCharacters(description) || lowWordDiversity(description) || descriptionRandom;
  if (description.length < 80) add("description_too_short", "description");
  if (descriptionMeaningless) add("meaningless_description", "description", true);
  if (keyboardOrTestText(products) || repeatedCharacters(products)) add("suspicious_product_text", "description", true);

  const linkCount = linksIn(`${name} ${description} ${products}`);
  if (linkCount > 3) add("excessive_links", "profile", linkCount > 6);
  if (/\b(?:viagra|porn|free\s+crypto|guaranteed\s+money|casino\s+bonus)\b/i.test(`${name} ${description} ${products}`)) add("spam_terms", "profile", true);
  if (fakeContact(business)) add("invalid_contact_pattern", "contact", true);
  if (context.recentSubmissions >= 2) add("rapid_resubmission", "profile");

  const normalizedName = normalizeBusinessText(name);
  const normalizedDescription = normalizeBusinessText(description);
  const contacts = [business.contact_email, business.contact_phone, business.contact_messenger, business.website_url, business.facebook_url]
    .map(normalizeBusinessText).filter(Boolean);
  let duplicateName = false;
  let duplicateDescription = false;
  let duplicateContact = false;
  for (const other of context.others) {
    duplicateName ||= normalizedName.length >= 3 && normalizeBusinessText(other.name) === normalizedName;
    duplicateDescription ||= normalizedDescription.length >= 80 && normalizeBusinessText(other.description) === normalizedDescription;
    const otherContacts = [other.contact_email, other.contact_phone, other.contact_messenger, other.website_url, other.facebook_url]
      .map(normalizeBusinessText).filter(Boolean);
    duplicateContact ||= contacts.some((contact) => otherContacts.includes(contact));
  }
  if (duplicateName) add("duplicate_business_name", "business_name");
  if (duplicateDescription) add("duplicate_description", "description", true);
  if (duplicateContact) add("duplicate_contact", "contact");

  const strongFields = new Set(signals.filter((signal) => signal.strong).map((signal) => signal.field));
  const nameStrong = signals.some((signal) => signal.strong && signal.field === "business_name");
  const descriptionStrong = signals.some((signal) => signal.strong && signal.field === "description");
  const duplicateSignals = [duplicateName, duplicateDescription, duplicateContact].filter(Boolean).length;
  const high = (nameStrong && descriptionStrong)
    || strongFields.size >= 3
    || (duplicateSignals >= 2 && (nameStrong || descriptionStrong));
  const riskLevel: ModerationRisk = high ? "high" : signals.length ? "needs_review" : "low";
  const suspiciousFields = [...new Set(signals.map((signal) => signal.field))];
  return { riskLevel, signals, reasonCategories: [...new Set(signals.map((signal) => signal.category))], suspiciousFields };
}
