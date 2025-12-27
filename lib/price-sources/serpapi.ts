import { ProviderPrice } from '../types';
import { PriceSearchParams, PriceSearchResult } from './index';

interface SerpAPIShoppingResult {
  title: string;
  link: string;
  source: string;
  price: string;
  extracted_price?: number;
  thumbnail?: string;
}

interface SerpAPIResponse {
  shopping_results?: SerpAPIShoppingResult[];
  organic_results?: Array<{
    title: string;
    link: string;
    snippet?: string;
  }>;
  error?: string;
}

/**
 * Israeli domain patterns
 */
const ISRAELI_DOMAINS = [
  '.co.il',
  '.org.il',
  '.net.il',
  '.ac.il',
  '.gov.il',
  '.muni.il',
  '.idf.il',
];

/**
 * Known Israeli retailers (even if using .com domains)
 */
const KNOWN_ISRAELI_RETAILERS = [
  'ksp',
  'ivory',
  'bug',
  'zap',
  'pc365',
  'plonter',
  'allsound',
  'kolhazemer',
  'machsaneimusic',
  'hamashbir',
  'mega',
  'shufersal',
  'ace',
  'homedepot.co.il',
  'musicstore',
  'danino',
  'tefen',
  'eshel',
  'globus',
];

/**
 * Check if a URL is from an Israeli website
 */
function isIsraeliWebsite(url: string): boolean {
  if (!url) return false;
  
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    // Check for Israeli TLD
    for (const domain of ISRAELI_DOMAINS) {
      if (hostname.endsWith(domain)) {
        return true;
      }
    }
    
    // Check for known Israeli retailers
    for (const retailer of KNOWN_ISRAELI_RETAILERS) {
      if (hostname.includes(retailer)) {
        return true;
      }
    }
    
    return false;
  } catch {
    return false;
  }
}

/**
 * Extract price from text (handles ILS format)
 */
function extractPrice(priceText: string): number {
  if (!priceText) return 0;
  
  // Remove currency symbols, commas, and whitespace
  const cleaned = priceText
    .replace(/[₪$€]/g, '')
    .replace(/,/g, '')
    .replace(/ILS/gi, '')
    .replace(/\s/g, '')
    .trim();
  
  // Extract first number
  const match = cleaned.match(/[\d.]+/);
  if (match) {
    const price = parseFloat(match[0]);
    return isNaN(price) ? 0 : price;
  }
  
  return 0;
}

/**
 * Try a single search query and return providers
 */
async function trySearch(
  apiKey: string,
  query: string,
  engine: 'google_shopping' | 'google'
): Promise<ProviderPrice[]> {
  const providers: ProviderPrice[] = [];
  
  const searchParams = new URLSearchParams({
    api_key: apiKey,
    engine,
    q: query,
    gl: 'il',
    hl: 'he',
    google_domain: 'google.co.il',
  });

  const response = await fetch(
    `https://serpapi.com/search.json?${searchParams.toString()}`
  );

  if (!response.ok) {
    return providers;
  }

  const data: SerpAPIResponse = await response.json();

  // Process shopping results
  if (data.shopping_results) {
    for (const result of data.shopping_results) {
      const price = result.extracted_price || extractPrice(result.price);
      const url = result.link || '';
      
      if (price > 0 && isIsraeliWebsite(url)) {
        providers.push({
          providerName: result.source || 'Unknown',
          providerUrl: url,
          price,
          currency: 'ILS',
          lastUpdated: new Date().toISOString(),
          source: 'serpapi',
        });
      }
    }
  }

  // Process organic results (for regular Google search)
  if (data.organic_results) {
    for (const result of data.organic_results) {
      if (!isIsraeliWebsite(result.link)) {
        continue;
      }
      
      // Try to extract price from snippet
      if (result.snippet) {
        const priceMatch = result.snippet.match(/₪\s*[\d,]+|[\d,]+\s*₪/);
        if (priceMatch) {
          const price = extractPrice(priceMatch[0]);
          if (price > 0) {
            let providerName = 'Unknown';
            try {
              const url = new URL(result.link);
              providerName = url.hostname.replace('www.', '');
            } catch {
              // Keep Unknown
            }

            providers.push({
              providerName,
              providerUrl: result.link,
              price,
              currency: 'ILS',
              lastUpdated: new Date().toISOString(),
              source: 'serpapi',
            });
          }
        }
      }
    }
  }

  return providers;
}

/**
 * Search for product prices using SerpAPI (Google Search)
 * Uses multiple query strategies for better results
 */
export async function searchWithSerpAPI(
  params: PriceSearchParams,
  apiKey: string
): Promise<PriceSearchResult> {
  try {
    const providers: ProviderPrice[] = [];
    const seenUrls = new Set<string>();

    // Helper to add unique providers
    const addProviders = (newProviders: ProviderPrice[]) => {
      for (const p of newProviders) {
        if (!seenUrls.has(p.providerUrl)) {
          seenUrls.add(p.providerUrl);
          providers.push(p);
        }
      }
    };

    // Query strategies - try multiple approaches
    const queries = [
      // Strategy 1: Product name with Israeli site filter
      `${params.productName} site:*.co.il מחיר`,
      // Strategy 2: Barcode search (exact match)
      `${params.barcode} מחיר ישראל`,
      // Strategy 3: Product name only (broader)
      `${params.productName} לקנות בישראל`,
    ];

    // Try Google Shopping first with main query
    const shoppingQuery = `${params.productName} ${params.barcode}`;
    const shoppingResults = await trySearch(apiKey, shoppingQuery, 'google_shopping');
    addProviders(shoppingResults);

    // If shopping didn't return enough results, try organic search
    if (providers.length < 3) {
      for (const query of queries) {
        if (providers.length >= 5) break; // We have enough results
        
        const results = await trySearch(apiKey, query, 'google');
        addProviders(results);
      }
    }

    // Even if no Israeli results, return success (just empty)
    // This prevents error messages for products that genuinely aren't sold in Israel
    return {
      success: true,
      providers,
    };
  } catch (error) {
    return {
      success: false,
      providers: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

