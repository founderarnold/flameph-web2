import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";
import { ORG } from "@/lib/site";
import { meta } from "@/lib/meta";

export const metadata = meta("Terms of Use", "The terms for using flameph.org.", "/legal/terms");

export default function Page() {
  return (
    <LegalPage k="terms" title="Terms of Use" path="/legal/terms" updated="October 12, 2026">
      <p>These terms apply when you use flameph.org, run by {ORG.name} (&ldquo;FLAME PH&rdquo;), SEC Reg. No. {ORG.secNo}. By using the site you agree to them.</p>
      <h2>1. What this site is</h2>
      <p>A community platform for Filipino entrepreneurs and MSMEs. Features labeled &ldquo;Beta&rdquo; may change; features labeled &ldquo;Coming soon&rdquo; are not yet available.</p>
      <h2>2. Your account</h2>
      <ul><li>Give true information and keep your login secure.</li><li>One person, one account. You must be at least 18, or have a parent or guardian&apos;s consent.</li><li>We may suspend accounts that break these terms.</li></ul>
      <h2>3. Your content</h2>
      <p>You own what you post (for example your business listing). You allow FLAME PH to display it on the site. Don&apos;t post anything false, illegal, infringing or harmful. We may remove content that breaks these rules.</p>
      <h2>4. Business directory</h2>
      <p>Listings are provided by members. A &ldquo;Verified&rdquo; badge means we checked registration documents; it is not an endorsement. FLAME PH is not a party to transactions between members and customers.</p>
      <h2>5. Ka-FLAME AI</h2>
      <p>Ka-FLAME AI is an AI guide, not a lawyer, accountant or financial adviser. It can make mistakes. Always verify tax, legal, permit and financing matters with the official agency (BIR, DTI, SEC, FDA or your LGU). Do not enter other people&apos;s personal data into it.</p>
      <h2>6. No guarantees</h2>
      <p>Membership does not guarantee funding, customers, sales or any business result. The site is provided &ldquo;as is&rdquo;.</p>
      <h2>7. Payments</h2>
      <p>No payments are collected on this website in this version.</p>
      <h2>8. Privacy</h2>
      <p>See our <Link href="/legal/privacy">Privacy Notice</Link>.</p>
      <h2>9. Changes and contact</h2>
      <p>We may update these terms and will post the date above. Questions: <a href={`mailto:${ORG.emailPrimary}`}>{ORG.emailPrimary}</a>. These terms are governed by the laws of the Republic of the Philippines.</p>
    </LegalPage>
  );
}
