// Who can see each group of business details. "public" = anyone; "members" = signed-in FLAME PH members only.
// Missing groups use the default, which matches how listings worked before (contacts and links public).

export type Visibility = "public" | "members";
export type FieldGroup = "phone" | "email" | "chat" | "links" | "products";

export const FIELD_GROUPS: { key: FieldGroup; label: string; help: string; columns: string[]; default: Visibility }[] = [
  { key: "phone", label: "Phone number", help: "Your call button and number.", columns: ["contact_phone"], default: "public" },
  { key: "email", label: "Business email", help: "Your email button.", columns: ["contact_email"], default: "public" },
  { key: "chat", label: "Messenger and Viber", help: "Your chat buttons.", columns: ["contact_messenger", "contact_viber"], default: "public" },
  { key: "links", label: "Website, social and shop links", help: "Facebook, TikTok, Shopee, MarketplacePH and others.", columns: ["website_url", "facebook_url", "google_business_url", "tiktok_url", "instagram_url", "shopee_url", "lazada_url", "marketplaceph_url"], default: "public" },
  { key: "products", label: "Products and prices", help: "Your product list and prices.", columns: ["products"], default: "public" },
];

/** Always public: name, industry, city and province, description, photos and logo. These make up a listing. */
export const ALWAYS_PUBLIC = ["Business name", "Industry", "City and province", "About your business", "Photos and logo"];

export type RegistrationVisibility = "public" | "members" | "private";
export const REGISTRATION_VISIBILITY: { value: RegistrationVisibility; label: string }[] = [
  { value: "private", label: "Only me and the FLAME PH team" },
  { value: "members", label: "FLAME PH members" },
  { value: "public", label: "Everyone" },
];

export function visibilityOf(fv: unknown, group: FieldGroup): Visibility {
  const v = fv && typeof fv === "object" ? (fv as Record<string, unknown>)[group] : undefined;
  return v === "members" || v === "public" ? v : FIELD_GROUPS.find((g) => g.key === group)!.default;
}

/** A copy of the business with members-only details removed for a visitor who is not signed in. Owners and members see everything. */
export function forViewer<T extends Record<string, unknown>>(b: T, viewerIsMember: boolean): T & { hidden_groups: FieldGroup[] } {
  if (viewerIsMember) return { ...b, hidden_groups: [] };
  const out: Record<string, unknown> = { ...b };
  const hidden: FieldGroup[] = [];
  for (const g of FIELD_GROUPS) {
    if (visibilityOf(b.field_visibility, g.key) === "members") {
      hidden.push(g.key);
      for (const c of g.columns) if (c in out) out[c] = null;
    }
  }
  return { ...(out as T), hidden_groups: hidden };
}

/** Builds field_visibility from a submitted form (switch "members_<group>" on = members only). */
export function visibilityFromForm(get: (name: string) => unknown) {
  return Object.fromEntries(FIELD_GROUPS.map((g) => [g.key, get(`members_${g.key}`) === "on" ? "members" : "public"])) as Record<FieldGroup, Visibility>;
}
