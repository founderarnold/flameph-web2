// The phone menu (the drawer opened from Menu on the bottom bar), for visitors and members (navigation Phase 1, owner GO 28 Nov 2026).
// One list, kept in the code: no database table, no query when the menu opens. Desktop menus keep using src/content/nav.json.
// Two levels at most: a section, then its links. Every link points at an existing page; tests check this.

export type MenuLink = {
  label: string;
  href: string;
  /** Members go here instead (same feature, member version), e.g. Group Order. */
  memberHref?: string;
  external?: boolean;
  /** Words people may type in the menu search (English and Filipino). */
  keywords?: string;
  /** Who sees it. Default: everyone. The page itself still checks sign-in and roles. */
  who?: "all" | "member" | "visitor";
  /** Only where the page itself shows this status. */
  status?: "Beta" | "Coming soon";
  /** Opens in a new tab with no /go/ step (sites outside the /go/ allow-list). */
  newTab?: boolean;
};

export type MenuSection = { key: string; label: string; fil: string; icon: string; links: MenuLink[] };

/** The goal shortcuts reuse the 28 homepage goal cards (src/components/EcosystemFrontDoor.tsx), by their titles. */
export type GoalGroup = { key: string; label: string; text: string; cards: string[] };

export const MENU_TITLE = "Ano ang gusto mong gawin?";

export const GOAL_GROUPS: GoalGroup[] = [
  { key: "goal-sales", label: "Increase Sales", text: "Sell products, find customers and expand distribution.",
    cards: ["Sell My Products", "Find Customers", "Grow My Business", "Find Digital Marketing Experts", "Sell a Business", "Hire People"] },
  { key: "goal-expenses", label: "Reduce Expenses", text: "Group ordering, shared services, discounts and free tools.",
    cards: ["Find Suppliers", "Find Cargo Movers", "Find Vehicle Dealers", "Find Tax Compliance Assistance", "Find Legal Assistance", "Find Import Assistance"] },
  { key: "goal-start", label: "Start a Business", text: "Business packages, training and mentorship.",
    cards: ["Start a Business", "Franchise a Business", "Buy a Business", "Pasalo a Business", "Easy Startup for Aspiring Managers", "Find Training", "Get Business Advice", "Find Financing Assistance", "Find Investment Opportunities", "Find Partners or Joint Venture", "Find Business Property"] },
  { key: "goal-income", label: "Earn Extra Income", text: "Jobs, referrals, affiliate opportunities and professional services.",
    cards: ["Find a Job", "Work From Home Jobs", "Earn Extra Income", "Build Portfolio", "Find Business Opportunities"] },
];

/** Extra links inside some goal groups, besides the goal cards (existing pages only). */
export const GOAL_EXTRAS: Record<string, MenuLink[]> = {
  "goal-expenses": [
    { label: "Group Ordering", href: "/deals", memberHref: "/group-order", keywords: "tipid bulk buy together" },
    { label: "Free Benefits and Tools", href: "/benefits", keywords: "libre free" },
  ],
};

/** Big shortcuts at the top of the menu, so these stay one tap away (they were bottom tabs until Phase 1). */
export const QUICK_SHORTCUTS: MenuLink[] = [
  { label: "Group Order", href: "/deals", memberHref: "/group-order", keywords: "tipid bulk buy together group ordering" },
  { label: "Fulfillment", href: "/fulfillment", keywords: "micro fulfillment padala delivery" },
  { label: "Flame POS", href: "/pos", keywords: "pos resibo benta sales cashier inventory" },
];

/** My FLAME Workspace, for signed-in members only. */
export const WORKSPACE_LINKS: MenuLink[] = [
  { label: "My Dashboard", href: "/workspace", keywords: "workspace dashboard" },
  { label: "My Profile", href: "/account/profile", keywords: "profile photo" },
  { label: "My Businesses & Business Pages", href: "/account/business", keywords: "business page listing mini-website" },
  { label: "My Listings on MarketplacePH", href: "https://www.marketplaceph.com/my/listings", external: true, keywords: "products listings" },
  { label: "My Messages", href: "/messages", keywords: "chat mensahe" },
  { label: "Business Inbox", href: "/workspace/inbox", keywords: "inbox notifications" },
  { label: "Leads & Inquiries", href: "/account/inquiries", keywords: "leads customers" },
  { label: "Requests & Quotes", href: "/requests", keywords: "quotation" },
  { label: "Transaction Records", href: "/records", keywords: "deals records" },
  { label: "My Rewards & Referrals", href: "/account/rewards", keywords: "referral invite points kita" },
  { label: "My Membership & Member ID", href: "/account#member-id", keywords: "member id tier membership" },
  { label: "Growth Path", href: "/account/growth", keywords: "milestones" },
  { label: "Settings & Privacy", href: "/account/settings", keywords: "settings privacy password" },
];

export const SECTIONS: MenuSection[] = [
  { key: "business", label: "Business Opportunities", fil: "Mga oportunidad sa negosyo", icon: "briefcase", links: [
    { label: "Start a Business", href: "https://www.negosyodepot.com/#/explore", external: true, keywords: "negosyo simula puhunan package" },
    { label: "Grow My Business", href: "/explore", keywords: "grow lago" },
    { label: "Sell Products & Find Customers", href: "https://www.marketplaceph.com/sell/new", external: true, keywords: "benta sell customers products" },
    { label: "Find Suppliers & Service Providers", href: "https://www.negosyodepot.com/#/find", external: true, keywords: "supplier distributor" },
    { label: "Franchise & Business Packages", href: "https://www.negosyodepot.com/#/explore", external: true, keywords: "franchise package puhunan" },
    { label: "Buy, Sell or Pasalo a Business", href: "https://www.negosyodepot.com/#/sell-business", external: true, keywords: "pasalo buy sell business" },
    { label: "Jobs & Hiring", href: "https://www.marketplaceph.com/jobs", external: true, keywords: "trabaho jobs hiring work employment" },
    { label: "Financing, Grants & Opportunities", href: "/opportunities", keywords: "puhunan financing grants loans pautang opportunities" },
    { label: "Real Estate for MSMEs", href: "/real-estate-for-msmes", keywords: "property pwesto lease" },
    { label: "Affiliate & Referral Opportunities", href: "/get-involved/affiliate", keywords: "kita income referral affiliate" },
    { label: "Easy Startup for Aspiring Managers", href: "https://www.managerspizza.com", external: true, newTab: true, keywords: "pizza manager's pizza franchise" },
  ] },
  { key: "benefits", label: "Benefits & Free Tools", fil: "Libreng benepisyo at tools", icon: "spark", links: [
    { label: "View All Free Benefits", href: "/benefits", keywords: "libre free benefits" },
    { label: "Free Basic POS", href: "/pos", keywords: "pos libre resibo benta" },
    { label: "Ask Ka-FLAME AI", href: "/bizconsult-ai", keywords: "ai flame ai advice tanong" },
    { label: "Free Mini-Website", href: "/account/business", keywords: "libre website landing page" },
    { label: "Free Business Directory", href: "https://pages.flameph.org/directory", external: true, newTab: true, keywords: "libre directory listing" },
    { label: "Business Calculators", href: "/business-calculators", keywords: "calculator libre pricing margin payroll sahod" },
    { label: "MSME Toolkits", href: "/resources", keywords: "templates guides checklists" },
    { label: "Compare Membership Benefits", href: "/membership/more-benefits", keywords: "tiers starter micro neo pro champion upgrade" },
  ] },
  { key: "flagship", label: "Flagship Programs", fil: "Mga pangunahing programa", icon: "award", links: [
    { label: "Group Ordering", href: "/deals", memberHref: "/group-order", keywords: "tipid bulk buy together" },
    { label: "Micro-Fulfillment by MSMEs", href: "/fulfillment", status: "Coming soon", keywords: "fulfillment padala delivery hub" },
    { label: "Sugpuin ang Kahirapan Through Entrepreneurship", href: "/workshops", keywords: "poverty kahirapan workshops" },
    { label: "AI Tools for Business", href: "/trainings-webinars", status: "Beta", keywords: "ai seminars" },
    { label: "Manager / CEO Training Program", href: "/manager-ceo-training", keywords: "trainee apprentice manager ceo" },
    { label: "RideSafe", href: "/ridesafe", status: "Beta", keywords: "roadside vehicle" },
  ] },
  { key: "learning", label: "Learning & Training", fil: "Pag-aaral at pagsasanay", icon: "book", links: [
    { label: "FLAME Academy", href: "/academy", keywords: "courses aral pagsasanay" },
    { label: "Free Workshops & Webinars", href: "/workshops", keywords: "libre workshops seminars" },
    { label: "Events, Expos & Summits", href: "/expos-summits", keywords: "events expo trade fair" },
    { label: "Business Resources", href: "/resources", keywords: "guides" },
    { label: "Find a Mentor", href: "/about/mentors", keywords: "mentor coach" },
    { label: "FLAME Talks with MSMEs", href: "/negosyo-talks", keywords: "talks videos" },
    { label: "Negosyo News", href: "/news", keywords: "balita news" },
  ] },
  { key: "community", label: "Community & Chapters", fil: "Komunidad at mga chapter", icon: "users", links: [
    { label: "Find a Chapter", href: "/chapters", keywords: "chapter komunidad region province city" },
    { label: "Community Forum", href: "/forum", keywords: "forum komunidad" },
    { label: "Chapter Activities", href: "/news", keywords: "activities events" },
    { label: "Featured Chapters", href: "/about/chapters" },
    { label: "Become a Chapter Leader", href: "/get-involved/chapter-builder", keywords: "chapter builder leader" },
    { label: "Volunteer as a Meetup Venue", href: "/get-involved/chapter-builder#venue", keywords: "venue cafe" },
    { label: "Refer or Nominate an MSME", href: "/get-involved/nominate", keywords: "nominate awards" },
    { label: "Groups", href: "/groups", who: "member" },
    { label: "Friends and Requests", href: "/friends", who: "member" },
    { label: "Find Members", href: "/members", who: "member", keywords: "people kapwa" },
  ] },
  { key: "involved", label: "Get Involved", fil: "Makilahok", icon: "hands", links: [
    { label: "All Ways to Get Involved", href: "/get-involved" },
    { label: "Volunteer With FLAME PH", href: "/volunteering", keywords: "volunteer" },
    { label: "Become a Mentor", href: "/get-involved/mentor" },
    { label: "Become a Resource Speaker", href: "/get-involved/resource-speaker", keywords: "speaker" },
    { label: "Offer Professional Services", href: "/get-involved/professional-services", keywords: "lawyer accountant marketing professional" },
    { label: "Build Your Professional Portfolio", href: "/get-involved/professional-services", keywords: "portfolio" },
  ] },
  { key: "partners", label: "Partner With Us", fil: "Makipag-partner", icon: "store", links: [
    { label: "Why Partner With FLAME PH", href: "/partners" },
    { label: "Become an Accredited Partner (Suppliers, Manufacturers, Service Providers)", href: "/partner-us", keywords: "supplier manufacturer service provider accredited best offer toll" },
    { label: "Strategic Partners", href: "/get-involved/partner" },
    { label: "Sponsor or Co-host a Workshop (LGUs, Agencies, Schools, NGOs)", href: "/get-involved/workshop-partner", keywords: "lgu government agency school ngo sponsor" },
    { label: "Sponsor an Event", href: "/get-involved/sponsor-event" },
    { label: "Sponsor a Community", href: "/get-involved/sponsor-community" },
    { label: "Support Poverty-Alleviation Programs", href: "/get-involved/poverty-alleviation", keywords: "kahirapan donate" },
    { label: "Contact Partnership Team", href: "/contact" },
  ] },
  { key: "about", label: "About FLAME PH", fil: "Tungkol sa FLAME PH", icon: "id", links: [
    { label: "Our Mission & Vision", href: "/about" },
    { label: "How the Ecosystem Works", href: "/programs-ecosystem", keywords: "ecosystem" },
    { label: "Our Story & Leadership", href: "/about/founders", keywords: "founders" },
    { label: "Our Team", href: "/about/team" },
    { label: "Featured Partners", href: "/about/partners" },
    { label: "Featured Mentors", href: "/about/mentors" },
    { label: "Impact", href: "/impact" },
    { label: "Annual Awards", href: "/awards", keywords: "awards" },
    { label: "Contact Us", href: "/contact", keywords: "help support tulong email" },
    { label: "Terms of Use", href: "/legal/terms" },
    { label: "Privacy Notice", href: "/legal/privacy" },
    { label: "Community Guidelines", href: "/membership/terms" },
  ] },
];

/** The ecosystem platforms. "One account" is said only where sign-in with FLAME PH is in place (MarketplacePH, NegosyoDepot). */
export type Platform = { key: string; name: string; text: string; href: string; logo: string; here?: boolean; sharedSignIn?: boolean; newTab?: boolean };
export const PLATFORMS: Platform[] = [
  { key: "flameph", name: "FLAMEPH.org", text: "MSME community, membership, business tools, learning and chapters.", href: "/", logo: "/brand/flameph-icon-160.webp", here: true },
  { key: "marketplaceph", name: "MarketplacePH.com", text: "Online selling, product discovery, customers, jobs and hiring.", href: "https://www.marketplaceph.com/", logo: "/ecosystem/marketplaceph-logo.png", sharedSignIn: true },
  { key: "negosyodepot", name: "NegosyoDepot.com", text: "B2B products and services, suppliers, business packages and distribution opportunities.", href: "https://www.negosyodepot.com/", logo: "/ecosystem/negosyodepot-logo.png", sharedSignIn: true },
  { key: "managerspizza", name: "ManagersPizza.com", text: "Pizza business, management, distribution and related business opportunities.", href: "https://www.managerspizza.com", logo: "/ecosystem/managers-pizza-logo.png", newTab: true },
];

/** The Create (+) sheet: existing pages only. Each page checks sign-in and permissions itself. */
export const CREATE_ACTIONS: (MenuLink & { text: string })[] = [
  { label: "Post a Community Update", text: "Share news, photos or a question with members.", href: "/new-post" },
  { label: "Start a Group Order", text: "Gather members who need the same item and ask for a bulk price.", href: "/group-order/new" },
  { label: "Request Professional Assistance", text: "Ask a member for a quote or a service.", href: "/requests/new" },
  { label: "Create or Edit Your Business Page & Listing", text: "Your free directory listing and mini-website.", href: "/account/business" },
  { label: "Post a Product on MarketplacePH", text: "List a product for sale.", href: "https://www.marketplaceph.com/sell/new", external: true },
  { label: "Post a Job on MarketplacePH", text: "Reach applicants for your business.", href: "https://www.marketplaceph.com/jobs/post", external: true },
];

/** What the phone menu shows about a signed-in member. Comes from data the page already loads (no query when the menu opens). */
export type MenuMember = { name: string; avatar: string | null; tier: string; staff: boolean; roleLinks: MenuLink[] };

/** Shortcuts to dashboards, only for roles and accreditation that exist in the database (roles table, partner_profiles). */
export type RoleInfo = { roles: string[]; accredited: boolean };
export function roleLinks({ roles, accredited }: RoleInfo): MenuLink[] {
  const has = (r: string) => roles.includes(r);
  const admin = has("super_admin") || has("admin");
  const out: MenuLink[] = [];
  if (admin || has("editor") || has("chapter_leader")) out.push({ label: "Administration", href: "/admin" });
  if (admin || has("chapter_leader")) out.push({ label: "Chapter Moderation", href: "/admin/moderation" });
  if (admin || has("national_reviewer") || has("chapter_coordinator")) out.push({ label: "Partner Desk", href: "/admin/partners" });
  if (has("finance") && !admin) out.push({ label: "Commissions (Finance)", href: "/admin/partners/commissions" });
  if (accredited) out.push({ label: "Partner Dashboard: My Best Offers", href: "/partner-us/offers" });
  if (has("chapter_tester")) out.push({ label: "Sample Tests", href: "/partner-us/samples" });
  return out;
}

/** Filipino and everyday words, and what they mean on the site. Used by the menu search and the site search. */
export const SYNONYMS: Record<string, string[]> = {
  puhunan: ["financing", "grants", "capital", "package", "franchise", "loans"],
  pautang: ["financing", "loans"],
  trabaho: ["jobs", "hiring", "work"],
  hanapbuhay: ["jobs", "income", "work"],
  negosyo: ["business", "opportunities", "start"],
  libre: ["free", "benefits"],
  supplier: ["suppliers", "service providers", "accredited"],
  benta: ["sell", "sales", "customers", "products", "pos"],
  magbenta: ["sell", "sales", "products"],
  tipid: ["group order", "shared", "save", "deals", "buy together"],
  kita: ["income", "affiliate", "referral", "earn", "jobs"],
  aral: ["academy", "training", "workshops", "courses"],
  pagsasanay: ["training", "academy", "workshops"],
  tulong: ["help", "contact", "assistance", "support"],
  komunidad: ["community", "forum", "chapters"],
  padala: ["delivery", "cargo", "fulfillment"],
  tindahan: ["store", "pos", "mini-website", "sell"],
  resibo: ["pos", "records"],
  sahod: ["payroll", "employee"],
  balita: ["news"],
  kasosyo: ["partner", "joint venture"],
};

/** All menu links in one flat list, with the section they belong to (for search and tests). */
export function allMenuLinks(): { link: MenuLink; section: string }[] {
  return [
    ...QUICK_SHORTCUTS.map((link) => ({ link, section: "Shortcuts" })),
    ...WORKSPACE_LINKS.map((link) => ({ link: { ...link, who: "member" as const }, section: "My FLAME Workspace" })),
    ...SECTIONS.flatMap((s) => s.links.map((link) => ({ link, section: s.label }))),
    ...Object.entries(GOAL_EXTRAS).flatMap(([k, links]) => links.map((link) => ({ link, section: GOAL_GROUPS.find((g) => g.key === k)?.label ?? "" }))),
    ...CREATE_ACTIONS.map((link) => ({ link: { ...link, who: "member" as const }, section: "Create" })),
  ];
}

export const visibleTo = (l: MenuLink, signedIn: boolean) => (l.who ?? "all") === "all" || (l.who === "member" ? signedIn : !signedIn);
export const hrefFor = (l: MenuLink, signedIn: boolean) => (signedIn && l.memberHref ? l.memberHref : l.href);
