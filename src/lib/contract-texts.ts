// Partner accreditation (Step 8): the standard plain-language drafts (version 1.0) of each contract template part.
// They are loaded into Admin > Partners > Contracts > Templates as DRAFTS. A lawyer must review each one, and the
// national team approves it, before any contract can use it. {{key}} placeholders are listed in ./contracts.
// NOT LEGAL ADVICE: these are drafts for lawyer review (penalty clauses and e-signatures in particular).

import type { Part } from "./contracts";

export const STANDARD_VERSION = "1.0";

export const STANDARD_TEXTS: Record<Part, { title: string; body: string }> = {
  master: {
    title: "Master Partner Agreement",
    body: `MASTER PARTNER AGREEMENT
Contract No. {{contract_no}}, version {{revision}}

1. THE PARTIES
1.1 {{operator_name}}, {{operator_details}} (the "Operator"), represented by {{flame_signatory}}, {{flame_signatory_position}}.
1.2 {{partner_legal_name}}, {{partner_registration}}, with business address at {{partner_address}} (the "Partner"), represented by {{partner_signatory}}, {{partner_signatory_position}}, {{partner_authority}}.
1.3 {{flame_party}} ("FLAME PH") is the community of MSMEs that accredited the Partner. FLAME PH runs member activities and chapters; it does not buy, sell, collect or pay money under this Agreement. All commercial contracting and all money under this Agreement are with the Operator.

2. PURPOSE
2.1 The Partner is an accredited {{partner_category}} of FLAME PH. This Agreement sets the terms under which the Partner offers its products or services to FLAME PH members, through Group Orders, chapter activities and the Operator's web apps.
2.2 Accreditation and this Agreement do not make the Partner an employee, agent, franchisee or joint venturer of FLAME PH or the Operator. Neither side may bind the other.

3. PARTS OF THIS AGREEMENT
3.1 This Agreement is made of this Master Partner Agreement, Schedule 1 for the Partner's category, and Annexes A (Territory), B (Pricing and commission), C (Service levels, complaints and penalties) and D (Intellectual property, FLAME marks and confidentiality).
3.2 If the parts conflict, this Master Partner Agreement prevails, then Schedule 1, then the Annexes.

4. TERM
4.1 This Agreement takes effect on {{effective_date}} and ends on {{end_date}}, unless ended earlier under clause 11.
4.2 Nothing in this Agreement renews by itself. The Operator will remind both sides {{renewal_notice_days}} days before the end date. A renewal is a new written contract signed by both sides.

5. ORDERS AND MONEY
5.1 flameph.org never collects, holds, pays out or transfers money. Prices, commissions, penalties, refunds and payouts shown on flameph.org are records of figures only.
5.2 Orders, downpayments, payments to the Partner, commissions, penalties and refunds are handled by the Operator (MarketplacePH Online Store) or directly between the Partner and the buying member, as stated in Schedule 1.
5.3 {{money_notice}}
5.4 Commission figures are negotiated targets, not guaranteed payouts. A commission is payable only on qualified, collected net sales, after refunds and returns, and only after the Operator's finance team approves each payout in writing.

6. QUALITY, SAMPLES AND COMPLAINTS
6.1 The Partner keeps its products or services at the quality described in its Best Offer and Schedule 1.
6.2 FLAME PH chapter testers may test samples and report their findings to the national team.
6.3 Members may file complaints. The Partner will answer and correct within the targets in Annex C. The Partner may respond to every complaint and every proposed sanction, and its evidence is kept.

7. CONFIDENTIALITY
7.1 Each side keeps the other's non-public information (prices before publication, costs, formulas, member lists, business plans) confidential, uses it only for this Agreement, and returns or deletes it when this Agreement ends.
7.2 This duty continues for 3 years after this Agreement ends, and for trade secrets (such as formulas) for as long as they remain secret.

8. DATA PRIVACY
8.1 Both sides comply with the Data Privacy Act of 2012 (Republic Act No. 10173). Personal data of members (names, addresses, contact details) is used only to fulfil orders and services under this Agreement, kept secure, and not sold or shared for other purposes.
8.2 The Partner reports any personal data breach involving members to the Operator within 24 hours of learning of it. FLAME PH's Data Protection Officer is Mark Tomon.

9. INTELLECTUAL PROPERTY
9.1 Each side keeps its own trademarks, names and other intellectual property. The Partner may use the FLAME PH name and marks only as allowed in Annex D.

10. SANCTIONS
10.1 If the Partner breaches this Agreement, the national team of FLAME PH, after hearing the Partner, may apply in steps: a warning, probation, a hold on new orders, a downgrade, or termination. A safety risk may justify an immediate hold.
10.2 Every sanction is decided by people, in writing, with reasons. The Partner may appeal within 7 days.

11. ENDING THIS AGREEMENT
11.1 Either side may end this Agreement without cause by giving 60 days' written notice.
11.2 The Operator may terminate this Agreement at once by written notice if the Partner commits a serious breach (for example a safety risk to members, fraud, a pyramid or recruitment scheme, repeated failure to deliver after warnings, or use of the FLAME marks outside Annex D), after a termination sanction under clause 10.
11.3 On ending, orders already accepted are completed or refunded as agreed, records are kept as the law requires, and clauses 5.1, 7, 8, 9 and 13 continue.

12. ELECTRONIC SIGNING
12.1 The parties may sign this Agreement electronically. Under the Electronic Commerce Act (Republic Act No. 8792), an electronic signature has the same legal effect as a handwritten one. The record of each signature (the fingerprint of the exact text signed, the time, the signer's account, IP address and browser) is kept by the Operator.
12.2 The parties may instead sign on paper; the scanned signed copy is kept as the original record.

13. LAW AND DISPUTES
13.1 Philippine law applies. The parties will first try to settle any dispute in good faith within 30 days. If that fails, {{venue}} have jurisdiction.

14. WHOLE AGREEMENT
14.1 This Agreement is the whole agreement between the parties on its subject. A change is valid only if written as a new version of this contract and signed by both sides.

SPECIAL TERMS FOR THIS CONTRACT
{{special_terms}}`,
  },
  schedule_supplier: {
    title: "Supplier terms",
    body: `SCHEDULE 1: SUPPLIER TERMS

1. PRODUCTS AND PRICES
1.1 The Partner supplies the products listed in Annex B at the prices stated there, from its chosen Best Offer. Member prices are the most a FLAME PH member is charged.
1.2 The Partner gives the Operator at least 30 days' written notice before any price increase. Orders accepted before the notice keep the old price.

2. ORDERS AND DELIVERY
2.1 The Partner fills orders that meet the minimum order quantity (MOQ) in Annex B, including Group Orders collected by the Operator.
2.2 The Partner delivers within the lead time in Annex C, to the areas it serves, on the shipping terms of its Best Offer. Risk passes to the buyer on delivery.
2.3 For Group Orders, the Operator may collect orders and downpayments from members only as needed to meet the MOQ; FLAME PH never holds this money.

3. QUALITY, WARRANTY AND RETURNS
3.1 Products match their description, labels and samples, are fit for their normal use, and carry the labels the law requires (including FDA where needed).
3.2 Missing or damaged goods are replaced, credited or refunded, at the buyer's choice, within the targets in Annex C. The Partner's returns and warranty terms from its Best Offer apply in addition.

4. SAMPLES
4.1 The Partner provides samples for chapter testing on the terms of its Best Offer.

5. STOCK AND CAPACITY
5.1 The Partner tells the Operator promptly if it cannot meet an accepted order or its stated monthly capacity.`,
  },
  schedule_service: {
    title: "Service provider terms",
    body: `SCHEDULE 1: SERVICE PROVIDER TERMS

1. SERVICES
1.1 The Partner provides the service packages listed in Annex B, each with its scope, exclusions, milestones and acceptance criteria, at the normal and member rates stated there.
1.2 Each engagement with a member is written down (a statement of work) before work starts: the package, the price, the schedule, and how the result is accepted.

2. STANDARDS
2.1 The Partner performs with reasonable skill and care, by qualified people, with the licences the law requires for its profession.
2.2 There is no blanket "100% satisfaction" promise. The service is accepted when it meets the measurable acceptance criteria in the statement of work.

3. CORRECTIONS AND REFUNDS
3.1 If a deliverable does not meet the acceptance criteria, the Partner corrects it within the targets in Annex C at no extra cost. If it cannot be corrected, the member is refunded in proportion to the part not delivered, per the Partner's correction and refund policy in its Best Offer.

4. CONFIDENTIALITY AND DATA
4.1 The Partner keeps members' business information confidential and handles any personal data only as needed for the service, under the Data Privacy Act.

5. AVAILABILITY
5.1 The Partner keeps the availability and response time stated in Annex C and tells the Operator in advance of any change.`,
  },
  schedule_manufacturer: {
    title: "Toll manufacturing and FLAME Signature terms",
    body: `SCHEDULE 1: TOLL MANUFACTURING AND FLAME SIGNATURE TERMS

1. PRODUCTS
1.1 The Partner manufactures the FLAME Signature products listed in Annex B and Annex D, at the toll prices stated in Annex B, only at the licensed plants and only under an active FLAME Signature licence.

2. PERMITS AND REGULATORY
2.1 The Partner keeps a valid FDA License to Operate for each plant and every product registration the law requires, and tells the Operator at once of any lapse, inspection finding or regulatory action.
2.2 Labels follow the approved artwork and the law (including FDA labelling rules).

3. BATCHES, QUALITY AND TRACEABILITY
3.1 Every batch is recorded on flameph.org with its lot number, dates, quantity, raw-material lots and quality check, and the Partner keeps its batch records for the period stated in its proposal.
3.2 A production batch may carry the FLAME Signature mark for sale only after the FLAME PH national team releases it.

4. RECALL
4.1 The Partner keeps its recall plan current and, on a recall decided by the national team or required by a regulator, carries it out at once at the level stated (consumer, retail or wholesale).

5. FORMULA AND PACKAGING
5.1 Ownership of formulas and who supplies packaging are as stated in Annex D and the licence. Formulas supplied by FLAME PH or the Operator stay theirs and are confidential.

6. CAPACITY AND ORDERS
6.1 The Partner fills purchase orders from the Operator at or above the MOQ in Annex B, within the lead time in Annex C.`,
  },
  annex_territory: {
    title: "Territory",
    body: `ANNEX A: TERRITORY

1. The Partner's territorial rights under this contract are:
{{territory_block}}

2. Only the FLAME PH national team grants, changes or ends territorial rights. The Partner may nominate sub-partners; it may not appoint them.
3. Exclusive rights are exclusive only for the named category, areas, channels and dates above. Excluded accounts stay outside the Partner's rights.
4. Making a product (manufacturing rights) and selling it in an area (distribution rights) are separate rights.
5. Territorial rights are reviewed on the schedule shown above, against the targets shown. Targets are goals, not promises of sales.`,
  },
  annex_pricing: {
    title: "Pricing and commission",
    body: `ANNEX B: PRICING AND COMMISSION

1. PRICES (from the chosen offer)
{{offer_block}}

2. COMMISSION (recorded figures)
{{commission_block}}

3. HOW COMMISSION IS WORKED OUT
3.1 Commission is a percentage of qualified, collected net sales: what members actually paid, less VAT where included, returns, refunds and discounts.
3.2 A refund or return after a commission was recorded reverses that commission (clawback).
3.3 Withholding tax is deducted where the law requires.
3.4 The Operator's finance team approves every payout by hand. Nothing is paid automatically.

4. MONEY NOTICE
{{money_notice}}`,
  },
  annex_sla: {
    title: "Service levels, complaints and penalties",
    body: `ANNEX C: SERVICE LEVELS, COMPLAINTS AND PENALTIES

1. SERVICE LEVELS
{{sla_block}}

2. LATE DELIVERY (PROPOSED PENALTY, SUBJECT TO LEGAL REVIEW)
{{penalty_block}}
2.1 A penalty applies only to delays caused by the Partner, not by the buyer, force majeure or a carrier chosen by the buyer.
2.2 Every penalty is calculated as a proposal, can be answered by the Partner, and applies only after a person on the national team approves it. Any money is settled through the Operator, never through flameph.org.

3. OTHER REMEDIES
3.1 Missing or damaged goods: replacement, credit or refund. Deficient services: re-performance or a proportionate refund based on the statement of work.

4. ESCALATION
4.1 Repeated or serious failures may lead to the sanctions in clause 10 of the Master Partner Agreement: warning, probation, hold, downgrade or termination.`,
  },
  annex_ip: {
    title: "Intellectual property, FLAME marks and confidentiality",
    body: `ANNEX D: INTELLECTUAL PROPERTY, FLAME MARKS AND CONFIDENTIALITY

1. FLAME PH NAME AND MARKS
1.1 The Partner may say it is an "Accredited Partner of FLAME PH" while this contract is signed and in force, and only in the categories and areas it covers.
1.2 The Partner may not use the FLAME PH or FLAME Signature names or logos in any other way, may not suggest that FLAME PH guarantees its products, prices or returns, and stops all use when this contract ends.

2. FLAME SIGNATURE (toll manufacturers only)
{{licence_block}}
2.1 The FLAME Signature mark is used only on the approved products in an active licence, for sale only in the licensed distribution areas, and only on production batches released by the national team.

3. THE PARTNER'S OWN INTELLECTUAL PROPERTY
3.1 The Partner keeps its own trademarks, designs, formulas and know-how, unless the licence or Schedule 1 says otherwise. The Partner allows the Operator and FLAME PH to show its name, logo and product photos to members to promote its offer during this contract.

4. CONFIDENTIALITY
4.1 Clause 7 of the Master Partner Agreement applies. Formulas, costs and unpublished prices are trade secrets.`,
  },
};
