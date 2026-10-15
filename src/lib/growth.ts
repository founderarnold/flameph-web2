// Shared rules for the member growth features: stages and milestones, points, opportunities and prices.

export type Stage = "discover" | "start" | "build" | "grow" | "scale";
export const STAGE_KEYS: Stage[] = ["discover", "start", "build", "grow", "scale"];

export const STAGES: Record<Stage, { label: string; fil: string; blurb: string; milestones: { key: string; label: string; href?: string }[]; unlocks: string }> = {
  discover: {
    label: "Discover", fil: "May idea pa lang", blurb: "Test your idea before spending.",
    milestones: [
      { key: "idea_validated", label: "Validated my idea with 10 possible customers", href: "/bizconsult-ai" },
      { key: "joined_talk", label: "Joined a NegosyoTalk or workshop", href: "/negosyo-talks" },
      { key: "found_mentor", label: "Talked to a mentor", href: "/get-involved/mentor" },
    ],
    unlocks: "Starter courses and idea feedback",
  },
  start: {
    label: "Start", fil: "Bagong negosyo", blurb: "Register, set prices and make the first sales.",
    milestones: [
      { key: "dti_registered", label: "Registered my business name with DTI" },
      { key: "bir_registered", label: "Registered with BIR and got my receipts" },
      { key: "bmbe", label: "Got a BMBE certificate (tax-free for micro businesses)" },
      { key: "first_listing", label: "Listed my business with prices on FLAME PH", href: "/account/business" },
    ],
    unlocks: "Verified badge and local bazaars",
  },
  build: {
    label: "Build", fil: "Inaayos ang sistema", blurb: "Make the product and operations ready for more buyers.",
    milestones: [
      { key: "fda_lto", label: "Got FDA LTO or the product permits I need" },
      { key: "barcode", label: "Got GS1 barcodes and better packaging" },
      { key: "marketplaceph", label: "Opened a shop on MarketplacePH", href: "https://www.marketplaceph.com" },
      { key: "bookkeeping", label: "Keep simple books every week" },
    ],
    unlocks: "Buy-together deals and regional trade fairs",
  },
  grow: {
    label: "Grow", fil: "Dumarami ang customers", blurb: "Add channels, financing and people.",
    milestones: [
      { key: "online_shops", label: "Selling on Shopee, Lazada or TikTok Shop" },
      { key: "resellers", label: "Have resellers or distributors" },
      { key: "financing", label: "Got a bank or government loan" },
      { key: "hired", label: "Hired and trained staff" },
    ],
    unlocks: "National trade fairs and B2B buyers",
  },
  scale: {
    label: "Scale", fil: "Lalawak na", blurb: "Go national and abroad.",
    milestones: [
      { key: "export_ready", label: "Completed export readiness (DTI EMB, PhilEXPORT)" },
      { key: "intl_fair", label: "Joined IFEX or an overseas trade fair" },
      { key: "franchise", label: "Set up franchising or distribution" },
    ],
    unlocks: "Export buyers and Negosyo Depot",
  },
};

export const peso = (n?: number | string | null) =>
  n === null || n === undefined || n === "" ? "" : `₱${Number(n).toLocaleString("en-PH", { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

export const POINTS = { referral: 50, review: 10, event: 20, milestone: 15, deal: 10 };

export const OPPORTUNITY_KINDS: Record<string, string> = {
  grant: "Grant", loan: "Loan or financing", trade_fair: "Trade fair", bazaar: "Bazaar", training: "Training",
  buyer_request: "Buyer request", program: "Government program", competition: "Competition", other: "Opportunity",
};

export type Opportunity = {
  id: string; title: string; kind: string; organizer: string | null; summary: string | null; url: string | null; province: string | null;
  sectors: string[]; stages: string[]; deadline: string | null; starts_on: string | null; members_only: boolean; created_at: string;
};

/** True when an opportunity fits a member's province, sector and stage (empty filters mean "everyone"). */
export function matches(o: Opportunity, m: { province?: string | null; sector?: string | null; stage?: string | null }) {
  const eq = (a?: string | null, z?: string | null) => (a ?? "").trim().toLowerCase() === (z ?? "").trim().toLowerCase();
  return (!o.province || eq(o.province, m.province))
    && (!o.sectors?.length || o.sectors.some((s) => eq(s, m.sector)))
    && (!o.stages?.length || o.stages.includes(m.stage ?? ""));
}

export const notExpired = (d?: string | null) => !d || new Date(`${d}T23:59:59+08:00`).getTime() >= Date.now();

export const dateLabel = (d?: string | null) => (d ? new Date(`${d}T00:00:00+08:00`).toLocaleDateString("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" }) : "");
