import { NextRequest, NextResponse } from 'next/server';
import { PriceCache, PriceComparison, ApiResponse } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { loadPriceCache, upsertPriceComparison } from '@/lib/price-cache';

// GET /api/prices - Get all cached prices
export async function GET(): Promise<NextResponse<ApiResponse<PriceCache>>> {
  try {
    const cache = await loadPriceCache();
    return NextResponse.json({ success: true, data: cache });
  } catch (error) {
    console.error('GET /api/prices error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST /api/prices - Save price comparison results
export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<null>>> {
  try {
    const body = await request.json();
    const { barcode, productId, recommendedPrice, threshold, providers, flaggedProviders, scanMetadata } = body;

    if (!barcode) {
      return NextResponse.json(
        { success: false, error: 'barcode is required' },
        { status: 400 }
      );
    }

    const comparison: PriceComparison = {
      productId,
      barcode,
      recommendedPrice,
      threshold,
      providers: providers || [],
      flaggedProviders: flaggedProviders || [],
      lastSearched: new Date().toISOString(),
      scanMetadata: scanMetadata || undefined,
      error: body.error || undefined,
    };

    await upsertPriceComparison(comparison);

    console.log(`[Price Cache] Saved results for barcode ${barcode}: ${providers?.length || 0} providers`);

    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    console.error('POST /api/prices error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE /api/prices - Clear price cache
export async function DELETE(): Promise<NextResponse<ApiResponse<null>>> {
  try {
    const { error } = await supabase
      .from('price_cache')
      .delete()
      .neq('id', 0); // Delete all

    if (error) throw error;

    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    console.error('DELETE /api/prices error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
