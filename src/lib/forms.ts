// Every public form is defined here. The API validates submissions against these definitions.
export type Field = {
  name: string;
  label: string;
  type?: "text" | "email" | "tel" | "textarea" | "select" | "url" | "number" | "date" | "checkbox";
  required?: boolean;
  options?: string[];
  placeholder?: string;
  help?: string;
};

export type FormDef = {
  type: string;
  title: string;
  intro?: string;
  fields: Field[];
  partnership?: boolean; // CC the partnerships email
  notificationAudience?: "general" | "real-estate";
  submitLabel?: string;
  success: string;
};

const name: Field = { name: "name", label: "Full name", required: true };
const email: Field = { name: "email", label: "Email", type: "email", required: true };
const mobile: Field = { name: "mobile", label: "Mobile number", type: "tel", placeholder: "09XX XXX XXXX" };
const city: Field = { name: "city", label: "City / Municipality", required: true };
const province: Field = { name: "province", label: "Province", required: true };
const org: Field = { name: "organization", label: "Organization / Business (if any)" };
const message = (label = "Message", required = true): Field => ({ name: "message", label, type: "textarea", required });

const STAGES = ["Discover (may idea pa lang)", "Start (bagong negosyo)", "Build", "Grow", "Scale"];
const AWARD_CATEGORIES = ["Resilience", "Innovation", "Job generation", "Women-led", "Youth-led"];

export const FORMS: Record<string, FormDef> = {
  contact: {
    type: "contact", title: "Send us a message",
    fields: [name, email, mobile, { name: "subject", label: "Subject", required: true }, message()],
    success: "Salamat! We received your message and will reply by email.",
  },
  mentor: {
    type: "mentor", title: "Apply as a volunteer mentor",
    fields: [name, email, mobile, city, province,
      { name: "expertise", label: "Areas you can mentor in", type: "textarea", required: true, placeholder: "e.g. food costing, online selling, bookkeeping" },
      { name: "experience", label: "Your business or professional experience", type: "textarea", required: true },
      { name: "hours", label: "Hours you can give per month", type: "select", options: ["1–2", "3–5", "6–10", "More than 10"], required: true },
      { name: "profile_url", label: "LinkedIn or Facebook profile", type: "url" },
      { name: "consent_list", label: "If approved, I agree to be listed publicly as a FLAME PH mentor.", type: "checkbox" }],
    success: "Salamat sa malasakit! Our team will review your application and contact you.",
  },
  partner: {
    type: "partner", title: "Partner with FLAME PH", partnership: true,
    fields: [name, email, mobile, { name: "organization", label: "Organization", required: true }, { name: "position", label: "Your position" },
      { name: "partnership_type", label: "Type of partnership", type: "select", required: true, options: ["Government agency / LGU", "Academe", "Corporate / CSR", "Financial institution", "NGO / Foundation", "Media", "Technology", "Other"] },
      message("What would you like to do together?")],
    success: "Thank you. Our partnerships team will reach out. Partners are listed publicly only after a signed agreement.",
  },
  "sponsor-event": {
    type: "sponsor-event", title: "Sponsor an event", partnership: true,
    fields: [name, email, mobile, org,
      { name: "sponsorship", label: "What would you like to sponsor?", type: "select", required: true, options: ["In-kind goods", "Venue", "Food", "Prizes / giveaways", "Speakers", "Other"] },
      { name: "location", label: "Preferred city or province" }, message("Details")],
    success: "Salamat! We'll contact you about upcoming events that fit your sponsorship.",
  },
  "sponsor-community": {
    type: "sponsor-community", title: "Sponsor a community", partnership: true,
    fields: [name, email, mobile, org,
      { name: "community", label: "Barangay, municipality or chapter you want to support", required: true },
      { name: "support", label: "How would you like to help?", type: "textarea", required: true }],
    success: "Salamat! Our team will get in touch to plan the program with you.",
  },
  nominate: {
    type: "nominate", title: "Nominate an MSME awardee",
    fields: [{ name: "nominee_name", label: "Nominee (owner) name", required: true }, { name: "nominee_business", label: "Business name", required: true },
      { name: "nominee_city", label: "City / Province", required: true },
      { name: "category", label: "Award category", type: "select", options: AWARD_CATEGORIES, required: true },
      { name: "story", label: "Why should this MSME be recognized?", type: "textarea", required: true },
      { name: "nominee_contact", label: "Nominee's email or mobile", required: true },
      { ...name, label: "Your name" }, { ...email, label: "Your email" },
      { name: "nominee_consent", label: "The nominee knows about and agrees to this nomination.", type: "checkbox", required: true }],
    success: "Salamat sa nomination! We'll review it once the awards cycle opens.",
  },
  "poverty-alleviation": {
    type: "poverty-alleviation", title: "Support Sugpuin ang Kahirapan",
    fields: [name, email, mobile, org,
      { name: "help_type", label: "How would you like to help?", type: "select", required: true, options: ["Give time (volunteer)", "Share skills (training, mentoring)", "In-kind donation", "Fund a program (we will contact you)"] },
      message("Tell us more")],
    success: "Maraming salamat! We'll reply with the next steps.",
  },
  affiliate: {
    type: "affiliate", title: "Affiliate marketer interest",
    fields: [name, email, mobile, city, { name: "channels", label: "Where do you promote? (Facebook, TikTok, etc.)", required: true }, { name: "audience", label: "Approximate audience size, if known" }],
    success: "Salamat! We'll let you know when the affiliate program opens.",
  },
  "chapter-leader": {
    type: "chapter-leader", title: "Apply to be a chapter leader",
    fields: [name, email, mobile, city, province, { name: "business", label: "Your business or work", required: true },
      { name: "why", label: "Why do you want to lead a FLAME PH chapter here?", type: "textarea", required: true },
      { name: "network", label: "Who in your community could join you? (MSMEs, groups, barangay)", type: "textarea" }],
    success: "Salamat! Our team will contact you to talk about starting a chapter.",
  },
  "resource-speaker": {
    type: "resource-speaker", title: "Volunteer as a resource speaker",
    fields: [name, email, mobile, city, { name: "topics", label: "Topics you can talk about", type: "textarea", required: true },
      { name: "credentials", label: "Your background in these topics", type: "textarea", required: true },
      { name: "video_url", label: "Link to a sample talk or video", type: "url" },
      { name: "format", label: "Preferred format", type: "select", options: ["In person", "Online", "Either"] }],
    success: "Salamat! We'll reach out when an event matches your topics.",
  },
  "professional-services": {
    type: "professional-services", title: "Volunteer your professional services",
    fields: [name, email, mobile, city,
      { name: "service", label: "Service you can offer", type: "select", required: true, options: ["Web / app development", "Social media", "Tax", "Bookkeeping", "Accounting", "Advertising", "Legal", "Design", "Other"] },
      { name: "experience", label: "Experience and credentials", type: "textarea", required: true },
      { name: "hours", label: "Hours you can give per month", type: "select", options: ["1–2", "3–5", "6–10", "More than 10"] }],
    success: "Salamat! Our team will match you with MSMEs who need your help.",
  },
  "workshop-request": {
    type: "workshop-request", title: "Request a free workshop for your LGU or barangay", partnership: true,
    fields: [name, email, mobile, { name: "organization", label: "LGU, barangay, school or group", required: true }, city, province,
      { name: "topic", label: "Topics you need", type: "textarea", required: true },
      { name: "participants", label: "Expected number of participants", type: "number" },
      { name: "preferred_date", label: "Preferred date", type: "date" }],
    success: "Salamat! We'll contact you to plan the workshop.",
  },
  "event-registration": {
    type: "event-registration", title: "Register for this event",
    fields: [name, email, mobile, city, { name: "business", label: "Business name (if any)" }],
    success: "You're registered! We'll email you the details.",
  },
  exhibitor: {
    type: "exhibitor", title: "Exhibitor interest",
    fields: [name, email, mobile, { name: "business", label: "Business name", required: true }, { name: "products", label: "Products you want to exhibit", type: "textarea", required: true }, city],
    success: "Salamat! We'll let you know when exhibitor slots open.",
  },
  "talk-topic": {
    type: "talk-topic", title: "Suggest a topic or be a guest",
    fields: [name, email, { name: "kind", label: "I want to…", type: "select", required: true, options: ["Suggest a topic", "Be a guest"] }, message("Topic or your story")],
    success: "Salamat! We read every suggestion.",
  },
  "merch-inquiry": {
    type: "merch-inquiry", title: "Merch inquiry",
    fields: [name, email, mobile, { name: "items", label: "Items and quantities", type: "textarea", required: true }, city],
    success: "Salamat! We'll reply with availability. No payment is collected on this website.",
  },
  personalized: {
    type: "personalized", title: "Request a personalized product",
    fields: [name, email, mobile, { name: "product", label: "What would you like personalized?", type: "textarea", required: true }, { name: "quantity", label: "Quantity", type: "number" }, { name: "needed_by", label: "Needed by", type: "date" }],
    success: "Salamat! We'll get back to you once this service opens.",
  },
  fulfillment: {
    type: "fulfillment", title: "Apply as a fulfillment partner",
    fields: [name, email, mobile, { name: "business", label: "Business name", required: true }, city, province,
      { name: "capability", label: "What can you produce, pack or deliver?", type: "textarea", required: true },
      { name: "registration", label: "Business registration (DTI/SEC/BMBE), if any" }],
    success: "Salamat! We'll contact you when the program opens.",
  },
  "pos-waitlist": {
    type: "pos-waitlist", title: "Join the Free POS waitlist",
    fields: [name, email, mobile, { name: "business", label: "Business name" }, { name: "business_type", label: "Type of business", type: "select", options: ["Food / carinderia", "Sari-sari store", "Retail", "Services", "Online seller", "Other"] }],
    success: "You're on the waitlist. We'll email you when the POS is ready.",
  },
  "academy-waitlist": {
    type: "academy-waitlist", title: "Get notified when courses open",
    fields: [name, email, { name: "stage", label: "Your business stage", type: "select", options: STAGES }, { name: "topics", label: "Topics you want to learn" }],
    success: "Salamat! We'll email you when the first course is published.",
  },
  "tier-waitlist": {
    type: "tier-waitlist", title: "Join the paid-tier waitlist",
    fields: [name, email, mobile, { name: "tier", label: "Tier you're interested in", type: "select", options: ["Starter", "Micro", "Neo", "Pro", "Champion"], required: true }, { name: "needs", label: "Which benefits matter most to you?", type: "textarea" }],
    success: "Salamat! You're on the waitlist. No payment is collected on this website.",
  },
  volunteer: {
    type: "volunteer", title: "General volunteer sign-up",
    fields: [name, email, mobile, city, { name: "skills", label: "Skills and interests", type: "textarea", required: true }],
    success: "Salamat! We'll match you with a role.",
  },
};

export const FORM_TYPES = Object.keys(FORMS);
