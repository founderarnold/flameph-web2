import type { Status } from "@/components/StatusBadge";

export type InvolvedPage = {
  slug: string; title: string; fil: string; status: Status; intro: string; description: string; form: string;
  sections: { title: string; items: string[] }[]; note?: string;
};

export const INVOLVED: InvolvedPage[] = [
  { slug: "mentor", title: "Volunteer as Mentor", fil: "Maging mentor", status: "live", form: "mentor",
    intro: "Share what you've learned in business with entrepreneurs who are just starting or trying to grow.",
    description: "Volunteer as a FLAME PH mentor and guide Filipino MSMEs.",
    sections: [
      { title: "What mentors do", items: ["Answer questions and give practical advice, one-on-one or in small groups", "Review a member's pricing, plan or listing", "Join occasional mentoring sessions at workshops or online"] },
      { title: "Commitment", items: ["You choose how many hours a month you can give", "Sessions can be online or in person", "You may stop anytime by telling us"] },
      { title: "Who we're looking for", items: ["Business owners, managers and professionals with real experience", "People who explain things simply and patiently", "Mentors are listed publicly only with their consent and after approval"] },
    ] },
  { slug: "partner", title: "Join as Partner", fil: "Makipag-partner", status: "live", form: "partner",
    intro: "Work with FLAME PH to bring training, markets and support to Filipino MSMEs.",
    description: "Partner with FLAME PH: government, academe, companies, NGOs and media.",
    sections: [
      { title: "Ways to partner", items: ["Co-host workshops, trainings or expos", "Provide expertise, venues or in-kind support", "Offer member benefits or discounts", "Collaborate on research and advocacy"] },
      { title: "Who can partner", items: ["LGUs and government agencies", "Schools and universities", "Companies and CSR programs", "NGOs, foundations and media"] },
    ],
    note: "Partners are listed publicly on our website only after a signed agreement is on file." },
  { slug: "sponsor-event", title: "Sponsor an Event", fil: "I-sponsor ang event", status: "live", form: "sponsor-event",
    intro: "Help make a workshop, training or expo possible for local entrepreneurs.",
    description: "Sponsor a FLAME PH event with venue, food, prizes or in-kind support.",
    sections: [{ title: "Sponsorship options", items: ["In-kind goods and materials", "Venue", "Food for participants", "Prizes and giveaways", "Speakers or facilitators"] }] },
  { slug: "sponsor-community", title: "Sponsor a Community", fil: "I-adopt ang komunidad", status: "live", form: "sponsor-community",
    intro: "Adopt a barangay or chapter and support its entrepreneurs over time.",
    description: "Adopt a barangay or FLAME PH chapter and support local entrepreneurs.",
    sections: [{ title: "What an adopt-a-community program can include", items: ["A series of workshops for the community", "Starter kits or tools for new entrepreneurs", "Mentoring from your team", "Market days where local MSMEs can sell"] }] },
  { slug: "nominate", title: "Nominate an MSME Awardee", fil: "Mag-nominate", status: "soon", form: "nominate",
    intro: "Know an MSME that deserves recognition? Tell us their story.",
    description: "Nominate a Filipino MSME for the FLAME PH Annual Awards.",
    sections: [{ title: "Categories", items: ["Resilience", "Innovation", "Job generation", "Women-led", "Youth-led"] }],
    note: "The first awards cycle has not opened yet. Nominations sent now will be reviewed once it opens." },
  { slug: "poverty-alleviation", title: "Support Poverty Alleviation Program", fil: "Sugpuin ang Kahirapan", status: "live", form: "poverty-alleviation",
    intro: "Sugpuin ang Kahirapan through Entrepreneurship is a poverty alleviation advocacy movement of FLAME PH. Help families earn through small business.",
    description: "Support FLAME PH's Sugpuin ang Kahirapan through Entrepreneurship program with time, skills or in-kind help.",
    sections: [{ title: "Ways to help", items: ["Give time as a volunteer at workshops", "Share skills through training or mentoring", "Donate in-kind starter materials for new entrepreneurs", "Help connect us with communities that need support"] }] },
  { slug: "affiliate", title: "Become an Affiliate Marketer", fil: "Maging affiliate", status: "soon", form: "affiliate",
    intro: "Promote FLAME PH merch and member products and earn from it, once the program opens.",
    description: "Register interest in the FLAME PH affiliate marketer program.",
    sections: [{ title: "How it is planned to work", items: ["Share FLAME PH and member products on your social media", "Earn a commission on sales you refer", "Terms and rates will be published before the program opens"] }] },
  { slug: "chapter-leader", title: "Become a Chapter Leader", fil: "Pamunuan ang chapter", status: "live", form: "chapter-leader",
    intro: "Bring FLAME PH to your city or municipality and lead your local MSME community.",
    description: "Start and lead a FLAME PH chapter in your city or municipality.",
    sections: [
      { title: "Responsibilities", items: ["Gather local entrepreneurs and hold regular meetups", "Organize workshops with the FLAME PH team", "Represent the chapter and connect members with opportunities"] },
      { title: "Requirements", items: ["A practicing entrepreneur or professional in the area", "Willing to volunteer time and follow FLAME PH's code of conduct", "Able to gather an initial core group"] },
      { title: "Steps to launch", items: ["Apply using the form below", "Talk with the FLAME PH team", "Form your core group", "Launch your chapter with a first meetup"] },
    ] },
  { slug: "resource-speaker", title: "Volunteer as a Resource Speaker", fil: "Magbahagi ng kaalaman", status: "live", form: "resource-speaker",
    intro: "Teach a topic at a FLAME PH workshop, training or webinar.",
    description: "Volunteer as a resource speaker for FLAME PH workshops and webinars.",
    sections: [{ title: "Topics we need", items: ["Business registration and permits", "Pricing and costing", "Bookkeeping and cash flow", "Online selling and social media", "Food safety and FDA requirements", "Financing options and loan readiness"] }] },
  { slug: "professional-services", title: "Volunteer Professional Services", fil: "Ialok ang propesyon mo", status: "live", form: "professional-services",
    intro: "Use your professional skills to help MSMEs who can't yet afford them.",
    description: "Volunteer web, social media, tax, bookkeeping, accounting or advertising services for MSMEs.",
    sections: [{ title: "Skills we need", items: ["Web and app development", "Social media management", "Tax and bookkeeping", "Accounting", "Advertising and design", "Legal guidance"] }] },
];

export const getInvolved = (slug: string) => INVOLVED.find((p) => p.slug === slug)!;
