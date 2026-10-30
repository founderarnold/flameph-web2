export const REAL_ESTATE_ADMIN_SECTIONS = {
  properties: {
    table: "property_inquiries",
    label: "Property inquiries",
    singular: "property inquiry",
    dataColumn: "requirement",
    exportKind: "real-estate-properties",
    statuses: ["new", "reviewing", "contacted", "matching", "site_visit", "closed"],
  },
  referrals: {
    table: "corporate_h_referral_partners",
    label: "Referral partners",
    singular: "referral partner",
    dataColumn: "application",
    exportKind: "real-estate-referrals",
    statuses: ["interested", "application_submitted", "for_orientation", "requirements_incomplete", "under_review", "approved", "active", "suspended", "inactive"],
  },
  careers: {
    table: "corporate_h_applications",
    label: "Career applications",
    singular: "career application",
    dataColumn: "application",
    exportKind: "real-estate-careers",
    statuses: ["submitted", "initial_review", "interview", "orientation", "training", "document_verification", "company_approved", "requirements_incomplete", "onboarded", "not_selected", "withdrawn"],
  },
} as const;

export type RealEstateAdminSection = keyof typeof REAL_ESTATE_ADMIN_SECTIONS;

export function getRealEstateAdminSection(section: string) {
  return REAL_ESTATE_ADMIN_SECTIONS[section as RealEstateAdminSection];
}

export function humanizeRealEstateField(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
