import "server-only";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/server";
import { SUPABASE_URL } from "@/lib/env";

type Query = { table: string; select?: string; filters?: Record<string, string | number | boolean | string[]>; order?: string; ascending?: boolean; limit?: number };

/** Fetch published rows for public pages. Always returns an array; empty on error or when unconfigured. */
export async function list<T = Record<string, unknown>>(q: Query): Promise<T[]> {
  return cachedList(JSON.stringify(q)) as Promise<T[]>;
}

const cachedList = unstable_cache(
  async (key: string) => {
    const q = JSON.parse(key) as Query;
    const supabase = createPublicClient();
    if (!supabase) return [];
    let req = supabase.from(q.table).select(q.select ?? "*");
    for (const [k, v] of Object.entries(q.filters ?? {})) {
      req = Array.isArray(v) ? req.in(k, v) : req.eq(k, v);
    }
    if (q.order) req = req.order(q.order, { ascending: q.ascending ?? false });
    if (q.limit) req = req.limit(q.limit);
    const { data, error } = await req;
    if (error) return [];
    return data ?? [];
  },
  ["content-list"],
  { revalidate: 60, tags: ["content"] },
);

export function mediaUrl(path?: string | null) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${SUPABASE_URL}/storage/v1/object/public/media/${path}`;
}

export type EventRow = {
  id: string; type: string; title: string; description: string | null; starts_at: string; ends_at: string | null;
  venue: string | null; city: string | null; province: string | null; online_url: string | null; status: string;
  capacity: number | null; registration_open: boolean; attendance_actual: number | null; photos: string[];
};

export async function eventsByType(types: string[]) {
  const rows = await list<EventRow>({ table: "events", filters: { type: types }, order: "starts_at", ascending: true });
  const now = Date.now();
  return {
    upcoming: rows.filter((e) => e.status === "scheduled" && new Date(e.starts_at).getTime() >= now - 86400000),
    past: rows.filter((e) => e.status === "completed").reverse(),
  };
}
