import Link from "next/link";
import { PageHero, Section } from "@/components/ui";
import { ORG } from "@/lib/site";
import { meta } from "@/lib/meta";
import { CHAPTER_BUILDER_AGREEMENT, POLICY_PAGES } from "@/lib/policy";

export const metadata = meta(CHAPTER_BUILDER_AGREEMENT.title, "The non-disclosure and non-compete agreement every FLAME PH Chapter Builder accepts before applying.", CHAPTER_BUILDER_AGREEMENT.href);

// Drafted 22 Nov 2026 in line with Legal Pack v1.0, for the owner's approval before it goes live. Lawyer review advised.
// Change the wording only together with a new CHAPTER_BUILDER_AGREEMENT.version in src/lib/policy.ts.
export default function Page() {
  const v = CHAPTER_BUILDER_AGREEMENT.version;
  return (
    <>
      <PageHero title={CHAPTER_BUILDER_AGREEMENT.title} path={CHAPTER_BUILDER_AGREEMENT.href} share={false}
        intro={<>Version {v}. Every Chapter Builder accepts this agreement on the <Link href="/get-involved/chapter-builder#builder" className="font-semibold text-primary underline">Chapter Builder form</Link>.</>} />
      <Section>
        <article className="prose-flame max-w-3xl">
          <p><strong>In short:</strong> as a Chapter Builder you will learn how the FLAME PH ecosystem works: flameph.org, marketplaceph.com and negosyodepot.com, the FLAME Signature white-label branding strategy, Micro Fulfillment, Group Ordering, the free POS, and our member lists, plans and partner deals. Keep all of it private, even from your family and friends, use it only for your FLAME PH chapter, and do not copy it or help anyone else copy it. You can still run your own business and join other organizations.</p>
          <p lang="fil"><strong>Sa madaling salita:</strong> bilang Chapter Builder, malalaman mo kung paano gumagana ang FLAME PH ecosystem: ang flameph.org, marketplaceph.com at negosyodepot.com, ang FLAME Signature white-label branding strategy, Micro Fulfillment, Group Ordering, ang libreng POS, at ang mga listahan ng member, plano at deal ng partners. Panatilihin itong lahat na pribado, kahit sa pamilya at mga kaibigan mo, gamitin lang para sa iyong FLAME PH chapter, at huwag itong kopyahin o tulungan ang iba na kopyahin ito. Puwede mo pa ring patakbuhin ang sarili mong negosyo at sumali sa ibang organisasyon.</p>

          <h2>1. Who this agreement is between</h2>
          <p>This agreement is between you, the <strong>Chapter Builder</strong>, and <strong>FLAME PH</strong>, formerly FAME Inc., SEC Reg. No. {ORG.secNo}, together with <strong>MarketplacePH Online Store</strong>, DTI-registered, Princeton St., Naga City, Camarines Sur, the Operator of flameph.org, marketplaceph.com and negosyodepot.com (together, &ldquo;FLAME PH&rdquo;, &ldquo;we&rdquo; or &ldquo;us&rdquo;).</p>
          <p>It adds to the <Link href={POLICY_PAGES.terms.href}>Terms of Use</Link>, the <Link href={POLICY_PAGES.guidelines.href}>Community Guidelines</Link> and the <Link href={POLICY_PAGES.privacy.href}>Privacy Notice</Link>. If they conflict on confidentiality or competition for Chapter Builders, this agreement applies.</p>

          <h2>2. When it starts and how you accept it</h2>
          <p>You accept this agreement by ticking its box on the Chapter Builder form while signed in to your FLAME PH account. We record your account, the version you accepted and the date and time. It starts when you send the form and applies whether or not your application is approved, because you may receive confidential information while we review it.</p>
          <p>You must be at least 18 years old and able to enter into a binding agreement.</p>

          <h2>3. What counts as confidential information</h2>
          <p>Confidential information is anything you receive or see because of your Chapter Builder role that is not public, in any form (spoken, written, on screen, in chats or files). For example:</p>
          <ul>
            <li><strong>the FLAME PH ecosystem</strong>: how flameph.org, marketplaceph.com and negosyodepot.com work, connect and support each other, including their features, plans and anything not yet launched;</li>
            <li><strong>the FLAME Signature white-label branding strategy</strong>, and how products are chosen, branded, made and sold under it;</li>
            <li><strong>Micro Fulfillment</strong>, <strong>Group Ordering</strong> and the <strong>free POS</strong>: how they are set up, run, priced and offered to members;</li>
            <li>the other systems, processes, business models and <strong>marketing strategies</strong> of FLAME PH and its ecosystem that are part and parcel of how it works;</li>
            <li>names, contact details, businesses and other personal data of members, applicants, suppliers, venues and partners;</li>
            <li>member lists, chapter group chats, attendance lists and sign-up sheets;</li>
            <li>group order prices, supplier terms, minimum order quantities and partner or sponsor deals;</li>
            <li>chapter plans, budgets, unpublished programs, events, training materials and internal guides;</li>
            <li>reports, moderation cases and anything marked or reasonably understood as private.</li>
          </ul>
          <p>It does <strong>not</strong> include information that is already public through no fault of yours, that you already knew before FLAME PH gave it to you, or that you got lawfully from someone else who was free to share it.</p>

          <h2>4. Keeping it confidential</h2>
          <ul>
            <li>Use confidential information <strong>only</strong> for your FLAME PH chapter work.</li>
            <li>Do not share, sell, post, copy, export or download it, except as your chapter work needs and as FLAME PH allows.</li>
            <li>Share it only with FLAME PH staff and fellow Chapter Builders who need it for the same chapter work.</li>
            <li><strong>Do not disclose it to anyone else</strong>: not to any other person, company, business partner or organization, and not to your spouse, relatives, siblings or friends. This applies to everything you learn during your time as a Chapter Builder.</li>
            <li>Keep it safe: use a strong password, do not leave lists in public group chats, and do not save member data on shared devices.</li>
            <li>Handle personal data as the <strong>Data Privacy Act of 2012 (RA 10173)</strong> requires and as the Privacy Notice describes.</li>
            <li>If information is lost, leaked or seen by the wrong person, tell our Data Protection Officer within <strong>24 hours</strong> of finding out: Mark Tomon, <a href={`mailto:${ORG.emailPrimary}`}>{ORG.emailPrimary}</a>.</li>
          </ul>
          <p>If a court or government office orders you to disclose confidential information, tell us first (unless the law forbids it), so we can respond, and disclose only what is required.</p>

          <h2>5. Not competing with FLAME PH and not copying its systems</h2>
          <p>You must accept this section before you can send the Chapter Builder application for an area or an industry. It protects the systems and strategies of FLAME PH from being copied and used by other companies.</p>
          <p>While you are a Chapter Builder and for <strong>7 years</strong> after your role ends, anywhere in the Philippines and online, you agree not to, by yourself or through or for any other person, company or organization:</p>
          <ul>
            <li>copy, imitate or set up an ecosystem or web apps like flameph.org, marketplaceph.com or negosyodepot.com, or a system that combines their features, for a company or group other than FLAME PH;</li>
            <li>copy or run a white-label branding program like FLAME Signature, or any similar branding activity, using what you learned from FLAME PH;</li>
            <li>copy or run a micro fulfillment service, a group ordering system, a free POS offer for MSMEs, or another feature of flameph.org, marketplaceph.com or negosyodepot.com, using what you learned from FLAME PH;</li>
            <li>help, advise, train, work for or invest in another company or group so that it can do any of the above;</li>
            <li>start, lead or organize another MSME network, association or chapter that offers members substantially the same things as FLAME PH (such as chapter meetups, group ordering and MSME referral groups) in the area or industry of your chapter;</li>
            <li>invite or move FLAME PH members, suppliers, venues, partners or sponsors that you met through your role to a competing company or group;</li>
            <li>present yourself, a group or an event as FLAME PH, or as connected with FLAME PH, without our written approval.</li>
          </ul>
          <p>Using FLAME PH confidential information to copy its systems or strategies is never allowed, even after the 7 years, for as long as Section 8 keeps the information confidential.</p>
          <p><strong>What you remain free to do:</strong> run and grow your own business, including selling your own products; work in your profession or trade; be a member or officer of chambers of commerce, cooperatives, trade associations, church, school, barangay and government programs; and use ordinary skills and public knowledge that did not come from FLAME PH confidential information. This section is limited in time, activity and purpose to what is needed to protect the FLAME PH ecosystem, so that it is fair and reasonable.</p>

          <h2>6. Name, logo and money</h2>
          <ul>
            <li>Use the FLAME PH name, logo and materials only for approved chapter activities and only in the form we provide.</li>
            <li>Do not collect, hold or receive money on behalf of FLAME PH. FLAME PH never collects or holds money for deals between members or for Group Orders; members pay suppliers directly.</li>
            <li>Do not promise members fixed or guaranteed returns, jobs, loans or benefits that FLAME PH has not announced.</li>
          </ul>

          <h2>7. Your role is volunteer work</h2>
          <p>Chapter building is volunteer work. This agreement does not make you an employee, agent or partner of FLAME PH, and it does not entitle you to pay. You can stop being a Chapter Builder at any time by telling us. FLAME PH can also end the role, for example if this agreement or the Community Guidelines are not followed.</p>

          <h2>8. When your role ends</h2>
          <p>Within <strong>7 days</strong> of your role ending, delete or return all confidential information you hold, including member lists and exported files, and leave or hand over FLAME PH chapter group chats you manage, as we ask. Sections 3 to 6 continue to apply after your role ends: confidentiality for <strong>7 years</strong>; for the systems and strategies of the FLAME PH ecosystem, for as long as they are not public; for personal data, for as long as the law protects it; and the non-compete in Section 5 for <strong>7 years</strong>.</p>
          <p><strong>Non-compete after your role ends:</strong> for <strong>7 years</strong> after your role ends, for any reason, you remain bound by Section 5. You may not create, copy or help others create or copy the FLAME PH ecosystem, its web apps (flameph.org, marketplaceph.com, negosyodepot.com), the FLAME Signature white-label branding strategy, Micro Fulfillment, Group Ordering, the free POS or its marketing strategies, or run a similar competing activity.</p>

          <h2>9. If the agreement is broken</h2>
          <p><strong>Penalty for copying or sharing the ecosystem.</strong> If you create or copy the FLAME PH ecosystem, its marketing strategies or its web apps (flameph.org, marketplaceph.com, negosyodepot.com), or help anyone else do so, you agree to pay FLAME PH a penalty of <strong>at least ₱10,000,000 (ten million pesos)</strong>, plus all legal expenses FLAME PH incurs, including attorney&rsquo;s fees, filing fees and court costs of any lawsuit against you.</p>
          <p>If you share the ecosystem, its systems or its strategies with competitors who then build the same or a similar ecosystem or strategies, you agree to pay FLAME PH <strong>further compensation</strong> on top of the ₱10,000,000 minimum, for the damage this causes, as proven or as the court awards.</p>
          <p>You agree that this penalty is a fair estimate of the harm to FLAME PH, because that harm is hard to measure exactly. Paying it does not stop FLAME PH from also asking the court to order you to stop.</p>
          <p>In addition, FLAME PH may end your Chapter Builder role, remove your chapter access, take the steps in the Community Guidelines, and ask the courts for any remedy the law allows, including an order to stop the use or disclosure of confidential information and an order to stop any copied or competing ecosystem. If a part of this agreement is found unenforceable, it applies to the extent the law allows and the rest stays in force.</p>

          <h2>10. Law and courts</h2>
          <p>Philippine law applies. We will first try to settle any dispute in good faith through the contact below. If that fails, the proper courts of <strong>San Fernando City, Pampanga</strong> have jurisdiction.</p>

          <h2>11. Changes to this agreement</h2>
          <p>If we change this agreement, we will publish a new version on this page with a new version number. Applications record the version accepted. We will ask existing Chapter Builders to accept a new version before it applies to them.</p>

          <h2>12. Contact</h2>
          <p>Questions about this agreement: <a href={`mailto:${ORG.emailPrimary}`}>{ORG.emailPrimary}</a> · {ORG.address}. Data Protection Officer: Mark Tomon.</p>
        </article>
        <p className="mt-10 max-w-3xl border-t border-line pt-4 text-sm text-muted">
          Also read: {Object.values(POLICY_PAGES).map((p, i) => <span key={p.href}>{i > 0 && " · "}<Link className="text-mph underline" href={p.href}>{p.title}</Link></span>)}
        </p>
      </Section>
    </>
  );
}
