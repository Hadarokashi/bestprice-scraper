import { ProviderPrice } from '../types';
import { PriceSearchParams, PriceSearchResult } from './index';

/**
 * Israeli domain patterns
 */
const ISRAELI_DOMAINS = ['.co.il', '.org.il', '.net.il'];
const KNOWN_ISRAELI_RETAILERS = ['ksp', 'ivory', 'bug', 'zap', 'pc365', 'plonter', 'allsound'];

/**
 * Check if URL is Israeli
 */
function isIsraeliWebsite(url: string): boolean {
  if (!url) return false;
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    for (const domain of ISRAELI_DOMAINS) {
      if (hostname.endsWith(domain)) return true;
    }
    for (const retailer of KNOWN_ISRAELI_RETAILERS) {
      if (hostname.includes(retailer)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Extract price from text
 */
function extractPrice(text: string): number {
  if (!text) return 0;
  const match = text.match(/₪\s*([\d,]+)|(\d[\d,]*)\s*₪/);
  if (match) {
    const priceStr = (match[1] || match[2]).replace(/,/g, '');
    return parseFloat(priceStr) || 0;
  }
  return 0;
}

interface BraveSearchResult {
  title: string;
  url: string;
  description: string;
  extra_snippets?: string[];
}

interface BraveSearchResponse {
  web?: {
    results?: BraveSearchResult[];
  };
}

/**
 * Search using Brave Search API (2,000 free queries/month)
 * Get API key from: https://brave.com/search/api/
 */
export async function searchWithBrave(
  params: PriceSearchParams,
  apiKey: string
): Promise<PriceSearchResult> {
  try {
    // Search for product with Israeli site filter
    const query = `${params.productName} ${params.barcode} מחיר site:*.co.il`;
    
    const response = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&country=IL`,
      {
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': apiKey,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Brave Search failed: ${response.status}`);
    }

    const data: BraveSearchResponse = await response.json();
    const providers: ProviderPrice[] = [];
    const seenUrls = new Set<string>();

    if (data.web?.results) {
      for (const result of data.web.results) {
        if (!isIsraeliWebsite(result.url)) continue;
        if (seenUrls.has(result.url)) continue;
        
        // Try to extract price from description or snippets
        let price = extractPrice(result.description);
        
        if (!price && result.extra_snippets) {
          for (const snippet of result.extra_snippets) {
            price = extractPrice(snippet);
            if (price > 0) break;
          }
        }

        if (price > 0) {
          seenUrls.add(result.url);
          
          let providerName = 'Unknown';
          try {
            providerName = new URL(result.url).hostname.replace('www.', '');
          } catch {
            // Keep unknown
          }

          providers.push({
            providerName,
            providerUrl: result.url,
            price,
            currency: 'ILS',
            lastUpdated: new Date().toISOString(),
            source: 'serpapi', // Use serpapi as source type for consistency
          });
        }
      }
    }

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

