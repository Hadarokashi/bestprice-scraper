import { ProviderPrice, PriceSource } from '../types';
import { searchWithSerpAPI } from './serpapi';
import { searchWithZap } from './zap-scraper';
import { searchWithBrave } from './brave-search';
import { getManualPrices } from './manual';

/**
 * Price source interface - all price sources must implement this
 */
export interface PriceSearchParams {
  productName: string;
  barcode: string;
  sku?: string;
}

export interface PriceSearchResult {
  success: boolean;
  providers: ProviderPrice[];
  error?: string;
}

/**
 * Merge providers from multiple sources, preferring Zap prices (more accurate)
 */
function mergeProviders(providers: ProviderPrice[]): ProviderPrice[] {
  const byStore = new Map<string, ProviderPrice>();
  
  // Sort so Zap results come last (override Google results)
  const sorted = [...providers].sort((a, b) => {
    if (a.source === 'zap' && b.source !== 'zap') return 1;
    if (a.source !== 'zap' && b.source === 'zap') return -1;
    return 0;
  });
  
  for (const provider of sorted) {
    // Normalize store name for comparison
    const normalizedName = provider.providerName
      .toLowerCase()
      .replace(/[^a-z0-9א-ת]/g, '');
    
    // Keep the Zap version if we have both (more accurate)
    byStore.set(normalizedName, provider);
  }
  
  return Array.from(byStore.values());
}

/**
 * Search for prices using the specified source
 */
export async function searchPrices(
  params: PriceSearchParams,
  source: PriceSource,
  apiKey?: string
): Promise<PriceSearchResult> {
  switch (source) {
    case 'serpapi':
      if (!apiKey) {
        return {
          success: false,
          providers: [],
          error: 'SerpAPI key is required for Google search',
        };
      }
      return searchWithSerpAPI(params, apiKey);

    case 'zap':
      return searchWithZap(params);

    case 'manual':
      return getManualPrices(params.barcode);

    case 'combined': {
      // Search sources - Zap is primary (free, accurate)
      const allProviders: ProviderPrice[] = [];
      const errors: string[] = [];
      
      // PRIMARY: Always search Zap (free, most accurate for Israeli market)
      console.log('Searching Zap.co.il...');
      const zapResult = await searchWithZap(params);
      if (zapResult.success) {
        console.log(`Zap found ${zapResult.providers.length} providers`);
        allProviders.push(...zapResult.providers);
      } else if (zapResult.error) {
        errors.push(`Zap: ${zapResult.error}`);
      }
      
      // OPTIONAL: Also search with API if key available (for broader coverage)
      if (apiKey && allProviders.length < 3) {
        // Try Brave Search first (if it looks like a Brave key)
        if (apiKey.startsWith('BSA')) {
          const braveResult = await searchWithBrave(params, apiKey);
          if (braveResult.success) {
            allProviders.push(...braveResult.providers);
          }
        } else {
          // Assume it's a SerpAPI key
          const serpResult = await searchWithSerpAPI(params, apiKey);
          if (serpResult.success) {
            allProviders.push(...serpResult.providers);
          } else if (serpResult.error) {
            errors.push(`Google: ${serpResult.error}`);
          }
        }
      }
      
      // Merge and deduplicate, preferring Zap prices
      const merged = mergeProviders(allProviders);
      
      return {
        success: true,
        providers: merged,
        error: errors.length > 0 && merged.length === 0 ? errors.join('; ') : undefined,
      };
    }

    default:
      return {
        success: false,
        providers: [],
        error: `Unknown price source: ${source}`,
      };
  }
}

/**
 * Get available price sources
 */
export function getAvailableSources(): Array<{
  id: PriceSource;
  name: string;
  description: string;
  requiresApiKey: boolean;
}> {
  return [
    {
      id: 'zap',
      name: 'Zap.co.il (מומלץ)',
      description: 'חינם! מחירים בזמן אמת מ-100+ חנויות ישראליות',
      requiresApiKey: false,
    },
    {
      id: 'combined',
      name: 'Zap + חיפוש נוסף',
      description: 'Zap כמקור ראשי + Google/Brave אם יש API key',
      requiresApiKey: false,
    },
    {
      id: 'serpapi',
      name: 'Google Search (SerpAPI)',
      description: 'חיפוש ב-Google Shopping (דורש API key בתשלום)',
      requiresApiKey: true,
    },
    {
      id: 'manual',
      name: 'ייבוא ידני',
      description: 'מחירים שיובאו ידנית מקובץ CSV',
      requiresApiKey: false,
    },
  ];
}

