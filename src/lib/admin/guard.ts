import "server-only";
import { redirect } from "next/navigation";
import { requireStaff, type Role } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";

/** Verifies the visitor's role, then returns a service-role client for admin work plus an audit logger. */
export async function adminContext(allowed: Role[] = ["super_admin", "admin", "editor", "chapter_leader"]) {
  const s = await requireStaff(allowed);
  const db = createAdminClient();
  if (!db) redirect("/admin?error=service-key");
  const { data: chapterRows } = await db.from("roles").select("chapter_id").eq("user_id", s.user.id).eq("role", "chapter_leader");
  const chapterIds = (chapterRows ?? []).map((r) => r.chapter_id).filter(Boolean) as string[];
  const audit = async (action: string, table_name?: string, row_id?: string, detail?: unknown) => {
    await db.from("audit_log").insert({ actor_id: s.user.id, action, table_name, row_id, detail: detail ?? null });
  };
  const isAdmin = s.roles.includes("super_admin") || s.roles.includes("admin");
  const onlyChapterLeader = !isAdmin && !s.roles.includes("editor") && s.roles.includes("chapter_leader");
  return { ...s, db, audit, isAdmin, onlyChapterLeader, chapterIds };
}
