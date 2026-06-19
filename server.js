const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');

const app = express();
const PORT = process.env.PORT || 3001;
const SCRAPER_API_SECRET =
  process.env.SCRAPER_API_SECRET ||
  process.env.PLAYWRIGHT_SCRAPER_SECRET ||
  process.env.CRON_SECRET ||
  '';

const allowedOrigins = (
  process.env.ALLOWED_ORIGINS ||
  'https://price-tracker-five-beryl.vercel.app,http://localhost:3000'
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-scraper-secret', 'x-cron-secret'],
  })
);
app.use(express.json());

// In-memory job storage
const jobs = new Map();
const cronRuns = new Map();
let activeCronRunId = null;

const DEFAULT_APP_BASE_URL = 'https://price-tracker-five-beryl.vercel.app';
const DEFAULT_CRON_BATCH_SIZE = Number(process.env.CRON_BATCH_SIZE || 2);
const DEFAULT_CRON_BATCH_DELAY_MS = Number(process.env.CRON_BATCH_DELAY_MS || 2000);
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 10000);
const POLL_TIMEOUT_MS = Number(process.env.POLL_TIMEOUT_MS || 1200000);

function generateCronRunId() {
  return `cron_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function buildAppHeaders(cronSecret) {
  const headers = { 'Content-Type': 'application/json' };
  const sharedSecret = SCRAPER_API_SECRET || cronSecret;
  if (sharedSecret) {
    headers.Authorization = `Bearer ${sharedSecret}`;
    headers['x-scraper-secret'] = sharedSecret;
    headers['x-cron-secret'] = sharedSecret;
  }
  return headers;
}

function isAuthorizedRequest(req) {
  if (!SCRAPER_API_SECRET) return true;

  const authHeader = req.headers.authorization;
  const bearerToken = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length).trim()
    : '';
  const scraperHeader = typeof req.headers['x-scraper-secret'] === 'string'
    ? req.headers['x-scraper-secret']
    : '';
  const cronHeader = typeof req.headers['x-cron-secret'] === 'string'
    ? req.headers['x-cron-secret']
    : '';

  return [bearerToken, scraperHeader, cronHeader].some((token) => token === SCRAPER_API_SECRET);
}

function requireApiSecret(req, res, next) {
  if (!isAuthorizedRequest(req)) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  return next();
}

// Israeli store configurations - 63 WEBSITES (Zap first!)
const SCRAPER_CONFIGS = [
  // ZAP FIRST - Price comparison aggregator (finds many stores at once)
  { id: '0', name: 'Zap.co.il', baseUrl: 'https://www.zap.co.il', searchPattern: '/search.aspx?keyword={query}', enabled: true, priority: true },
  // Music & Audio Stores
  { id: '1', name: 'Bconnect', baseUrl: 'https://bconnect.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '2', name: 'Diez', baseUrl: 'https://diez.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '3', name: 'Next-Pro', baseUrl: 'https://www.next-pro.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '4', name: 'הד סאונד', baseUrl: 'https://headsound.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '5', name: 'טרטל', baseUrl: 'https://www.turtle.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '6', name: 'עולם המוסיקה', baseUrl: 'https://www.musicworld.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '7', name: 'מג\'יקל נוטס', baseUrl: 'https://www.magical-notes.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '8', name: 'אודיולאב', baseUrl: 'https://audiolab.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '9', name: 'לבמה', baseUrl: 'https://la-bama.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '10', name: 'מיוזיק סנטר', baseUrl: 'https://www.music-center.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '11', name: 'אסקול', baseUrl: 'https://www.askol.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '12', name: 'Speed of Sound', baseUrl: 'https://www.speedofsound.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '13', name: 'Ginges', baseUrl: 'https://www.ginges.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '14', name: 'Signal', baseUrl: 'https://www.signal-audio.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '15', name: 'Orior', baseUrl: 'https://www.orior.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '16', name: 'Kilombo', baseUrl: 'https://kilombo.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '17', name: 'FunkyDJ', baseUrl: 'https://www.funkydj.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '18', name: 'שלמון', baseUrl: 'https://shalmonmusic.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '19', name: 'קול המוסיקה', baseUrl: 'https://kolhamusica.com', searchPattern: '/?s={query}', enabled: true },
  { id: '20', name: 'חלילית', baseUrl: 'https://www.halilit.com', searchPattern: '/?s={query}', enabled: true },
  { id: '21', name: 'מצלול', baseUrl: 'https://mitzlol.com', searchPattern: '/?s={query}', enabled: true },
  { id: '22', name: 'פעימות', baseUrl: 'https://peimot.com', searchPattern: '/?s={query}', enabled: true },
  { id: '23', name: 'אפקט', baseUrl: 'https://www.effect.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '24', name: 'שכטר', baseUrl: 'https://shechtermusic.com', searchPattern: '/?s={query}', enabled: true },
  { id: '25', name: 'סאונד צ\'ק', baseUrl: 'https://www.sound-check.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '26', name: 'דראם בית', baseUrl: 'https://www.drumbite.co.il', searchPattern: '/?s={query}', enabled: true },
  // Electronics & General Stores
  { id: '27', name: 'KSP', baseUrl: 'https://ksp.co.il', searchPattern: '/?select=.2.100..&txt_search={query}', enabled: true },
  { id: '28', name: 'Bug', baseUrl: 'https://www.bug.co.il', searchPattern: '/search?q={query}', enabled: true },
  { id: '29', name: 'Ivory', baseUrl: 'https://www.ivory.co.il', searchPattern: '/search?q={query}', enabled: true },
  { id: '30', name: 'Gamestorm', baseUrl: 'https://www.gamestorm.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '31', name: 'Flymac', baseUrl: 'https://flymac.website', searchPattern: '/?s={query}', enabled: true },
  { id: '32', name: 'אילת דיפו', baseUrl: 'https://www.eilatdepot.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '33', name: 'לידר קומפיוטרס', baseUrl: 'https://www.leadercomputers.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '34', name: 'WALLASHOPS', baseUrl: 'https://www.wallashops.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '35', name: 'מחסני חשמל', baseUrl: 'https://www.payngo.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '36', name: 'מחסני חשמל אילת', baseUrl: 'https://eilat.payngo.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '37', name: 'OLSALE', baseUrl: 'https://www.olsale.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '38', name: 'LASTPRICE', baseUrl: 'https://www.lastprice.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '39', name: 'KRAVITZ', baseUrl: 'https://www.kravitz.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '40', name: 'HITECHZONE', baseUrl: 'https://www.htzone.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '41', name: 'בזק סטור', baseUrl: 'https://bstore.bezeq.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '42', name: 'ALM', baseUrl: 'https://www.alm.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '43', name: 'ביג אלקטריק', baseUrl: 'https://bigelectric.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '44', name: 'בסט מובייל', baseUrl: 'https://www.bestmobile.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '45', name: 'חשמל נטו', baseUrl: 'https://www.netoneto.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '46', name: 'SHEKEM', baseUrl: 'https://www.shekem-electric.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '47', name: 'שקם דיוטי פרי', baseUrl: 'https://shekem-df.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '48', name: 'SUPERPHARM', baseUrl: 'https://shop.super-pharm.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '49', name: 'ברנרד', baseUrl: 'https://www.bernard.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '50', name: 'סנסנטר', baseUrl: 'https://www.sancenter.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '51', name: 'i-Cell', baseUrl: 'https://www.i-cell.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '52', name: 'Greenmobile', baseUrl: 'https://greenmobile.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '53', name: 'גאדג\'ט סלולר', baseUrl: 'https://www.gadget-cellular.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '54', name: 'רדיו אלקטריק', baseUrl: 'https://www.rde.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '55', name: 'ריקוטק', baseUrl: 'https://rikotek.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '56', name: 'ZAPSTORE', baseUrl: 'https://shop.zap.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '57', name: 'אורסייל', baseUrl: 'https://orsale.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '58', name: 'גאדג\'ט מובייל', baseUrl: 'https://gadget-mobile.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '59', name: 'נירטק', baseUrl: 'https://www.nirtech.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '60', name: 'X-Press', baseUrl: 'https://www.x-press.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '61', name: 'אייס', baseUrl: 'https://www.ace.co.il', searchPattern: '/?s={query}', enabled: true },
  { id: '62', name: 'King Games', baseUrl: 'https://www.king-games.co.il', searchPattern: '/?s={query}', enabled: true },
];

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
  const getTokens = (s) => s
    .split(' ')
    .filter((word) => word.length > 2)
    .filter((word) => !GENERIC_PRODUCT_TOKENS.has(word));
  
  const found = normalize(foundName);
  const search = normalize(searchQuery);
  
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
    if (meaningfulMatches.length < requiredMeaningfulMatches) return false;
  }
  
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
  const baseUrl = config.baseUrl;
  
  // Helper to make URLs absolute
  const makeAbsolute = (url) => {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    if (url.startsWith('//')) return 'https:' + url;
    if (url.startsWith('/')) return baseUrl + url;
    return baseUrl + '/' + url;
  };
  
  try {
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    
    // Special handling for Zap.co.il - price comparison site
    if (config.name === 'Zap.co.il') {
      console.log('[Zap] Using special Zap extraction...');
      
      // Wait for search results to load
      await page.waitForTimeout(2000);
      
      // Step 1: Find model links from search results
      const modelLinks = await page.evaluate(() => {
        const links = [];
        document.querySelectorAll('a[href*="model.aspx?modelid="]').forEach(a => {
          const href = a.getAttribute('href');
          if (href && !links.includes(href)) {
            links.push(href.startsWith('http') ? href : 'https://www.zap.co.il' + href);
          }
        });
        return links.slice(0, 3); // Check first 3 models
      });
      
      console.log(`[Zap] Found ${modelLinks.length} model pages to check`);
      
      // Step 2: Visit each model page and extract ALL stores
      for (const modelUrl of modelLinks) {
        try {
          console.log(`[Zap] Checking model: ${modelUrl}`);
          await page.goto(modelUrl, { timeout: 15000 });
          await page.waitForTimeout(3000); // Wait for stores list to load
          
          // Extract all store prices from the model page
          const storeProducts = await page.evaluate((productName) => {
            const stores = [];
            
            // Zap stores list - each store row has price and store name
            // Common selectors for Zap store rows
            const storeRows = document.querySelectorAll(
              '.PriceListItem, .StoreRow, [class*="store-row"], [class*="price-row"], ' +
              '.PriceDetails, [class*="PriceListItemBody"], tr[class*="store"], .compare-row'
            );
            
            storeRows.forEach(row => {
              // Try to find store name
              const storeNameEl = row.querySelector(
                '.StoreName, .store-name, [class*="store-name"], [class*="StoreName"], ' +
                '.PriceListShopName, a[class*="shop"], .shop-name'
              );
              // Try to find price
              const priceEl = row.querySelector(
                '.PriceValue, .price, [class*="price"]:not([class*="old"]), ' +
                '.PriceListPrice, [class*="Price"]:not([class*="Old"])'
              );
              // Try to find link to store
              const linkEl = row.querySelector('a[href*="redirect"], a[href*="pid="], a[target="_blank"]');
              
              if (storeNameEl && priceEl) {
                const storeName = storeNameEl.textContent?.trim() || '';
                const priceText = priceEl.textContent?.replace(/[^\d.,]/g, '').replace(',', '') || '';
                const price = parseFloat(priceText);
                const url = linkEl?.getAttribute('href') || window.location.href;
                
                if (storeName && price > 50 && price < 100000) {
                  stores.push({
                    name: productName || 'Unknown',
                    price,
                    url,
                    seller: storeName,
                  });
                }
              }
            });
            
            // Also try alternative structure - price boxes
            if (stores.length === 0) {
              document.querySelectorAll('[class*="priceBox"], [class*="StorePrice"], .store-item').forEach(box => {
                const allText = box.textContent || '';
                const priceMatch = allText.match(/(\d{2,6})/);
                const price = priceMatch ? parseFloat(priceMatch[1]) : 0;
                
                if (price > 50 && price < 100000) {
                  stores.push({
                    name: productName || 'Unknown',
                    price,
                    url: window.location.href,
                    seller: 'Zap Store',
                  });
                }
              });
            }
            
            // Fallback: get price from meta description
            if (stores.length === 0) {
              const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
              const priceMatch = metaDesc.match(/מ\s*[-–]\s*(\d{2,6})/);
              if (priceMatch) {
                const title = document.title?.replace(/ - זאפ.*$/, '').trim() || productName;
                stores.push({
                  name: title,
                  price: parseFloat(priceMatch[1]),
                  url: window.location.href,
                  seller: 'Zap (lowest)',
                });
              }
            }
            
            return stores;
          }, productName);
          
          console.log(`[Zap] Found ${storeProducts.length} stores on model page`);
          
          for (const p of storeProducts) {
            products.push({ ...p, url: makeAbsolute(p.url) });
          }
          
          // If we found stores, we're done
          if (products.length > 0) {
            return products;
          }
        } catch (err) {
          console.log(`[Zap] Error on model page: ${err.message}`);
        }
      }
      
      // Fallback: try to extract from search results if no model pages worked
      if (products.length === 0) {
        console.log('[Zap] Falling back to search results extraction');
        const searchProducts = await page.evaluate(() => {
          const results = [];
          document.querySelectorAll('[class*="product"], [class*="result"]').forEach(card => {
            const nameEl = card.querySelector('[class*="title"], h2, h3');
            const priceEl = card.querySelector('[class*="price"]');
            if (nameEl && priceEl) {
              const name = nameEl.textContent?.trim() || '';
              const priceText = priceEl.textContent?.replace(/[^\d.,]/g, '').replace(',', '') || '';
              const price = parseFloat(priceText);
              if (name && price > 50 && price < 100000) {
                results.push({ name, price, url: window.location.href });
              }
            }
          });
          return results;
        });
        
        for (const p of searchProducts) {
          products.push({ ...p, url: makeAbsolute(p.url) });
        }
      }
      
      return products;
    }
    
    // Try JSON-LD first
    const jsonLdProducts = await page.evaluate(() => {
      const results = [];
      document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
        try {
          const data = JSON.parse(script.textContent || '');
          if (data['@type'] === 'Product' && data.name && data.offers) {
            const offer = Array.isArray(data.offers) ? data.offers[0] : data.offers;
            const price = parseFloat(offer.price || offer.lowPrice);
            if (price > 0) results.push({ name: data.name, price, url: offer.url || data.url || window.location.href });
          }
        } catch {}
      });
      return results;
    });
    
    if (jsonLdProducts.length > 0) {
      products.push(...jsonLdProducts.map(p => ({ ...p, url: makeAbsolute(p.url) })));
      return products;
    }
    
    // Try WooCommerce structure
    const wooProducts = await page.evaluate(() => {
      const results = [];
      document.querySelectorAll('.product, .products li, .product-item, [data-product-id]').forEach(card => {
        const nameEl = card.querySelector('.woocommerce-loop-product__title, .product-title, .product-name, h2, h3');
        const priceEl = card.querySelector('.price .woocommerce-Price-amount, .price ins .amount, .price .amount, .product-price');
        // Try multiple link selectors
        const linkEl = card.querySelector('a[href*="product"]') || 
                       card.querySelector('a.woocommerce-LoopProduct-link') ||
                       card.querySelector('a[href]:not([href="#"])') ||
                       card.closest('a[href]');
        
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
      products.push(...wooProducts.map(p => ({ ...p, url: makeAbsolute(p.url) })));
      return products;
    }
    
    // Generic extraction - improved link detection
    const genericProducts = await page.evaluate(() => {
      const results = [];
      const priceRegex = /(?:₪|ILS)\s*(\d{1,5}(?:[,\.]\d{1,2})?)|(\d{1,5}(?:[,\.]\d{1,2})?)\s*(?:₪|ILS)/;
      
      document.querySelectorAll('li, article, .product, .item, [class*="product"]').forEach(el => {
        const text = el.textContent?.trim() || '';
        const match = text.match(priceRegex);
        if (match) {
          const nameEl = el.querySelector('h1, h2, h3, h4, .title, .name, [class*="title"], [class*="name"]');
          // Try multiple link selectors
          const linkEl = el.querySelector('a[href*="product"]') ||
                         el.querySelector('a[href*="item"]') ||
                         el.querySelector('a[href]:not([href="#"]):not([href="javascript"])') ||
                         el.closest('a[href]');
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
    
    products.push(...genericProducts.map(p => ({ ...p, url: makeAbsolute(p.url) })));
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
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      locale: 'he-IL',
      viewport: { width: 1280, height: 720 },
    });
    
    const page = await context.newPage();
    const searchUrl = buildSearchUrl(config, productName);
    
    console.log(`[${config.name}] Navigating...`);
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForTimeout(1500);
    
    const products = await extractPrices(page, config);
    console.log(`[${config.name}] Found ${products.length} products`);
    
    for (const product of products) {
      if (isProductMatch(product.name, productName) && isPriceValid(product.price, recommendedPrice)) {
        const num = providers.length + 1;
        const productUrl = product.url || searchUrl;
        providers.push({
          providerName: num > 1 ? `${config.name} (${num})` : config.name,
          providerUrl: productUrl,
          price: product.price,
          currency: 'ILS',
          lastUpdated: new Date().toISOString(),
        });
        console.log(`[${config.name}] Match: ${product.name} - ₪${product.price} - URL: ${productUrl}`);
      }
    }
  } catch (error) {
    console.error(`[${config.name}] Error:`, error.message);
  } finally {
    if (context) await context.close();
  }
  
  return providers;
}

// Number of sites to scrape in parallel (1-2 for 2GB RAM to avoid memory issues)
const PARALLEL_SITES = 1; // Sequential to minimize memory usage

// Background scraping function
async function runScrapeJob(jobId, productName, recommendedPrice, barcode, excludeSites = [], includeSites = []) {
  const job = jobs.get(jobId);
  if (!job) return;
  
  let sitesToScan = SCRAPER_CONFIGS;
  if (Array.isArray(includeSites) && includeSites.length > 0) {
    sitesToScan = sitesToScan.filter((config) => includeSites.includes(config.name));
  }
  if (excludeSites.length > 0) {
    sitesToScan = sitesToScan.filter((config) => !excludeSites.includes(config.name));
  }
  
  // Update job with correct total
  job.totalSites = sitesToScan.length;
  
  let browser = null;
  
  try {
    console.log(`\n🔍 [Job ${jobId}] Starting scrape for "${productName}"`);
    console.log(`   Scanning ${sitesToScan.length} sites (excluded ${excludeSites.length} sites found on Zap)`);
    if (excludeSites.length > 0) {
      console.log(`   Excluded: ${excludeSites.slice(0, 5).join(', ')}${excludeSites.length > 5 ? '...' : ''}`);
    }
    
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    
    // Process sites in batches of PARALLEL_SITES
    for (let i = 0; i < sitesToScan.length; i += PARALLEL_SITES) {
      if (job.status === 'cancelled') break;
      
      const batch = sitesToScan.slice(i, i + PARALLEL_SITES);
      console.log(`[Job ${jobId}] Processing batch ${Math.floor(i / PARALLEL_SITES) + 1}: ${batch.map(c => c.name).join(', ')}`);
      
      const batchResults = await Promise.all(
        batch.map(async (config) => {
          try {
            const providers = await scrapeSite(browser, config, productName, recommendedPrice);
            return { config, providers, error: null };
          } catch (error) {
            return { config, providers: [], error: error.message };
          }
        })
      );
      
      // Update job with batch results
      for (const { config, providers, error } of batchResults) {
        if (error) {
          job.scans.push({
            name: config.name,
            status: 'error',
            resultsCount: 0,
            error,
          });
        } else {
          job.providers.push(...providers);
          job.scans.push({
            name: config.name,
            status: providers.length > 0 ? 'found' : 'not_found',
            resultsCount: providers.length,
          });
        }
        job.completedSites++;
      }
      job.progress = Math.round((job.completedSites / sitesToScan.length) * 100);
    }
    
    job.status = 'completed';
    job.completedAt = new Date().toISOString();
    console.log(`✅ [Job ${jobId}] Completed - Found ${job.providers.length} results from ${sitesToScan.length} sites`);
    
  } catch (error) {
    console.error(`❌ [Job ${jobId}] Fatal error:`, error.message);
    job.status = 'failed';
    job.error = error.message;
  } finally {
    if (browser) await browser.close();
  }
}

async function runCronOrchestration({
  runId,
  appBaseUrl,
  cronSecret,
  batchSize = DEFAULT_CRON_BATCH_SIZE,
  batchDelayMs = DEFAULT_CRON_BATCH_DELAY_MS,
  limit = 0,
}) {
  const run = cronRuns.get(runId);
  if (!run) return;

  const headers = buildAppHeaders(cronSecret);
  const safeBaseUrl = appBaseUrl || DEFAULT_APP_BASE_URL;

  try {
    run.status = 'running';
    run.message = 'Fetching products and settings';
    run.startedAt = new Date().toISOString();

    const [productsRes, settingsRes] = await Promise.all([
      fetch(`${safeBaseUrl}/api/products`, { headers }),
      fetch(`${safeBaseUrl}/api/settings`, { headers }),
    ]);

    if (!productsRes.ok) {
      const text = await productsRes.text();
      throw new Error(`products API failed (${productsRes.status}): ${text}`);
    }

    const productsJson = await productsRes.json();
    const settingsJson = settingsRes.ok ? await settingsRes.json() : {};

    let products = productsJson?.data?.products || [];
    const scanMode = settingsJson?.data?.scanMode || 'zap_then_remaining';
    const sitePreset = settingsJson?.data?.sitePreset || 'enabled';

    if (limit > 0 && products.length > limit) {
      products = products.slice(0, limit);
    }

    run.totalProducts = products.length;
    run.scanMode = scanMode;
    run.sitePreset = sitePreset;

    if (products.length === 0) {
      run.status = 'completed';
      run.message = 'No products found';
      run.completedAt = new Date().toISOString();
      return;
    }

    const chunks = chunkArray(products, Math.max(1, batchSize));
    run.totalBatches = chunks.length;
    run.message = `Processing ${products.length} products in ${chunks.length} batches`;

    for (let batchIndex = 0; batchIndex < chunks.length; batchIndex++) {
      const batch = chunks[batchIndex];
      run.currentBatch = batchIndex + 1;
      run.message = `Batch ${batchIndex + 1}/${chunks.length}`;

      const jobIds = [];

      for (const product of batch) {
        try {
          const createRes = await fetch(`${safeBaseUrl}/api/scraping/create-job`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              productId: product.id,
              productName: product.name,
              barcode: product.barcode,
              recommendedPrice: Number(product.recommended_price ?? product.recommendedPrice ?? 0),
              scanMode,
              sitePreset,
            }),
          });

          const createJson = await createRes.json().catch(() => ({}));
          if (!createRes.ok || !createJson?.success || !createJson?.data?.id) {
            run.failedCount += 1;
            run.processedCount += 1;
            run.errors.push({
              productName: product.name,
              step: 'create-job',
              error: createJson?.error || `HTTP ${createRes.status}`,
            });
            continue;
          }

          run.queuedCount += 1;
          jobIds.push({
            jobId: createJson.data.id,
            productName: product.name,
            recommendedPrice: Number(product.recommended_price ?? product.recommendedPrice ?? 0),
          });
        } catch (error) {
          run.failedCount += 1;
          run.processedCount += 1;
          run.errors.push({
            productName: product.name,
            step: 'create-job',
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      const pendingJobs = new Map(jobIds.map((j) => [j.jobId, j]));

      const startTime = Date.now();
      while (pendingJobs.size > 0 && Date.now() - startTime < POLL_TIMEOUT_MS) {
        const pollBatch = [...pendingJobs.entries()];

        await Promise.all(
          pollBatch.map(async ([jobId, meta]) => {
            try {
              const tickRes = await fetch(`${safeBaseUrl}/api/scraping/process-batch`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ jobId }),
              });

              if (!tickRes.ok) {
                const tickText = await tickRes.text();
                console.error(`[Cron] process-batch failed for ${meta.productName}: ${tickRes.status} ${tickText}`);
                return;
              }

              const tickJson = await tickRes.json().catch(() => ({}));
              const status = tickJson?.data?.status;

              if (['completed', 'partial', 'failed'].includes(status)) {
                pendingJobs.delete(jobId);
                run.startedCount += 1;
                run.processedCount += 1;
                run.progress = Math.round((run.processedCount / run.totalProducts) * 100);
                const providers = tickJson?.data?.providers || [];
                console.log(`[Cron] ✅ ${meta.productName}: ${status} (${providers.length} providers)`);

                run.productResults.push({
                  productName: meta.productName,
                  recommendedPrice: meta.recommendedPrice || 0,
                  providers,
                  status,
                });

                if (status === 'failed') {
                  run.failedCount += 1;
                  run.errors.push({
                    productName: meta.productName,
                    step: 'scan',
                    error: tickJson?.data?.error || 'Scan failed',
                  });
                }
              }
            } catch (error) {
              console.error(`[Cron] poll error for ${meta.productName}:`, error.message);
            }
          })
        );

        if (pendingJobs.size > 0) {
          run.message = `Batch ${batchIndex + 1}/${chunks.length} — ${pendingJobs.size} scanning`;
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        }
      }

      if (pendingJobs.size > 0) {
        console.warn(`[Cron] Batch ${batchIndex + 1} timed out with ${pendingJobs.size} pending jobs`);
        for (const [, meta] of pendingJobs) {
          run.processedCount += 1;
          run.failedCount += 1;
          run.errors.push({
            productName: meta.productName,
            step: 'timeout',
            error: `Timed out after ${POLL_TIMEOUT_MS / 1000}s`,
          });
        }
        run.progress = Math.round((run.processedCount / run.totalProducts) * 100);
      }

      if (batchIndex < chunks.length - 1 && batchDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, batchDelayMs));
      }
    }

    run.status = 'completed';
    run.message = `Queued ${run.queuedCount}/${run.totalProducts}, started ${run.startedCount}, failed ${run.failedCount}`;
    run.completedAt = new Date().toISOString();

    generateAndSendReport(run).catch((err) =>
      console.error('[Report] Failed to send email report:', err.message || err)
    );
  } catch (error) {
    run.status = 'failed';
    run.message = error instanceof Error ? error.message : 'Unknown cron orchestration error';
    run.completedAt = new Date().toISOString();
    run.errors.push({
      step: 'fatal',
      error: run.message,
    });
  } finally {
    if (activeCronRunId === runId) {
      activeCronRunId = null;
    }
  }
}

// ── Daily Report: PDF generation + email ──

async function generateAndSendReport(run, { toOverride } = {}) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const REPORT_EMAIL = toOverride
    ? [toOverride]
    : (process.env.REPORT_EMAIL || '').split(',').map((e) => e.trim()).filter(Boolean);

  if (!RESEND_API_KEY || REPORT_EMAIL.length === 0) {
    console.log('[Report] Skipping — RESEND_API_KEY or REPORT_EMAIL not configured');
    return;
  }

  console.log(`[Report] Generating PDF for ${run.productResults.length} products…`);

  const html = buildReportHtml(run);

  let browser = null;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle', timeout: 30000 });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '24px', bottom: '24px', left: '24px', right: '24px' },
    });
    await browser.close();
    browser = null;

    const pdfBase64 = pdfBuffer.toString('base64');
    const today = new Date().toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' });

    const flagged = run.productResults.filter((p) => {
      if (!p.providers.length || !p.recommendedPrice) return false;
      const lowest = Math.min(...p.providers.map((pr) => pr.price));
      return lowest < p.recommendedPrice * 0.99;
    });

    const emailHtml = buildEmailHtml(run, flagged.length, today);

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'BestPrice <reports@sofie-and-eyal.com>',
        to: REPORT_EMAIL,
        subject: `דוח מחירים יומי — ${today} ${flagged.length > 0 ? `⚠️ ${flagged.length} חריגים` : '✅ תקין'}`,
        html: emailHtml,
        attachments: [
          {
            filename: `bestprice-report-${today.replace(/\./g, '-')}.pdf`,
            content: pdfBase64,
          },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Resend API ${res.status}: ${errText}`);
    }

    console.log(`[Report] Email sent to ${REPORT_EMAIL.join(', ')}`);
  } finally {
    if (browser) await browser.close();
  }
}

function buildEmailHtml(run, flaggedCount, today) {
  const scanned = run.productResults.length;
  const good = run.productResults.filter((p) => {
    if (!p.providers.length || !p.recommendedPrice) return false;
    const lowest = Math.min(...p.providers.map((pr) => pr.price));
    return lowest >= p.recommendedPrice * 0.99;
  }).length;
  const noResults = run.productResults.filter((p) => !p.providers.length).length;

  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;direction:rtl;max-width:520px;margin:0 auto;padding:24px;color:#1a1a2e">
    <div style="text-align:center;margin-bottom:24px">
      <h1 style="font-size:22px;margin:0 0 4px;color:#6c63ff">BestPrice</h1>
      <p style="margin:0;color:#888;font-size:13px">דוח סריקה יומי — ${today}</p>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px">
      <tr>
        <td style="background:#6c63ff;color:#fff;border-radius:10px;padding:16px;text-align:center;width:25%">
          <div style="font-size:24px;font-weight:700">${scanned}</div>
          <div style="font-size:11px;opacity:.85">נסרקו</div>
        </td>
        <td width="8"></td>
        <td style="background:${flaggedCount ? '#ff6b6b' : '#2ecc71'};color:#fff;border-radius:10px;padding:16px;text-align:center;width:25%">
          <div style="font-size:24px;font-weight:700">${flaggedCount}</div>
          <div style="font-size:11px;opacity:.85">חריגים</div>
        </td>
        <td width="8"></td>
        <td style="background:#2ecc71;color:#fff;border-radius:10px;padding:16px;text-align:center;width:25%">
          <div style="font-size:24px;font-weight:700">${good}</div>
          <div style="font-size:11px;opacity:.85">תקינים</div>
        </td>
        <td width="8"></td>
        <td style="background:#95a5a6;color:#fff;border-radius:10px;padding:16px;text-align:center;width:25%">
          <div style="font-size:24px;font-weight:700">${noResults}</div>
          <div style="font-size:11px;opacity:.85">ללא תוצאות</div>
        </td>
      </tr>
    </table>
    <p style="color:#555;font-size:13px;text-align:center">הדוח המפורט מצורף כ-PDF.</p>
  </div>`;
}

function buildReportHtml(run) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' });

  const products = run.productResults
    .map((p) => {
      const lowest = p.providers.length ? Math.min(...p.providers.map((pr) => pr.price)) : null;
      const lowestProvider = p.providers.length
        ? p.providers.reduce((a, b) => (a.price <= b.price ? a : b))
        : null;
      const diff = lowest && p.recommendedPrice ? ((lowest - p.recommendedPrice) / p.recommendedPrice) * 100 : null;
      const isFlagged = diff !== null && diff < -1;
      return { ...p, lowest, lowestProvider, diff, isFlagged };
    })
    .sort((a, b) => {
      if (a.isFlagged && !b.isFlagged) return -1;
      if (!a.isFlagged && b.isFlagged) return 1;
      if (a.diff === null && b.diff === null) return 0;
      if (a.diff === null) return 1;
      if (b.diff === null) return -1;
      return a.diff - b.diff;
    });

  const flagged = products.filter((p) => p.isFlagged);
  const good = products.filter((p) => p.diff !== null && !p.isFlagged);
  const noResults = products.filter((p) => p.diff === null);
  const fmtPrice = (n) => n != null ? `₪${Math.round(n).toLocaleString('he-IL')}` : '—';
  const fmtPct = (n) => n != null ? `${n > 0 ? '+' : ''}${n.toFixed(1)}%` : '';

  const productRows = products
    .map((p) => {
      const bgColor = p.isFlagged ? '#fff5f5' : p.diff !== null ? '#f0fff4' : '#fafafa';
      const diffColor = p.isFlagged ? '#e53e3e' : '#38a169';
      const statusDot = p.isFlagged ? '🔴' : p.diff !== null ? '🟢' : '⚪';
      return `
      <tr style="background:${bgColor}">
        <td style="padding:10px 12px;border-bottom:1px solid #edf2f7;font-size:12px">${statusDot}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #edf2f7;font-weight:500;font-size:13px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.productName}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #edf2f7;font-size:13px;text-align:center">${fmtPrice(p.recommendedPrice)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #edf2f7;font-size:13px;text-align:center;font-weight:600;color:${p.isFlagged ? '#e53e3e' : '#2d3748'}">${fmtPrice(p.lowest)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #edf2f7;font-size:12px;text-align:center;color:${diffColor};font-weight:600">${fmtPct(p.diff)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #edf2f7;font-size:11px;color:#718096;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.lowestProvider?.providerName || '—'}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #edf2f7;font-size:12px;text-align:center;color:#a0aec0">${p.providers.length}</td>
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Heebo', -apple-system, sans-serif; background: #f7f8fc; color: #1a1a2e; }
  .page { max-width: 800px; margin: 0 auto; padding: 32px 24px; }

  .header {
    background: linear-gradient(135deg, #6c63ff 0%, #3b82f6 50%, #06b6d4 100%);
    border-radius: 16px;
    padding: 32px;
    color: #fff;
    margin-bottom: 24px;
    position: relative;
    overflow: hidden;
  }
  .header::before {
    content: '';
    position: absolute;
    top: -50%; right: -30%;
    width: 300px; height: 300px;
    background: rgba(255,255,255,0.08);
    border-radius: 50%;
  }
  .header h1 { font-size: 28px; font-weight: 800; margin-bottom: 4px; position: relative; }
  .header .sub { font-size: 14px; opacity: 0.85; position: relative; }

  .stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin-bottom: 24px;
  }
  .stat-card {
    background: #fff;
    border-radius: 12px;
    padding: 20px 16px;
    text-align: center;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  }
  .stat-card .num { font-size: 32px; font-weight: 800; line-height: 1; }
  .stat-card .label { font-size: 12px; color: #718096; margin-top: 6px; font-weight: 500; }
  .stat-card.flagged .num { color: #e53e3e; }
  .stat-card.good .num { color: #38a169; }
  .stat-card.total .num { color: #6c63ff; }
  .stat-card.empty .num { color: #a0aec0; }

  .section-title {
    font-size: 16px;
    font-weight: 700;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 2px solid #edf2f7;
    color: #2d3748;
  }

  table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.06); margin-bottom: 24px; }
  thead th {
    background: #f7f8fc;
    padding: 12px;
    font-size: 11px;
    font-weight: 600;
    color: #718096;
    text-align: right;
    border-bottom: 2px solid #edf2f7;
    white-space: nowrap;
  }
  thead th:nth-child(3), thead th:nth-child(4), thead th:nth-child(5), thead th:nth-child(7) { text-align: center; }

  .footer {
    text-align: center;
    font-size: 11px;
    color: #a0aec0;
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid #edf2f7;
  }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <h1>🏷️ BestPrice — דוח מחירים יומי</h1>
    <div class="sub">${dateStr} | ${timeStr}</div>
  </div>

  <div class="stats">
    <div class="stat-card total">
      <div class="num">${products.length}</div>
      <div class="label">מוצרים נסרקו</div>
    </div>
    <div class="stat-card flagged">
      <div class="num">${flagged.length}</div>
      <div class="label">חריגי מחיר</div>
    </div>
    <div class="stat-card good">
      <div class="num">${good.length}</div>
      <div class="label">תקינים</div>
    </div>
    <div class="stat-card empty">
      <div class="num">${noResults.length}</div>
      <div class="label">ללא תוצאות</div>
    </div>
  </div>

  <div class="section-title">📋 כל המוצרים</div>
  <table>
    <thead>
      <tr>
        <th></th>
        <th>מוצר</th>
        <th>מחיר מומלץ</th>
        <th>מחיר נמוך</th>
        <th>הפרש</th>
        <th>ספק זול</th>
        <th>ספקים</th>
      </tr>
    </thead>
    <tbody>
      ${productRows}
    </tbody>
  </table>

  <div class="footer">
    נוצר אוטומטית ע״י BestPrice | סריקה: ${run.scanMode || 'zap_then_remaining'} | משך: ${
    run.startedAt && run.completedAt
      ? Math.round((new Date(run.completedAt) - new Date(run.startedAt)) / 60000) + ' דקות'
      : '—'
  }
  </div>
</div>
</body>
</html>`;
}

// Generate simple job ID
function generateJobId() {
  return Math.random().toString(36).substring(2, 15);
}

// Create scrape job - returns immediately
app.post('/scrape', requireApiSecret, async (req, res) => {
  const { productName, recommendedPrice, barcode, excludeSites, includeSites } = req.body;
  
  if (!productName) {
    return res.status(400).json({ success: false, error: 'productName is required' });
  }
  
  // Calculate sites to scan based on excludeSites
  const excludeList = Array.isArray(excludeSites) ? excludeSites : [];
  const includeList = Array.isArray(includeSites) ? includeSites : [];
  let sitesToScan = SCRAPER_CONFIGS;
  if (includeList.length > 0) {
    sitesToScan = sitesToScan.filter((config) => includeList.includes(config.name));
  }
  if (excludeList.length > 0) {
    sitesToScan = sitesToScan.filter((config) => !excludeList.includes(config.name));
  }
  
  const jobId = generateJobId();
  
  // Create job
  const job = {
    id: jobId,
    status: 'processing',
    productName,
    recommendedPrice,
    barcode,
    providers: [],
    scans: [],
    completedSites: 0,
    totalSites: sitesToScan.length,
    progress: 0,
    createdAt: new Date().toISOString(),
    excludedSites: excludeList.length,
    includedSites: includeList.length,
  };
  
  jobs.set(jobId, job);
  
  // Start scraping in background (don't await)
  runScrapeJob(jobId, productName, recommendedPrice, barcode, excludeList, includeList);
  
  // Return immediately with job ID
  res.json({
    success: true,
    data: {
      jobId,
      status: 'processing',
      totalSites: sitesToScan.length,
      excludedSites: excludeList.length,
      includedSites: includeList.length,
      message: `Scraping ${sitesToScan.length} sites (${excludeList.length} excluded). Poll /status/:jobId for results.`,
    },
  });
});

// Get job status and results
app.get('/status/:jobId', requireApiSecret, (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);
  
  if (!job) {
    return res.status(404).json({ success: false, error: 'Job not found' });
  }
  
  res.json({
    success: true,
    data: {
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      productName: job.productName,
      recommendedPrice: job.recommendedPrice,
      providers: job.providers,
      scanMetadata: {
        totalWebsites: job.totalSites,
        scannedWebsites: job.completedSites,
        websites: job.scans,
      },
      createdAt: job.createdAt,
      completedAt: job.completedAt,
    },
  });
});

// Legacy endpoint - waits for completion (for backwards compatibility)
app.post('/scrape-sync', requireApiSecret, async (req, res) => {
  const { productName, recommendedPrice, barcode, excludeSites, includeSites } = req.body;
  
  if (!productName) {
    return res.status(400).json({ success: false, error: 'productName is required' });
  }
  
  const excludeList = Array.isArray(excludeSites) ? excludeSites : [];
  const includeList = Array.isArray(includeSites) ? includeSites : [];
  let sitesToScan = SCRAPER_CONFIGS;
  if (includeList.length > 0) {
    sitesToScan = sitesToScan.filter((config) => includeList.includes(config.name));
  }
  if (excludeList.length > 0) {
    sitesToScan = sitesToScan.filter((config) => !excludeList.includes(config.name));
  }
  
  // Create and run job
  const jobId = generateJobId();
  const job = {
    id: jobId,
    status: 'processing',
    productName,
    recommendedPrice,
    barcode,
    providers: [],
    scans: [],
    completedSites: 0,
    totalSites: sitesToScan.length,
    progress: 0,
    createdAt: new Date().toISOString(),
  };
  
  jobs.set(jobId, job);
  
  // Wait for completion
  await runScrapeJob(jobId, productName, recommendedPrice, barcode, excludeList, includeList);
  
  const completedJob = jobs.get(jobId);
  
  res.json({
    success: true,
    data: {
      productName,
      barcode,
      recommendedPrice,
      providers: completedJob.providers,
      scanMetadata: {
        totalWebsites: completedJob.totalSites,
        scannedWebsites: completedJob.completedSites,
        websites: completedJob.scans,
      },
    },
  });
});

// Trigger daily orchestration from Vercel cron.
// Starts a background run and returns immediately.
app.post('/cron/orchestrate', requireApiSecret, async (req, res) => {

  if (activeCronRunId) {
    const activeRun = cronRuns.get(activeCronRunId);
    if (activeRun && ['queued', 'running'].includes(activeRun.status)) {
      return res.json({
        success: true,
        data: {
          runId: activeRun.id,
          status: activeRun.status,
          message: 'Cron orchestration already running',
        },
      });
    }
  }

  const runId = generateCronRunId();
  const appBaseUrl = req.body?.appBaseUrl || process.env.APP_BASE_URL || DEFAULT_APP_BASE_URL;
  const run = {
    id: runId,
    status: 'queued',
    message: 'Queued',
    appBaseUrl,
    processedCount: 0,
    queuedCount: 0,
    startedCount: 0,
    failedCount: 0,
    totalProducts: 0,
    totalBatches: 0,
    currentBatch: 0,
    progress: 0,
    errors: [],
    productResults: [],
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
  };
  cronRuns.set(runId, run);
  activeCronRunId = runId;

  runCronOrchestration({
    runId,
    appBaseUrl,
    cronSecret: process.env.CRON_SECRET,
    limit: Number(req.body?.limit) || 0,
  });

  return res.json({
    success: true,
    data: {
      runId,
      status: run.status,
      appBaseUrl,
      message: 'Cron orchestration started on Render',
    },
  });
});

app.get('/cron/orchestrate/:runId', requireApiSecret, (req, res) => {
  const run = cronRuns.get(req.params.runId);
  if (!run) {
    return res.status(404).json({ success: false, error: 'Run not found' });
  }
  return res.json({ success: true, data: run });
});

// Test report endpoint — generates PDF + sends email from existing cached price data
app.post('/test-report', requireApiSecret, async (req, res) => {
  try {
    const appBaseUrl = req.body?.appBaseUrl || DEFAULT_APP_BASE_URL;
    const headers = buildAppHeaders(process.env.CRON_SECRET);

    const [productsRes, pricesRes] = await Promise.all([
      fetch(`${appBaseUrl}/api/products`, { headers }),
      fetch(`${appBaseUrl}/api/prices`, { headers }),
    ]);

    if (!productsRes.ok) throw new Error(`Products API: ${productsRes.status}`);
    const productsJson = await productsRes.json();
    const allProducts = productsJson?.data?.products || [];

    const priceCache = pricesRes.ok ? (await pricesRes.json())?.data || {} : {};

    const productResults = allProducts.map((p) => {
      const barcode = p.barcode;
      const rec = Number(p.recommended_price ?? p.recommendedPrice ?? 0);
      const cached = priceCache[barcode];
      const providers = cached?.providers || [];
      return {
        productName: p.name,
        recommendedPrice: rec,
        providers,
        status: 'completed',
      };
    });

    const fakeRun = {
      productResults,
      scanMode: 'cached_data',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };

    await generateAndSendReport(fakeRun, { toOverride: req.body?.to });
    res.json({ success: true, message: `Report sent with ${productResults.length} products` });
  } catch (error) {
    console.error('[test-report]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'scraper',
    uptimeSeconds: Math.round(process.uptime()),
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    service: 'scraper-api',
    status: 'running',
    docs: 'private',
  });
});

// Cleanup old jobs every minute (keep jobs for 30 minutes to allow full scan cycles)
setInterval(() => {
  const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
  for (const [jobId, job] of jobs.entries()) {
    if (new Date(job.createdAt).getTime() < thirtyMinutesAgo) {
      jobs.delete(jobId);
    }
  }

  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  for (const [runId, run] of cronRuns.entries()) {
    if (new Date(run.createdAt).getTime() < oneDayAgo && !['queued', 'running'].includes(run.status)) {
      cronRuns.delete(runId);
    }
  }
}, 60 * 1000);

// ── Built-in daily scheduler (Israel 5:00 AM) ──
// More reliable than Vercel Hobby cron which goes dormant.
function scheduleNextRun() {
  const now = new Date();
  const israelNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));

  const target = new Date(israelNow);
  target.setHours(5, 0, 0, 0);

  if (israelNow >= target) {
    target.setDate(target.getDate() + 1);
  }

  const israelOffset = israelNow.getTime() - now.getTime();
  const msUntilTarget = target.getTime() - israelNow.getTime();

  const hours = Math.round(msUntilTarget / 3600000 * 10) / 10;
  console.log(`[Scheduler] Next daily scan in ${hours}h (5:00 AM Israel)`);

  setTimeout(async () => {
    console.log('[Scheduler] 5:00 AM Israel — triggering daily scan');
    try {
      const appBaseUrl = process.env.APP_BASE_URL || DEFAULT_APP_BASE_URL;
      const runId = generateCronRunId();
      const run = {
        id: runId,
        status: 'queued',
        message: 'Queued (self-scheduled)',
        appBaseUrl,
        processedCount: 0,
        queuedCount: 0,
        startedCount: 0,
        failedCount: 0,
        totalProducts: 0,
        totalBatches: 0,
        currentBatch: 0,
        progress: 0,
        errors: [],
        productResults: [],
        createdAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null,
      };
      cronRuns.set(runId, run);
      activeCronRunId = runId;

      await runCronOrchestration({
        runId,
        appBaseUrl,
        cronSecret: process.env.CRON_SECRET,
      });
    } catch (err) {
      console.error('[Scheduler] Error:', err.message || err);
    }

    scheduleNextRun();
  }, msUntilTarget);
}

scheduleNextRun();

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║       🎧 BestPrice Playwright Scraper - Job-Based             ║
╠════════════════════════════════════════════════════════════════╣
║  Server running on port ${PORT}                                   ║
║  Endpoints: POST /scrape, GET /status/:jobId                   ║
╚════════════════════════════════════════════════════════════════╝
  `);
});
