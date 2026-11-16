import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { SubmissionForm } from "@/components/SubmissionForm";
import { FORMS } from "@/lib/forms";
import { TabShell } from "@/components/shell/TabShell";

export const metadata = { title: "Fulfillment" };

/** Fulfillment tab (members see this at /fulfillment). Reuses the existing partner application; the full feature arrives in Phase 10. */
export default async function FulfillmentTab() {
  await requireUser("/fulfillment");
  return (
    <TabShell title="Fulfillment" fil="Kita mula sa kapwa MSME" soon="Order fulfillment tools arrive in a later update"
      intro="Member MSMEs produce, pack or deliver orders for FLAME PH merch, Signature Brands and personalized requests. Apply below to be a fulfillment partner.">
      <SubmissionForm def={FORMS.fulfillment} compact doneHref="/home" />
      <Link href="/fulfillment?view=public" className="text-sm font-semibold text-primary underline">About Fulfillment by MSMEs</Link>
    </TabShell>
  );
}
