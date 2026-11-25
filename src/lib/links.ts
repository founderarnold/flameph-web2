/**
 * Turns what a member types for a link into a working web address (owner, 25 Nov 2026): with or without https://,
 * "www.", a bare page name or an @handle. Used when a listing is saved and again when a listing is shown, so links
 * saved before this change also open without errors.
 */

export type LinkKind = "facebook_url" | "google_business_url" | "tiktok_url" | "instagram_url" | "shopee_url" | "lazada_url" | "website_url" | "marketplaceph_url";

/** Where a bare name or @handle points to, for the sites that have one. */
const HANDLE: Partial<Record<LinkKind, (h: string) => string>> = {
  facebook_url: (h) => `https://www.facebook.com/${h}`,
  instagram_url: (h) => `https://www.instagram.com/${h}`,
  tiktok_url: (h) => `https://www.tiktok.com/@${h}`,
  shopee_url: (h) => `https://shopee.ph/${h}`,
  marketplaceph_url: (h) => `https://www.marketplaceph.com/store/${h}`,
};

/** Hint shown in the empty box. */
export const LINK_PLACEHOLDER: Record<LinkKind, string> = {
  facebook_url: "facebook.com/yourpage or yourpage",
  google_business_url: "g.page/yourbusiness or maps.app.goo.gl/…",
  tiktok_url: "tiktok.com/@yourshop or @yourshop",
  instagram_url: "instagram.com/yourshop or @yourshop",
  shopee_url: "shopee.ph/yourshop",
  lazada_url: "lazada.com.ph/shop/yourshop",
  website_url: "yourbusiness.com",
  marketplaceph_url: "marketplaceph.com/store/yourstore",
};

/**
 * A full https:// address, or null when nothing usable was typed. Never returns a javascript:, data: or other
 * non-web address.
 */
export function normalizeLink(kind: LinkKind, input: unknown): string | null {
  let v = typeof input === "string" ? input.trim().replace(/\s+/g, "") : "";
  if (!v) return null;
  v = v.replace(/^<|>$/g, "");
  if (/^[a-z][a-z0-9+.-]*:/i.test(v) && !/^https?:\/\//i.test(v)) return null; // mailto:, javascript: and the like
  v = v.replace(/^http:\/\//i, "https://").replace(/^\/\//, "");
  if (!/^https:\/\//i.test(v)) {
    const handle = v.replace(/^@/, "");
    // A bare name ("mypage", "@myshop") has no dot or slash: it is a page name on that site.
    if (!/[./]/.test(handle) && HANDLE[kind] && /^[\w.-]{1,100}$/.test(handle)) return HANDLE[kind]!(handle);
    v = `https://${v}`;
  }
  try {
    const u = new URL(v);
    if (u.protocol !== "https:" || !u.hostname.includes(".") || /[^a-z0-9.-]/i.test(u.hostname)) return null;
    return u.toString().slice(0, 300);
  } catch {
    return null;
  }
}

/** For showing a saved link: the normalised address, or the saved text if it already worked. */
export const linkHref = (kind: LinkKind, saved: unknown) => normalizeLink(kind, saved);
