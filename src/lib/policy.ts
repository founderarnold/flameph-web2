// The live policy set and the consent switches (Legal Pack v1.0, Parts A–D).
// To publish a new version: change POLICY_VERSION and POLICY_EFFECTIVE. Existing members are then asked again on next sign-in.

export const POLICY_VERSION = "1.0";
/** ISO date the current version takes effect (Asia/Manila). */
export const POLICY_EFFECTIVE = "2026-11-17";
export const POLICY_EFFECTIVE_LABEL = "17 November 2026";

export const POLICY_PAGES = {
  terms: { title: "Terms of Use", href: "/legal/terms" },
  guidelines: { title: "Community Guidelines", href: "/membership/terms" },
  privacy: { title: "Privacy Notice and Data-Sharing Consent", href: "/legal/privacy" },
} as const;

export type ConsentKey = "terms" | "records" | "ecosystem_badge" | "vetting" | "marketing";
export type ConsentSource = "signup" | "prompt" | "settings";

export type ConsentDef = { key: ConsentKey; n: number; title: string; en: string; tl: string; required: boolean };

/** Each switch is shown separately and is off by default. Only "terms" is needed to create an account. */
export const CONSENTS: ConsentDef[] = [
  {
    key: "terms", n: 1, required: true, title: "Terms, Guidelines and Privacy",
    en: `I have read and accept the Terms of Use, the Community Guidelines and the Privacy Notice (version ${POLICY_VERSION}).`,
    tl: `Tinatanggap ko ang Terms of Use, Community Guidelines at Privacy Notice (version ${POLICY_VERSION}).`,
  },
  {
    key: "records", n: 2, required: false, title: "Transaction records",
    en: "Allow me to create and confirm transaction records with other members, and show my confirmed record count on my profile.",
    tl: "Payagan akong gumawa at mag-confirm ng transaction records kasama ang ibang member, at ipakita ang bilang ng confirmed records sa profile ko.",
  },
  {
    key: "ecosystem_badge", n: 3, required: false, title: "Badge across the ecosystem",
    en: "Share my verified status, badge level, confirmed record count and category mix, and account creation date with marketplaceph.com and negosyodepot.com, so my badge shows there. Turning this off removes my badge from those sites within 15 minutes.",
    tl: "Ibahagi sa marketplaceph.com at negosyodepot.com ang verified status, badge level, bilang at uri ng confirmed records, at petsa ng pagkakagawa ng account ko, para lumabas doon ang badge ko. Kapag pinatay ito, aalisin ang badge ko sa mga site na iyon sa loob ng 15 minuto.",
  },
  {
    key: "vetting", n: 4, required: false, title: "Business vetting",
    en: "Let FLAME PH review the business documents I upload, to vet my business. They are kept private and never shared with other sites or members.",
    tl: "Payagan ang FLAME PH na suriin ang business documents na ia-upload ko. Pribado ang mga ito at hindi ibinabahagi sa ibang site o member.",
  },
  {
    key: "marketing", n: 5, required: false, title: "News and offers",
    en: "Send me news, opportunities and offers from FLAME PH by email or push.",
    tl: "Padalhan ako ng balita, oportunidad at alok mula sa FLAME PH sa email o push.",
  },
];

export const CONSENT_KEYS = CONSENTS.map((c) => c.key);
export const OPTIONAL_KEYS = CONSENTS.filter((c) => !c.required).map((c) => c.key);

export type ConsentState = Partial<Record<ConsentKey, { granted: boolean; version: string; at: string }>>;

/** True when the member has accepted the current Terms, Guidelines and Privacy Notice. */
export const hasCurrentTerms = (s: ConsentState) => s.terms?.granted === true && s.terms.version === POLICY_VERSION;

/** Reads "c_<key>=1" style choices (sign-up form, OAuth return link, Settings form). Missing means off. */
export function choicesFrom(get: (name: string) => string | null | undefined): Record<ConsentKey, boolean> {
  return Object.fromEntries(CONSENT_KEYS.map((k) => [k, get(`c_${k}`) === "1"])) as Record<ConsentKey, boolean>;
}

/**
 * Chapter Builder Non-Disclosure and Non-Compete Agreement (page: /legal/chapter-builder-agreement).
 * Every Chapter Builder and Meetup Venue application stores the version accepted and the time (data.nda_accepted_version, data.nda_accepted_at).
 * To publish new wording, change the version: the next applications record the new one. Lawyer review advised (owner, 22 Nov 2026).
 */
export const CHAPTER_BUILDER_AGREEMENT = {
  title: "Chapter Builder and Meetup Venue Non-Disclosure and Non-Compete Agreement",
  href: "/legal/chapter-builder-agreement",
  // 1.0 live 22 Nov 2026 (Chapter Builders). 1.1: also Meetup Venue volunteers; applies whether approved, rejected or ended.
  version: "1.1",
} as const;
