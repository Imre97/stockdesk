import { Decimal } from "@stockdesk/shared";

export interface SimulatedAsset {
  symbol: string;
  name: string;
  exchange: string;
  industry: string;
  basePrice: Decimal;
  annualVolatility: Decimal;
  sharesOutstanding: Decimal;
  peRatio: Decimal | null;
  beta: Decimal | null;
  dividendYield: Decimal | null;
  shortable: boolean;
  fractionable: boolean;
  websiteUrl: string;
  logoUrl: string | null;
}

interface UniverseRow {
  symbol: string;
  name: string;
  exchange: string;
  industry: string;
  basePrice: string;
  annualVolatility: string;
  sharesOutstanding: string;
  peRatio: string;
  beta: string;
  dividendYield: string | null;
  website: string;
}

const NASDAQ = "NASDAQ";
const NYSE = "NYSE";
const LOGO_BASE = "https://cdn.stockdesk.example/logos";

const NOT_SHORTABLE = new Set(["MU", "NKE", "PFE"]);
const NOT_FRACTIONABLE = new Set(["AVGO", "BRK.B", "TXN"]);
const WITHOUT_LOGO = new Set(["AMGN", "MU", "NKE"]);

const ROWS: UniverseRow[] = [
  { symbol: "AAPL", name: "Apple Inc.", exchange: NASDAQ, industry: "Consumer Electronics",
    basePrice: "228.40", annualVolatility: "0.26", sharesOutstanding: "15200000000", peRatio: "34.20", beta: "1.18", dividendYield: null, website: "www.apple.com" },
  { symbol: "MSFT", name: "Microsoft Corporation", exchange: NASDAQ, industry: "Software Infrastructure",
    basePrice: "432.60", annualVolatility: "0.24", sharesOutstanding: "7430000000", peRatio: "35.80", beta: "0.92", dividendYield: null, website: "www.microsoft.com" },
  { symbol: "NVDA", name: "NVIDIA Corporation", exchange: NASDAQ, industry: "Semiconductors",
    basePrice: "138.90", annualVolatility: "0.48", sharesOutstanding: "24500000000", peRatio: "52.40", beta: "1.65", dividendYield: null, website: "www.nvidia.com" },
  { symbol: "AMZN", name: "Amazon.com, Inc.", exchange: NASDAQ, industry: "Internet Retail",
    basePrice: "201.30", annualVolatility: "0.31", sharesOutstanding: "10500000000", peRatio: "41.60", beta: "1.14", dividendYield: null, website: "www.aboutamazon.com" },
  { symbol: "GOOGL", name: "Alphabet Inc.", exchange: NASDAQ, industry: "Internet Content and Information",
    basePrice: "176.80", annualVolatility: "0.28", sharesOutstanding: "12200000000", peRatio: "25.10", beta: "1.03", dividendYield: null, website: "www.abc.xyz" },
  { symbol: "META", name: "Meta Platforms, Inc.", exchange: NASDAQ, industry: "Internet Content and Information",
    basePrice: "592.40", annualVolatility: "0.34", sharesOutstanding: "2530000000", peRatio: "27.30", beta: "1.21", dividendYield: null, website: "www.meta.com" },
  { symbol: "TSLA", name: "Tesla, Inc.", exchange: NASDAQ, industry: "Auto Manufacturers",
    basePrice: "251.30", annualVolatility: "0.55", sharesOutstanding: "3190000000", peRatio: "65.20", beta: "2.05", dividendYield: null, website: "www.tesla.com" },
  { symbol: "AVGO", name: "Broadcom Inc.", exchange: NASDAQ, industry: "Semiconductors",
    basePrice: "172.50", annualVolatility: "0.38", sharesOutstanding: "4670000000", peRatio: "48.90", beta: "1.09", dividendYield: "0.0130", website: "www.broadcom.com" },
  { symbol: "COST", name: "Costco Wholesale Corporation", exchange: NASDAQ, industry: "Discount Stores",
    basePrice: "905.20", annualVolatility: "0.20", sharesOutstanding: "443000000", peRatio: "52.10", beta: "0.79", dividendYield: null, website: "www.costco.com" },
  { symbol: "NFLX", name: "Netflix, Inc.", exchange: NASDAQ, industry: "Entertainment",
    basePrice: "712.40", annualVolatility: "0.36", sharesOutstanding: "428000000", peRatio: "42.80", beta: "1.28", dividendYield: null, website: "www.netflix.com" },
  { symbol: "AMD", name: "Advanced Micro Devices, Inc.", exchange: NASDAQ, industry: "Semiconductors",
    basePrice: "148.70", annualVolatility: "0.47", sharesOutstanding: "1620000000", peRatio: "45.30", beta: "1.72", dividendYield: null, website: "www.amd.com" },
  { symbol: "PEP", name: "PepsiCo, Inc.", exchange: NASDAQ, industry: "Beverages",
    basePrice: "168.90", annualVolatility: "0.17", sharesOutstanding: "1373000000", peRatio: "23.40", beta: "0.55", dividendYield: "0.0320", website: "www.pepsico.com" },
  { symbol: "ADBE", name: "Adobe Inc.", exchange: NASDAQ, industry: "Software Application",
    basePrice: "512.30", annualVolatility: "0.31", sharesOutstanding: "441000000", peRatio: "33.60", beta: "1.31", dividendYield: null, website: "www.adobe.com" },
  { symbol: "CSCO", name: "Cisco Systems, Inc.", exchange: NASDAQ, industry: "Communication Equipment",
    basePrice: "57.80", annualVolatility: "0.21", sharesOutstanding: "4000000000", peRatio: "19.70", beta: "0.86", dividendYield: "0.0270", website: "www.cisco.com" },
  { symbol: "INTC", name: "Intel Corporation", exchange: NASDAQ, industry: "Semiconductors",
    basePrice: "23.60", annualVolatility: "0.42", sharesOutstanding: "4270000000", peRatio: "18.20", beta: "1.04", dividendYield: null, website: "www.intel.com" },
  { symbol: "QCOM", name: "QUALCOMM Incorporated", exchange: NASDAQ, industry: "Semiconductors",
    basePrice: "163.40", annualVolatility: "0.33", sharesOutstanding: "1110000000", peRatio: "21.50", beta: "1.24", dividendYield: null, website: "www.qualcomm.com" },
  { symbol: "TXN", name: "Texas Instruments Incorporated", exchange: NASDAQ, industry: "Semiconductors",
    basePrice: "201.70", annualVolatility: "0.26", sharesOutstanding: "911000000", peRatio: "34.10", beta: "1.02", dividendYield: "0.0270", website: "www.ti.com" },
  { symbol: "AMGN", name: "Amgen Inc.", exchange: NASDAQ, industry: "Drug Manufacturers",
    basePrice: "312.80", annualVolatility: "0.23", sharesOutstanding: "537000000", peRatio: "29.40", beta: "0.61", dividendYield: null, website: "www.amgen.com" },
  { symbol: "SBUX", name: "Starbucks Corporation", exchange: NASDAQ, industry: "Restaurants",
    basePrice: "96.40", annualVolatility: "0.27", sharesOutstanding: "1134000000", peRatio: "27.80", beta: "0.98", dividendYield: null, website: "www.starbucks.com" },
  { symbol: "MU", name: "Micron Technology, Inc.", exchange: NASDAQ, industry: "Semiconductors",
    basePrice: "102.30", annualVolatility: "0.50", sharesOutstanding: "1110000000", peRatio: "16.90", beta: "1.44", dividendYield: null, website: "www.micron.com" },
  { symbol: "BRK.B", name: "Berkshire Hathaway Inc.", exchange: NYSE, industry: "Insurance Diversified",
    basePrice: "468.20", annualVolatility: "0.16", sharesOutstanding: "1300000000", peRatio: "15.30", beta: "0.87", dividendYield: null, website: "www.berkshirehathaway.com" },
  { symbol: "JPM", name: "JPMorgan Chase & Co.", exchange: NYSE, industry: "Banks Diversified",
    basePrice: "218.50", annualVolatility: "0.25", sharesOutstanding: "2830000000", peRatio: "12.80", beta: "1.11", dividendYield: null, website: "www.jpmorganchase.com" },
  { symbol: "V", name: "Visa Inc.", exchange: NYSE, industry: "Credit Services",
    basePrice: "289.60", annualVolatility: "0.19", sharesOutstanding: "1610000000", peRatio: "30.20", beta: "0.95", dividendYield: null, website: "www.visa.com" },
  { symbol: "MA", name: "Mastercard Incorporated", exchange: NYSE, industry: "Credit Services",
    basePrice: "498.10", annualVolatility: "0.20", sharesOutstanding: "925000000", peRatio: "36.40", beta: "1.06", dividendYield: null, website: "www.mastercard.com" },
  { symbol: "JNJ", name: "Johnson & Johnson", exchange: NYSE, industry: "Drug Manufacturers",
    basePrice: "158.30", annualVolatility: "0.15", sharesOutstanding: "2410000000", peRatio: "15.60", beta: "0.52", dividendYield: "0.0310", website: "www.jnj.com" },
  { symbol: "WMT", name: "Walmart Inc.", exchange: NYSE, industry: "Discount Stores",
    basePrice: "81.40", annualVolatility: "0.19", sharesOutstanding: "8040000000", peRatio: "33.90", beta: "0.63", dividendYield: null, website: "www.walmart.com" },
  { symbol: "PG", name: "The Procter & Gamble Company", exchange: NYSE, industry: "Household and Personal Products",
    basePrice: "172.60", annualVolatility: "0.14", sharesOutstanding: "2360000000", peRatio: "27.20", beta: "0.44", dividendYield: "0.0240", website: "www.pg.com" },
  { symbol: "XOM", name: "Exxon Mobil Corporation", exchange: NYSE, industry: "Oil and Gas Integrated",
    basePrice: "118.90", annualVolatility: "0.28", sharesOutstanding: "4400000000", peRatio: "13.70", beta: "0.92", dividendYield: "0.0330", website: "www.exxonmobil.com" },
  { symbol: "UNH", name: "UnitedHealth Group Incorporated", exchange: NYSE, industry: "Healthcare Plans",
    basePrice: "562.30", annualVolatility: "0.24", sharesOutstanding: "921000000", peRatio: "21.40", beta: "0.58", dividendYield: null, website: "www.unitedhealthgroup.com" },
  { symbol: "HD", name: "The Home Depot, Inc.", exchange: NYSE, industry: "Home Improvement Retail",
    basePrice: "392.70", annualVolatility: "0.22", sharesOutstanding: "993000000", peRatio: "26.10", beta: "1.02", dividendYield: null, website: "www.homedepot.com" },
  { symbol: "BAC", name: "Bank of America Corporation", exchange: NYSE, industry: "Banks Diversified",
    basePrice: "41.80", annualVolatility: "0.29", sharesOutstanding: "7760000000", peRatio: "13.20", beta: "1.29", dividendYield: null, website: "www.bankofamerica.com" },
  { symbol: "CVX", name: "Chevron Corporation", exchange: NYSE, industry: "Oil and Gas Integrated",
    basePrice: "148.20", annualVolatility: "0.25", sharesOutstanding: "1840000000", peRatio: "14.60", beta: "1.08", dividendYield: "0.0410", website: "www.chevron.com" },
  { symbol: "KO", name: "The Coca-Cola Company", exchange: NYSE, industry: "Beverages",
    basePrice: "68.30", annualVolatility: "0.15", sharesOutstanding: "4310000000", peRatio: "24.80", beta: "0.58", dividendYield: "0.0290", website: "www.coca-colacompany.com" },
  { symbol: "MRK", name: "Merck & Co., Inc.", exchange: NYSE, industry: "Drug Manufacturers",
    basePrice: "104.60", annualVolatility: "0.21", sharesOutstanding: "2530000000", peRatio: "18.30", beta: "0.41", dividendYield: "0.0300", website: "www.merck.com" },
  { symbol: "PFE", name: "Pfizer Inc.", exchange: NYSE, industry: "Drug Manufacturers",
    basePrice: "28.40", annualVolatility: "0.24", sharesOutstanding: "5660000000", peRatio: "17.10", beta: "0.66", dividendYield: "0.0580", website: "www.pfizer.com" },
  { symbol: "DIS", name: "The Walt Disney Company", exchange: NYSE, industry: "Entertainment",
    basePrice: "94.70", annualVolatility: "0.29", sharesOutstanding: "1810000000", peRatio: "22.60", beta: "1.37", dividendYield: null, website: "www.thewaltdisneycompany.com" },
  { symbol: "CRM", name: "Salesforce, Inc.", exchange: NYSE, industry: "Software Application",
    basePrice: "268.40", annualVolatility: "0.32", sharesOutstanding: "967000000", peRatio: "44.20", beta: "1.30", dividendYield: null, website: "www.salesforce.com" },
  { symbol: "ORCL", name: "Oracle Corporation", exchange: NYSE, industry: "Software Infrastructure",
    basePrice: "172.30", annualVolatility: "0.28", sharesOutstanding: "2790000000", peRatio: "38.70", beta: "1.05", dividendYield: null, website: "www.oracle.com" },
  { symbol: "IBM", name: "International Business Machines Corporation", exchange: NYSE, industry: "Information Technology Services",
    basePrice: "218.90", annualVolatility: "0.20", sharesOutstanding: "921000000", peRatio: "23.10", beta: "0.71", dividendYield: "0.0300", website: "www.ibm.com" },
  { symbol: "NKE", name: "NIKE, Inc.", exchange: NYSE, industry: "Footwear and Accessories",
    basePrice: "78.20", annualVolatility: "0.28", sharesOutstanding: "1490000000", peRatio: "21.80", beta: "1.09", dividendYield: null, website: "www.nike.com" },
];

function toAsset(row: UniverseRow): SimulatedAsset {
  return {
    symbol: row.symbol,
    name: row.name,
    exchange: row.exchange,
    industry: row.industry,
    basePrice: new Decimal(row.basePrice),
    annualVolatility: new Decimal(row.annualVolatility),
    sharesOutstanding: new Decimal(row.sharesOutstanding),
    peRatio: new Decimal(row.peRatio),
    beta: new Decimal(row.beta),
    dividendYield: row.dividendYield === null ? null : new Decimal(row.dividendYield),
    shortable: !NOT_SHORTABLE.has(row.symbol),
    fractionable: !NOT_FRACTIONABLE.has(row.symbol),
    websiteUrl: `https://${row.website}`,
    logoUrl: WITHOUT_LOGO.has(row.symbol) ? null : `${LOGO_BASE}/${row.symbol.toLowerCase()}.svg`,
  };
}

export const SIMULATED_UNIVERSE: readonly SimulatedAsset[] = ROWS.map(toAsset);

const BY_SYMBOL = new Map(SIMULATED_UNIVERSE.map((asset) => [asset.symbol, asset]));

export function findSimulatedAsset(symbol: string): SimulatedAsset | undefined {
  return BY_SYMBOL.get(symbol.trim().toUpperCase());
}
