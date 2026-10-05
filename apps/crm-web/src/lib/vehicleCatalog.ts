export const VEHICLE_MAKE_OPTIONS = [
  "BMW",
  "BYD",
  "Chery",
  "Chevrolet",
  "Daewoo",
  "Geely",
  "Haval",
  "Honda",
  "Hyundai",
  "JAC",
  "Kia",
  "Lada",
  "Lexus",
  "Mercedes-Benz",
  "Nissan",
  "Ravon",
  "Renault",
  "Skoda",
  "Toyota",
  "Volkswagen",
];

const MODELS_BY_MAKE: Record<string, string[]> = {
  BMW: ["3 Series", "5 Series", "7 Series", "X3", "X5", "X6"],
  BYD: ["Dolphin", "E2", "F3", "Han", "Qin", "Song Plus"],
  Chery: ["Arrizo 5", "Arrizo 8", "Tiggo 4", "Tiggo 7", "Tiggo 8"],
  Chevrolet: ["Cobalt", "Lacetti", "Malibu", "Nexia", "Spark"],
  Daewoo: ["Gentra", "Lacetti", "Matiz", "Nexia"],
  Geely: ["Atlas", "Coolray", "Emgrand", "Monjaro", "Tugella"],
  Haval: ["F7", "H6", "Jolion", "M6"],
  Honda: ["Accord", "Civic", "CR-V", "Fit", "Insight"],
  Hyundai: ["Accent", "Avante", "Elantra", "i30", "Santa Fe", "Solaris", "Sonata", "Tucson"],
  JAC: ["J7", "JS4", "S3", "S5"],
  Kia: ["Cerato", "K5", "Optima", "Rio", "Sorento", "Sportage"],
  Lada: ["Granta", "Largus", "Niva", "Vesta", "XRAY"],
  Lexus: ["ES", "GS", "GX", "LX", "RX"],
  "Mercedes-Benz": ["C-Class", "E-Class", "S-Class", "Vito", "W124", "W210", "W211", "W212"],
  Nissan: ["Almera", "Juke", "Leaf", "Murano", "Note", "Qashqai", "Teana", "X-Trail"],
  Ravon: ["Gentra", "Nexia R3", "R2", "R4"],
  Renault: ["Duster", "Kaptur", "Logan", "Megane", "Sandero"],
  Skoda: ["Fabia", "Kodiaq", "Octavia", "Rapid", "Superb"],
  Toyota: ["Aqua", "Camry", "Corolla", "Highlander", "Land Cruiser", "Prius", "RAV4", "Sienna", "Yaris"],
  Volkswagen: ["Golf", "Jetta", "Passat", "Polo", "Tiguan", "Touareg"],
};

export function getVehicleModelOptions(make: string): string[] {
  const exactMake = VEHICLE_MAKE_OPTIONS.find((item) => item.toLowerCase() === make.trim().toLowerCase());
  if (exactMake) {
    return MODELS_BY_MAKE[exactMake] ?? [];
  }

  return [...new Set(Object.values(MODELS_BY_MAKE).flat())].sort((left, right) => left.localeCompare(right, "ru"));
}
