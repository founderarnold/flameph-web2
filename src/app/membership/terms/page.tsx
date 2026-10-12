import { LegalPage } from "@/components/LegalPage";
import { ORG } from "@/lib/site";
import { meta } from "@/lib/meta";

export const metadata = meta("Membership Terms", "The terms of FLAME PH membership.", "/membership/terms");

export default function Page() {
  return (
    <LegalPage k="membership" title="Membership Terms" path="/membership/terms" updated="October 12, 2026">
      <h2>1. Who can join</h2>
      <p>Aspiring entrepreneurs, MSME owners, professionals and supporters who agree to these terms and our Code of Conduct. Membership is free.</p>
      <h2>2. What membership gives you</h2>
      <p>Access to the benefits listed on our Free MSME Benefits page, each marked Live, Beta or Coming soon. Benefits may change; we will say so on the site.</p>
      <h2>3. What membership does not give you</h2>
      <ul><li>No guarantee of funding, loans, grants, customers or sales.</li><li>No right to speak for or represent FLAME PH unless authorized in writing.</li><li>No government accreditation or endorsement.</li></ul>
      <h2>4. Member ID</h2>
      <p>Your digital member ID shows your name, member since date, tier and status, and can be verified by scanning its QR code. Don&apos;t alter or misuse it.</p>
      <h2>5. Code of conduct</h2>
      <ul><li>Be honest in your profile and listings.</li><li>Treat other members with respect. No harassment, scams or spam.</li><li>Respect other members&apos; privacy.</li></ul>
      <h2>6. Paid tiers</h2>
      <p>Paid tiers are not yet available and no payments are collected on this site. Terms for paid tiers will be published before they open.</p>
      <h2>7. Ending membership</h2>
      <p>You can leave anytime by emailing <a href={`mailto:${ORG.emailPrimary}`}>{ORG.emailPrimary}</a>. We may suspend or end membership for serious or repeated breaches of these terms.</p>
    </LegalPage>
  );
}
