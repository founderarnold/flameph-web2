// Region of each province in src/content/ph-provinces.ts (used to fill in a business's region automatically).
export const REGION_OF: Record<string, string> = {
  "Metro Manila": "NCR",
  Abra: "CAR", Apayao: "CAR", Benguet: "CAR", Ifugao: "CAR", Kalinga: "CAR", "Mountain Province": "CAR",
  "Ilocos Norte": "Region I (Ilocos)", "Ilocos Sur": "Region I (Ilocos)", "La Union": "Region I (Ilocos)", Pangasinan: "Region I (Ilocos)",
  Batanes: "Region II (Cagayan Valley)", Cagayan: "Region II (Cagayan Valley)", Isabela: "Region II (Cagayan Valley)", "Nueva Vizcaya": "Region II (Cagayan Valley)", Quirino: "Region II (Cagayan Valley)",
  Aurora: "Region III (Central Luzon)", Bataan: "Region III (Central Luzon)", Bulacan: "Region III (Central Luzon)", "Nueva Ecija": "Region III (Central Luzon)", Pampanga: "Region III (Central Luzon)", Tarlac: "Region III (Central Luzon)", Zambales: "Region III (Central Luzon)",
  Batangas: "Region IV-A (CALABARZON)", Cavite: "Region IV-A (CALABARZON)", Laguna: "Region IV-A (CALABARZON)", Quezon: "Region IV-A (CALABARZON)", Rizal: "Region IV-A (CALABARZON)",
  Marinduque: "MIMAROPA", "Occidental Mindoro": "MIMAROPA", "Oriental Mindoro": "MIMAROPA", Palawan: "MIMAROPA", Romblon: "MIMAROPA",
  Albay: "Region V (Bicol)", "Camarines Norte": "Region V (Bicol)", "Camarines Sur": "Region V (Bicol)", Catanduanes: "Region V (Bicol)", Masbate: "Region V (Bicol)", Sorsogon: "Region V (Bicol)",
  Aklan: "Region VI (Western Visayas)", Antique: "Region VI (Western Visayas)", Capiz: "Region VI (Western Visayas)", Guimaras: "Region VI (Western Visayas)", Iloilo: "Region VI (Western Visayas)",
  "Negros Occidental": "NIR (Negros Island)", "Negros Oriental": "NIR (Negros Island)", Siquijor: "NIR (Negros Island)",
  Bohol: "Region VII (Central Visayas)", Cebu: "Region VII (Central Visayas)",
  Biliran: "Region VIII (Eastern Visayas)", "Eastern Samar": "Region VIII (Eastern Visayas)", Leyte: "Region VIII (Eastern Visayas)", "Northern Samar": "Region VIII (Eastern Visayas)", Samar: "Region VIII (Eastern Visayas)", "Southern Leyte": "Region VIII (Eastern Visayas)",
  "Zamboanga del Norte": "Region IX (Zamboanga Peninsula)", "Zamboanga del Sur": "Region IX (Zamboanga Peninsula)", "Zamboanga Sibugay": "Region IX (Zamboanga Peninsula)",
  Bukidnon: "Region X (Northern Mindanao)", Camiguin: "Region X (Northern Mindanao)", "Lanao del Norte": "Region X (Northern Mindanao)", "Misamis Occidental": "Region X (Northern Mindanao)", "Misamis Oriental": "Region X (Northern Mindanao)",
  "Davao de Oro": "Region XI (Davao)", "Davao del Norte": "Region XI (Davao)", "Davao del Sur": "Region XI (Davao)", "Davao Occidental": "Region XI (Davao)", "Davao Oriental": "Region XI (Davao)",
  Cotabato: "Region XII (SOCCSKSARGEN)", Sarangani: "Region XII (SOCCSKSARGEN)", "South Cotabato": "Region XII (SOCCSKSARGEN)", "Sultan Kudarat": "Region XII (SOCCSKSARGEN)",
  "Agusan del Norte": "Region XIII (Caraga)", "Agusan del Sur": "Region XIII (Caraga)", "Dinagat Islands": "Region XIII (Caraga)", "Surigao del Norte": "Region XIII (Caraga)", "Surigao del Sur": "Region XIII (Caraga)",
  Basilan: "BARMM", "Lanao del Sur": "BARMM", "Maguindanao del Norte": "BARMM", "Maguindanao del Sur": "BARMM", Sulu: "BARMM", "Tawi-Tawi": "BARMM",
};

export const regionOf = (province?: string | null) => (province ? REGION_OF[province] ?? null : null);
