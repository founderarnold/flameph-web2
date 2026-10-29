export type HeroScene = {
  sheet: number;
  quadrant: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  alt: string;
};

const EXACT_SCENES: Record<string, HeroScene> = {
  "/about": { sheet: 1, quadrant: "top-left", alt: "Filipino entrepreneurs growing together across a connected MSME ecosystem" },
  "/about/founders": { sheet: 1, quadrant: "top-right", alt: "Two Filipino founders planning an organization together" },
  "/about/team": { sheet: 1, quadrant: "bottom-left", alt: "A collaborative Filipino nonprofit team" },
  "/about/chapters": { sheet: 1, quadrant: "bottom-right", alt: "A welcoming local community chapter meeting" },
  "/about/mentors": { sheet: 2, quadrant: "top-left", alt: "A business mentor guiding a young Filipino entrepreneur" },
  "/about/partners": { sheet: 2, quadrant: "top-right", alt: "Trusted nonprofit partners working together" },
  "/advocacy": { sheet: 2, quadrant: "bottom-left", alt: "MSME advocates presenting community business needs" },
  "/volunteering": { sheet: 2, quadrant: "bottom-right", alt: "Volunteers helping Filipino small business owners" },
  "/academy": { sheet: 3, quadrant: "top-left", alt: "Entrepreneurs learning practical skills at a business academy" },
  "/workshops": { sheet: 3, quadrant: "top-right", alt: "A hands-on workshop for small business owners" },
  "/trainings-webinars": { sheet: 3, quadrant: "bottom-left", alt: "An engaging hybrid training and webinar" },
  "/expos-summits": { sheet: 3, quadrant: "bottom-right", alt: "A vibrant Philippine MSME expo" },
  "/bizconsult-ai": { sheet: 4, quadrant: "top-left", alt: "A friendly AI business assistant helping a Filipino shop owner" },
  "/pos": { sheet: 4, quadrant: "top-right", alt: "A sari-sari store owner using a simple point-of-sale system" },
  "/resources": { sheet: 4, quadrant: "bottom-left", alt: "An entrepreneur studying practical business guides and templates" },
  "/news": { sheet: 4, quadrant: "bottom-right", alt: "A community storyteller documenting an MSME event" },
  "/awards": { sheet: 5, quadrant: "top-left", alt: "Filipino micro-entrepreneurs receiving an achievement award" },
  "/impact": { sheet: 5, quadrant: "top-right", alt: "Growing businesses, jobs and families showing community impact" },
  "/opportunities": { sheet: 5, quadrant: "bottom-left", alt: "A business owner discovering new opportunities" },
  "/deals": { sheet: 5, quadrant: "bottom-right", alt: "Local shop owners buying supplies together" },
  "/membership/free-benefits": { sheet: 6, quadrant: "top-left", alt: "An entrepreneur receiving free membership tools and benefits" },
  "/membership/more-benefits": { sheet: 6, quadrant: "top-right", alt: "A growing MSME unlocking more support and market access" },
  "/get-involved": { sheet: 6, quadrant: "bottom-left", alt: "Volunteers and partners choosing ways to get involved" },
  "/contact": { sheet: 6, quadrant: "bottom-right", alt: "A helpful support team answering an entrepreneur's message" },
  "/negosyo-talks": { sheet: 7, quadrant: "top-left", alt: "A Filipino business talk show interview" },
  "/merch": { sheet: 7, quadrant: "top-right", alt: "Tasteful nonprofit merchandise displayed by supporters" },
  "/signature-brands": { sheet: 7, quadrant: "bottom-left", alt: "Entrepreneurs presenting Filipino signature brands" },
  "/personalized": { sheet: 7, quadrant: "bottom-right", alt: "An artisan personalizing a product for a customer" },
  "/fulfillment": { sheet: 8, quadrant: "top-left", alt: "MSMEs packing and delivering local products together" },
  "/chapters": { sheet: 8, quadrant: "top-right", alt: "A local chapter connecting neighborhood entrepreneurs" },
  "/real-estate-for-msmes/find-property": { sheet: 8, quadrant: "bottom-left", alt: "A family and entrepreneur exploring suitable properties" },
  "/real-estate-for-msmes/careers": { sheet: 8, quadrant: "bottom-right", alt: "A young professional beginning a real-estate career" },
  "/real-estate-for-msmes/referral-partner": { sheet: 9, quadrant: "top-left", alt: "A professional ethically referring a property client" },
  "/programs-ecosystem": { sheet: 9, quadrant: "top-right", alt: "A connected micro-business website and ecosystem" },
};

export function heroSceneForPath(pathname: string): HeroScene | null {
  const path = pathname.split(/[?#]/, 1)[0].replace(/\/$/, "") || "/";
  if (EXACT_SCENES[path]) return EXACT_SCENES[path];
  if (path.startsWith("/news/")) return { sheet: 9, quadrant: "bottom-left", alt: "A writer preparing an inspiring community business story" };
  if (path.startsWith("/resources/")) return { sheet: 9, quadrant: "bottom-right", alt: "An entrepreneur applying a practical business resource" };
  return null;
}

export const isStandardHeroPath = (pathname: string) => heroSceneForPath(pathname) !== null;
export const showStandardHeroShare = (pathname: string) => isStandardHeroPath(pathname) && pathname !== "/contact";

export const HERO_POSITION: Record<HeroScene["quadrant"], string> = {
  "top-left": "0% 0%",
  "top-right": "100% 0%",
  "bottom-left": "0% 100%",
  "bottom-right": "100% 100%",
};
