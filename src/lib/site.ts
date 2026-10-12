// Verified facts (section 3 of the rebuild brief). Do not embellish.
export const ORG = {
  shortName: "FLAME PH",
  name: "FLAME PH — Federation of Leaders Advancing MSME Ecosystem in the Philippines",
  legalName: "Federation of Leaders Advancing MSME Ecosystem in the Philippines",
  formerName: "FAME PH — Founders' Association of MSMEs and Entrepreneurs, Inc.",
  type: "Non-stock, non-profit corporation",
  secNo: "2024050150009-15",
  secRegisteredOn: "May 9, 2024",
  secRegisteredIso: "2024-05-09",
  address: "Greenville Subd., Barangay San Jose, San Fernando City, Pampanga",
  emailPrimary: "flameph.org@gmail.com",
  emailPartnerships: "federationofmsmes@gmail.com",
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://flameph.org",
} as const;

export const TAGLINES = {
  main: "Build Ecosystem. Fuel Leaders. Empower Entrepreneurs.",
  growth: "Start local. Grow together. Scale global.",
  notAlone: "Hindi mo kailangang mag-start at mag-grow ng business nang mag-isa.",
  noOneAlone: "Walang negosyanteng Pilipino ang dapat maging mag-isa.",
  principle: "One MSME alone pays more. Together, we can pay less and grow more.",
  advocacy: "Sugpuin ang Kahirapan through Entrepreneurship",
};

export const PURPOSE =
  "FLAME PH helps young aspiring entrepreneurs, startup business owners and MSMEs to start small, grow locally and scale up globally, with the end in mind of breaking the chains of poverty among Filipino households and building a first-world Philippines for the next Filipino generation.";

export const VISION =
  "A vibrant, resilient, and globally competitive Philippines where every micro, small, and medium enterprise has access to the digital capital, market linkages, regulatory support, and community needed to prosper sustainably.";

export const MISSION =
  "To mobilize grassroots leadership, provide accessible business toolkits and AI-driven advisory, eliminate predatory middlemen through peer-to-peer commerce, and champion MSME rights in national policy frameworks.";

export const PILLARS = [
  { name: "Start", fil: "Simulan", text: "We plan to give first-time entrepreneurs plain-language guides, checklists and Ka-FLAME AI answers so they can register and open a small business with confidence." },
  { name: "Grow", fil: "Palaguin", text: "We plan to run workshops, trainings and mentoring that help owners price better, manage cash and reach more customers locally." },
  { name: "Connect", fil: "Kumonekta", text: "We are building a free business directory, local chapters and peer-to-peer links so MSMEs can buy, sell and share costs together." },
  { name: "Scale", fil: "Palakihin", text: "We aim to open doors to bigger markets, through MarketplacePH and future programs, for members who are ready to grow beyond their city." },
];

export const FOUNDERS = [
  {
    name: "Dr. Joliber Mapiles, ECE",
    title: "Chairman & Co-Founder, FLAME PH",
    bio: "Dr. Joliber Mapiles is a real estate entrepreneur and business leader with extensive experience in property investment, development, and entrepreneurship. His work in real estate has given him practical insights into business growth, investment strategies, and building sustainable enterprises. As Chairman and Co-Founder of FLAME PH, he brings this experience to his advocacy of empowering Filipino MSMEs, fostering business collaboration, and creating opportunities for entrepreneurs to grow together toward a more competitive and prosperous Philippines.",
  },
  {
    name: "Mr. Arnold Relova, MBA",
    title: "Founder & Vice Chairman, FLAME PH",
    bio: "Mr. Arnold Relova is a seasoned MSME entrepreneur and business builder with hands-on experience in developing and expanding businesses across multiple industries. He is the founder of NegosyoDepot.com, MarketplacePH.com, Manager's Pizza, ProBoxx Packaging Solutions, and YOBO Sports, with several outlets and distributors serving customers across Luzon, Visayas, and Mindanao. As Vice-Chairman and Founder of FLAME PH, he brings his practical experience in entrepreneurship, business development, distribution, and MSME growth to help build a stronger network of Filipino entrepreneurs—encouraging collaboration, shared opportunities, and sustainable business growth.",
  },
  {
    name: "Ms. Karen Dizon, MBA",
    title: "Executive Director, FLAME PH",
    bio: "Ms. Karen Dizon is a business and organizational development professional with experience in MSME development, administration, and public-sector engagement. She serves as Vice President of MSME BrandBuilders Network Corp. (MBNC) and previously served as an Executive Staff member of the Secretary of the Department of Tourism (DOT). As Executive Director of FLAME PH, she helps lead the organization's programs, partnerships, and initiatives focused on strengthening Filipino MSMEs and fostering collaboration between entrepreneurs and key stakeholders.",
  },
  {
    name: "Mr. Mark Tomon",
    title: "Deputy Executive Director, FLAME PH",
    bio: "Mr. Mark Tomon is an entrepreneur and business development leader with experience in MSME branding, marketing, business development, and enterprise development. He is the President of MSME BrandBuilders Network Corp. (MBNC), Vice President of Managers' Pizza, and Co-Founder of ProBoxx Packaging Solutions. As Deputy Executive Director of FLAME PH, he contributes his expertise in brand building, marketing, business development, and MSME collaboration to help Filipino entrepreneurs strengthen their businesses and become more competitive in the local and global marketplace.",
  },
];

export const SISTER_PLATFORMS = {
  marketplaceph: { name: "MarketplacePH", url: "https://www.marketplaceph.com", label: "Shop / Sell / Jobs", status: "live" as const },
  negosyodepot: { name: "NegosyoDepot", url: "https://www.negosyodepot.com", label: "Start / Grow / ScaleUp", status: "soon" as const },
};

export const OFFICIAL_LINKS = {
  BIR: "https://www.bir.gov.ph",
  DTI: "https://bnrs.dti.gov.ph",
  SEC: "https://www.sec.gov.ph",
  FDA: "https://www.fda.gov.ph",
  BMBE: "https://www.dti.gov.ph/negosyo/bmbe/",
  NPC: "https://privacy.gov.ph",
};

export const REGISTRATION_LINE = `FLAME PH (formerly FAME PH — Founders' Association of MSMEs and Entrepreneurs, Inc.) · SEC Reg. No. ${ORG.secNo} · Non-stock, non-profit · ${ORG.address} · ${ORG.emailPrimary}`;

export const TRUST_LINE = `SEC-registered non-profit · Reg. No. ${ORG.secNo} · Founded by practicing Filipino entrepreneurs · Free to join`;
