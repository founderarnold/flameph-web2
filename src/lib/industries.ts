// FLAME PH industry taxonomy. The top level is the existing business "sector" list (same words, so saved listings,
// opportunity matching and the directory keep working); each has a short list of more specific industries.
export const INDUSTRIES: { name: string; subs: string[] }[] = [
  { name: "Food & beverage", subs: ["Restaurant or carinderia", "Bakery and pastries", "Food processing and delicacies", "Beverages and coffee", "Catering", "Street food and kiosks"] },
  { name: "Retail / sari-sari", subs: ["Sari-sari store", "Grocery and convenience", "Online selling", "Wholesale and distribution", "Pharmacy and health products"] },
  { name: "Agriculture", subs: ["Crops and vegetables", "Fruits", "Livestock and poultry", "Fisheries and aquaculture", "Agri-inputs and supplies", "Agri-processing"] },
  { name: "Manufacturing", subs: ["Garments and textiles", "Furniture and woodwork", "Metal and fabrication", "Packaging and printing", "Household and cleaning products", "Construction materials", "Suppliers"] },
  { name: "Services", subs: ["Repair and maintenance", "Transport and logistics", "Professional services", "Education and tutoring", "Events and photography", "Cleaning and laundry", "Construction and trades", "Real estate", "Advertising", "Marketing", "Accounting services", "Legal services", "Insurance", "Tax compliance", "Import and export services", "Investors and funders"] },
  { name: "Beauty & wellness", subs: ["Salon and barbershop", "Spa and massage", "Cosmetics and skincare", "Fitness", "Health and wellness products"] },
  { name: "Crafts & fashion", subs: ["Handicrafts", "Bags and accessories", "Jewelry", "Footwear", "Clothing and fashion design", "Home decor"] },
  { name: "Technology", subs: ["Software and apps", "IT services", "Digital marketing", "Electronics and gadgets", "E-commerce services", "AI", "Systems"] },
  { name: "Tourism", subs: ["Accommodation", "Tours and travel", "Resorts", "Souvenirs and pasalubong", "Transport for tourists"] },
  { name: "Other", subs: [] },
];

export const INDUSTRY_NAMES = INDUSTRIES.map((i) => i.name);
export const subsOf = (industry?: string | null) => INDUSTRIES.find((i) => i.name === industry)?.subs ?? [];
export const isIndustry = (v: string) => INDUSTRY_NAMES.includes(v);
