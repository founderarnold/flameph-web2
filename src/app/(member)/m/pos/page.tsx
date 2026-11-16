import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { TabShell } from "@/components/shell/TabShell";
import { buttonClass } from "@/components/ui";

export const metadata = { title: "Flame POS" };

const POS_SSO_URL = "https://www.flameph.org/sso/authorize?client=flamepos&return=https%3A%2F%2Fpos.flameph.org%2Forganizations";

/** Flame POS tab (members see this at /pos). Opens the existing FLAME POS with the member's FLAME PH sign-in; the in-app POS arrives in Phase 6. */
export default async function PosTab() {
  await requireUser("/pos");
  return (
    <TabShell title="Flame POS" fil="Libreng POS para sa MSME" soon="More POS features inside the app arrive in a later update"
      intro="Free point of sale for your store: sales, receipts, stock and reports. You use your FLAME PH account, so there is no new password.">
      <a href={POS_SSO_URL} className={buttonClass({ variant: "flame", block: true })}>Open FLAME POS</a>
      <a href="https://pos.flameph.org/login" className={buttonClass({ variant: "outline", block: true })}>POS staff sign in</a>
      <Link href="/pos?view=public" className="text-sm font-semibold text-primary underline">About FLAME POS</Link>
    </TabShell>
  );
}
