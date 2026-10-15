import type { Role } from "@/lib/auth";

export type AdminField = {
  name: string;
  label: string;
  type: "text" | "textarea" | "number" | "date" | "datetime" | "bool" | "select" | "image" | "images" | "privateFile" | "links" | "benefits" | "url" | "tags";
  options?: string[];
  required?: boolean;
  help?: string;
};

export type AdminTable = {
  table: string;
  label: string;
  singular: string;
  roles: Role[];
  columns: string[];
  order: { column: string; ascending: boolean };
  fields: AdminField[];
  publishRule?: { field: string; message: string }; // field that must be set before published=true
  slugFrom?: string;
};

const STAGES = ["discover", "start", "build", "grow", "scale"];
const CONTENT: Role[] = ["super_admin", "admin", "editor"];
const ADMIN: Role[] = ["super_admin", "admin"];

export const ADMIN_TABLES: AdminTable[] = [
  {
    table: "opportunities", label: "Opportunities", singular: "opportunity", roles: CONTENT, columns: ["title", "kind", "province", "deadline", "published"],
    order: { column: "created_at", ascending: false },
    fields: [
      { name: "title", label: "Title", type: "text", required: true },
      { name: "kind", label: "Type", type: "select", options: ["grant", "loan", "trade_fair", "bazaar", "training", "buyer_request", "program", "competition", "other"], required: true },
      { name: "organizer", label: "Organizer (e.g. DTI Region V, DOST, Landbank)", type: "text" },
      { name: "summary", label: "What it is, who can apply, what to prepare", type: "textarea" },
      { name: "url", label: "Official link", type: "url", help: "Link to the organizer's own page so members can verify." },
      { name: "province", label: "Province (leave empty for nationwide)", type: "text" },
      { name: "sectors", label: "Sectors", type: "tags", help: "Use the directory's sector names, e.g. Food & beverage, Agriculture. Leave empty for all sectors." },
      { name: "stages", label: "Stages", type: "tags", help: "Any of: discover, start, build, grow, scale. Leave empty for all stages." },
      { name: "deadline", label: "Application deadline", type: "date" },
      { name: "starts_on", label: "Event or program start", type: "date" },
      { name: "members_only", label: "Only signed-in members can see it", type: "bool" },
      { name: "published", label: "Published", type: "bool" },
    ],
  },
  {
    table: "deals", label: "Buy-together deals", singular: "deal", roles: ADMIN, columns: ["title", "supplier", "deal_price", "deadline", "status", "published"],
    order: { column: "created_at", ascending: false },
    fields: [
      { name: "title", label: "What members are buying", type: "text", required: true },
      { name: "supplier", label: "Supplier", type: "text" },
      { name: "description", label: "Details (specs, pickup or delivery, payment)", type: "textarea" },
      { name: "unit", label: "Unit (e.g. pack of 100, kilo)", type: "text" },
      { name: "deal_price", label: "Group price per unit (₱)", type: "number" },
      { name: "regular_price", label: "Regular price per unit (₱)", type: "number" },
      { name: "target_members", label: "Members needed", type: "number", required: true },
      { name: "deadline", label: "Join by", type: "date" },
      { name: "status", label: "Status", type: "select", options: ["open", "reached", "closed"], required: true },
      { name: "photo_path", label: "Photo", type: "image" },
      { name: "published", label: "Published", type: "bool" },
    ],
  },
  {
    table: "business_reviews", label: "Listing reviews", singular: "review", roles: ADMIN, columns: ["reviewer_name", "rating", "body", "hidden", "created_at"],
    order: { column: "created_at", ascending: false },
    fields: [
      { name: "rating", label: "Rating", type: "number" },
      { name: "body", label: "Review", type: "textarea" },
      { name: "hidden", label: "Hide this review (spam or abusive)", type: "bool" },
    ],
  },
  {
    table: "events", label: "Events", singular: "event", roles: [...CONTENT, "chapter_leader"], columns: ["title", "type", "starts_at", "status", "published"],
    order: { column: "starts_at", ascending: false }, slugFrom: "title",
    fields: [
      { name: "title", label: "Title", type: "text", required: true },
      { name: "type", label: "Type", type: "select", options: ["workshop", "training", "webinar", "expo", "summit", "talk"], required: true },
      { name: "description", label: "Description", type: "textarea" },
      { name: "starts_at", label: "Starts", type: "datetime", required: true },
      { name: "ends_at", label: "Ends", type: "datetime" },
      { name: "venue", label: "Venue", type: "text" }, { name: "city", label: "City", type: "text" }, { name: "province", label: "Province", type: "text" },
      { name: "online_url", label: "Online link", type: "url" },
      { name: "status", label: "Status", type: "select", options: ["draft", "scheduled", "completed", "cancelled"], required: true },
      { name: "capacity", label: "Capacity", type: "number" },
      { name: "registration_open", label: "Registration open", type: "bool" },
      { name: "attendance_actual", label: "Actual attendance (from sign-in sheets)", type: "number", help: "Counts toward the public Event attendees statistic once status is completed." },
      { name: "attendance_source", label: "Attendance source / notes", type: "text", help: "e.g. 'Sign-in sheet, 42 names'" },
      { name: "photos", label: "Real event photos", type: "images", help: "Upload only real photos taken at this event. They are shown as real photos." },
      { name: "published", label: "Published", type: "bool" },
    ],
  },
  {
    table: "resources", label: "Resources", singular: "resource", roles: CONTENT, columns: ["title", "type", "stage", "last_reviewed", "published"],
    order: { column: "created_at", ascending: false }, slugFrom: "title",
    publishRule: { field: "last_reviewed", message: "Set a 'last reviewed' date before publishing." },
    fields: [
      { name: "title", label: "Title", type: "text", required: true },
      { name: "summary", label: "Summary", type: "textarea" },
      { name: "body", label: "Body (simple Markdown: ## headings, - lists, **bold**, [links](https://...))", type: "textarea" },
      { name: "type", label: "Type", type: "select", options: ["guide", "template", "checklist", "video", "article"], required: true },
      { name: "stage", label: "Stage", type: "select", options: STAGES },
      { name: "topic", label: "Topic (e.g. permits, pricing, tax, food safety)", type: "text" },
      { name: "file_path", label: "Downloadable file", type: "image", help: "PDF, DOCX, XLSX or image." },
      { name: "external_url", label: "Or external link", type: "url" },
      { name: "last_reviewed", label: "Last reviewed", type: "date" },
      { name: "source_links", label: "Official source links", type: "links" },
      { name: "published", label: "Published", type: "bool" },
    ],
  },
  {
    table: "posts", label: "News posts", singular: "post", roles: CONTENT, columns: ["title", "published_at", "published"],
    order: { column: "created_at", ascending: false }, slugFrom: "title",
    fields: [
      { name: "title", label: "Title", type: "text", required: true },
      { name: "excerpt", label: "Excerpt", type: "textarea" },
      { name: "body", label: "Body (simple Markdown)", type: "textarea" },
      { name: "cover_path", label: "Cover image", type: "image" },
      { name: "cover_is_real_photo", label: "Cover is a real photo (not an illustration)", type: "bool" },
      { name: "published_at", label: "Publish date", type: "datetime" },
      { name: "published", label: "Published", type: "bool" },
    ],
  },
  {
    table: "episodes", label: "NegosyoTalks episodes", singular: "episode", roles: CONTENT, columns: ["title", "guest", "aired_on", "published"],
    order: { column: "aired_on", ascending: false },
    fields: [
      { name: "title", label: "Title", type: "text", required: true }, { name: "guest", label: "Guest", type: "text" },
      { name: "description", label: "Description", type: "textarea" }, { name: "video_url", label: "YouTube or Facebook video URL", type: "url" },
      { name: "aired_on", label: "Aired on", type: "date" }, { name: "published", label: "Published", type: "bool" },
    ],
  },
  {
    table: "courses", label: "Academy courses", singular: "course", roles: CONTENT, columns: ["title", "stage", "published"],
    order: { column: "created_at", ascending: false },
    fields: [
      { name: "title", label: "Title", type: "text", required: true }, { name: "stage", label: "Stage", type: "select", options: STAGES, required: true },
      { name: "summary", label: "Summary", type: "textarea" }, { name: "url", label: "Course link", type: "url" }, { name: "published", label: "Published", type: "bool" },
    ],
  },
  {
    table: "chapters", label: "Chapters", singular: "chapter", roles: [...ADMIN, "chapter_leader"], columns: ["name", "province", "city", "status", "published"],
    order: { column: "name", ascending: true }, slugFrom: "name",
    fields: [
      { name: "name", label: "Chapter name", type: "text", required: true },
      { name: "region", label: "Region", type: "text" }, { name: "province", label: "Province", type: "text" }, { name: "city", label: "City / Municipality", type: "text" },
      { name: "leader_name", label: "Leader name", type: "text" }, { name: "description", label: "Description", type: "textarea" },
      { name: "contact_url", label: "Contact link (Facebook group, etc.)", type: "url" },
      { name: "status", label: "Status", type: "select", options: ["forming", "active", "inactive"], required: true },
      { name: "featured", label: "Featured on About page", type: "bool" }, { name: "published", label: "Published", type: "bool" },
    ],
  },
  {
    table: "mentors", label: "Mentors", singular: "mentor", roles: ADMIN, columns: ["name", "expertise", "consent_to_list", "published"],
    order: { column: "created_at", ascending: false }, publishRule: { field: "consent_to_list", message: "A mentor can only be published with their consent." },
    fields: [
      { name: "name", label: "Name", type: "text", required: true }, { name: "expertise", label: "Expertise", type: "text" },
      { name: "bio", label: "Bio", type: "textarea" }, { name: "city", label: "City", type: "text" }, { name: "photo_path", label: "Photo", type: "image" },
      { name: "profile_url", label: "Profile link", type: "url" },
      { name: "consent_to_list", label: "Mentor consented to be listed publicly", type: "bool" },
      { name: "featured", label: "Featured", type: "bool" }, { name: "published", label: "Published", type: "bool" },
    ],
  },
  {
    table: "team_members", label: "Team members", singular: "team member", roles: ADMIN, columns: ["name", "role", "consent_to_list", "published"],
    order: { column: "sort", ascending: true }, publishRule: { field: "consent_to_list", message: "A team member can only be published with their consent." },
    fields: [
      { name: "name", label: "Name", type: "text", required: true }, { name: "role", label: "Role", type: "text" }, { name: "bio", label: "Bio", type: "textarea" },
      { name: "photo_path", label: "Photo", type: "image" }, { name: "sort", label: "Sort order", type: "number" },
      { name: "consent_to_list", label: "Consented to be listed publicly", type: "bool" }, { name: "published", label: "Published", type: "bool" },
    ],
  },
  {
    table: "founders", label: "Founders", singular: "founder", roles: ADMIN, columns: ["name", "title", "sort"],
    order: { column: "sort", ascending: true },
    fields: [
      { name: "name", label: "Name", type: "text", required: true }, { name: "title", label: "Title", type: "text", required: true },
      { name: "bio", label: "Bio", type: "textarea", required: true }, { name: "photo_path", label: "Real photo", type: "image" },
      { name: "linkedin_url", label: "LinkedIn", type: "url" }, { name: "facebook_url", label: "Facebook", type: "url" },
      { name: "sort", label: "Sort order", type: "number" }, { name: "published", label: "Published", type: "bool" },
    ],
  },
  {
    table: "partners", label: "Partners", singular: "partner", roles: ADMIN, columns: ["name", "partnership_type", "proof_file", "published"],
    order: { column: "created_at", ascending: false }, publishRule: { field: "proof_file", message: "Upload a proof file (MOU, letter or email PDF) before publishing a partner." },
    fields: [
      { name: "name", label: "Organization", type: "text", required: true }, { name: "partnership_type", label: "Partnership type", type: "text" },
      { name: "description", label: "Description", type: "textarea" }, { name: "logo_path", label: "Logo", type: "image" }, { name: "website", label: "Website", type: "url" },
      { name: "proof_file", label: "Proof of partnership (private)", type: "privateFile", help: "MOU, signed letter or email PDF. Never shown publicly." },
      { name: "featured", label: "Featured", type: "bool" }, { name: "published", label: "Published", type: "bool" },
    ],
  },
  {
    table: "stories", label: "Stories & testimonials", singular: "story", roles: ADMIN, columns: ["member_name", "business_name", "consent_file", "published"],
    order: { column: "created_at", ascending: false }, publishRule: { field: "consent_file", message: "Upload the member's signed consent before publishing a story." },
    fields: [
      { name: "member_name", label: "Member name", type: "text", required: true }, { name: "business_name", label: "Business", type: "text" },
      { name: "city", label: "City", type: "text" }, { name: "story", label: "Story", type: "textarea", required: true }, { name: "photo_path", label: "Photo", type: "image" },
      { name: "consent_file", label: "Signed consent (private)", type: "privateFile" }, { name: "published", label: "Published", type: "bool" },
    ],
  },
  {
    table: "merch_products", label: "Merch & Signature Brands", singular: "product", roles: ADMIN, columns: ["name", "kind", "price_php", "published"],
    order: { column: "sort", ascending: true },
    fields: [
      { name: "name", label: "Name", type: "text", required: true }, { name: "kind", label: "Catalog", type: "select", options: ["merch", "signature_brand"], required: true },
      { name: "maker", label: "Maker (for Signature Brands)", type: "text" }, { name: "description", label: "Description", type: "textarea" },
      { name: "price_php", label: "Price (₱)", type: "number" }, { name: "photo_path", label: "Photo", type: "image" },
      { name: "sort", label: "Sort order", type: "number" }, { name: "published", label: "Published", type: "bool" },
    ],
  },
  {
    table: "tiers", label: "Membership tiers", singular: "tier", roles: ADMIN, columns: ["name", "price_php", "available", "sort"],
    order: { column: "sort", ascending: true },
    fields: [
      { name: "slug", label: "Slug", type: "text", required: true }, { name: "name", label: "Name", type: "text", required: true },
      { name: "sort", label: "Sort order", type: "number", required: true },
      { name: "price_php", label: "Price (₱). Leave empty to hide", type: "number" }, { name: "price_period", label: "Price period", type: "select", options: ["month", "year"] },
      { name: "benefits", label: "Benefits", type: "benefits", help: "Only list benefits that truly exist, with honest status." },
      { name: "available", label: "Available to join now", type: "bool", help: "Keep off: paid tiers can't be purchased on this site yet." },
    ],
  },
  {
    table: "awards_cycles", label: "Awards cycles", singular: "awards cycle", roles: ADMIN, columns: ["title", "year", "nominations_open", "published"],
    order: { column: "year", ascending: false },
    fields: [
      { name: "title", label: "Title", type: "text", required: true }, { name: "year", label: "Year", type: "number", required: true },
      { name: "criteria", label: "Criteria", type: "textarea" }, { name: "opens_on", label: "Nominations open", type: "date" },
      { name: "closes_on", label: "Nominations close", type: "date" }, { name: "ceremony_on", label: "Awarding date", type: "date" },
      { name: "nominations_open", label: "Nominations open now", type: "bool" }, { name: "published", label: "Published", type: "bool" },
    ],
  },
  {
    table: "policy_positions", label: "Policy positions", singular: "policy position", roles: ADMIN, columns: ["title", "approved_by", "published"],
    order: { column: "created_at", ascending: false }, publishRule: { field: "approved_by", message: "Record who approved this position before publishing." },
    fields: [
      { name: "title", label: "Title", type: "text", required: true }, { name: "body", label: "Position (simple Markdown)", type: "textarea", required: true },
      { name: "approved_by", label: "Approved by (board resolution, date)", type: "text" }, { name: "published", label: "Published", type: "bool" },
    ],
  },
];

export const getAdminTable = (t: string) => ADMIN_TABLES.find((x) => x.table === t);
export const PK: Record<string, string> = { tiers: "slug" };
