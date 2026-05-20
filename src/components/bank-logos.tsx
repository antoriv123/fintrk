/**
 * Bank logos — real app icons from the App Store.
 * fintrk is NOT affiliated with any of these banks.
 * Logos are shown solely to indicate format compatibility.
 */

interface BankLogoProps {
  size?: number;
  className?: string;
}

/** All supported banks with their logo files, grouped by category */
export const SUPPORTED_BANKS = [
  // Spanish banks
  { slug: "bbva", name: "BBVA", category: "spain" },
  { slug: "santander", name: "Santander", category: "spain" },
  { slug: "caixabank", name: "CaixaBank", category: "spain" },
  { slug: "ing", name: "ING", category: "spain" },
  { slug: "bankinter", name: "Bankinter", category: "spain" },
  { slug: "sabadell", name: "Sabadell", category: "spain" },
  { slug: "openbank", name: "Openbank", category: "spain" },
  { slug: "evo", name: "EVO Banco", category: "spain" },
  { slug: "kutxabank", name: "Kutxabank", category: "spain" },
  { slug: "ibercaja", name: "Ibercaja", category: "spain" },
  { slug: "unicaja", name: "Unicaja", category: "spain" },
  { slug: "abanca", name: "Abanca", category: "spain" },
  { slug: "myinvestor", name: "MyInvestor", category: "spain" },
  { slug: "bizum", name: "Bizum", category: "spain" },
  // European banks
  { slug: "rabobank", name: "Rabobank", category: "europe" },
  { slug: "abn-amro", name: "ABN AMRO", category: "europe" },
  { slug: "deutsche-bank", name: "Deutsche Bank", category: "europe" },
  { slug: "bnp-paribas", name: "BNP Paribas", category: "europe" },
  { slug: "commerzbank", name: "Commerzbank", category: "europe" },
  { slug: "triodos", name: "Triodos", category: "europe" },
  // Neobanks & fintechs
  { slug: "revolut", name: "Revolut", category: "fintech" },
  { slug: "n26", name: "N26", category: "fintech" },
  { slug: "wise", name: "Wise", category: "fintech" },
  { slug: "bunq", name: "bunq", category: "fintech" },
  { slug: "monzo", name: "Monzo", category: "fintech" },
  { slug: "starling", name: "Starling", category: "fintech" },
  { slug: "vivid", name: "Vivid", category: "fintech" },
  { slug: "lydia", name: "Lydia", category: "fintech" },
  { slug: "curve", name: "Curve", category: "fintech" },
  { slug: "trade-republic", name: "Trade Republic", category: "fintech" },
  // Investment & crypto
  { slug: "degiro", name: "DEGIRO", category: "invest" },
  { slug: "scalable", name: "Scalable", category: "invest" },
  { slug: "interactive-brokers", name: "IBKR", category: "invest" },
  { slug: "coinbase", name: "Coinbase", category: "invest" },
  { slug: "binance", name: "Binance", category: "invest" },
  // Payment
  { slug: "paypal", name: "PayPal", category: "payment" },
  // Mexico
  { slug: "bbva-mx", name: "BBVA México", category: "latam" },
  { slug: "banorte", name: "Banorte", category: "latam" },
  { slug: "santander-mx", name: "Santander MX", category: "latam" },
  { slug: "hsbc", name: "HSBC", category: "latam" },
  { slug: "citibanamex", name: "Citibanamex", category: "latam" },
  { slug: "nu-mx", name: "Nu México", category: "latam" },
  { slug: "mercado-pago", name: "Mercado Pago", category: "latam" },
  // Colombia
  { slug: "bancolombia", name: "Bancolombia", category: "latam" },
  { slug: "davivienda", name: "Davivienda", category: "latam" },
  { slug: "banco-bogota", name: "Banco de Bogotá", category: "latam" },
  { slug: "bbva-co", name: "BBVA Colombia", category: "latam" },
  { slug: "nequi", name: "Nequi", category: "latam" },
  { slug: "nu-co", name: "Nu Colombia", category: "latam" },
  // Argentina
  { slug: "mercado-pago-ar", name: "Mercado Pago AR", category: "latam" },
  { slug: "brubank", name: "Brubank", category: "latam" },
  { slug: "galicia", name: "Galicia", category: "latam" },
  { slug: "santander-ar", name: "Santander AR", category: "latam" },
  { slug: "bbva-ar", name: "BBVA Argentina", category: "latam" },
  { slug: "uala", name: "Ualá", category: "latam" },
  { slug: "naranja-x", name: "Naranja X", category: "latam" },
  // Chile
  { slug: "banco-chile", name: "Banco de Chile", category: "latam" },
  { slug: "bancoestado", name: "BancoEstado", category: "latam" },
  { slug: "santander-cl", name: "Santander CL", category: "latam" },
  { slug: "bci", name: "BCI", category: "latam" },
  { slug: "falabella", name: "Falabella", category: "latam" },
  { slug: "mach", name: "MACH", category: "latam" },
  // Peru
  { slug: "bcp", name: "BCP", category: "latam" },
  { slug: "interbank", name: "Interbank", category: "latam" },
  { slug: "bbva-pe", name: "BBVA Perú", category: "latam" },
  { slug: "scotiabank-pe", name: "Scotiabank", category: "latam" },
  { slug: "yape", name: "Yape", category: "latam" },
  // Ecuador
  { slug: "pichincha", name: "Banco Pichincha", category: "latam" },
  { slug: "guayaquil", name: "Banco Guayaquil", category: "latam" },
  { slug: "pacifico", name: "Banco del Pacífico", category: "latam" },
  // Uruguay
  { slug: "brou", name: "BROU", category: "latam" },
  { slug: "itau-uy", name: "Itaú Uruguay", category: "latam" },
  { slug: "santander-uy", name: "Santander UY", category: "latam" },
  // US
  { slug: "chase", name: "Chase", category: "us" },
  { slug: "bofa", name: "Bank of America", category: "us" },
  { slug: "wells-fargo", name: "Wells Fargo", category: "us" },
  { slug: "citi", name: "Citi", category: "us" },
  { slug: "capital-one", name: "Capital One", category: "us" },
  { slug: "sofi", name: "SoFi", category: "us" },
  // UK
  { slug: "barclays", name: "Barclays", category: "europe" },
  { slug: "hsbc-uk", name: "HSBC UK", category: "europe" },
  { slug: "lloyds", name: "Lloyds", category: "europe" },
  { slug: "revolut-uk", name: "Revolut UK", category: "europe" },
  // France
  { slug: "boursorama", name: "Boursorama", category: "europe" },
  { slug: "credit-agricole", name: "Crédit Agricole", category: "europe" },
  { slug: "societe-generale", name: "Société Générale", category: "europe" },
  // Germany
  { slug: "sparkasse", name: "Sparkasse", category: "europe" },
  { slug: "n26-de", name: "N26 DE", category: "europe" },
  // Netherlands
  { slug: "ing-nl", name: "ING NL", category: "europe" },
  // Belgium
  { slug: "belfius", name: "Belfius", category: "europe" },
  { slug: "kbc", name: "KBC", category: "europe" },
  { slug: "bnp-fortis", name: "BNP Paribas Fortis", category: "europe" },
  // Italy
  { slug: "intesa", name: "Intesa Sanpaolo", category: "europe" },
  { slug: "unicredit", name: "UniCredit", category: "europe" },
  { slug: "fineco", name: "Fineco", category: "europe" },
  // Portugal
  { slug: "cgd", name: "Caixa Geral", category: "europe" },
  { slug: "millennium", name: "Millennium BCP", category: "europe" },
  { slug: "novo-banco", name: "Novo Banco", category: "europe" },
  // Ireland
  { slug: "aib", name: "AIB", category: "europe" },
  { slug: "boi", name: "Bank of Ireland", category: "europe" },
  // Austria
  { slug: "erste", name: "Erste Bank", category: "europe" },
  { slug: "raiffeisen", name: "Raiffeisen", category: "europe" },
] as const;

/** Subset shown prominently on landing page — 5 most recognizable */
export const FEATURED_BANKS = [
  "bbva", "santander", "revolut", "wise", "n26",
] as const;

const BANK_SLUGS = new Set<string>(SUPPORTED_BANKS.map((b) => b.slug));

/** Render a real bank app icon from /public/banks/ */
export function BankLogo({ bank, size = 24, className }: { bank: string } & BankLogoProps) {
  const slug = bank.toLowerCase();
  if (!BANK_SLUGS.has(slug)) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/banks/${slug}.png`}
      alt={bank}
      width={size}
      height={size}
      className={`rounded-[22%] ${className ?? ""}`}
      loading="eager"
    />
  );
}

/** Map for checking if a bank has a logo */
export const BANK_LOGOS: Record<string, boolean> = Object.fromEntries(
  SUPPORTED_BANKS.map((b) => [b.slug, true])
);

/** Bank logos strip — shows featured banks in a row */
export function BankLogosStrip({ size = 28, className, showAll }: BankLogoProps & { showAll?: boolean }) {
  const banks = showAll
    ? SUPPORTED_BANKS
    : SUPPORTED_BANKS.filter((b) => (FEATURED_BANKS as readonly string[]).includes(b.slug));
  return (
    <div className={`flex items-center gap-2 flex-wrap justify-center ${className ?? ""}`}>
      {banks.map(({ slug, name }) => (
        <div key={slug} className="flex flex-col items-center gap-1">
          <BankLogo bank={slug} size={size} />
          <span className="text-[10px] text-muted-foreground leading-none">{name}</span>
        </div>
      ))}
    </div>
  );
}
