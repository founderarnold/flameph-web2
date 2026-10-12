import "server-only";
import { list } from "@/lib/content";
import { FOUNDERS } from "@/lib/site";

export type Founder = { name: string; title: string; bio: string; photo_path?: string | null; linkedin_url?: string | null; facebook_url?: string | null };

/** Founders from the database (admin can add photos/links); falls back to the verified facts. */
export async function getFounders(): Promise<Founder[]> {
  const rows = await list<Founder>({ table: "founders", order: "sort", ascending: true });
  return rows.length ? rows : FOUNDERS;
}
