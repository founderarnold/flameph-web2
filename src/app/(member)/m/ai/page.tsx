import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { TabShell } from "@/components/shell/TabShell";
import { KaFlameChat } from "@/components/KaFlameChat";
import { Notice } from "@/components/ui";
import { getSettings } from "@/lib/settings";
import { startOfManilaDay, startOfManilaMonth } from "@/lib/ai/guard";
import { DEFAULT_MEMBER_MONTHLY_CAP_USD } from "@/lib/ai/budget";

export const metadata = { title: "Ka-FLAME AI" };

/**
 * Ka-FLAME AI for signed-in members (members see this at /bizconsult-ai; visitors keep the public page).
 * Reuses the existing chat and listing writer; adds what is left today and this month, and the member's history.
 */
export default async function AiTab() {
  const { supabase, user } = await requireUser("/bizconsult-ai");
  const [settings, { data: profile }, { count: today }, { data: month }] = await Promise.all([
    getSettings(),
    supabase.from("profiles").select("tier").eq("id", user.id).single(),
    supabase.from("ai_messages").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", startOfManilaDay()),
    supabase.from("ai_messages").select("cost_usd").eq("user_id", user.id).gte("created_at", startOfManilaMonth()),
  ]);
  const limits = settings.ai_limits ?? { free: 10 };
  const daily = limits[profile?.tier ?? "free"] ?? limits.free ?? 10;
  const left = Math.max(0, daily - (today ?? 0));
  const cap = Number(settings.ai_member_monthly_cap_usd ?? DEFAULT_MEMBER_MONTHLY_CAP_USD);
  const used = (month ?? []).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
  const monthPct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : null;
  return (
    <TabShell title="Ka-FLAME AI" fil="Ang AI kasama mo sa negosyo"
      intro="Ask in Taglish, English or Filipino about starting, registering, pricing and growing your business. Free for members.">
      <section aria-label="Your Ka-FLAME AI allowance" className="card grid gap-3 p-4 sm:grid-cols-2">
        <p><span className="block text-2xl font-extrabold">{left} of {daily}</span><span className="text-sm text-muted">questions left today (resets at midnight)</span></p>
        {monthPct !== null && (
          <p><span className="block text-2xl font-extrabold">{monthPct}%</span><span className="text-sm text-muted">of this month&apos;s free allowance used</span></p>
        )}
      </section>
      <Notice>FLAME AI can make mistakes. Always double-check important decisions. It is an AI guide, not a lawyer or accountant.</Notice>
      <KaFlameChat />
      <p className="flex flex-wrap gap-x-4">
        <Link href="/account/ai" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">My AI history</Link>
        <Link href="/workspace#ws-tools" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">Back to Workspace</Link>
      </p>
    </TabShell>
  );
}
