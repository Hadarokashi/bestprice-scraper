import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { searchPrices } from '@/lib/price-sources';
import { PriceComparison, ApiResponse, PriceSource } from '@/lib/types';
import { upsertPriceComparison } from '@/lib/price-cache';

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

      await upsertPriceComparison(errorComparison);

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
    await upsertPriceComparison(comparison);

    return NextResponse.json({ success: true, data: comparison });
  } catch (error) {
    console.error('POST /api/prices/search error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
