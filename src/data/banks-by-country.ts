export interface BankInfo {
  slug: string;
  name: string;
  color: string;
  emoji?: string;
}

export interface CountryInfo {
  code: string;
  name: string;
  flag: string;
  currency: string;
  symbol: string;
  lang: "es" | "en" | "both";
  banks: BankInfo[];
}

export const COUNTRIES: CountryInfo[] = [
  // --- Spanish-speaking ---
  {
    code: "ES",
    name: "España",
    flag: "🇪🇸",
    currency: "EUR",
    symbol: "€",
    lang: "es",
    banks: [
      { slug: "santander", name: "Santander", color: "#ec0000" },
      { slug: "bbva", name: "BBVA", color: "#004481" },
      { slug: "caixabank", name: "CaixaBank", color: "#0099cc" },
      { slug: "sabadell", name: "Sabadell", color: "#0070BA" },
      { slug: "ing", name: "ING", color: "#FF6200" },
      { slug: "bankinter", name: "Bankinter", color: "#FF6B35" },
      { slug: "revolut", name: "Revolut", color: "#0075EB" },
      { slug: "n26", name: "N26", color: "#36a18b" },
      { slug: "wise", name: "Wise", color: "#71B548" },
    ],
  },
  {
    code: "MX",
    name: "México",
    flag: "🇲🇽",
    currency: "MXN",
    symbol: "$",
    lang: "es",
    banks: [
      { slug: "bbva-mx", name: "BBVA México", color: "#004481" },
      { slug: "banorte", name: "Banorte", color: "#E30613" },
      { slug: "santander-mx", name: "Santander MX", color: "#ec0000" },
      { slug: "hsbc", name: "HSBC", color: "#DB0011" },
      { slug: "citibanamex", name: "Citibanamex", color: "#1A1F71" },
      { slug: "nu-mx", name: "Nu México", color: "#820AD1" },
      { slug: "mercado-pago", name: "Mercado Pago", color: "#00B1EA" },
    ],
  },
  {
    code: "CO",
    name: "Colombia",
    flag: "🇨🇴",
    currency: "COP",
    symbol: "$",
    lang: "es",
    banks: [
      { slug: "bancolombia", name: "Bancolombia", color: "#003B71" },
      { slug: "davivienda", name: "Davivienda", color: "#ED1C24" },
      { slug: "banco-bogota", name: "Banco de Bogotá", color: "#003B71" },
      { slug: "bbva-co", name: "BBVA Colombia", color: "#004481" },
      { slug: "nequi", name: "Nequi", color: "#E6007E" },
      { slug: "nu-co", name: "Nu Colombia", color: "#820AD1" },
    ],
  },
  {
    code: "AR",
    name: "Argentina",
    flag: "🇦🇷",
    currency: "ARS",
    symbol: "$",
    lang: "es",
    banks: [
      { slug: "mercado-pago-ar", name: "Mercado Pago", color: "#00B1EA" },
      { slug: "brubank", name: "Brubank", color: "#6C2BD9" },
      { slug: "galicia", name: "Galicia", color: "#F37021" },
      { slug: "santander-ar", name: "Santander AR", color: "#ec0000" },
      { slug: "bbva-ar", name: "BBVA Argentina", color: "#004481" },
      { slug: "uala", name: "Ualá", color: "#3D5AFE" },
      { slug: "naranja-x", name: "Naranja X", color: "#FF6600" },
    ],
  },
  {
    code: "CL",
    name: "Chile",
    flag: "🇨🇱",
    currency: "CLP",
    symbol: "$",
    lang: "es",
    banks: [
      { slug: "banco-chile", name: "Banco de Chile", color: "#003B8E" },
      { slug: "bancoestado", name: "BancoEstado", color: "#0072CE" },
      { slug: "santander-cl", name: "Santander CL", color: "#ec0000" },
      { slug: "bci", name: "BCI", color: "#003B71" },
      { slug: "falabella", name: "Falabella", color: "#8CC63F" },
      { slug: "mach", name: "MACH", color: "#FF3366" },
    ],
  },
  {
    code: "PE",
    name: "Perú",
    flag: "🇵🇪",
    currency: "PEN",
    symbol: "S/",
    lang: "es",
    banks: [
      { slug: "bcp", name: "BCP", color: "#002A5C" },
      { slug: "interbank", name: "Interbank", color: "#00A651" },
      { slug: "bbva-pe", name: "BBVA Perú", color: "#004481" },
      { slug: "scotiabank-pe", name: "Scotiabank", color: "#EC111A" },
      { slug: "yape", name: "Yape", color: "#6B2D8B" },
    ],
  },
  {
    code: "EC",
    name: "Ecuador",
    flag: "🇪🇨",
    currency: "USD",
    symbol: "$",
    lang: "es",
    banks: [
      { slug: "pichincha", name: "Banco Pichincha", color: "#FFD100" },
      { slug: "guayaquil", name: "Banco Guayaquil", color: "#003B71" },
      { slug: "pacifico", name: "Banco del Pacífico", color: "#0072CE" },
    ],
  },
  {
    code: "UY",
    name: "Uruguay",
    flag: "🇺🇾",
    currency: "UYU",
    symbol: "$",
    lang: "es",
    banks: [
      { slug: "brou", name: "BROU", color: "#003B71" },
      { slug: "itau-uy", name: "Itaú Uruguay", color: "#FF6600" },
      { slug: "santander-uy", name: "Santander UY", color: "#ec0000" },
    ],
  },
  // --- English-speaking / European ---
  {
    code: "NL",
    name: "Netherlands",
    flag: "🇳🇱",
    currency: "EUR",
    symbol: "€",
    lang: "en",
    banks: [
      { slug: "ing-nl", name: "ING", color: "#FF6200" },
      { slug: "abn-amro", name: "ABN AMRO", color: "#004C2D" },
      { slug: "rabobank", name: "Rabobank", color: "#003082" },
      { slug: "bunq", name: "Bunq", color: "#00B0F0" },
      { slug: "revolut", name: "Revolut", color: "#0075EB" },
      { slug: "n26", name: "N26", color: "#36a18b" },
      { slug: "wise", name: "Wise", color: "#71B548" },
    ],
  },
  {
    code: "DE",
    name: "Germany",
    flag: "🇩🇪",
    currency: "EUR",
    symbol: "€",
    lang: "en",
    banks: [
      { slug: "deutsche-bank", name: "Deutsche Bank", color: "#0018A8" },
      { slug: "commerzbank", name: "Commerzbank", color: "#FFD700" },
      { slug: "sparkasse", name: "Sparkasse", color: "#FF0000" },
      { slug: "n26-de", name: "N26", color: "#36a18b" },
      { slug: "revolut", name: "Revolut", color: "#0075EB" },
      { slug: "wise", name: "Wise", color: "#71B548" },
    ],
  },
  {
    code: "FR",
    name: "France",
    flag: "🇫🇷",
    currency: "EUR",
    symbol: "€",
    lang: "en",
    banks: [
      { slug: "bnp-paribas", name: "BNP Paribas", color: "#00915A" },
      { slug: "societe-generale", name: "Société Générale", color: "#E60028" },
      { slug: "credit-agricole", name: "Crédit Agricole", color: "#009845" },
      { slug: "boursorama", name: "Boursorama", color: "#FF6600" },
      { slug: "revolut", name: "Revolut", color: "#0075EB" },
      { slug: "n26", name: "N26", color: "#36a18b" },
    ],
  },
  {
    code: "GB",
    name: "United Kingdom",
    flag: "🇬🇧",
    currency: "GBP",
    symbol: "£",
    lang: "en",
    banks: [
      { slug: "barclays", name: "Barclays", color: "#00AEEF" },
      { slug: "hsbc-uk", name: "HSBC", color: "#DB0011" },
      { slug: "lloyds", name: "Lloyds", color: "#006A4D" },
      { slug: "monzo", name: "Monzo", color: "#FF4F40" },
      { slug: "starling", name: "Starling", color: "#7433FF" },
      { slug: "revolut-uk", name: "Revolut", color: "#0075EB" },
      { slug: "wise", name: "Wise", color: "#71B548" },
    ],
  },
  {
    code: "IT",
    name: "Italy",
    flag: "🇮🇹",
    currency: "EUR",
    symbol: "€",
    lang: "en",
    banks: [
      { slug: "intesa", name: "Intesa Sanpaolo", color: "#004B87" },
      { slug: "unicredit", name: "UniCredit", color: "#E40613" },
      { slug: "fineco", name: "Fineco", color: "#003087" },
      { slug: "revolut", name: "Revolut", color: "#0075EB" },
      { slug: "n26", name: "N26", color: "#36a18b" },
    ],
  },
  {
    code: "PT",
    name: "Portugal",
    flag: "🇵🇹",
    currency: "EUR",
    symbol: "€",
    lang: "both",
    banks: [
      { slug: "cgd", name: "Caixa Geral", color: "#004B87" },
      { slug: "millennium", name: "Millennium BCP", color: "#7B2D8E" },
      { slug: "novo-banco", name: "Novo Banco", color: "#00A651" },
      { slug: "revolut", name: "Revolut", color: "#0075EB" },
      { slug: "wise", name: "Wise", color: "#71B548" },
    ],
  },
  {
    code: "BE",
    name: "Belgium",
    flag: "🇧🇪",
    currency: "EUR",
    symbol: "€",
    lang: "en",
    banks: [
      { slug: "kbc", name: "KBC", color: "#003B71" },
      { slug: "belfius", name: "Belfius", color: "#7B2D8E" },
      { slug: "bnp-fortis", name: "BNP Paribas Fortis", color: "#00915A" },
      { slug: "revolut", name: "Revolut", color: "#0075EB" },
    ],
  },
  {
    code: "US",
    name: "United States",
    flag: "🇺🇸",
    currency: "USD",
    symbol: "$",
    lang: "en",
    banks: [
      { slug: "chase", name: "Chase", color: "#117ACA" },
      { slug: "bofa", name: "Bank of America", color: "#012169" },
      { slug: "wells-fargo", name: "Wells Fargo", color: "#D71E28" },
      { slug: "citi", name: "Citi", color: "#003DA5" },
      { slug: "capital-one", name: "Capital One", color: "#004977" },
      { slug: "sofi", name: "SoFi", color: "#00D4AA" },
    ],
  },
  {
    code: "IE",
    name: "Ireland",
    flag: "🇮🇪",
    currency: "EUR",
    symbol: "€",
    lang: "en",
    banks: [
      { slug: "aib", name: "AIB", color: "#6C2D82" },
      { slug: "boi", name: "Bank of Ireland", color: "#003B71" },
      { slug: "revolut", name: "Revolut", color: "#0075EB" },
      { slug: "n26", name: "N26", color: "#36a18b" },
    ],
  },
  {
    code: "AT",
    name: "Austria",
    flag: "🇦🇹",
    currency: "EUR",
    symbol: "€",
    lang: "en",
    banks: [
      { slug: "erste", name: "Erste Bank", color: "#003B71" },
      { slug: "raiffeisen", name: "Raiffeisen", color: "#FFD700" },
      { slug: "n26", name: "N26", color: "#36a18b" },
      { slug: "revolut", name: "Revolut", color: "#0075EB" },
    ],
  },
];

export const EFECTIVO_BANK: BankInfo = {
  slug: "efectivo",
  name: "Efectivo",
  color: "#2D6A4F",
  emoji: "💵",
};

export function getCountriesByLang(lang: "es" | "en"): CountryInfo[] {
  return COUNTRIES.filter((c) => c.lang === lang || c.lang === "both");
}

/**
 * Returns the 5 most relevant countries for the onboarding.
 * Detected country (via IP) is always included and placed first.
 * Remaining slots are filled with language-based priorities.
 */
export function getTopCountries(lang: "es" | "en", detectedCode?: string): CountryInfo[] {
  const PRIORITIES: Record<"es" | "en", string[]> = {
    es: ["ES", "MX", "AR", "CO", "CL"],
    en: ["US", "GB", "IE", "DE", "NL"],
  };

  const seen = new Set<string>();
  const ordered: CountryInfo[] = [];

  // 1. Detected country first
  if (detectedCode) {
    const detected = COUNTRIES.find((c) => c.code === detectedCode);
    if (detected) {
      seen.add(detected.code);
      ordered.push(detected);
    }
  }

  // 2. Fill with language priorities
  for (const code of PRIORITIES[lang]) {
    if (ordered.length >= 5) break;
    if (seen.has(code)) continue;
    const country = COUNTRIES.find((c) => c.code === code);
    if (country) {
      seen.add(code);
      ordered.push(country);
    }
  }

  return ordered;
}

export function getBanksByCountry(countryCode: string): BankInfo[] {
  const country = COUNTRIES.find((c) => c.code === countryCode);
  if (!country) return [];
  return [...country.banks, EFECTIVO_BANK];
}

export function getCountryByCode(code: string): CountryInfo | undefined {
  return COUNTRIES.find((c) => c.code === code);
}
