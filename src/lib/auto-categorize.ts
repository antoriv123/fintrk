// Client-side auto-categorization based on description keywords
// No API call needed — instant categorization

const RULES: [string[], string, string][] = [
  // [keywords, category, expense_type]
  // Supermercado
  [["albert heijn", "ah ", "ah-", "lidl", "aldi", "mercadona", "carrefour", "spar", "jumbo", "dia ", "consum", "eroski", "vomar", "dirk", "plus ", "colruyt", "supermercado", "supermarkt", "grocery", "edeka", "rewe", "penny", "netto", "tesco", "sainsbury", "asda", "waitrose", "whole foods", "walmart", "target", "costco", "trader joe", "intermarche", "leclerc", "auchan", "coop ", "migros", "denner", "esselunga", "conad", "pingo doce", "continente"], "supermercado", "necesario"],
  // Transporte
  [["uber ride", "bolt ride", "taxi", " ns ", "ns-", "ov-chipkaart", "ovchip", "metro", "bus ", "gasolina", "shell", "bp ", "repsol", "cepsa", "peaje", "parking", "tier ", "lime ", "ryanair", "vueling", "klm", "transavia", "easyjet", "flixbus", "blabla", "cabify", "lyft", "grab", "didi", "tfl ", "sncf", "deutsche bahn", "renfe", "italo", "trenitalia", "eurostar", "ouigo", "wizzair", "norweg", "airfrance", "british air", "iberia", "lufthansa", "swiss air", "tap ", "volotea", "parking ", "aparcamiento", "autopista", "toll ", "fuel", "petrol", "gasoil", "diesel", "electric charge", "chargepoint"], "transporte", "necesario"],
  // Suscripciones
  [["netflix", "spotify", "apple.com", "icloud", "google one", "youtube premium", "amazon prime", "disney+", "hbo", "chatgpt", "openai", "claude", "adobe", "notion", "figma", "github", "vercel", "heroku", "canva", "dropbox", "microsoft 365", "office 365", "twitch", "patreon", "substack", "medium", "linkedin premium", "grammarly", "1password", "nordvpn", "expressvpn", "audible", "kindle unlimited", "crunchyroll", "dazn", "paramount", "peacock", "apple music", "tidal", "deezer", "duolingo", "calm", "headspace", "strava", "peloton", "midjourney", "copilot", "cursor"], "suscripciones", "discrecional"],
  // Ocio / Restaurantes
  [["mcdonald", "burger king", "kfc", "domino", "just eat", "uber eats", "deliveroo", "glovo", "thuisbezorgd", "restaurant", "restaurante", "bar ", "cafe ", "cafeteria", "starbucks", "dunkin", "cine", "cinema", "teatro", "museo", "concierto", "costa coffee", "pret a manger", "five guys", "chipotle", "subway", "papa john", "pizza hut", "taco bell", "nando", "wagamama", "wetherspoon", "kebab", "sushi", "ramen", "tapas", "cerveceria", "pub ", "discoteca", "club ", "bowling", "karaoke", "escape room", "parque tematico", "theme park", "zoo ", "aquarium", "festival"], "ocio", "discrecional"],
  // Alquiler / Vivienda
  [["alquiler", "rent ", "huur", "hipoteca", "mortgage", "housing", "miete", "loyer", "affitto", "renda", "comunidad de vecinos", "homeowners", "property tax", "council tax", "onroerende", "grundsteuer"], "alquiler", "necesario"],
  // Servicios / Facturas
  [["vodafone", "movistar", "orange", "telefonica", "t-mobile", "kpn", "ziggo", "comcast", "at&t", "verizon", "o2 ", "three ", "ee ", "bouygues", "sfr", "free mobile", "iliad", "wind", "tim ", "nos ", "meo ", "endesa", "iberdrola", "naturgy", "engie", "edf", "vattenfall", "essent", "nuon", "agua ", "water ", "gas ", "elektri", "electricidad", "electricity", "internet", "fibra", "broadband", "wifi"], "servicios", "necesario"],
  // Universidad / Educacion
  [["universidad", "university", "college", "matricula", "tuition", "rotterdam", "hogeschool", "studielink", "erasmus", "campus", "academic", "school", "instituto", "course", "udemy", "coursera", "edx", "skillshare", "masterclass", "pluralsight", "codecademy", "libros", "books", "textbook", "escolar"], "universidad", "necesario"],
  // Herramientas negocio
  [["cloudflare", "aws ", "amazon web", "digitalocean", "stripe", "mailchimp", "resend", "hosting", "dominio", "domain", "namecheap", "godaddy", "google workspace", "slack", "zoom", "calendly", "hubspot", "intercom", "zendesk", "jira", "confluence", "asana", "trello", "monday.com", "airtable", "typeform", "zapier", "make.com", "n8n", "shopify", "squarespace", "wix", "webflow", "wordpress", "facebook ads", "google ads", "meta ads", "facebk", "linkedin ads", "twitter ads", "mailerlite", "sendinblue", "convertkit", "beehiiv", "lemlist", "instantly"], "herramientas-negocio", "negocio"],
  // Ropa
  [["zara", "h&m", "pull&bear", "primark", "nike", "adidas", "asos", "mango", "bershka", "uniqlo", "massimo dutti", "stradivarius", "puma", "new balance", "converse", "vans", "levi", "decathlon", "footlocker", "jd sports", "cos ", "arket", "& other stories", "gap ", "old navy", "north face", "columbia", "timberland", "dr martens", "clarks"], "ropa", "discrecional"],
  // Salud
  [["farmacia", "pharmacy", "apotheek", "medico", "doctor", "dentista", "hospital", "fisio", "gym ", "gimnasio", "basic-fit", "anytime fitness", "optica", "seguro medico", "health insurance", "zorgverzekering", "psycho", "therapist", "nutricion", "physiotherapy", "osteopat", "oculista", "optician", "lentes", "glasses", "vitamins"], "salud", "necesario"],
  // Inversiones
  [["myinvestor", "trading 212", "etoro", "degiro", "interactive brokers", "coinbase", "binance", "revolut trading", "robinhood", "fidelity", "vanguard", "schwab", "saxo bank", "flatex", "trade republic", "scalable capital", "bitcoin", "ethereum", "crypto"], "inversiones", "necesario"],
  // Transferencia
  [["transferencia", "transfer", "traspaso", "desde eur", "a eur", "savings", "vault", "pocket", "autotransferencia", "to instant", "from instant", "to easy", "to flexible"], "transferencia", "necesario"],
  // Seguros
  [["seguro", "insurance", "verzekering", "assurance", "versicherung", "poliza", "policy", "allianz", "axa", "mapfre", "zurich", "generali", "aegon", "nationale nederlanden"], "seguros", "necesario"],
  // Hogar
  [["ikea", "leroy merlin", "bricodepot", "bauhaus", "hornbach", "gamma", "praxis", "action", "hema", "tiger", "flying tiger", "casa ", "home depot", "lowes", "bed bath", "wayfair", "maisons du monde", "westwing", "electrodomestico", "appliance"], "hogar", "discrecional"],
  // Tecnologia
  [["apple store", "mediamarkt", "coolblue", "pccomponentes", "amazon.es", "amazon.com", "amazon.de", "amazon.nl", "amazon.fr", "amazon.it", "amazon.co.uk", "best buy", "fnac", "saturn", "el corte ingles", "electronics"], "tecnologia", "discrecional"],
  // Delivery / comida rapida
  [["plenergy", "drippys", "febo", "hema food", "foodora", "wolt", "gorillas", "getir", "gopuff", "picnic", "flink", "deliveroo", "rappi", "ifood"], "ocio", "discrecional"],
  // Mascotas
  [["veterinario", "vet ", "petshop", "pet store", "tiendanimal", "kiwoko", "fressnapf", "zooplus", "mascota", "pet food"], "mascotas", "necesario"],
  // Regalos / Donaciones
  [["regalo", "gift", "donacion", "donation", "caridad", "charity", "birthday", "cumpleaños", "navidad", "christmas"], "regalos", "discrecional"],
  // Intereses
  [["interes", "interest", "rendimiento", "yield", "dividendo", "dividend", "cupon", "coupon"], "intereses", "necesario"],
];

export function suggestCategory(description: string): { category: string; expenseType: string } | null {
  const lower = description.toLowerCase();

  for (const [keywords, category, expenseType] of RULES) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        return { category, expenseType };
      }
    }
  }

  return null;
}
