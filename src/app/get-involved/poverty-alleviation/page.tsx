import { InvolvedTemplate } from "@/components/InvolvedTemplate";
import { getInvolved } from "@/content/involved";
import { getSettings } from "@/lib/settings";
import { meta } from "@/lib/meta";

const page = getInvolved("poverty-alleviation");
export const metadata = meta(page.title, page.description, "/get-involved/poverty-alleviation");

export default async function Page() {
  const { donation_details: d } = await getSettings();
  const hasDetails = d && (d.account_no || d.gcash);
  return (
    <InvolvedTemplate page={page}>
      <div className="card p-5">
        <h2 className="text-xl font-extrabold">Monetary donations</h2>
        {hasDetails ? (
          <dl className="mt-3 space-y-1">
            {d.bank && <div><dt className="inline font-semibold">Bank: </dt><dd className="inline">{d.bank}</dd></div>}
            {d.account_name && <div><dt className="inline font-semibold">Account name: </dt><dd className="inline">{d.account_name}</dd></div>}
            {d.account_no && <div><dt className="inline font-semibold">Account no.: </dt><dd className="inline">{d.account_no}</dd></div>}
            {d.gcash && <div><dt className="inline font-semibold">GCash: </dt><dd className="inline">{d.gcash}</dd></div>}
            {d.receipts_note && <p className="mt-2 text-sm text-muted">{d.receipts_note}</p>}
          </dl>
        ) : (
          <p className="mt-2 text-muted">FLAME PH is not accepting online monetary donations yet. Official, verified account details will be posted here. Please don&apos;t send money to anyone claiming to collect for FLAME PH; use the form to reach us instead.</p>
        )}
      </div>
    </InvolvedTemplate>
  );
}
