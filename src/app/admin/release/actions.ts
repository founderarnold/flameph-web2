"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminContext } from "@/lib/admin/guard";
import { isStage, type Rollout } from "@/lib/release";

// Phase 13: moves the release stage forward or back. Admins and founders only; every change goes to the audit log and
// restarts the 7-day monitoring window (the daily release email runs while it is open).

export async function setStage(fd: FormData) {
  const c = await adminContext(["super_admin", "admin"]);
  const stage = String(fd.get("stage") ?? "");
  const note = String(fd.get("note") ?? "").trim().slice(0, 300);
  if (!isStage(stage)) redirect("/admin/release?error=stage");
  const { data } = await c.db.from("settings").select("value").eq("key", "rollout").maybeSingle();
  const before = (data?.value ?? { stage: "internal", history: [] }) as Rollout;
  const now = new Date();
  const value: Rollout = {
    stage,
    started_at: now.toISOString(),
    monitor_until: new Date(now.getTime() + 7 * 864e5).toISOString(),
    history: [...(before.history ?? []), { stage, at: now.toISOString(), by: c.user.id, note: note || undefined }].slice(-40),
  };
  const { error } = await c.db.from("settings").upsert({ key: "rollout", value, is_public: false, updated_at: now.toISOString() });
  if (error) redirect("/admin/release?error=save");
  await c.audit("release_stage", "settings", "rollout", { from: before.stage, to: stage, note: note || null });
  revalidatePath("/admin/release");
  redirect("/admin/release?done=stage");
}
