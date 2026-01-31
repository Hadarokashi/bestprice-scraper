import { ProviderPrice } from '../types';
import type { ScraperConfig } from '../types';

interface ExtractedProduct {
  name: string;
  price: number;
  url: string;
}

/**
 * Build search URL from scraper config and query
 */
function buildSearchUrl(config: ScraperConfig, query: string): string {
  const encodedQuery = encodeURIComponent(query);
  
  if (config.searchPattern) {
    // Use configured pattern
    return config.baseUrl + config.searchPattern.replace('{query}', encodedQuery);
  }
  
  // Try common patterns
  const patterns = [
    `/?s=${encodedQuery}`,
    `/?q=${encodedQuery}`,
    `/search?q=${encodedQuery}`,
    `/search?keyword=${encodedQuery}`,
    `/search.php?search=${encodedQuery}`,
  ];
  
  // Return the first pattern (/?s=) as default
  return config.baseUrl + patterns[0];
}

/**
 * Extract JSON-LD product data from HTML
 */
function extractFromJsonLd(html: string): ExtractedProduct[] {
  const products: ExtractedProduct[] = [];
  
  try {
    const scripts = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi) || [];
    
    for (const script of scripts) {
      try {
        const content = script.replace(/<script[^>]*>|<\/script>/gi, '');
        const data = JSON.parse(content);
        
        // Handle single product
        if (data['@type'] === 'Product' && data.name && data.offers) {
          const offer = Array.isArray(data.offers) ? data.offers[0] : data.offers;
          const price = parseFloat(offer.price || offer.lowPrice);
          
          if (price > 0) {
            products.push({
              name: data.name,
              price,
              url: offer.url || data.url || '',
            });
          }
        }
        
        // Handle product list
        if (data['@type'] === 'ItemList' && Array.isArray(data.itemListElement)) {
          for (const item of data.itemListElement) {
            if (item.item && item.item['@type'] === 'Product') {
              const product = item.item;
              const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
              const price = parseFloat(offer?.price || offer?.lowPrice || 0);
              
              if (price > 0) {
                products.push({
                  name: product.name,
                  price,
                  url: product.url || offer?.url || '',
                });
              }
            }
          }
        }
      } catch {
        continue;
      }
    }
  } catch {
    // Ignore JSON-LD parsing errors
  }
  
  return products;
}

/**
 * Extract prices from OpenGraph and common meta tags
 */
function extractFromMetaTags(html: string): ExtractedProduct[] {
  const products: ExtractedProduct[] = [];
  
  try {
    // Extract og:title
    const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
    const title = titleMatch ? titleMatch[1] : '';
    
    // Extract og:url
    const urlMatch = html.match(/<meta\s+property="og:url"\s+content="([^"]+)"/i);
    const url = urlMatch ? urlMatch[1] : '';
    
    // Extract price from various meta tags
    const pricePatterns = [
      /<meta\s+property="product:price:amount"\s+content="([^"]+)"/i,
      /<meta\s+itemprop="price"\s+content="([^"]+)"/i,
      /<meta\s+name="price"\s+content="([^"]+)"/i,
    ];
    
    for (const pattern of pricePatterns) {
      const match = html.match(pattern);
      if (match) {
        const price = parseFloat(match[1].replace(/[^\d.]/g, ''));
        if (price > 0 && title) {
          products.push({ name: title, price, url });
          break;
        }
      }
    }
  } catch {
    // Ignore meta tag parsing errors
  }
  
  return products;
}

/**
 * Extract prices using common CSS selectors and patterns
 */
function extractFromCommonSelectors(html: string, baseUrl: string): ExtractedProduct[] {
  const products: ExtractedProduct[] = [];
  
  try {
    // Common price patterns in Israeli websites
    const priceRegex = /(?:₪|ILS|שקל)\s*(\d{1,5}(?:[,\.]\d{1,2})?)|(\d{1,5}(?:[,\.]\d{1,2})?)\s*(?:₪|ILS|שקל)/gi;
    const matches = html.match(priceRegex);
    
    if (matches && matches.length > 0) {
      // Extract first valid price (usually the product price)
      for (const match of matches) {
        const priceStr = match.replace(/[^\d.,]/g, '').replace(',', '.');
        const price = parseFloat(priceStr);
        
        if (price > 50 && price < 50000) { // Reasonable price range for audio equipment
          // Try to find product name nearby
          const nameMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i) ||
                          html.match(/<title>([^<]+)<\/title>/i);
          const name = nameMatch ? nameMatch[1].trim() : 'Product';
          
          products.push({
            name,
            price,
            url: baseUrl,
          });
          break; // Take first reasonable price
        }
      }
    }
  } catch {
    // Ignore selector parsing errors
  }
  
  return products;
}

/**
 * Check if product name matches the search query (strict matching)
 */
function isStrictMatch(foundName: string, searchQuery: string): boolean {
  const normalize = (s: string) => s
    .toLowerCase()
    .replace(/[^\w\s\u0590-\u05FF]/g, '') // Keep letters, numbers, spaces, Hebrew
    .replace(/\s+/g, ' ')
    .trim();
  
  const found = normalize(foundName);
  const search = normalize(searchQuery);
  
  // Extract model numbers (e.g., "DT770", "DJ300", "TG V70")
  const modelPattern = /[a-z]+\s*\d+|\d+\s*[a-z]+/gi;
  const searchModels = search.match(modelPattern) || [];
  const foundModels = found.match(modelPattern) || [];
  
  // If search has model number, it must appear in found product
  if (searchModels.length > 0 && searchModels[0]) {
    const searchModel = searchModels[0].replace(/\s/g, '').toLowerCase();
    const hasModel = foundModels.some(m => 
      m.replace(/\s/g, '').toLowerCase().includes(searchModel) ||
      searchModel.includes(m.replace(/\s/g, '').toLowerCase())
    );
    
    if (!hasModel) {
      return false;
    }
  }
  
  // Check if most words match
  const searchWords = search.split(' ').filter(w => w.length > 2);
  const foundWords = found.split(' ');
  
  const matchedWords = searchWords.filter(word => 
    foundWords.some(fw => fw.includes(word) || word.includes(fw))
  );
  
  // At least 60% of words must match
  return matchedWords.length >= Math.ceil(searchWords.length * 0.6);
}

/**
 * Validate if a price is reasonable for the product
 */
function isPriceReasonable(price: number, recommendedPrice?: number): boolean {
  // Basic sanity check
  if (price < 50 || price > 50000) {
    return false;
  }
  
  // If we have a recommended price, validate against it
  if (recommendedPrice && recommendedPrice > 0) {
    // Much stricter range for audio equipment: 60%-130% of recommended
    const minPrice = recommendedPrice * 0.6;  // 60% minimum
    const maxPrice = recommendedPrice * 1.3;  // 130% maximum
    
    if (price < minPrice || price > maxPrice) {
      console.log(`[Price Validation] Rejected ₪${price} for recommended ₪${recommendedPrice} (expected range: ₪${minPrice.toFixed(0)}-₪${maxPrice.toFixed(0)})`);
      return false;
    }
  }
  
  return true;
}

/**
 * Scrape a single website using HTTP and generic extraction
 */
export async function scrapeGeneric(
  config: ScraperConfig,
  productName: string,
  recommendedPrice?: number
): Promise<ProviderPrice[]> {
  const providers: ProviderPrice[] = [];
  
  if (!config.enabled) {
    return providers;
  }
  
  try {
    const searchUrl = buildSearchUrl(config, productName);
    console.log(`[Generic Scraper] ${config.name}: ${searchUrl}`);
    
    // Fetch with browser-like headers
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });
    
    if (!response.ok) {
      console.log(`[Generic Scraper] ${config.name}: HTTP ${response.status}`);
      return providers;
    }
    
    const html = await response.text();
    
    // Try extraction methods in order of reliability
    let extractedProducts: ExtractedProduct[] = [];
    
    extractedProducts = extractFromJsonLd(html);
    if (extractedProducts.length === 0) {
      extractedProducts = extractFromMetaTags(html);
    }
    if (extractedProducts.length === 0) {
      extractedProducts = extractFromCommonSelectors(html, searchUrl);
    }
    
    // Filter for strict matches only - collect ALL matching products with valid prices
    for (const product of extractedProducts) {
      if (isStrictMatch(product.name, productName) && isPriceReasonable(product.price, recommendedPrice)) {
        const resultNumber = providers.length + 1;
        providers.push({
          providerName: providers.length > 0 ? `${config.name} (${resultNumber})` : config.name,
          providerUrl: product.url || searchUrl,
          price: product.price,
          currency: 'ILS',
          lastUpdated: new Date().toISOString(),
          source: 'manual' as any, // We'll update the type system later
        });
        
        console.log(`[Generic Scraper] ${config.name}: Match #${resultNumber} - ${product.name} - ₪${product.price}`);
        // Continue checking all products - no break
      }
    }
    
    if (providers.length === 0) {
      console.log(`[Generic Scraper] ${config.name}: No matches found`);
    }
  } catch (error) {
    console.error(`[Generic Scraper] ${config.name}: Error -`, error instanceof Error ? error.message : 'Unknown error');
  }
  
  return providers;
}
