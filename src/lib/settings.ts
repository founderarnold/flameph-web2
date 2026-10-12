import "server-only";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/server";

export type Settings = {
  stat_thresholds?: { founding_members?: number; ai_helpful_min_ratings?: number };
  social_links?: Record<string, string>;
  launch_date?: string | null;
  donation_details?: { bank?: string; account_name?: string; account_no?: string; gcash?: string; receipts_note?: string } | null;
  ai_limits?: Record<string, number>;
  ai_monthly_cap_usd?: number;
  legal_status?: Record<string, "draft" | "approved">;
  hero_image?: string | null;
};

export const DEFAULT_SETTINGS: Settings = {
  stat_thresholds: { founding_members: 50, ai_helpful_min_ratings: 20 },
  social_links: {},
  launch_date: null,
  donation_details: null,
  ai_limits: { guest: 3, free: 10 },
  legal_status: { terms: "draft", privacy: "draft", membership: "draft" },
};

export const getSettings = unstable_cache(
  async (): Promise<Settings> => {
    const supabase = createPublicClient();
    if (!supabase) return DEFAULT_SETTINGS;
    const { data, error } = await supabase.from("settings").select("key,value");
    if (error || !data) return DEFAULT_SETTINGS;
    const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    for (const row of data) out[row.key] = row.value;
    return out as Settings;
  },
  ["settings"],
  { revalidate: 300, tags: ["settings"] },
);
