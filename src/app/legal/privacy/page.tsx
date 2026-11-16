import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";
import { ORG, OFFICIAL_LINKS } from "@/lib/site";
import { meta } from "@/lib/meta";
import { CONSENTS } from "@/lib/policy";

export const metadata = meta("Privacy Notice and Data-Sharing Consent", "How FLAME PH collects, uses, shares and protects personal data under the Data Privacy Act of 2012, and the consent switches members control.", "/legal/privacy");

const COLLECT: [string, string, string][] = [
  ["Name, email, password or Google/Facebook sign-in, mobile (optional)", "Your account and sign-in", "Contract (your membership)"],
  ["Province, city, business stage, business details you enter", "Directory, matching opportunities, live statistics by province", "Contract; legitimate interest"],
  ["Posts, comments, messages, follows, friends, group memberships", "Running the community features you use", "Contract"],
  ["Transaction records and ratings", "Only if you turn on consent 2", "Consent"],
  ["Business documents for vetting", "Only if you turn on consent 4", "Consent"],
  ["Badge and record counts shared with MarketplacePH and NegosyoDepot", "Only if you turn on consent 3", "Consent"],
  ["Marketing emails and push", "Only if you turn on consent 5", "Consent"],
  ["Questions to Ka-FLAME AI", "Answering you, safety and quality review", "Contract; legitimate interest"],
  ["Technical data: hashed IP, device, cookies needed for sign-in, privacy-friendly page analytics", "Security, abuse prevention, keeping the site working", "Legitimate interest; legal obligation"],
];

// Legal Pack v1.0, Parts C and D (approved by the owner).
export default function Page() {
  return (
    <LegalPage title="Privacy Notice and Data-Sharing Consent" path="/legal/privacy">
      <p>Under the Data Privacy Act of 2012 (Republic Act No. 10173), its Implementing Rules, and issuances of the National Privacy Commission (NPC).</p>

      <h2>1. Who is responsible</h2>
      <ul>
        <li><strong>FLAME PH</strong>, formerly FAME Inc., SEC Reg. No. {ORG.secNo}, is the personal information controller for membership data.</li>
        <li><strong>MarketplacePH Online Store</strong>, the Operator, runs the website and processes data for FLAME PH under a data-sharing and outsourcing agreement.</li>
        <li><strong>Data Protection Officer:</strong> Mark Tomon · <a href={`mailto:${ORG.emailPrimary}`}>{ORG.emailPrimary}</a> · {ORG.address}.</li>
      </ul>

      <h2>2. What we collect</h2>
      <div className="not-prose -mx-4 overflow-x-auto px-4">
        <table className="w-full min-w-[560px] border-collapse text-left text-sm">
          <thead><tr className="border-b-2 border-line"><th scope="col" className="py-2 pr-3">Data</th><th scope="col" className="py-2 pr-3">Why</th><th scope="col" className="py-2">Legal basis</th></tr></thead>
          <tbody>{COLLECT.map(([d, w, b]) => <tr key={d} className="border-b border-line align-top"><td className="py-2 pr-3">{d}</td><td className="py-2 pr-3">{w}</td><td className="py-2">{b}</td></tr>)}</tbody>
        </table>
      </div>
      <p>We do not sell personal data.</p>

      <h2>3. What moves between the ecosystem web apps</h2>
      <p><strong>For sign-in only:</strong> your account identity (name and verified email) when you choose to sign in to another ecosystem site.</p>
      <p><strong>Only with consent 3:</strong> your verified status, badge level, confirmed record count and category mix, and account creation date.</p>
      <p><strong>Never shared:</strong> private messages, vetting documents, amounts in records, and other members&apos; contact details.</p>
      <p>Every cross-site data access is logged for audit.</p>

      <h2>4. Who else processes data</h2>
      <p>These service providers work under contracts that require confidentiality and security:</p>
      <ul>
        <li>Supabase (database and storage)</li>
        <li>Vercel (hosting)</li>
        <li>Anthropic (Ka-FLAME AI)</li>
        <li>Resend (email)</li>
        <li>Cloudflare Turnstile (bot protection)</li>
        <li>Google and Meta (only if you sign in with them)</li>
        <li>Google Maps (RideSafe, in your browser)</li>
      </ul>
      <p>Some of them store data outside the Philippines. We use them only with safeguards required by the NPC.</p>

      <h2>5. How long we keep data</h2>
      <ul>
        <li>Account data: while your account is open, then 1 year, unless the law requires longer.</li>
        <li>Moderation cases: 3 years.</li>
        <li>Vetting documents: until vetting is decided plus 1 year, or sooner when you withdraw consent.</li>
        <li>Ka-FLAME AI chats: 1 year, or until you delete them.</li>
      </ul>

      <h2>6. Your rights</h2>
      <p>You have the rights to be informed, to access, to object, to correct, to erasure or blocking, to data portability, to damages, and to file a complaint with the <a href={OFFICIAL_LINKS.NPC} target="_blank" rel="noopener">National Privacy Commission</a>.</p>
      <p>To use these rights, go to <Link href="/account/settings">Settings</Link> or write to the DPO. We answer within 15 working days.</p>

      <h2>7. Security and breaches</h2>
      <p>Security measures include row level security on every table, encryption in transit, hashed IP addresses and role-based admin access.</p>
      <p>If a personal data breach is likely to put you at real risk, we notify the <strong>National Privacy Commission and affected members within 72 hours</strong> of knowing about it, as required by NPC Circular 16-03.</p>

      <h2>8. Changes</h2>
      <p>We will show the new version and its effective date, and ask for consent again where the law requires.</p>

      <h2 id="consent">9. Data-sharing consent: your switches</h2>
      <p>When you join, and any time in <Link href="/account/settings">Settings</Link>, you see these switches. Each one is shown separately and is <strong>off until you turn it on</strong>. Switch 1 is needed to create an account. Saying no to switches 2 to 5 never blocks core member features. Every switch except 1 can be turned off in Settings at any time; to withdraw switch 1, close your account (turning it off in Settings asks us to do that).</p>
      <ol>
        {CONSENTS.map((c) => <li key={c.key}><strong>{c.title}.</strong> &ldquo;{c.en}&rdquo; <i lang="fil">{c.tl}</i></li>)}
      </ol>
      <p>For each member and switch, we record the switch number, the on or off state, the policy version, the date and time, and the source (sign-up, sign-in prompt or Settings). You can see your own history in Settings.</p>
    </LegalPage>
  );
}
