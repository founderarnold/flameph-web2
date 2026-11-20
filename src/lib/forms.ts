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
    fields: [name, email, { ...mobile, help: "So our team can call or text you. We never share it publicly." },
      { ...city, help: "The city or town where you want to start or help build a chapter." }, province,
      { name: "business", label: "Your business or work", required: true, help: "What you do now, for example: bakery owner, accountant, barangay officer, student leader." },
      { name: "why", label: "Why do you want to lead a FLAME PH chapter here?", type: "textarea", required: true, help: "In a few sentences: what local MSMEs need, and how you want to help." },
      { name: "network", label: "Who in your community could join you? (MSMEs, groups, barangay)", type: "textarea", help: "Optional. Groups or people you can invite, like a market vendors' association, a cooperative or a school." }],
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
  "real-estate-property": {
    type: "real-estate-property",
    title: "New Property Inquiry",
    intro: "Tell us what kind of property or business location you need. A property specialist will review the requirement before suggesting any option.",
    notificationAudience: "real-estate",
    submitLabel: "Submit Property Requirement",
    fields: [
      { name: "property_type", label: "Property requirement", type: "select", required: true, options: ["Commercial space", "Commercial lot", "Office", "Warehouse", "Commissary", "Production facility", "Raw land", "Residential property", "Agricultural property", "Investment property", "Micro-fulfillment location", "Other"] },
      { name: "purpose", label: "How will you use the property?", type: "select", required: true, options: ["Start a business", "Operate an existing business", "Business expansion", "Branch location", "Warehouse / distribution", "Manufacturing / production", "Personal residence", "Investment", "Rental income", "Agriculture", "Other"] },
      { name: "transaction_type", label: "Do you want to buy or lease?", type: "select", required: true, options: ["Buy", "Lease", "Not sure"] },
      province, city,
      { name: "preferred_area", label: "Preferred barangay or area" },
      { name: "budget", label: "Approximate purchase or monthly lease budget", required: true, placeholder: "Example: ₱25,000 monthly lease budget or ₱3M purchase budget" },
      { name: "size_requirement", label: "Approximate floor or lot area", placeholder: "Example: 80 sqm floor area" },
      { name: "timeline", label: "When do you need it?", type: "select", required: true, options: ["Immediately", "Within 30 days", "1–3 months", "3–6 months", "Researching only"] },
      { name: "financing", label: "Financing preference", type: "select", options: ["Cash", "Bank financing", "Pag-IBIG where applicable", "Developer financing", "Need help understanding options", "Not decided"] },
      name, email, { ...mobile, required: true },
      { name: "preferred_contact", label: "Preferred contact method", type: "select", required: true, options: ["Email", "Phone call", "SMS", "Messenger / Viber"] },
      { name: "additional_details", label: "Other requirements", type: "textarea", placeholder: "Tell us about parking, road access, power, loading area, preferred project, or other needs." },
      { name: "partner_forwarding_consent", label: "I agree that FLAME PH may forward this property inquiry to its designated real-estate/property partner for assistance.", type: "checkbox", required: true },
    ],
    success: "Your property requirement was received. FLAME PH or an authorized property specialist will contact you after reviewing the details.",
  },
  "real-estate-referral-partner": {
    type: "real-estate-referral-partner",
    title: "New Referral Partner Application",
    intro: "Apply for orientation to learn the approved referral pathway. Applying does not make anyone a broker, salesperson, or agent.",
    notificationAudience: "real-estate",
    submitLabel: "Submit Referral Partner Application",
    fields: [
      name, email, { ...mobile, required: true }, province, city,
      { name: "current_work_business", label: "Current work or business" },
      { name: "source", label: "How did you hear about this?", type: "select", required: true, options: ["FLAME PH", "Corporate H member", "Facebook", "Mapiles Realty", "Mapiles AI", "MarketplacePH", "Event / seminar", "Friend / family", "Other"] },
      { name: "referred_by", label: "Referred by (if applicable)" },
      { name: "network_size", label: "Approximate network size", type: "select", options: ["Below 50", "50–199", "200–499", "500–999", "1,000+", "Not sure"] },
      { name: "interest_reason", label: "Why are you interested in the referral program?", type: "textarea", required: true },
      { name: "referral_terms", label: "I understand that an application or FLAME PH membership does not authorize me to perform regulated real-estate activities or make unauthorized promises.", type: "checkbox", required: true },
      { name: "partner_data_sharing", label: "I authorize FLAME PH to securely forward this application to designated Mapiles Realty Corporate H reviewers.", type: "checkbox", required: true },
    ],
    success: "Your referral-partner application was received for initial review and orientation. Approval and participation requirements will be explained separately.",
  },
  "real-estate-career": {
    type: "real-estate-career",
    title: "New Corporate H Professional Application",
    intro: "Choose the professional path that fits your background. Company review is separate from any required accreditation, licensing, appointment, or regulatory process.",
    notificationAudience: "real-estate",
    submitLabel: "Submit Professional Application",
    fields: [
      name, email, { ...mobile, required: true }, province, city,
      { name: "participation_type", label: "Participation type", type: "select", required: true, options: ["Associate / training pathway", "Professional / leadership opportunity"] },
      { name: "position_applied", label: "Position or pathway", type: "select", required: true, options: ["Marketing Associate", "Sales Associate", "Real Estate Salesperson Pathway", "Sales Manager", "Licensed Broker Opportunity"] },
      { name: "source", label: "How did you hear about this?", type: "select", required: true, options: ["FLAME PH", "Corporate H member", "Facebook", "Mapiles Realty", "Mapiles AI", "MarketplacePH", "Event / seminar", "Friend / family", "Other"] },
      { name: "current_work", label: "Current work or business" },
      { name: "real_estate_experience", label: "Relevant sales, leadership, marketing, or real-estate experience", type: "textarea" },
      { name: "salesperson_status", label: "Real Estate Salesperson status", type: "select", required: true, options: ["Not accredited", "Accredited — subject to verification", "Not applicable / not sure"] },
      { name: "broker_status", label: "PRC Real Estate Broker status", type: "select", required: true, options: ["Not licensed", "Licensed — subject to verification", "Not applicable / not sure"] },
      { name: "professional_goals", label: "What do you want to learn or achieve?", type: "textarea", required: true },
      { name: "application_consent", label: "I consent to the processing of my information for this Corporate H application, screening, communication, and onboarding.", type: "checkbox", required: true },
      { name: "career_data_sharing", label: "I authorize FLAME PH to securely forward this application to authorized Mapiles Realty Corporate H reviewers.", type: "checkbox", required: true },
    ],
    success: "Your professional application was received for initial review. Any training, document, accreditation, or appointment requirements will be communicated separately.",
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
  "meetup-venue": {
    type: "meetup-venue", title: "Volunteer as a FLAME PH Meetup Venue",
    intro: "Offer your space for free or low-cost MSME meetups, workshops or chapter meetings. You choose when and how often.",
    fields: [name, email, { ...mobile, required: true, help: "Our chapter team will call or text you to visit and plan the first meetup." },
      { name: "venue_name", label: "Name of the venue or business", required: true, help: "Example: Aling Nena's Café, Barangay San Jose Hall, ABC Co-working." },
      { name: "venue_type", label: "What kind of place is it?", type: "select", required: true, options: ["Café or restaurant", "Store or showroom", "Office or co-working space", "Function room or events place", "School or training room", "Barangay hall or LGU facility", "Church or community center", "Cooperative office", "Other"], help: "Pick the closest one." },
      { name: "address", label: "Address or landmark", required: true, help: "Street and barangay, or a well-known landmark nearby." }, city, province,
      { name: "capacity", label: "How many people can sit comfortably?", type: "select", required: true, options: ["Up to 10", "11–25", "26–50", "51–100", "More than 100"], help: "A rough count is fine." },
      { name: "available_when", label: "When is the space usually free?", type: "select", required: true, options: ["Weekday mornings", "Weekday afternoons", "Weekday evenings", "Weekends", "Flexible, just ask"], help: "Choose the time that suits you best. We can agree on exact dates later." },
      { name: "cost", label: "Is there a cost to use the space?", type: "select", required: true, options: ["Free", "Free if participants buy food or drinks", "Small fee to cover costs", "Let's discuss"], help: "Many venues host for free in exchange for new customers and visibility." },
      { name: "facilities", label: "What can you provide?", type: "textarea", help: "Optional. For example: tables and chairs, TV or projector, Wi-Fi, sound system, parking, PWD access." },
      { name: "photos_url", label: "Link to photos of the space (Facebook page, Google Maps)", type: "url", help: "Optional. Helps our team picture the space before visiting." },
      { name: "host_ok", label: "I am the owner or am allowed to offer this venue for FLAME PH meetups.", type: "checkbox", required: true }],
    success: "Salamat! A FLAME PH chapter team member will contact you to visit the venue and plan a meetup.",
  },
  "fulfillment-waitlist": {
    type: "fulfillment-waitlist", title: "Join the Micro Fulfillment waitlist",
    intro: "Tell us if you want your products distributed (MSME brand owner), want to run a small fulfillment hub (hub operator), or both. This is a waitlist for the pilot; it does not commit you to anything.",
    submitLabel: "Join the waitlist",
    fields: [
      { name: "role", label: "I am joining as…", type: "select", required: true, options: ["MSME brand owner (I want my products distributed)", "Fulfillment hub operator (I have space, staff or riders)", "Both"], help: "Brand owner = you make or sell products. Hub operator = you can store, pack or deliver products for other MSMEs." },
      name, email, { ...mobile, required: true, help: "We will text or call you when the pilot opens in your area." },
      { name: "business", label: "Business name", required: true, help: "Your registered or trade name. If not registered yet, the name you use with customers." },
      { ...city, help: "Where your business or space is located." }, province,
      { name: "registration", label: "Is your business registered?", type: "select", required: true, options: ["DTI", "SEC", "CDA (cooperative)", "BMBE", "Barangay permit / Mayor's permit only", "Not yet registered"], help: "Choose the main registration you have. Not registered yet is okay; we can guide you." },
      { name: "products", label: "Brand owners: what products do you sell?", type: "textarea", help: "Only if you are a brand owner. Example: bottled sauces, dried fish, soap, snacks. Mention if any need refrigeration." },
      { name: "monthly_volume", label: "Brand owners: about how many orders or pieces do you sell per month?", type: "select", options: ["Below 100", "100–500", "501–2,000", "More than 2,000", "Just starting"], help: "A rough estimate helps us plan hub space." },
      { name: "target_areas", label: "Brand owners: where do you want your products to reach?", type: "textarea", help: "Cities, provinces or regions. Example: all of Luzon, Metro Cebu, Davao Region." },
      { name: "space_type", label: "Hub operators: what space do you have?", type: "select", options: ["Store or sari-sari store", "Bodega or stock room", "Garage or spare room", "Warehouse", "Office", "Other"], help: "Only if you want to be a hub operator. Choose the place where you could keep other MSMEs' products." },
      { name: "space_size", label: "Hub operators: about how big is the space?", type: "select", options: ["Small (a few shelves)", "Medium (a room)", "Large (a bodega or warehouse)"], help: "No need to measure. Just your best estimate." },
      { name: "delivery", label: "Hub operators: can you deliver or arrange pickups?", type: "select", options: ["Yes, I have my own riders or vehicle", "Yes, through courier partners", "Pickup only (customers or couriers collect)", "Not yet"], help: "This tells us if your hub can handle last-mile delivery in your area." },
      { name: "notes", label: "Anything else we should know?", type: "textarea", help: "Optional. Questions, concerns or ideas." },
      { name: "pilot_ok", label: "I understand this is a waitlist for a pilot. Joining does not guarantee a slot, and terms and fees will be explained before anything starts.", type: "checkbox", required: true },
    ],
    success: "You're on the Micro Fulfillment waitlist. We'll contact you when the pilot opens in your area.",
  },
  "manager-trainee": {
    type: "manager-trainee", title: "Apply for the Manager/CEO Training Program", partnership: true,
    intro: "Apprenticeship and management trainee program for future managers and CEOs, through Manager's Pizza and FLAME PH partners. Fill in what you can; you may send more documents later.",
    submitLabel: "Submit my application",
    fields: [
      name, email, { ...mobile, required: true, help: "For interview scheduling." }, city, province,
      { name: "age_ok", label: "I am at least 18 years old.", type: "checkbox", required: true },
      { name: "track", label: "Which program are you applying for?", type: "select", required: true, options: ["Apprenticeship (learn by working in an actual store)", "Management trainee (train to manage a branch or business)", "Not sure yet, please advise me"], help: "Apprenticeship is hands-on work in a store. Management trainee is a longer path toward running a branch or business." },
      { name: "status", label: "What are you doing now?", type: "select", required: true, options: ["Student", "Fresh graduate", "Employed", "Self-employed / business owner", "Looking for work", "OFW or returning OFW", "Other"] },
      { name: "education", label: "Highest education completed", type: "select", required: true, options: ["High school", "Senior high school", "Vocational / TESDA", "College undergraduate", "College graduate", "Master's degree or higher"] },
      { name: "school_course", label: "School and course", help: "Example: PUP, BS Business Administration, 2022." },
      { name: "work_history", label: "Work experience", type: "textarea", required: true, help: "List your jobs, most recent first: company, position, years worked and main duties. If you have no job yet, write about part-time work, school projects or family business." },
      { name: "management_years", label: "Years of experience leading people or running a business", type: "select", required: true, options: ["None yet", "Less than 1 year", "1–2 years", "3–5 years", "More than 5 years"], help: "Include supervising staff, leading a team, or running your own small business." },
      { name: "food_retail", label: "Have you worked in food service or retail?", type: "select", options: ["Yes", "No"] },
      { name: "credentials", label: "Trainings, certificates and credentials", type: "textarea", help: "Example: TESDA NC II, food safety training, licenses, awards, leadership roles." },
      { name: "resume_url", label: "Link to your resume or LinkedIn profile", type: "url", help: "Optional. A Google Drive or LinkedIn link. Make sure it can be opened by anyone with the link." },
      { name: "why", label: "Why do you want to become a manager or CEO?", type: "textarea", required: true, help: "Tell us your goals and what kind of business you dream of running." },
      { name: "availability", label: "When can you start?", type: "select", required: true, options: ["Immediately", "Within 1 month", "1–3 months", "After graduation"] },
      { name: "relocate", label: "Are you willing to train in another city?", type: "select", options: ["Yes", "No", "Depends on the location"] },
      { name: "forward_ok", label: "I allow FLAME PH to share this application with Manager's Pizza and FLAME PH partner companies for screening.", type: "checkbox", required: true },
    ],
    success: "Salamat! Your application was received. The Manager's Pizza and FLAME PH partners team will review it and contact you about next steps.",
  },
  volunteer: {
    type: "volunteer", title: "General volunteer sign-up",
    fields: [name, email, mobile, city, { name: "skills", label: "Skills and interests", type: "textarea", required: true }],
    success: "Salamat! We'll match you with a role.",
  },
};

export const FORM_TYPES = Object.keys(FORMS);
