#!/usr/bin/env npx ts-node

/**
 * Local Playwright Price Scraper
 * 
 * Usage:
 *   npx ts-node scripts/scrape-prices.ts "DT 770 PRO" 859
 *   npx ts-node scripts/scrape-prices.ts "AMIRON ZERO" 649
 * 
 * Or run all products:
 *   npx ts-node scripts/scrape-prices.ts --all
 */

import { scrapeMultipleSites, closeBrowser } from '../lib/price-sources/playwright-scraper';
import { ScraperConfig } from '../lib/types';

// Israeli music/audio store configurations
const SCRAPER_CONFIGS: ScraperConfig[] = [
  { id: '1', name: 'Zap.co.il', baseUrl: 'https://www.zap.co.il', searchPattern: '/search.aspx?keyword={query}', enabled: true, priority: 1 },
  { id: '2', name: 'Bconnect', baseUrl: 'https://bconnect.co.il', searchPattern: '/?s={query}', enabled: true, priority: 2 },
  { id: '3', name: 'Diez', baseUrl: 'https://diez.co.il', searchPattern: '/?s={query}', enabled: true, priority: 3 },
  { id: '4', name: 'Sound Check', baseUrl: 'https://sound-check.co.il', searchPattern: '/?s={query}', enabled: true, priority: 4 },
  { id: '5', name: 'הד סאונד', baseUrl: 'https://www.hadsound.co.il', searchPattern: '/?s={query}', enabled: true, priority: 5 },
  { id: '6', name: 'עולם המוסיקה', baseUrl: 'https://www.musicworld.co.il', searchPattern: '/?s={query}', enabled: true, priority: 6 },
  { id: '7', name: 'לבמה', baseUrl: 'https://lavama.co.il', searchPattern: '/?s={query}', enabled: true, priority: 7 },
  { id: '8', name: 'Signal', baseUrl: 'https://www.signal.co.il', searchPattern: '/?s={query}', enabled: true, priority: 8 },
  { id: '9', name: 'Ginges', baseUrl: 'https://www.ginges.co.il', searchPattern: '/?s={query}', enabled: true, priority: 9 },
  { id: '10', name: 'FunkyDJ', baseUrl: 'https://www.funkydj.co.il', searchPattern: '/?s={query}', enabled: true, priority: 10 },
  { id: '11', name: 'KSP', baseUrl: 'https://www.ksp.co.il', searchPattern: '/?select=.2.100..&txt_search={query}', enabled: true, priority: 11 },
  { id: '12', name: 'Bug', baseUrl: 'https://www.bug.co.il', searchPattern: '/search?q={query}', enabled: true, priority: 12 },
  { id: '13', name: 'Ivory', baseUrl: 'https://www.ivory.co.il', searchPattern: '/search?q={query}', enabled: true, priority: 13 },
];

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║           🎧 BestPrice - Playwright Price Scraper 🎧           ║
╠════════════════════════════════════════════════════════════════╣
║                                                                ║
║  Usage:                                                        ║
║    npx ts-node scripts/scrape-prices.ts "PRODUCT" [PRICE]      ║
║                                                                ║
║  Examples:                                                     ║
║    npx ts-node scripts/scrape-prices.ts "DT 770 PRO" 859       ║
║    npx ts-node scripts/scrape-prices.ts "AMIRON ZERO" 649      ║
║                                                                ║
║  The PRICE is optional but recommended for better filtering.   ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
`);
    process.exit(0);
  }
  
  const productName = args[0];
  const recommendedPrice = args[1] ? parseFloat(args[1]) : undefined;
  
  console.log(`\n🔍 Searching for: "${productName}"`);
  if (recommendedPrice) {
    console.log(`💰 Recommended price: ₪${recommendedPrice}`);
    console.log(`📊 Acceptable range: ₪${(recommendedPrice * 0.5).toFixed(0)} - ₪${(recommendedPrice * 1.5).toFixed(0)}`);
  }
  console.log(`🌐 Checking ${SCRAPER_CONFIGS.length} websites...\n`);
  
  const startTime = Date.now();
  
  try {
    const { providers, scans } = await scrapeMultipleSites(
      SCRAPER_CONFIGS,
      productName,
      recommendedPrice,
      3 // Run 3 sites concurrently
    );
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log('\n' + '═'.repeat(60));
    console.log('📊 SCAN RESULTS');
    console.log('═'.repeat(60));
    
    // Group scans by status
    const found = scans.filter(s => s.status === 'found');
    const notFound = scans.filter(s => s.status === 'not_found');
    const errors = scans.filter(s => s.status === 'error');
    
    if (found.length > 0) {
      console.log(`\n✅ Found (${found.length}):`);
      found.forEach(s => console.log(`   • ${s.name}: ${s.count} result(s)`));
    }
    
    if (notFound.length > 0) {
      console.log(`\n❌ Not Found (${notFound.length}):`);
      notFound.forEach(s => console.log(`   • ${s.name}`));
    }
    
    if (errors.length > 0) {
      console.log(`\n⚠️ Errors (${errors.length}):`);
      errors.forEach(s => console.log(`   • ${s.name}`));
    }
    
    console.log('\n' + '═'.repeat(60));
    console.log('💰 PRICES FOUND');
    console.log('═'.repeat(60));
    
    if (providers.length === 0) {
      console.log('\n❌ No prices found for this product.');
      console.log('\nPossible reasons:');
      console.log('  • Product is not available at these stores');
      console.log('  • Product name doesn\'t match listings');
      console.log('  • Prices are outside the acceptable range');
    } else {
      // Sort by price
      providers.sort((a, b) => a.price - b.price);
      
      console.log('');
      providers.forEach((p, i) => {
        const diff = recommendedPrice ? ((p.price / recommendedPrice - 1) * 100).toFixed(1) : '';
        const diffStr = diff ? (parseFloat(diff) >= 0 ? `+${diff}%` : `${diff}%`) : '';
        console.log(`${i + 1}. ₪${p.price.toLocaleString()} - ${p.providerName} ${diffStr}`);
        console.log(`   ${p.providerUrl}`);
      });
      
      if (recommendedPrice) {
        const belowThreshold = providers.filter(p => p.price < recommendedPrice * 0.9);
        if (belowThreshold.length > 0) {
          console.log('\n⚠️ ALERT: Prices below threshold (-10%):');
          belowThreshold.forEach(p => {
            console.log(`   • ₪${p.price} at ${p.providerName}`);
          });
        }
      }
    }
    
    console.log('\n' + '═'.repeat(60));
    console.log(`⏱️ Completed in ${elapsed}s`);
    console.log('═'.repeat(60) + '\n');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await closeBrowser();
  }
}

main();
