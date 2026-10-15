import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getSession, isStaffRole, type Role } from "@/lib/auth";
import { MEMBER_LINKS } from "@/lib/member-nav";
import { MemberTabs } from "./MemberTabs";

export async function memberTabs(supabase: SupabaseClient, user: User, roles: Role[]) {
  // Unread inquiries for the badge; zero until the 0003 database update is run.
  const { count: unread } = await supabase.from("business_inquiries").select("id", { count: "exact", head: true }).eq("owner_id", user.id).eq("status", "new");
  return [
    ...MEMBER_LINKS.map((l) => (l.href === "/account/inquiries" && unread ? { ...l, label: `${l.label} (${unread})` } : l)),
    ...(isStaffRole(roles) ? [{ href: "/admin", label: "Admin" }] : []),
  ];
}

/** Member tab bar for pages outside /account (Opportunities, Buy together). Shows nothing to visitors who aren't signed in. */
export async function MemberNav() {
  const { supabase, user, roles } = await getSession();
  if (!supabase || !user) return null;
  return (
    <div className="border-b border-line bg-bg">
      <div className="container-x py-4"><MemberTabs tabs={await memberTabs(supabase, user, roles)} /></div>
    </div>
  );
}
