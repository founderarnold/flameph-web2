// Mini-websites are built and hosted by the FlamePH Pages app (pages.flameph.org, its own database). flameph.org
// keeps only what it needs to connect them to the member: which mini-sites a member has published (member_minisites)
// and the leads visitors send from them (business_inquiries, source = 'minisite'). Nothing here rebuilds the builder.

/** Every mini-site keeps its address at www.flameph.org/business/{slug} (next.config.ts forwards it to the Pages app). */
export const MINISITE_BASE = "https://www.flameph.org/business";
export const PAGES_ORIGIN = "https://pages.flameph.org";
export const PAGES_CLIENT = "flamephpages";

export const minisiteUrl = (slug: string) => `${MINISITE_BASE}/${encodeURIComponent(slug)}`;

/**
 * Opens the existing mini-website builder already signed in, through the FLAME PH sign-in hub. `next` is a page in the
 * Pages app: "/dashboard" (my mini-sites), "/build" (make one), "/dashboard/leads".
 */
export const builderHref = (next: "/dashboard" | "/build" | "/dashboard/leads" = "/dashboard") =>
  `/sso/authorize?client=${PAGES_CLIENT}&return=${encodeURIComponent(PAGES_ORIGIN + next)}`;

export type Minisite = { site_id: string; slug: string; name: string; category: string | null; published: boolean };

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max) : "");

/** "sites" message: the full list of one owner's mini-sites (published or not). Anything not listed is marked offline. */
export function parseSitesMessage(m: Record<string, unknown>): { ownerEmail: string; sites: Minisite[] } | null {
  const ownerEmail = text(m.owner_email, 200).toLowerCase();
  if (!EMAIL.test(ownerEmail) || !Array.isArray(m.sites) || m.sites.length > 50) return null;
  const sites: Minisite[] = [];
  for (const raw of m.sites as Record<string, unknown>[]) {
    const site_id = text(raw?.site_id, 36), slug = text(raw?.slug, 63).toLowerCase();
    if (!UUID.test(site_id) || !SLUG.test(slug)) return null;
    sites.push({ site_id, slug, name: text(raw.name, 120) || slug, category: text(raw.category, 40) || null, published: raw.published === true });
  }
  return { ownerEmail, sites };
}

export type MinisiteLead = { ownerEmail: string; leadId: string; slug: string; name: string; email: string | null; mobile: string | null; message: string };

/** "lead" message: one lead a visitor sent from a mini-site's form. */
export function parseLeadMessage(m: Record<string, unknown>): MinisiteLead | null {
  const ownerEmail = text(m.owner_email, 200).toLowerCase();
  const leadId = text(m.lead_id, 36), slug = text(m.site_slug, 63).toLowerCase();
  const name = text(m.name, 120);
  const email = text(m.email, 200).toLowerCase() || null;
  const mobile = text(m.mobile, 20) || null;
  if (!EMAIL.test(ownerEmail) || !UUID.test(leadId) || !SLUG.test(slug) || !name) return null;
  if (email && !EMAIL.test(email)) return null;
  if (!email && !mobile) return null;
  return { ownerEmail, leadId, slug, name, email, mobile, message: text(m.message, 1500) || "(No message. Please contact them back.)" };
}

/** Where an inquiry came from, in words. */
export const sourceLabel = (q: { source?: string | null; minisite_slug?: string | null }) =>
  q.source === "minisite" ? `From your mini-website${q.minisite_slug ? ` (/business/${q.minisite_slug})` : ""}` : "From your listing";
