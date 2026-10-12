import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "super_admin" | "admin" | "chapter_leader" | "editor";

export async function getSession() {
  const supabase = await createClient();
  if (!supabase) return { supabase: null, user: null, roles: [] as Role[] };
  const { data } = await supabase.auth.getUser();
  const user = data.user ?? null;
  let roles: Role[] = [];
  if (user) {
    const { data: r } = await supabase.from("roles").select("role").eq("user_id", user.id);
    roles = (r ?? []).map((x) => x.role as Role);
  }
  return { supabase, user, roles };
}

export async function requireUser(next = "/account") {
  const s = await getSession();
  if (!s.user || !s.supabase) redirect(`/login?next=${encodeURIComponent(next)}`);
  return { ...s, user: s.user!, supabase: s.supabase! };
}

export const isAdminRole = (roles: Role[]) => roles.some((r) => r === "super_admin" || r === "admin");
export const isStaffRole = (roles: Role[]) => roles.length > 0;

export async function requireStaff(allowed: Role[] = ["super_admin", "admin", "editor", "chapter_leader"]) {
  const s = await requireUser("/admin");
  if (!s.roles.some((r) => allowed.includes(r))) redirect("/account?denied=1");
  return s;
}
