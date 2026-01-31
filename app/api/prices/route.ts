import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { PriceCache, PriceComparison, ApiResponse } from '@/lib/types';

// GET /api/prices - Get all cached prices
export async function GET(): Promise<NextResponse<ApiResponse<PriceCache>>> {
  try {
    const { data, error } = await supabase
      .from('price_cache')
      .select('*');

    if (error) throw error;

    // Convert to PriceCache format (barcode -> PriceComparison)
    const cache: PriceCache = {};
    for (const row of data || []) {
      cache[row.barcode] = {
        productId: row.product_id,
        barcode: row.barcode,
        recommendedPrice: parseFloat(row.recommended_price),
        threshold: row.threshold,
        providers: row.providers || [],
        flaggedProviders: row.flagged_providers || [],
        lastSearched: row.last_searched,
        error: row.error || undefined,
      };
    }

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

    // Upsert into price_cache
    const { error } = await supabase
      .from('price_cache')
      .upsert({
        barcode,
        product_id: productId,
        recommended_price: recommendedPrice,
        threshold,
        providers: providers || [],
        flagged_providers: flaggedProviders || [],
        scan_metadata: scanMetadata || null,
        last_searched: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'barcode',
      });

    if (error) throw error;

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
