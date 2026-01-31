const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// In-memory job storage
const jobs = new Map();

// Israeli store configurations - 60 WEBSITES
const SCRAPER_CONFIGS = [
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
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    
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

// Number of sites to scrape in parallel (2-3 recommended for 2GB RAM)
const PARALLEL_SITES = 3;

// Background scraping function
async function runScrapeJob(jobId, productName, recommendedPrice, barcode) {
  const job = jobs.get(jobId);
  if (!job) return;
  
  let browser = null;
  
  try {
    console.log(`\n🔍 [Job ${jobId}] Starting scrape for "${productName}" (${PARALLEL_SITES} sites in parallel)`);
    
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    
    // Process sites in batches of PARALLEL_SITES
    for (let i = 0; i < SCRAPER_CONFIGS.length; i += PARALLEL_SITES) {
      if (job.status === 'cancelled') break;
      
      const batch = SCRAPER_CONFIGS.slice(i, i + PARALLEL_SITES);
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
      job.progress = Math.round((job.completedSites / SCRAPER_CONFIGS.length) * 100);
    }
    
    job.status = 'completed';
    job.completedAt = new Date().toISOString();
    console.log(`✅ [Job ${jobId}] Completed - Found ${job.providers.length} results`);
    
  } catch (error) {
    console.error(`❌ [Job ${jobId}] Fatal error:`, error.message);
    job.status = 'failed';
    job.error = error.message;
  } finally {
    if (browser) await browser.close();
  }
}

// Generate simple job ID
function generateJobId() {
  return Math.random().toString(36).substring(2, 15);
}

// Create scrape job - returns immediately
app.post('/scrape', async (req, res) => {
  const { productName, recommendedPrice, barcode } = req.body;
  
  if (!productName) {
    return res.status(400).json({ success: false, error: 'productName is required' });
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
    totalSites: SCRAPER_CONFIGS.length,
    progress: 0,
    createdAt: new Date().toISOString(),
  };
  
  jobs.set(jobId, job);
  
  // Start scraping in background (don't await)
  runScrapeJob(jobId, productName, recommendedPrice, barcode);
  
  // Return immediately with job ID
  res.json({
    success: true,
    data: {
      jobId,
      status: 'processing',
      message: 'Scraping started. Poll /status/:jobId for results.',
    },
  });
});

// Get job status and results
app.get('/status/:jobId', (req, res) => {
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
app.post('/scrape-sync', async (req, res) => {
  const { productName, recommendedPrice, barcode } = req.body;
  
  if (!productName) {
    return res.status(400).json({ success: false, error: 'productName is required' });
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
    totalSites: SCRAPER_CONFIGS.length,
    progress: 0,
    createdAt: new Date().toISOString(),
  };
  
  jobs.set(jobId, job);
  
  // Wait for completion
  await runScrapeJob(jobId, productName, recommendedPrice, barcode);
  
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

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'bestprice-playwright-scraper', jobs: jobs.size });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    service: 'BestPrice Playwright Scraper',
    status: 'running',
    endpoints: {
      'GET /health': 'Health check',
      'POST /scrape': 'Start async scrape job (returns jobId)',
      'GET /status/:jobId': 'Get job status and results',
    },
  });
});

// Cleanup old jobs every 10 minutes
setInterval(() => {
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  for (const [jobId, job] of jobs.entries()) {
    if (new Date(job.createdAt).getTime() < tenMinutesAgo) {
      jobs.delete(jobId);
    }
  }
}, 60 * 1000);

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
