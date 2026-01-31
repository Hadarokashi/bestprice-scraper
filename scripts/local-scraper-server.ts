#!/usr/bin/env npx tsx

/**
 * Local Playwright Scraper Server
 * 
 * This server runs Playwright locally and exposes an API for the dashboard.
 * Run this on your machine to enable browser-based scraping.
 * 
 * Usage:
 *   npx tsx scripts/local-scraper-server.ts
 * 
 * Then configure the dashboard to use http://localhost:3001 as the scraper URL.
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { scrapeMultipleSites, closeBrowser } from '../lib/price-sources/playwright-scraper';
import { ScraperConfig } from '../lib/types';

const PORT = 3001;

// Israeli music/audio store configurations
const SCRAPER_CONFIGS: ScraperConfig[] = [
  { id: '1', name: 'Zap.co.il', baseUrl: 'https://www.zap.co.il', searchPattern: '/search.aspx?keyword={query}', enabled: true, priority: 1 },
  { id: '2', name: 'Bconnect', baseUrl: 'https://bconnect.co.il', searchPattern: '/?s={query}', enabled: true, priority: 2 },
  { id: '3', name: 'Diez', baseUrl: 'https://diez.co.il', searchPattern: '/?s={query}', enabled: true, priority: 3 },
  { id: '4', name: 'Sound Check', baseUrl: 'https://sound-check.co.il', searchPattern: '/?s={query}', enabled: true, priority: 4 },
  { id: '5', name: 'הד סאונד', baseUrl: 'https://www.head-sound.co.il', searchPattern: '/?s={query}', enabled: true, priority: 5 },
  { id: '6', name: 'עולם המוסיקה', baseUrl: 'https://www.musicworld.co.il', searchPattern: '/?s={query}', enabled: true, priority: 6 },
  { id: '7', name: 'לבמה', baseUrl: 'https://www.labama.co.il', searchPattern: '/?s={query}', enabled: true, priority: 7 },
  { id: '8', name: 'Signal', baseUrl: 'https://www.signalmusic.co.il', searchPattern: '/?s={query}', enabled: true, priority: 8 },
  { id: '9', name: 'Ginges', baseUrl: 'https://www.ginges.co.il', searchPattern: '/?s={query}', enabled: true, priority: 9 },
  { id: '10', name: 'FunkyDJ', baseUrl: 'https://www.funkydj.co.il', searchPattern: '/?s={query}', enabled: true, priority: 10 },
  { id: '11', name: 'KSP', baseUrl: 'https://www.ksp.co.il', searchPattern: '/?select=.2.100..&txt_search={query}', enabled: true, priority: 11 },
  { id: '12', name: 'Bug', baseUrl: 'https://www.bug.co.il', searchPattern: '/search?q={query}', enabled: true, priority: 12 },
  { id: '13', name: 'Ivory', baseUrl: 'https://www.ivory.co.il', searchPattern: '/search?q={query}', enabled: true, priority: 13 },
  { id: '14', name: 'Pro-Shop', baseUrl: 'https://www.proshop.co.il', searchPattern: '/?s={query}', enabled: true, priority: 14 },
  { id: '15', name: 'Music Station', baseUrl: 'https://www.musicstation.co.il', searchPattern: '/?s={query}', enabled: true, priority: 15 },
];

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  
  // Health check
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'playwright-scraper' }));
    return;
  }
  
  // Scrape endpoint
  if (url.pathname === '/scrape' && req.method === 'POST') {
    let body = '';
    
    req.on('data', chunk => { body += chunk.toString(); });
    
    req.on('end', async () => {
      try {
        const { productName, recommendedPrice, barcode } = JSON.parse(body);
        
        if (!productName) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'productName is required' }));
          return;
        }
        
        console.log(`\n🔍 Scraping: "${productName}" (₪${recommendedPrice || 'N/A'})`);
        
        const { providers, scans } = await scrapeMultipleSites(
          SCRAPER_CONFIGS,
          productName,
          recommendedPrice,
          3 // Concurrent limit
        );
        
        console.log(`✅ Found ${providers.length} results from ${scans.filter(s => s.status === 'found').length} sites`);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          data: {
            productName,
            barcode,
            recommendedPrice,
            providers,
            scanMetadata: {
              totalWebsites: scans.length,
              scannedWebsites: scans.length,
              websites: scans.map(s => ({
                name: s.name,
                status: s.status === 'found' ? 'found' : s.status === 'error' ? 'error' : 'not_found',
                resultsCount: s.count,
              })),
            },
          },
        }));
      } catch (error) {
        console.error('Scrape error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        }));
      }
    });
    
    return;
  }
  
  // Not found
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}

const server = createServer(handleRequest);

server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║       🎧 BestPrice - Local Playwright Scraper Server 🎧        ║
╠════════════════════════════════════════════════════════════════╣
║                                                                ║
║  Server running at: http://localhost:${PORT}                     ║
║                                                                ║
║  Endpoints:                                                    ║
║    GET  /health  - Check if server is running                  ║
║    POST /scrape  - Scrape prices for a product                 ║
║                                                                ║
║  Example:                                                      ║
║    curl -X POST http://localhost:${PORT}/scrape \\               ║
║      -H "Content-Type: application/json" \\                     ║
║      -d '{"productName":"DT 770 PRO","recommendedPrice":859}'  ║
║                                                                ║
║  Keep this server running while using the dashboard.           ║
║  Press Ctrl+C to stop.                                         ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n👋 Shutting down...');
  await closeBrowser();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeBrowser();
  process.exit(0);
});
