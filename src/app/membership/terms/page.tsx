import Link from "next/link";
import { LegalPage, FixedNotice } from "@/components/LegalPage";
import { meta } from "@/lib/meta";
import { ORG } from "@/lib/site";
import { INVESTOR_WARNING_EN, INVESTOR_WARNING_TL } from "@/lib/legal-text";

export const metadata = meta("Community Guidelines", "The rules every FLAME PH member agrees to: be real, do honest business, no spam, protect privacy.", "/membership/terms");

// Legal Pack v1.0, Part B (approved by the owner). This page replaces the earlier Membership Terms draft at the same address.
export default function Page() {
  return (
    <LegalPage title="Community Guidelines" path="/membership/terms">
      <p>Membership in FLAME PH is free and is governed by the <Link href="/legal/terms">Terms of Use</Link> and these Community Guidelines. They apply to everything you post, send or record on flameph.org.</p>

      <h2>1. Be real and be respectful</h2>
      <ul>
        <li>Use your real name or your real business name.</li>
        <li>No harassment, hate, threats, bullying, or sexual content.</li>
        <li>Disagree with ideas, not people.</li>
      </ul>

      <h2>2. Do honest business</h2>
      <ul>
        <li>No fake reviews or fake records, and no impersonation.</li>
        <li>No selling of illegal, counterfeit or regulated goods without the required permits.</li>
        <li>Describe products and prices truthfully.</li>
      </ul>

      <h2>3. No spam</h2>
      <ul>
        <li>No mass posting, repeated identical posts, or link farming.</li>
        <li>No unsolicited bulk messages.</li>
        <li>New accounts have posting and messaging limits for their first days.</li>
      </ul>

      <h2>4. Protect privacy</h2>
      <ul>
        <li>Do not post anyone&apos;s ID, address, phone number, bank details or private messages without their permission.</li>
        <li>Report data leaks to us right away.</li>
      </ul>

      <h2 id="investor-posts">5. Investor and funder posts</h2>
      <p>Any post offering or asking for investment, funding, loans or partnership money is marked as an investor/funder post. The following warning is always shown on it and on every reply. The poster cannot remove or hide it:</p>
      <FixedNotice><p>{INVESTOR_WARNING_EN}</p><p lang="fil">{INVESTOR_WARNING_TL}</p></FixedNotice>
      <p>The following are held for review or blocked:</p>
      <ul>
        <li>promises of fixed, guaranteed or risk-free returns (&ldquo;sure kita&rdquo;, &ldquo;walang talo&rdquo;, &ldquo;guaranteed 10% monthly&rdquo;)</li>
        <li>pyramid, recruitment or pay-to-join schemes</li>
        <li>requests to send money to join</li>
      </ul>

      <h2>6. How moderation works</h2>
      <ol>
        <li><strong>Automated checks (immediate).</strong> Spam, link and keyword filters, duplicate posts, and new-account limits.</li>
        <li><strong>Community.</strong> Any member can report, block or mute.</li>
        <li><strong>Chapter heads (within 24 hours).</strong> First look at reports in their chapter or industry group. They can hide content in their group, warn, or mute for 7 days.</li>
        <li><strong>Admins (after 24 hours, platform-wide).</strong> They take over if nothing has happened. They can hide, warn, mute, suspend, verify, or remove a listing.</li>
        <li><strong>Founders (final).</strong> Escalations, appeals within 7 days of a decision, policy changes, and bans.</li>
      </ol>

      <h2>7. Appeals</h2>
      <p>If action was taken on your account or content, you can appeal within 7 days by emailing <a href={`mailto:${ORG.emailPrimary}`}>{ORG.emailPrimary}</a>. A founder reviews the appeal, and their decision is final on flameph.org.</p>
    </LegalPage>
  );
}
