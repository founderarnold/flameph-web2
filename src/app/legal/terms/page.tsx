import Link from "next/link";
import { LegalPage, FixedNotice } from "@/components/LegalPage";
import { ORG } from "@/lib/site";
import { meta } from "@/lib/meta";
import { NO_MONEY_EN, NO_MONEY_TL } from "@/lib/legal-text";

export const metadata = meta("Terms of Use", "The terms for using flameph.org and FLAME PH membership.", "/legal/terms");

// Legal Pack v1.0, Part A (approved by the owner). Change the text only with a new POLICY_VERSION.
export default function Page() {
  return (
    <LegalPage title="Terms of Use" path="/legal/terms">
      <h2>1. Who we are</h2>
      <p>flameph.org is the online home of <strong>FLAME PH</strong>, formerly FAME Inc., SEC Reg. No. {ORG.secNo}. FLAME PH is the registered organization behind the community, the FLAME PH name and the membership.</p>
      <p>The website is operated by <strong>MarketplacePH Online Store</strong>, DTI-registered, Princeton St., Naga City, Camarines Sur (the <strong>Operator</strong>). The Operator controls and runs three web apps: flameph.org, marketplaceph.com and negosyodepot.com. They are <strong>one ecosystem under one operator</strong>, not separate companies, and none is a third party to the others.</p>
      <p>When we send you from flameph.org to MarketplacePH or NegosyoDepot, it is a redirect to a more focused web app for that use. It is not a hand-over to another company.</p>
      <p>&ldquo;We&rdquo;, &ldquo;us&rdquo; and &ldquo;FLAME PH&rdquo; in these Terms mean FLAME PH and the Operator, each in its own role.</p>

      <h2>2. Accepting these Terms</h2>
      <p>By creating an account you accept these Terms, the <Link href="/membership/terms">Community Guidelines</Link> and the <Link href="/legal/privacy">Privacy Notice</Link>. You accept them with one switch, which is off until you turn it on.</p>
      <p>If you do not accept, you can still browse the public pages, but you cannot create an account.</p>

      <h2>3. Who can join</h2>
      <p>You must be at least <strong>18 years old</strong> and able to enter into a binding agreement. If you act for a business, you confirm that you are allowed to act for it.</p>

      <h2>4. Your account</h2>
      <ul>
        <li>Give true information and keep it up to date.</li>
        <li>Keep your password and sign-in methods private.</li>
        <li>You are responsible for what happens under your account.</li>
        <li>One person, one account. Do not create accounts for other people without their permission, or to get around a suspension.</li>
      </ul>
      <p>You may sign in to FLAME POS, FlamePH Pages, MarketplacePH, NegosyoDepot and Manager&apos;s Pizza with your FLAME PH account. Those sites receive only your sign-in identity (name and verified email) for that purpose.</p>

      <h2>5. What flameph.org is, and what it is not</h2>
      <p>flameph.org is a place for Filipino MSMEs to learn, connect, post, organize group orders and keep simple records of business they do together.</p>
      <p><strong>FLAME PH never collects, holds, transfers or guarantees money between members.</strong> flameph.org has no checkout, escrow or wallet for member-to-member dealings. The only payment that may be taken on flameph.org is FLAME PH&apos;s own membership plan fee, described in section 9.</p>
      <p>Payment, delivery, quality, refunds and disputes are between the members (or the member and the supplier) who deal with each other.</p>
      <p>This statement covers flameph.org only. MarketplacePH and NegosyoDepot run their own selling features under their own terms.</p>

      <h2>6. Transaction records</h2>
      <p>A transaction record is a note that two members did business together. It is <strong>not</strong> a payment, contract, invoice, receipt, guarantee or proof of quality.</p>
      <ul>
        <li><strong>How a record is made:</strong> a request or quote is accepted, the work is done, and then <strong>both</strong> members confirm. Only confirmed records count.</li>
        <li><strong>Amounts:</strong> any amount is typed by the members. FLAME PH never checks or verifies it.</li>
        <li><strong>Repeat deals:</strong> repeat deals between the same two members count toward badges and reputation only after <strong>both</strong> businesses are vetted through submitted business documents. Until then, only the first 3 records between that pair count.</li>
        <li><strong>The reminder:</strong> every confirmed record shows this reminder, which cannot be dismissed or removed:</li>
      </ul>
      <FixedNotice><p>{NO_MONEY_EN}</p><p lang="fil">{NO_MONEY_TL}</p></FixedNotice>
      <p>You must not create false records, record deals that did not happen, or use records to mislead anyone.</p>

      <h2>7. Group Orders</h2>
      <p>In a Group Order, members who want the same item gather and ask a supplier for a bulk price. FLAME PH never collects, holds or transfers money for a Group Order.</p>
      <p>Manufacturers and suppliers often require a minimum order quantity. To keep a Group Order from being cancelled, <strong>MarketplacePH Online Store</strong>, the Operator, may collect the members&apos; orders and a downpayment where needed. That downpayment is paid to MarketplacePH Online Store, never to FLAME PH, and is not taken on flameph.org. MarketplacePH Online Store&apos;s own order terms (including refunds if a Group Order does not proceed) apply to it, and it will give them to you before you pay any downpayment.</p>
      <p>FLAME PH does not sell, stock or guarantee the item. A Group Order confirmed as a record shows the reminder in section 6.</p>

      <h2>8. Investor and funder posts</h2>
      <p>Offers to raise or invest money may be regulated as securities.</p>
      <ul>
        <li><strong>The warning:</strong> every investor or funder post, and every reply under it, shows the warning in the <Link href="/membership/terms#investor-posts">Community Guidelines (section 5)</Link>. The poster cannot remove or hide it.</li>
        <li><strong>What we hold or remove:</strong> posts that promise fixed, guaranteed or risk-free returns, or that use pyramid, recruitment or &ldquo;pay-to-join&rdquo; structures. We may report them to the SEC or other authorities.</li>
      </ul>

      <h2>9. Membership plans</h2>
      <p>Basic membership is free. Paid plans, when offered, are optional and are FLAME PH&apos;s own fee for membership services. They are paid on the membership page through PayMongo. Plan fees are never used to hold or move money for deals between members.</p>
      <p>No paid plan is open yet. Before one opens, we will publish its name, price and period, who receives the payment, the refund rule, and the name shown on receipts, in an updated version of these Terms.</p>

      <h2>10. Your content</h2>
      <ul>
        <li><strong>Ownership:</strong> you keep ownership of what you post.</li>
        <li><strong>What you allow us to do:</strong> you give FLAME PH and the Operator a non-exclusive, royalty-free licence to host, show, share within the ecosystem and promote it on flameph.org for as long as it is posted. You can delete your content, and the licence ends when it is deleted, except for copies we must keep by law or for an open moderation case.</li>
        <li><strong>What you promise:</strong> you have the right to post it, and it does not break the law or the Community Guidelines.</li>
      </ul>

      <h2>11. Badges</h2>
      <p>Badges show status only:</p>
      <ul>
        <li>the flameph.org badge after 1 month of account age</li>
        <li>the MarketplacePH and NegosyoDepot badges after 3 months, and only with your separate consent</li>
      </ul>
      <p><strong>A badge is never a certification, a rating guarantee or an endorsement</strong> by FLAME PH, the Operator or anyone else.</p>

      <h2>12. Moderation and enforcement</h2>
      <p>We moderate in five layers, as described in the Community Guidelines. We may hide content, warn, mute, suspend or ban accounts, and remove listings. Where the law and safety allow, we tell you why and how to appeal. Appeals go to the founders within 7 days.</p>

      <h2>13. Other ecosystem sites and outside links</h2>
      <p>FLAME POS, FlamePH Pages, MarketplacePH, NegosyoDepot and Manager&apos;s Pizza have their own terms for their own features. Links to government agencies, Google Maps (for example in RideSafe) and other outside sites are for convenience. We do not control or verify those sites.</p>

      <h2>14. Ka-FLAME AI and tools</h2>
      <p>Ka-FLAME AI, the business calculators and RideSafe are guides only. They can be wrong. They are not legal, tax, accounting, financial, engineering or emergency advice. Always confirm with the proper agency or professional. In an emergency, call 911.</p>

      <h2>15. No warranty; limits of liability</h2>
      <p>flameph.org is provided &ldquo;as is&rdquo;. As far as the law allows:</p>
      <ul>
        <li>FLAME PH and the Operator are not liable for deals between members, for content posted by members, for outside sites, or for indirect or lost-profit losses.</li>
        <li>Our total liability to you for any claim is limited to the membership fees you paid us in the 12 months before the claim, or PHP 1,000 if you paid none.</li>
      </ul>
      <p>Nothing here limits rights you have under the Consumer Act or other laws that cannot be waived.</p>

      <h2>16. Ending your account</h2>
      <p>You can close your account at any time by turning off switch 1 in <Link href="/account/settings">Settings</Link>, or by emailing us. We may suspend or close an account that breaks these Terms. Sections 6, 10, 15 and 17 continue after closure.</p>

      <h2>17. Law and disputes</h2>
      <p>Philippine law applies. We will first try to settle any dispute in good faith through the contact below. If that fails, the proper courts of San Fernando City, Pampanga have jurisdiction.</p>

      <h2>18. Changes</h2>
      <p>We may update these Terms. We will show the new version and its effective date. For important changes, we will ask you to accept again before you continue using member features.</p>

      <h2>19. Contact</h2>
      <p>FLAME PH, {ORG.address} · <a href={`mailto:${ORG.emailPrimary}`}>{ORG.emailPrimary}</a></p>
    </LegalPage>
  );
}
