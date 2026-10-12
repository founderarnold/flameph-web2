import "server-only";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/server";

export type Stats = {
  members: number;
  members_this_month: number;
  provinces: number;
  cities: number;
  businesses: number;
  verified_businesses: number;
  active_chapters: number;
  events_held: number;
  event_attendees: number;
  ai_answers: number;
  ai_ratings: number;
  ai_helpful_rate: number | null;
  resource_downloads: number;
  generated_at: string;
};

/** Live statistics from the database, cached for 5 minutes. Returns null on error: never a fake number. */
export const getStats = unstable_cache(
  async (): Promise<Stats | null> => {
    const supabase = createPublicClient();
    if (!supabase) return null;
    const { data, error } = await supabase.rpc("public_stats");
    if (error || !data) return null;
    return data as Stats;
  },
  ["public-stats"],
  { revalidate: 300, tags: ["stats"] },
);

export const getGrowth = unstable_cache(
  async () => {
    const supabase = createPublicClient();
    if (!supabase) return null;
    const { data, error } = await supabase.rpc("weekly_member_growth");
    if (error) return null;
    return (data ?? []) as { week: string; new_members: number; total: number }[];
  },
  ["weekly-growth"],
  { revalidate: 300, tags: ["stats"] },
);

export const getProvinces = unstable_cache(
  async () => {
    const supabase = createPublicClient();
    if (!supabase) return null;
    const { data, error } = await supabase.rpc("member_provinces");
    if (error) return null;
    return (data ?? []) as { province: string; members: number }[];
  },
  ["member-provinces"],
  { revalidate: 300, tags: ["stats"] },
);
