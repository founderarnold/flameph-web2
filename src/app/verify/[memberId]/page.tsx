import type { Metadata } from "next";
import { Section } from "@/components/ui";
import { createPublicClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Verify member ID", robots: { index: false } };

type V = { member_code: string; full_name: string | null; member_since: string; tier: string; status: string };

export default async function Page({ params }: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await params;
  const supabase = createPublicClient();
  const { data } = supabase ? await supabase.rpc("verify_member", { code: memberId }) : { data: null };
  const m = (data as V[] | null)?.[0];
  return (
    <Section>
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-extrabold">Member ID verification</h1>
        {m ? (
          <div className={`card mt-4 p-6 ${m.status === "active" ? "border-ok" : "border-red-500"}`}>
            <p className={`text-lg font-extrabold ${m.status === "active" ? "text-ok" : "text-red-700"}`}>{m.status === "active" ? "✓ Valid FLAME PH member" : "Membership not active"}</p>
            <dl className="mt-4 space-y-2">
              <div><dt className="text-sm text-muted">Name</dt><dd className="font-bold">{m.full_name ?? "—"}</dd></div>
              <div><dt className="text-sm text-muted">Member ID</dt><dd className="font-bold">{m.member_code}</dd></div>
              <div><dt className="text-sm text-muted">Member since</dt><dd className="font-bold">{new Date(m.member_since).toLocaleDateString("en-PH", { dateStyle: "long" })}</dd></div>
              <div><dt className="text-sm text-muted">Tier</dt><dd className="font-bold capitalize">{m.tier}</dd></div>
            </dl>
          </div>
        ) : (
          <div className="card mt-4 border-red-500 p-6"><p className="font-bold text-red-700 dark:text-red-300">No verified member found with ID {memberId.toUpperCase()}.</p></div>
        )}
      </div>
    </Section>
  );
}
