import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { searchPrices } from '@/lib/price-sources';
import { PriceComparison, ApiResponse, PriceSource } from '@/lib/types';

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

    // Load settings from Supabase
    const { data: settingsData } = await supabase
      .from('settings')
      .select('*')
      .single();

    const settings = settingsData || { threshold: 10, price_source: 'zap' };
    const priceSource: PriceSource = source || settings.price_source;
    const threshold = settings.threshold;

    // Search for prices
    const result = await searchPrices(
      { productName, barcode },
      priceSource,
      apiKey
    );

    if (!result.success) {
      // Still save the error to cache
      const errorComparison: PriceComparison = {
        productId: productId || barcode,
        barcode,
        recommendedPrice: body.recommendedPrice || 0,
        threshold,
        providers: [],
        flaggedProviders: [],
        lastSearched: new Date().toISOString(),
        error: result.error,
      };

      await upsertPriceCache(errorComparison);

      return NextResponse.json({ success: true, data: errorComparison });
    }

    // Get recommended price from request
    const recommendedPrice = body.recommendedPrice || 0;

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

    // Update cache in Supabase
    await upsertPriceCache(comparison);

    return NextResponse.json({ success: true, data: comparison });
  } catch (error) {
    console.error('POST /api/prices/search error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

async function upsertPriceCache(comparison: PriceComparison): Promise<void> {
  const { error } = await supabase
    .from('price_cache')
    .upsert({
      barcode: comparison.barcode,
      product_id: comparison.productId,
      recommended_price: comparison.recommendedPrice,
      threshold: comparison.threshold,
      providers: comparison.providers,
      flagged_providers: comparison.flaggedProviders,
      last_searched: comparison.lastSearched,
      error: comparison.error || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'barcode' });

  if (error) {
    console.error('Error upserting price cache:', error);
  }
}