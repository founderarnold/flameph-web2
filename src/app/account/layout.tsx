import { requireUser } from "@/lib/auth";
import { memberTabs } from "@/components/MemberNav";
import { MemberTabs } from "@/components/MemberTabs";

export const metadata = { title: "My account", robots: { index: false } };

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const { roles, supabase, user } = await requireUser();
  return (
    <div className="container-x py-8">
      <MemberTabs tabs={await memberTabs(supabase, user, roles)} />
      <div className="mt-6">{children}</div>
    </div>
  );
}
