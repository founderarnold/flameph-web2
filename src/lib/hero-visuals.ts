export type HeroVisual = {
  src: string;
  alt: string;
  backgroundPosition: "0% 0%" | "100% 0%" | "0% 100%" | "100% 100%";
};

type Position = HeroVisual["backgroundPosition"];

function scene(sheet: number, backgroundPosition: Position, alt: string): HeroVisual {
  return {
    src: `/hero-scenes/hero-scenes-${sheet}.webp`,
    backgroundPosition,
    alt,
  };
}

const EXACT: Record<string, HeroVisual> = {
  "/about": scene(1, "0% 0%", "Filipino entrepreneurs growing together across a connected MSME ecosystem"),
  "/about/chapters": scene(1, "100% 100%", "A welcoming local community chapter meeting"),
  "/about/founders": scene(1, "100% 0%", "Two Filipino founders planning an organization together"),
  "/about/mentors": scene(2, "0% 0%", "A business mentor guiding a young Filipino entrepreneur"),
  "/about/partners": scene(2, "100% 0%", "Trusted nonprofit partners working together"),
  "/about/team": scene(1, "0% 100%", "A collaborative Filipino nonprofit team"),
  "/academy": scene(3, "0% 0%", "Entrepreneurs learning practical skills at a business academy"),
  "/advocacy": scene(2, "0% 100%", "MSME advocates presenting community business needs"),
  "/awards": scene(5, "0% 0%", "Filipino micro-entrepreneurs receiving an achievement award"),
  "/benefits": scene(6, "0% 0%", "An entrepreneur receiving practical FLAME PH member benefits"),
  "/bizconsult-ai": scene(4, "0% 0%", "A friendly AI business assistant helping a Filipino shop owner"),
  "/chapters": scene(8, "100% 0%", "A local chapter connecting neighborhood entrepreneurs"),
  "/contact": scene(6, "100% 100%", "A helpful support team answering an entrepreneur's message"),
  "/deals": scene(5, "100% 100%", "Local shop owners buying supplies together"),
  "/directory": scene(9, "100% 0%", "A Filipino micro-business being discovered through its online directory page"),
  "/explore": scene(1, "0% 0%", "Filipino entrepreneurs exploring the connected FLAME PH ecosystem"),
  "/expos-summits": scene(3, "100% 100%", "A vibrant Philippine MSME expo"),
  "/fulfillment": scene(8, "0% 0%", "MSMEs packing and delivering local products together"),
  "/get-involved": scene(6, "0% 100%", "Volunteers and partners choosing ways to get involved"),
  "/impact": scene(5, "100% 0%", "Growing businesses, jobs and families showing community impact"),
  "/membership/free-benefits": scene(6, "0% 0%", "An entrepreneur receiving free membership tools and benefits"),
  "/membership/more-benefits": scene(6, "100% 0%", "A growing MSME unlocking more support and market access"),
  "/merch": scene(7, "100% 0%", "Tasteful nonprofit merchandise displayed by supporters"),
  "/negosyo-talks": scene(7, "0% 0%", "A Filipino business talk show interview"),
  "/news": scene(4, "100% 100%", "A community storyteller documenting an MSME event"),
  "/opportunities": scene(5, "0% 100%", "A business owner discovering new opportunities"),
  "/partners": scene(2, "100% 0%", "FLAME PH and trusted organizations building an MSME partnership"),
  "/personalized": scene(7, "100% 100%", "An artisan personalizing a product for a customer"),
  "/programs-ecosystem": scene(9, "100% 0%", "A connected micro-business website and ecosystem"),
  "/resources": scene(4, "0% 100%", "An entrepreneur studying practical business guides and templates"),
  "/signature-brands": scene(7, "0% 100%", "Entrepreneurs presenting Filipino signature brands"),
  "/trainings-webinars": scene(3, "0% 100%", "An engaging hybrid training and webinar"),
  "/volunteering": scene(2, "100% 100%", "Volunteers helping Filipino small business owners"),
  "/workshops": scene(3, "100% 0%", "A hands-on workshop for small business owners"),
};

const PREFIXES: Array<[string, HeroVisual]> = [
  ["/news/", scene(4, "100% 100%", "A community storyteller documenting a FLAME PH update")],
  ["/resources/", scene(4, "0% 100%", "An entrepreneur using a practical FLAME PH business resource")],
  ["/get-involved/", scene(6, "0% 100%", "Filipino volunteers and entrepreneurs working together")],
];

export function getHeroVisual(path?: string): HeroVisual | undefined {
  if (!path || path === "/pos" || path.startsWith("/real-estate-for-msmes") || path.startsWith("/account/business")) {
    return undefined;
  }
  return EXACT[path] ?? PREFIXES.find(([prefix]) => path.startsWith(prefix))?.[1];
}
