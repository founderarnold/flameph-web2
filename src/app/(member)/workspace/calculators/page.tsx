import { Suspense } from "react";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getLang } from "@/lib/i18n";
import { TabShell } from "@/components/shell/TabShell";
import { CalculatorPicker } from "@/app/business-calculators/CalculatorPicker";
import { CALCULATORS } from "@/lib/calculators";

export const metadata = { title: "Business calculators" };

/**
 * The 15 business calculators inside Workspace. The same picker and the same calculator pages as
 * /business-calculators (kept as it is), so every result is identical; only the frame around them is the member app.
 */
export default async function WorkspaceCalculators() {
  await requireUser("/workspace/calculators");
  const lang = await getLang();
  return (
    <TabShell title="Business calculators" fil="Libreng calculators para sa negosyo"
      intro={`${CALCULATORS.length} free calculators for pricing, cash flow, stock, delivery, staff, payroll and growth. Your numbers stay on your phone.`}>
      <Suspense fallback={<div className="card p-6 text-muted">Naglo-load ang calculator…</div>}>
        <CalculatorPicker lang={lang === "fil" ? "tl" : undefined} signedIn />
      </Suspense>
      <p className="text-sm text-muted">
        Estimates for planning only, not tax, legal or accounting advice. <Link href="/workspace" className="font-semibold text-primary underline">Back to Workspace</Link>
      </p>
    </TabShell>
  );
}
