// Phase 10B: investor and funder profiles. Plain words shared by the profile page, posts, the admin screen and the tests.
// The rules themselves live in the database (0026_investor_funder.sql). Nothing here handles money: FLAME PH has no
// pledge, subscription, commitment or payment feature for investors or funders.
import { INVESTOR_WARNING_EN, INVESTOR_WARNING_TL } from "@/lib/legal-text";

export const MEMBER_TYPES = {
  business: { label: "Business owner or MSME", help: "You run or are starting a business." },
  investor_funder: { label: "Investor or funder", help: "You invest in, lend to or fund businesses. Every post you make carries the investor warning." },
} as const;
export type MemberType = keyof typeof MEMBER_TYPES;
export const isMemberType = (v: unknown): v is MemberType => typeof v === "string" && v in MEMBER_TYPES;

/** The label shown next to an investor or funder's name. */
export const INVESTOR_PROFILE_LABEL = "Investor or funder";

export const REGULATORS = {
  sec: "Securities and Exchange Commission (SEC)",
  bsp: "Bangko Sentral ng Pilipinas (BSP)",
  ic: "Insurance Commission (IC)",
  cda: "Cooperative Development Authority (CDA)",
  other: "Other government regulator",
} as const;
export type Regulator = keyof typeof REGULATORS;
export const isRegulator = (v: unknown): v is Regulator => typeof v === "string" && v in REGULATORS;
const SHORT: Record<Regulator, string> = { sec: "SEC", bsp: "BSP", ic: "IC", cda: "CDA", other: "a regulator" };

export type InvestorLabel = { regulator: Regulator | null; checked_at: string | null };

const day = (iso: string) => new Date(iso).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" });

/** Short label on posts. Always says it is not an endorsement. null when nothing was seen. */
export function registrationLabel(l: InvestorLabel | undefined | null): string | null {
  if (!l?.regulator || !l.checked_at) return null;
  return `Registration seen on ${SHORT[l.regulator]} list, ${day(l.checked_at)} · Not an endorsement`;
}

/** The full meaning of the label. Shown with it, on the profile page and on the admin screen. */
export const REGISTRATION_LABEL_MEANING =
  "This label only means a FLAME PH admin saw a registration or licence with this name and number on the regulator's public list on the date shown. " +
  "It is not an endorsement, recommendation, approval or guarantee by FLAME PH of this person, their business, any offer or any return. " +
  "FLAME PH does not check offers or whether they comply with the law. Check with the SEC yourself before you invest.";
export const REGISTRATION_LABEL_MEANING_TL =
  "Ang label na ito ay nangangahulugang nakita lang ng isang admin ng FLAME PH ang rehistro o lisensya na may ganitong pangalan at numero sa pampublikong listahan ng regulator sa petsang nakasaad. " +
  "Hindi ito endorsement, rekomendasyon, pag-apruba o garantiya ng FLAME PH sa taong ito, sa negosyo nila, sa anumang alok o sa anumang kita. " +
  "Hindi sinusuri ng FLAME PH ang mga alok o kung sumusunod ang mga ito sa batas. Alamin muna sa SEC bago mag-invest.";

/** Text for the phone's share sheet. An investor/funder post never leaves without the warning. */
export function shareText(investor: boolean): string | undefined {
  return investor ? `${INVESTOR_WARNING_EN}\n\n${INVESTOR_WARNING_TL}` : undefined;
}

/** For emails and other plain-text places: the excerpt, then the full warning in both languages. */
export function withWarning(text: string, investor: boolean): string {
  return investor ? `${text}\n\n${INVESTOR_WARNING_EN}\n\n${INVESTOR_WARNING_TL}` : text;
}

export const INVESTOR_ERRORS: Record<string, string> = {
  not_investor: "Choose \"Investor or funder\" as your profile type first, then save.",
  fields: "Please fill in the regulator, the registered name and the registration or licence number.",
  unavailable: "This opens after FLAME PH finishes a database update. Please try again later.",
  failed: "That didn't go through. Please try again.",
};
