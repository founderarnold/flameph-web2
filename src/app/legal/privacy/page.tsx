import { LegalPage } from "@/components/LegalPage";
import { ORG, OFFICIAL_LINKS } from "@/lib/site";
import { meta } from "@/lib/meta";

export const metadata = meta("Privacy Notice", "How FLAME PH collects, uses and protects personal data under the Data Privacy Act of 2012.", "/legal/privacy");

export default function Page() {
  return (
    <LegalPage k="privacy" title="Privacy Notice" path="/legal/privacy" updated="October 12, 2026">
      <p>{ORG.name} (&ldquo;FLAME PH&rdquo;, &ldquo;we&rdquo;) respects your privacy and complies with the Data Privacy Act of 2012 (Republic Act No. 10173), its Implementing Rules, and issuances of the National Privacy Commission (NPC).</p>
      <h2>Personal information controller</h2>
      <p>{ORG.formerName}, now known as FLAME PH · SEC Reg. No. {ORG.secNo} · {ORG.address}. Contact for privacy concerns: <a href={`mailto:${ORG.emailPrimary}`}>{ORG.emailPrimary}</a>.</p>
      <h2>What we collect</h2>
      <ul>
        <li><strong>Account data:</strong> name, email, mobile number (optional), province, city, business stage.</li>
        <li><strong>Business listing data:</strong> details you choose to publish, and registration documents you upload for verification (kept private).</li>
        <li><strong>Form submissions:</strong> what you type into our forms.</li>
        <li><strong>Ka-FLAME AI:</strong> your questions and the answers, token counts and ratings.</li>
        <li><strong>Technical data:</strong> a one-way hash of your IP address for spam and rate limiting, and privacy-friendly, cookie-less analytics.</li>
      </ul>
      <h2>Why we use it</h2>
      <ul><li>To run your membership, ID and directory listing</li><li>To reply to forms and send updates you asked for</li><li>To operate and improve Ka-FLAME AI and keep it safe</li><li>To count anonymous statistics shown on our Impact page</li><li>To meet legal obligations</li></ul>
      <h2>Legal basis</h2>
      <p>Your consent (which you may withdraw anytime), the performance of our membership agreement with you, and our legitimate interests in running a safe service.</p>
      <h2>Sharing</h2>
      <p>We do not sell personal data. We use service providers to run the site: Supabase (database and login), Vercel (hosting), Anthropic (Ka-FLAME AI processing of the questions you type), and an email delivery service. They process data only on our instructions. We never send other members&apos; personal data to the AI. Data may be processed outside the Philippines with appropriate safeguards.</p>
      <h2>Retention</h2>
      <p>We keep account data while your account is active, and delete it within a reasonable time after you ask us to or close your account, unless the law requires us to keep it. You can delete your Ka-FLAME AI history anytime from your account.</p>
      <h2>Your rights</h2>
      <p>You have the right to be informed, to access, to object, to correct, to erasure or blocking, to data portability, to damages, and to file a complaint with the <a href={OFFICIAL_LINKS.NPC} target="_blank" rel="noopener">National Privacy Commission</a>. Email us to exercise them.</p>
      <h2>Security</h2>
      <p>We use encryption in transit, access controls and row-level security so members can only see their own private data.</p>
    </LegalPage>
  );
}
