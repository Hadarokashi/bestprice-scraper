import { chromium, Browser, Page } from 'playwright';
import { ProviderPrice, ScraperConfig } from '../types';

interface ScrapedProduct {
  name: string;
  price: number;
  url: string;
}

const GENERIC_PRODUCT_TOKENS = new Set([
  'pro',
  'plus',
  'max',
  'mini',
  'ultra',
  'zero',
  'smart',
  'black',
  'white',
  'blue',
  'red',
  'green',
  'gray',
  'grey',
  'silver',
  'gold',
  'pink',
  'ram',
  'gb',
  '5g',
  '4g',
]);

/**
 * Build search URL from scraper config and query
 */
function buildSearchUrl(config: ScraperConfig, query: string): string {
  const encodedQuery = encodeURIComponent(query);
  
  if (config.searchPattern) {
    return config.baseUrl + config.searchPattern.replace('{query}', encodedQuery);
  }
  
  return config.baseUrl + `/?s=${encodedQuery}`;
}

/**
 * Extract prices from a page using Playwright
 */
async function extractPricesFromPage(page: Page, config: ScraperConfig): Promise<ScrapedProduct[]> {
  const products: ScrapedProduct[] = [];
  
  try {
    // Wait for page to be fully loaded
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    
    // Try multiple extraction strategies
    
    // 1. JSON-LD (most reliable)
    const jsonLdProducts = await page.evaluate(() => {
      const results: { name: string; price: number; url: string }[] = [];
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      
      scripts.forEach(script => {
        try {
          const data = JSON.parse(script.textContent || '');
          
          // Handle single product
          if (data['@type'] === 'Product' && data.name && data.offers) {
            const offer = Array.isArray(data.offers) ? data.offers[0] : data.offers;
            const price = parseFloat(offer.price || offer.lowPrice);
            if (price > 0) {
              results.push({ name: data.name, price, url: offer.url || data.url || '' });
            }
          }
          
          // Handle product list
          if (data['@type'] === 'ItemList' && Array.isArray(data.itemListElement)) {
            data.itemListElement.forEach((item: any) => {
              if (item.item?.['@type'] === 'Product') {
                const product = item.item;
                const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
                const price = parseFloat(offer?.price || offer?.lowPrice || 0);
                if (price > 0) {
                  results.push({ name: product.name, price, url: product.url || offer?.url || '' });
                }
              }
            });
          }
        } catch {}
      });
      
      return results;
    });
    
    if (jsonLdProducts.length > 0) {
      products.push(...jsonLdProducts);
      console.log(`[Playwright] ${config.name}: Found ${jsonLdProducts.length} products via JSON-LD`);
      return products;
    }
    
    // 2. WooCommerce product structure (common in Israeli sites)
    const wooProducts = await page.evaluate(() => {
      const results: { name: string; price: number; url: string }[] = [];
      
      // WooCommerce product cards
      const productCards = document.querySelectorAll('.product, .products li, .product-item, [data-product-id]');
      
      productCards.forEach(card => {
        const nameEl = card.querySelector('.woocommerce-loop-product__title, .product-title, .product-name, h2, h3');
        const priceEl = card.querySelector('.price .woocommerce-Price-amount, .price ins .amount, .price .amount, .product-price');
        const linkEl = card.querySelector('a[href*="product"], a.woocommerce-LoopProduct-link');
        
        if (nameEl && priceEl) {
          const name = nameEl.textContent?.trim() || '';
          const priceText = priceEl.textContent?.replace(/[^\d.,]/g, '').replace(',', '.') || '';
          const price = parseFloat(priceText);
          const url = linkEl?.getAttribute('href') || '';
          
          if (name && price > 50) {
            results.push({ name, price, url });
          }
        }
      });
      
      return results;
    });
    
    if (wooProducts.length > 0) {
      products.push(...wooProducts);
      console.log(`[Playwright] ${config.name}: Found ${wooProducts.length} products via WooCommerce`);
      return products;
    }
    
    // 3. Generic price extraction (look for price patterns near product names)
    const genericProducts = await page.evaluate(() => {
      const results: { name: string; price: number; url: string }[] = [];
      
      // Find all elements with prices
      const allElements = document.querySelectorAll('*');
      const priceRegex = /(?:₪|ILS)\s*(\d{1,5}(?:[,\.]\d{1,2})?)|(\d{1,5}(?:[,\.]\d{1,2})?)\s*(?:₪|ILS)/;
      
      allElements.forEach(el => {
        const text = el.textContent?.trim() || '';
        const match = text.match(priceRegex);
        
        if (match && el.closest('li, article, .product, .item, [class*="product"]')) {
          const parent = el.closest('li, article, .product, .item, [class*="product"]');
          if (!parent) return;
          
          const nameEl = parent.querySelector('h1, h2, h3, h4, .title, .name, [class*="title"], [class*="name"]');
          const linkEl = parent.querySelector('a');
          
          if (nameEl) {
            const name = nameEl.textContent?.trim() || '';
            const priceStr = (match[1] || match[2]).replace(',', '.');
            const price = parseFloat(priceStr);
            const url = linkEl?.getAttribute('href') || '';
            
            if (name && price > 50 && price < 50000) {
              // Avoid duplicates
              if (!results.find(r => r.name === name && r.price === price)) {
                results.push({ name, price, url });
              }
            }
          }
        }
      });
      
      return results;
    });
    
    if (genericProducts.length > 0) {
      products.push(...genericProducts);
      console.log(`[Playwright] ${config.name}: Found ${genericProducts.length} products via generic extraction`);
    }
    
  } catch (error) {
    console.error(`[Playwright] ${config.name}: Extraction error -`, error);
  }
  
  return products;
}

/**
 * Check if product name matches the search query
 */
function isProductMatch(foundName: string, searchQuery: string): boolean {
  const normalize = (s: string) => s
    .toLowerCase()
    .replace(/[^\w\s\u0590-\u05FF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const getTokens = (s: string) => s
    .split(' ')
    .filter((word) => word.length > 2)
    .filter((word) => !GENERIC_PRODUCT_TOKENS.has(word));
  
  const found = normalize(foundName);
  const search = normalize(searchQuery);
  
  // Extract model numbers
  const modelPattern = /[a-z]+\s*\d+|\d+\s*[a-z]+/gi;
  const searchModels = search.match(modelPattern) || [];
  const foundModels = found.match(modelPattern) || [];
  
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
  
  // Check word overlap
  const searchWords = search.split(' ').filter(w => w.length > 2);
  const foundWords = found.split(' ');
  const meaningfulSearchWords = getTokens(search);
  
  const matchedWords = searchWords.filter(word => 
    foundWords.some(fw => fw.includes(word) || word.includes(fw))
  );

  const meaningfulMatches = meaningfulSearchWords.filter(word =>
    foundWords.some(fw => fw.includes(word) || word.includes(fw))
  );

  if (meaningfulSearchWords.length > 0) {
    const requiredMeaningfulMatches = meaningfulSearchWords.length === 1
      ? 1
      : Math.min(2, meaningfulSearchWords.length);

    if (meaningfulMatches.length < requiredMeaningfulMatches) {
      return false;
    }
  }
  
  return matchedWords.length >= Math.ceil(searchWords.length * 0.5);
}

/**
 * Validate price against recommended price
 */
function isPriceValid(price: number, recommendedPrice?: number): boolean {
  if (price < 50 || price > 50000) return false;
  
  if (recommendedPrice && recommendedPrice > 0) {
    const minPrice = recommendedPrice * 0.5;
    const maxPrice = recommendedPrice * 1.5;
    return price >= minPrice && price <= maxPrice;
  }
  
  return true;
}

// Singleton browser instance
let browserInstance: Browser | null = null;

/**
 * Get or create browser instance
 */
async function getBrowser(): Promise<Browser> {
  if (!browserInstance) {
    console.log('[Playwright] Launching browser...');
    browserInstance = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
  }
  return browserInstance;
}

/**
 * Close browser instance
 */
export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
    console.log('[Playwright] Browser closed');
  }
}

/**
 * Scrape a website using Playwright (headless browser)
 */
export async function scrapeWithPlaywright(
  config: ScraperConfig,
  productName: string,
  recommendedPrice?: number
): Promise<ProviderPrice[]> {
  const providers: ProviderPrice[] = [];
  
  if (!config.enabled) {
    return providers;
  }
  
  let page: Page | null = null;
  
  try {
    const browser = await getBrowser();
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'he-IL',
      viewport: { width: 1920, height: 1080 },
    });
    
    page = await context.newPage();
    
    const searchUrl = buildSearchUrl(config, productName);
    console.log(`[Playwright] ${config.name}: Navigating to ${searchUrl}`);
    
    await page.goto(searchUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: 15000 
    });
    
    // Wait a bit for dynamic content
    await page.waitForTimeout(2000);
    
    const products = await extractPricesFromPage(page, config);
    
    // Filter and collect matching products
    for (const product of products) {
      if (isProductMatch(product.name, productName) && isPriceValid(product.price, recommendedPrice)) {
        const resultNumber = providers.length + 1;
        providers.push({
          providerName: providers.length > 0 ? `${config.name} (${resultNumber})` : config.name,
          providerUrl: product.url || searchUrl,
          price: product.price,
          currency: 'ILS',
          lastUpdated: new Date().toISOString(),
          source: 'manual' as any,
        });
        
        console.log(`[Playwright] ${config.name}: Match #${resultNumber} - ${product.name} - ₪${product.price}`);
      }
    }
    
    if (providers.length === 0) {
      console.log(`[Playwright] ${config.name}: No matches found`);
    }
    
    await context.close();
  } catch (error) {
    console.error(`[Playwright] ${config.name}: Error -`, error instanceof Error ? error.message : 'Unknown error');
  }
  
  return providers;
}

/**
 * Scrape multiple websites in parallel with Playwright
 */
export async function scrapeMultipleSites(
  configs: ScraperConfig[],
  productName: string,
  recommendedPrice?: number,
  maxConcurrent: number = 3
): Promise<{ providers: ProviderPrice[]; scans: { name: string; status: string; count: number }[] }> {
  const allProviders: ProviderPrice[] = [];
  const scans: { name: string; status: string; count: number }[] = [];
  
  console.log(`[Playwright] Starting scrape of ${configs.length} sites for "${productName}"`);
  
  // Process in batches to avoid overwhelming the browser
  for (let i = 0; i < configs.length; i += maxConcurrent) {
    const batch = configs.slice(i, i + maxConcurrent);
    
    const results = await Promise.all(
      batch.map(async (config) => {
        try {
          const providers = await scrapeWithPlaywright(config, productName, recommendedPrice);
          return { config, providers, error: null };
        } catch (error) {
          return { config, providers: [], error };
        }
      })
    );
    
    for (const { config, providers, error } of results) {
      if (error) {
        scans.push({ name: config.name, status: 'error', count: 0 });
      } else if (providers.length > 0) {
        scans.push({ name: config.name, status: 'found', count: providers.length });
        allProviders.push(...providers);
      } else {
        scans.push({ name: config.name, status: 'not_found', count: 0 });
      }
    }
  }
  
  // Close browser when done
  await closeBrowser();
  
  console.log(`[Playwright] Completed. Found ${allProviders.length} total results from ${scans.filter(s => s.status === 'found').length} sites`);
  
  return { providers: allProviders, scans };
}
