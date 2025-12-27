import { ProviderPrice } from '../types';
import { PriceSearchParams, PriceSearchResult } from './index';

interface ZapOffer {
  '@type': string;
  price: string;
  priceCurrency: string;
  seller?: {
    '@type': string;
    name: string;
  };
}

interface ZapProductJsonLd {
  '@type': string;
  name?: string;
  brand?: { name: string };
  offers?: {
    '@type': string;
    url?: string;
    offerCount?: string;
    lowPrice?: string;
    highPrice?: string;
    priceCurrency?: string;
    offers?: ZapOffer[];
  };
}

/**
 * Extract all JSON-LD scripts and find Product type
 */
function extractProductJsonLd(html: string): ZapProductJsonLd | null {
  const scripts = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || [];
  
  for (const script of scripts) {
    try {
      const content = script.replace(/<script[^>]*>|<\/script>/g, '');
      const data = JSON.parse(content);
      if (data['@type'] === 'Product') {
        return data as ZapProductJsonLd;
      }
    } catch {
      // Continue to next script
    }
  }
  return null;
}

/**
 * Extract model IDs from Zap search results
 */
function extractModelIds(html: string): string[] {
  const matches = html.match(/modelid=(\d+)/g) || [];
  const ids = matches.map(m => m.replace('modelid=', ''));
  return [...new Set(ids)];
}

/**
 * Zap category mapping for product types
 */
const ZAP_CATEGORIES = [
  'e-headphone',           // Headphones
  'e-headphoneaccessories', // Headphone accessories  
  'e-microphone',          // Microphones
  'e-speaker',             // Speakers
  'e-audioaccessories',    // Audio accessories
];

/**
 * Check if the found product matches the search query
 * Uses strict matching - model number must be present
 */
function isProductMatch(foundName: string, searchName: string): boolean {
  // Normalize both names - also handle omega/ohm variations
  const normalize = (s: string) => s
    .toLowerCase()
    .replace(/[\u200F\u200E&rlm;]/g, '') // Remove RTL marks
    .replace(/Ω|ω|\u03A9|\u00D8/gi, 'ohm') // Normalize omega to ohm
    .replace(/[^a-z0-9א-ת\s]/g, ' ')      // Remove special chars
    .replace(/\s+/g, ' ')                 // Normalize spaces
    .trim();

  const found = normalize(foundName);
  const search = normalize(searchName);

  // Extract model number pattern (letters + numbers like "dt770", "dj300", "tg v70")
  const modelPattern = /[a-z]+\s*\d+|\d+\s*[a-z]+/gi;
  const searchModels = search.match(modelPattern) || [];
  const foundModels = found.match(modelPattern) || [];

  // If search has a model number, it MUST be in the found product
  const firstSearchModel = searchModels[0];
  if (firstSearchModel) {
    const searchModelNormalized = firstSearchModel.replace(/\s/g, '');
    let modelFound = false;
    
    for (const foundModel of foundModels) {
      const foundModelNormalized = foundModel.replace(/\s/g, '');
      if (foundModelNormalized.includes(searchModelNormalized) || 
          searchModelNormalized.includes(foundModelNormalized)) {
        modelFound = true;
        break;
      }
    }

    if (!modelFound) {
      console.log(`[Zap] Match check: "${searchName}" vs "${foundName}" = NO MATCH (model number mismatch)`);
      return false;
    }
  }

  // Also check for brand match if present
  const brands = ['beyerdynamic', 'sennheiser', 'audio-technica', 'shure', 'akg'];
  const searchBrand = brands.find(b => search.includes(b));
  const foundBrand = brands.find(b => found.includes(b));
  
  if (searchBrand && foundBrand && searchBrand !== foundBrand) {
    console.log(`[Zap] Match check: "${searchName}" vs "${foundName}" = NO MATCH (brand mismatch)`);
    return false;
  }

  console.log(`[Zap] Match check: "${searchName}" vs "${foundName}" = MATCH`);
  return true;
}

/**
 * Detect product type from name
 */
function detectProductType(name: string): 'headphone' | 'microphone' | 'accessory' | 'unknown' {
  const lowerName = name.toLowerCase();
  
  // Accessories - earpads, cables, adapters, etc.
  if (/^edt|^k\s*\d|^nr\.|^ea\s*\d|pad|cable|adapter|stand|case|bag/i.test(name)) {
    return 'accessory';
  }
  
  // Microphones
  if (/^tg\s*[vdi]|^m\s*\d{2,}|^mc\s*\d|microphone|מיקרופון/i.test(name)) {
    return 'microphone';
  }
  
  // Headphones
  if (/^dt\s*\d|^dj\s*\d|headphone|אוזניות|pro\s*x/i.test(name)) {
    return 'headphone';
  }
  
  return 'unknown';
}

/**
 * Clean and normalize product name for search
 * Removes special symbols only, keeps all text
 */
function cleanProductName(name: string): string {
  let cleaned = name
    // Remove Ω and similar symbols
    .replace(/Ω|ω|\u03A9|\u00D8/g, '')
    // Replace slashes with spaces
    .replace(/\//g, ' ')
    // Remove other special chars but keep letters, numbers, spaces, periods, hyphens
    .replace(/[^\w\sא-ת.-]/g, '')
    // Remove extra whitespace
    .replace(/\s+/g, ' ')
    .trim();
  
  return cleaned;
}

/**
 * Generate search variations for better coverage
 */
function getSearchVariations(productName: string): string[] {
  const variations: string[] = [];
  
  // Original name (with omega -> Ohm)
  const base = productName.replace(/Ω|ω|\u03A9|\u00D8/g, 'Ohm').trim();
  variations.push(base);
  
  // Cleaned version
  const cleaned = cleanProductName(productName);
  if (cleaned !== base) {
    variations.push(cleaned);
  }
  
  // Remove "Ohm" suffix entirely
  const withoutOhm = cleaned.replace(/\s*\d+\s*Ohm\s*/gi, ' ').trim();
  if (withoutOhm !== cleaned && withoutOhm.length > 3) {
    variations.push(withoutOhm);
  }
  
  // Extract core model (e.g., "DT 770" from "DT 770 PRO 80 Ohm")
  const coreModelMatch = cleaned.match(/^([A-Z]{1,3}\s*\d{2,4})/i);
  if (coreModelMatch) {
    const coreModel = coreModelMatch[1].trim();
    if (coreModel.length >= 4 && !variations.includes(coreModel)) {
      variations.push(coreModel);
    }
    // Also try with PRO suffix
    const withPro = cleaned.match(/^([A-Z]{1,3}\s*\d{2,4}\s*PRO)/i);
    if (withPro && !variations.includes(withPro[1])) {
      variations.push(withPro[1]);
    }
  }
  
  // Add Beyerdynamic prefix to cleaned version
  variations.push(`Beyerdynamic ${cleaned}`);
  
  // Unique variations only, max 5
  return [...new Set(variations)].slice(0, 5);
}

/**
 * Get Zap categories to search based on product type
 */
function getCategoriesToSearch(productType: 'headphone' | 'microphone' | 'accessory' | 'unknown'): string[] {
  switch (productType) {
    case 'headphone':
      return ['e-headphone'];
    case 'microphone':
      return ['e-microphone'];
    case 'accessory':
      return ['e-headphoneaccessories', 'e-audioaccessories'];
    default:
      return ['e-headphone', 'e-microphone']; // Search both
  }
}

/**
 * Search for a product on Zap.co.il and get real-time prices
 */
export async function searchWithZap(
  params: PriceSearchParams
): Promise<PriceSearchResult> {
  try {
    const providers: ProviderPrice[] = [];
    
    // Detect product type and get appropriate categories
    const productType = detectProductType(params.productName);
    const cleanedName = cleanProductName(params.productName);
    const categories = getCategoriesToSearch(productType);
    
    console.log(`[Zap] Searching for: "${params.productName}" -> "${cleanedName}" [${productType}]`);

    // Skip accessories as they're rarely in Zap
    if (productType === 'accessory') {
      console.log('[Zap] Skipping accessory - not typically listed');
      return { 
        success: true, 
        providers: [],
        error: 'אביזר - לא נמצא בהשוואת מחירים'
      };
    }

    // Get multiple search variations
    const searchVariations = getSearchVariations(params.productName);
    console.log(`[Zap] Search variations: ${searchVariations.join(', ')}`);

    // Build search queries - prioritize appropriate categories
    const searchQueries: string[] = [];
    
    for (const searchTerm of searchVariations) {
      // First try product-specific categories
      for (const cat of categories) {
        searchQueries.push(
          `https://www.zap.co.il/models.aspx?sog=${cat}&keyword=${encodeURIComponent(searchTerm)}`
        );
      }
    }
    
    // Then try general search as fallback
    for (const searchTerm of searchVariations.slice(0, 2)) {
      searchQueries.push(
        `https://www.zap.co.il/search.aspx?keyword=${encodeURIComponent(searchTerm)}`
      );
    }

    let foundModelIds: string[] = [];

    // Try searches until we find results
    for (const searchUrl of searchQueries) {
      if (foundModelIds.length > 0) break;

      try {
        console.log(`[Zap] Trying: ${searchUrl}`);
        const response = await fetch(searchUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept-Language': 'he-IL,he;q=0.9',
          },
        });

        if (!response.ok) continue;

        const html = await response.text();
        const modelIds = extractModelIds(html);
        
        if (modelIds.length > 0) {
          console.log(`[Zap] Found ${modelIds.length} models`);
          foundModelIds = modelIds.slice(0, 3); // Take first 3
        }
      } catch {
        continue;
      }
    }

    if (foundModelIds.length === 0) {
      console.log('[Zap] No models found');
      return { success: true, providers: [] };
    }

    // Check each model to find the best match
    let bestMatch: {
      productData: ZapProductJsonLd;
      modelUrl: string;
    } | null = null;

    for (const modelId of foundModelIds.slice(0, 5)) { // Check up to 5 models
      const modelUrl = `https://www.zap.co.il/model.aspx?modelid=${modelId}`;
      
      try {
        const modelResponse = await fetch(modelUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept-Language': 'he-IL,he;q=0.9',
          },
        });

        if (!modelResponse.ok) continue;

        const modelHtml = await modelResponse.text();
        const productData = extractProductJsonLd(modelHtml);

        if (!productData?.offers || !productData.name) continue;

        const foundName = productData.name.replace(/[\u200F\u200E&rlm;]/g, '');
        
        // Validate product match using cleaned name for better matching
        if (isProductMatch(foundName, cleanedName) || isProductMatch(foundName, params.productName)) {
          bestMatch = { productData, modelUrl };
          console.log(`[Zap] Found matching product: ${foundName}`);
          break;
        }
      } catch {
        continue;
      }
    }

    if (!bestMatch) {
      console.log('[Zap] No matching product found');
      return { success: true, providers: [] };
    }

    const { productData, modelUrl } = bestMatch;
    const offers = productData.offers!;
    console.log(`[Zap] Price range: ₪${offers.lowPrice} - ₪${offers.highPrice} (${offers.offerCount} stores)`);

    // Extract individual store offers if available
    if (offers.offers && Array.isArray(offers.offers)) {
      for (const offer of offers.offers) {
        if (offer.price && offer.seller?.name) {
          const price = parseFloat(offer.price);
          if (price > 0) {
            providers.push({
              providerName: offer.seller.name,
              providerUrl: bestMatch.modelUrl,
              price,
              currency: 'ILS',
              lastUpdated: new Date().toISOString(),
              source: 'zap',
            });
          }
        }
      }
    }

    // If no individual offers, use aggregate data
    if (providers.length === 0 && offers.lowPrice) {
      const lowPrice = parseFloat(offers.lowPrice);
      if (lowPrice > 0) {
        providers.push({
          providerName: `Zap.co.il (${offers.offerCount || '?'} חנויות)`,
          providerUrl: bestMatch.modelUrl,
          price: lowPrice,
          currency: 'ILS',
          lastUpdated: new Date().toISOString(),
          source: 'zap',
        });
      }
    }

    console.log(`[Zap] Returning ${providers.length} providers`);
    return {
      success: true,
      providers,
    };
  } catch (error) {
    console.error('[Zap] Error:', error);
    return {
      success: false,
      providers: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
