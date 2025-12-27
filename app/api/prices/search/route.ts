import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { searchPrices } from '@/lib/price-sources';
import { PriceCache, PriceComparison, AppSettings, ApiResponse, PriceSource } from '@/lib/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const PRICE_CACHE_FILE = path.join(DATA_DIR, 'price-cache.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function loadPriceCache(): Promise<PriceCache> {
  try {
    const data = await fs.readFile(PRICE_CACHE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function savePriceCache(cache: PriceCache): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(PRICE_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
}

async function loadSettings(): Promise<AppSettings> {
  try {
    const data = await fs.readFile(SETTINGS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { threshold: 10, priceSource: 'serpapi' };
  }
}

// POST /api/prices/search - Search for prices
export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<PriceComparison>>> {
  try {
    const body = await request.json();
    const { productId, barcode, productName, source, apiKey } = body;

    if (!barcode || !productName) {
      return NextResponse.json(
        { success: false, error: 'Barcode and product name are required' },
        { status: 400 }
      );
    }

    // Load settings to get threshold and default source
    const settings = await loadSettings();
    const priceSource: PriceSource = source || settings.priceSource;
    const effectiveApiKey = apiKey || settings.serpApiKey;

    // Search for prices
    const result = await searchPrices(
      { productName, barcode },
      priceSource,
      effectiveApiKey
    );

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || 'Search failed' },
        { status: 500 }
      );
    }

    // Load cached data to get recommended price
    const cache = await loadPriceCache();
    
    // Get recommended price from request or existing cache
    const recommendedPrice = body.recommendedPrice || cache[barcode]?.recommendedPrice || 0;
    const threshold = settings.threshold;

    // Calculate flagged providers (below threshold)
    const thresholdPrice = recommendedPrice * (1 - threshold / 100);
    const flaggedProviders = result.providers.filter(p => p.price < thresholdPrice);

    // Create comparison result
    const comparison: PriceComparison = {
      productId: productId || barcode,
      barcode,
      recommendedPrice,
      threshold,
      providers: result.providers,
      flaggedProviders,
      lastSearched: new Date().toISOString(),
    };

    // Update cache
    cache[barcode] = comparison;
    await savePriceCache(cache);

    return NextResponse.json({ success: true, data: comparison });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

