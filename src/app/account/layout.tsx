import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { memberTabs } from "@/components/MemberNav";
import { MemberTabs } from "@/components/MemberTabs";

export const metadata = { title: "My account", robots: { index: false } };

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const { roles, supabase, user } = await requireUser();
  // Phase 12: a closed account sees one line pointing to where it can be reopened.
  const { data: prof } = await supabase.from("profiles").select("status").eq("id", user.id).maybeSingle();
  return (
    <div className="container-x py-8">
      <MemberTabs tabs={await memberTabs(supabase, user, roles)} />
      <p className="mt-2 text-right text-sm"><Link href="/?view=public" className="text-mph underline">View the public home page</Link></p>
      {prof?.status === "closed" && <p role="status" className="mt-4 rounded-xl bg-warn-soft p-3 text-sm font-semibold">Your account is closed. <Link className="underline" href="/account/privacy">Reopen it or download your data</Link>.</p>}
      <div className="mt-6">{children}</div>
    </div>
  );
}
