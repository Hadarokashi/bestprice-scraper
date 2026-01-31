const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Israeli music/audio store configurations
const SCRAPER_CONFIGS = [
  { id: '1', name: 'Zap.co.il', baseUrl: 'https://www.zap.co.il', searchPattern: '/search.aspx?keyword={query}', enabled: true },
  { id: '2', name: 'Bconnect', baseUrl: 'https://bconnect.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '3', name: 'Diez', baseUrl: 'https://diez.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '4', name: 'Sound Check', baseUrl: 'https://sound-check.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '5', name: 'הד סאונד', baseUrl: 'https://www.head-sound.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '6', name: 'עולם המוסיקה', baseUrl: 'https://www.musicworld.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '7', name: 'לבמה', baseUrl: 'https://www.labama.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '8', name: 'Ginges', baseUrl: 'https://www.ginges.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '9', name: 'FunkyDJ', baseUrl: 'https://www.funkydj.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '10', name: 'KSP', baseUrl: 'https://www.ksp.co.il', searchPattern: '/?select=.2.100..&txt_search={query}', enabled: true },
  { id: '11', name: 'Bug', baseUrl: 'https://www.bug.co.il', searchPattern: '/search?q={query}', enabled: true },
  { id: '12', name: 'Ivory', baseUrl: 'https://www.ivory.co.il', searchPattern: '/search?q={query}', enabled: true },
  { id: '13', name: 'Pro-Shop', baseUrl: 'https://www.proshop.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '14', name: 'Music Station', baseUrl: 'https://www.musicstation.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '15', name: 'Next-Pro', baseUrl: 'https://next-pro.co.il', searchPattern: '/?s={query}', enabled: true },
];

// Build search URL
function buildSearchUrl(config, query) {
  const encodedQuery = encodeURIComponent(query);
  if (config.searchPattern) {
    return config.baseUrl + config.searchPattern.replace('{query}', encodedQuery);
  }
  return config.baseUrl + `/?s=${encodedQuery}`;
}

// Check if product name matches search query
function isProductMatch(foundName, searchQuery) {
  const normalize = (s) => s.toLowerCase().replace(/[^\w\s\u0590-\u05FF]/g, '').replace(/\s+/g, ' ').trim();
  
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
    if (!hasModel) return false;
  }
  
  const searchWords = search.split(' ').filter(w => w.length > 2);
  const foundWords = found.split(' ');
  const matchedWords = searchWords.filter(word => 
    foundWords.some(fw => fw.includes(word) || word.includes(fw))
  );
  
  return matchedWords.length >= Math.ceil(searchWords.length * 0.5);
}

// Validate price
function isPriceValid(price, recommendedPrice) {
  if (price < 50 || price > 50000) return false;
  if (recommendedPrice && recommendedPrice > 0) {
    const minPrice = recommendedPrice * 0.5;
    const maxPrice = recommendedPrice * 1.5;
    return price >= minPrice && price <= maxPrice;
  }
  return true;
}

// Extract prices from page
async function extractPrices(page, config) {
  const products = [];
  
  try {
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    
    // Try JSON-LD first
    const jsonLdProducts = await page.evaluate(() => {
      const results = [];
      document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
        try {
          const data = JSON.parse(script.textContent || '');
          if (data['@type'] === 'Product' && data.name && data.offers) {
            const offer = Array.isArray(data.offers) ? data.offers[0] : data.offers;
            const price = parseFloat(offer.price || offer.lowPrice);
            if (price > 0) results.push({ name: data.name, price, url: offer.url || data.url || '' });
          }
          if (data['@type'] === 'ItemList' && Array.isArray(data.itemListElement)) {
            data.itemListElement.forEach(item => {
              if (item.item?.['@type'] === 'Product') {
                const product = item.item;
                const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
                const price = parseFloat(offer?.price || offer?.lowPrice || 0);
                if (price > 0) results.push({ name: product.name, price, url: product.url || '' });
              }
            });
          }
        } catch {}
      });
      return results;
    });
    
    if (jsonLdProducts.length > 0) {
      products.push(...jsonLdProducts);
      return products;
    }
    
    // Try WooCommerce structure
    const wooProducts = await page.evaluate(() => {
      const results = [];
      document.querySelectorAll('.product, .products li, .product-item, [data-product-id]').forEach(card => {
        const nameEl = card.querySelector('.woocommerce-loop-product__title, .product-title, .product-name, h2, h3');
        const priceEl = card.querySelector('.price .woocommerce-Price-amount, .price ins .amount, .price .amount, .product-price');
        const linkEl = card.querySelector('a[href*="product"], a.woocommerce-LoopProduct-link');
        
        if (nameEl && priceEl) {
          const name = nameEl.textContent?.trim() || '';
          const priceText = priceEl.textContent?.replace(/[^\d.,]/g, '').replace(',', '.') || '';
          const price = parseFloat(priceText);
          const url = linkEl?.getAttribute('href') || '';
          if (name && price > 50) results.push({ name, price, url });
        }
      });
      return results;
    });
    
    if (wooProducts.length > 0) {
      products.push(...wooProducts);
      return products;
    }
    
    // Generic extraction
    const genericProducts = await page.evaluate(() => {
      const results = [];
      const priceRegex = /(?:₪|ILS)\s*(\d{1,5}(?:[,\.]\d{1,2})?)|(\d{1,5}(?:[,\.]\d{1,2})?)\s*(?:₪|ILS)/;
      
      document.querySelectorAll('li, article, .product, .item, [class*="product"]').forEach(el => {
        const text = el.textContent?.trim() || '';
        const match = text.match(priceRegex);
        if (match) {
          const nameEl = el.querySelector('h1, h2, h3, h4, .title, .name, [class*="title"], [class*="name"]');
          const linkEl = el.querySelector('a');
          if (nameEl) {
            const name = nameEl.textContent?.trim() || '';
            const priceStr = (match[1] || match[2]).replace(',', '.');
            const price = parseFloat(priceStr);
            const url = linkEl?.getAttribute('href') || '';
            if (name && price > 50 && price < 50000) {
              if (!results.find(r => r.name === name && r.price === price)) {
                results.push({ name, price, url });
              }
            }
          }
        }
      });
      return results;
    });
    
    products.push(...genericProducts);
  } catch (error) {
    console.error(`Extraction error for ${config.name}:`, error.message);
  }
  
  return products;
}

// Scrape single site
async function scrapeSite(browser, config, productName, recommendedPrice) {
  const providers = [];
  let context = null;
  
  try {
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'he-IL',
      viewport: { width: 1920, height: 1080 },
    });
    
    const page = await context.newPage();
    const searchUrl = buildSearchUrl(config, productName);
    
    console.log(`[${config.name}] Navigating to ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);
    
    // Debug: Log page title and URL to verify page loaded
    const pageTitle = await page.title();
    const pageUrl = page.url();
    console.log(`[${config.name}] Page loaded - Title: "${pageTitle}", URL: ${pageUrl}`);
    
    const products = await extractPrices(page, config);
    console.log(`[${config.name}] Extracted ${products.length} products from page`);
    
    // Debug: Log first few products found
    if (products.length > 0) {
      console.log(`[${config.name}] Sample products:`, products.slice(0, 3).map(p => `${p.name}: ₪${p.price}`));
    }
    
    for (const product of products) {
      const matchResult = isProductMatch(product.name, productName);
      const priceValid = isPriceValid(product.price, recommendedPrice);
      console.log(`[${config.name}] Checking "${product.name}" (₪${product.price}): match=${matchResult}, priceValid=${priceValid}`);
      
      if (matchResult && priceValid) {
        const num = providers.length + 1;
        providers.push({
          providerName: num > 1 ? `${config.name} (${num})` : config.name,
          providerUrl: product.url || searchUrl,
          price: product.price,
          currency: 'ILS',
          lastUpdated: new Date().toISOString(),
        });
        console.log(`[${config.name}] Found: ${product.name} - ₪${product.price}`);
      }
    }
    
    if (providers.length === 0) {
      console.log(`[${config.name}] No matches`);
    }
  } catch (error) {
    console.error(`[${config.name}] Error:`, error.message);
  } finally {
    if (context) await context.close();
  }
  
  return providers;
}

// Main scrape endpoint
app.post('/scrape', async (req, res) => {
  const { productName, recommendedPrice, barcode } = req.body;
  
  if (!productName) {
    return res.status(400).json({ success: false, error: 'productName is required' });
  }
  
  console.log(`\n🔍 Scraping: "${productName}" (₪${recommendedPrice || 'N/A'})`);
  
  let browser = null;
  const allProviders = [];
  const scans = [];
  
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    
    // Process sites in batches of 3
    for (let i = 0; i < SCRAPER_CONFIGS.length; i += 3) {
      const batch = SCRAPER_CONFIGS.slice(i, i + 3);
      
      const results = await Promise.all(
        batch.map(async (config) => {
          try {
            const providers = await scrapeSite(browser, config, productName, recommendedPrice);
            return { config, providers, error: null };
          } catch (error) {
            return { config, providers: [], error };
          }
        })
      );
      
      for (const { config, providers, error } of results) {
        if (error) {
          scans.push({ name: config.name, status: 'error', resultsCount: 0 });
        } else if (providers.length > 0) {
          scans.push({ name: config.name, status: 'found', resultsCount: providers.length });
          allProviders.push(...providers);
        } else {
          scans.push({ name: config.name, status: 'not_found', resultsCount: 0 });
        }
      }
    }
    
    console.log(`✅ Found ${allProviders.length} results from ${scans.filter(s => s.status === 'found').length} sites\n`);
    
    res.json({
      success: true,
      data: {
        productName,
        barcode,
        recommendedPrice,
        providers: allProviders,
        scanMetadata: {
          totalWebsites: scans.length,
          scannedWebsites: scans.length,
          websites: scans,
        },
      },
    });
  } catch (error) {
    console.error('Scrape error:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    if (browser) await browser.close();
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'bestprice-playwright-scraper' });
});

app.get('/', (req, res) => {
  res.json({ 
    service: 'BestPrice Playwright Scraper',
    status: 'running',
    endpoints: {
      'GET /health': 'Health check',
      'POST /scrape': 'Scrape prices for a product',
    },
    usage: {
      method: 'POST',
      url: '/scrape',
      body: {
        productName: 'DT 770 PRO',
        recommendedPrice: 859,
      },
    },
  });
});

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║       🎧 BestPrice Playwright Scraper - Railway Edition        ║
╠════════════════════════════════════════════════════════════════╣
║  Server running on port ${PORT}                                   ║
║  Endpoints: GET /health, POST /scrape                          ║
╚════════════════════════════════════════════════════════════════╝
  `);
});
