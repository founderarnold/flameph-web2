// Industry and chapter groups. The catalogue lives in the database (group_catalog, 0018); this file holds the rules the pages share.

export type Group = { id: string; slug: string; kind: "industry" | "chapter"; name: string; sector: string | null; chapter_id: string | null; priority: boolean };
export type CatalogEntry = { slug: string; name: string; sector: string; priority: boolean; sort: number };

/** The address of a chapter's group: /groups/chapter-<chapter slug or id>. */
export const chapterGroupSlug = (c: { id: string; slug?: string | null }) => `chapter-${c.slug || c.id}`;

/** Posts in this group always carry the investor and funder warning. */
export const INVESTOR_GROUP = "investors-and-funders";

export const isGroupSlug = (v: unknown): v is string => typeof v === "string" && /^[a-z0-9-]{2,80}$/.test(v);
