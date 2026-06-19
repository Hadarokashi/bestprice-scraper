import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { filterIgnoredProviders, loadIgnoredMatches } from '@/lib/ignored-matches';
import type { ProviderPrice } from '@/lib/types';

interface ProviderExportRow {
  'שם מוצר': string;
  'ברקוד': string;
  'מק"ט': string;
  'מחיר מומלץ': string;
  'מחיר ספק': string;
  'הפרש מחיר': string;
  'אחוז הנחה': string;
  'סטטוס': string;
  'קישור': string;
  'תאריך בדיקה': string;
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function escapeCsvValue(value: string): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export async function POST(request: NextRequest) {
  try {
    const { providerName } = await request.json();
    
    if (!providerName) {
      return NextResponse.json(
        { success: false, error: 'Provider name is required' },
        { status: 400 }
      );
    }
    
    const [cacheResult, productsResult, ignoredMatches] = await Promise.all([
      supabase.from('price_cache').select('*'),
      supabase.from('products').select('id, name, sku, barcode'),
      loadIgnoredMatches().catch(() => []),
    ]);

    if (cacheResult.error) throw cacheResult.error;
    if (productsResult.error) throw productsResult.error;

    const priceCache = cacheResult.data;
    const products = productsResult.data;
    
    const productMap = new Map(products?.map((p) => [p.id, p]) || []);
    
    const providerProducts: ProviderExportRow[] = [];
    
    for (const cache of priceCache || []) {
      const providers = filterIgnoredProviders(
        (cache.providers || []) as ProviderPrice[],
        cache.barcode,
        ignoredMatches
      );
      const provider = providers.find((p) => p.providerName === providerName);
      
      if (provider) {
        const product = productMap.get(cache.product_id);
        const recommendedPrice = toNumber(cache.recommended_price);
        const providerPrice = toNumber(provider.price);
        const threshold = toNumber(cache.threshold) || 10;
        const thresholdPrice = recommendedPrice * (1 - threshold / 100);
        const isFlagged = providerPrice < thresholdPrice;
        const priceDifference = recommendedPrice - providerPrice;
        const percentDiscount = recommendedPrice > 0
          ? ((priceDifference / recommendedPrice) * 100).toFixed(1)
          : '0.0';
        
        providerProducts.push({
          'שם מוצר': product?.name || 'Unknown',
          'ברקוד': cache.barcode,
          'מק"ט': product?.sku || '',
          'מחיר מומלץ': recommendedPrice.toFixed(2),
          'מחיר ספק': providerPrice.toFixed(2),
          'הפרש מחיר': priceDifference.toFixed(2),
          'אחוז הנחה': `${percentDiscount}%`,
          'סטטוס': isFlagged ? 'חריג' : 'תקין',
          'קישור': provider.providerUrl || '',
          'תאריך בדיקה': new Date(provider.lastUpdated || cache.last_searched).toLocaleDateString('he-IL'),
        });
      }
    }
    
    if (providerProducts.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No products found for this provider' },
        { status: 404 }
      );
    }
    
    const headers = Object.keys(providerProducts[0]).join(',');
    const rows = providerProducts.map((item) =>
      Object.values(item).map((value) => escapeCsvValue(String(value))).join(',')
    );
    const csv = [headers, ...rows].join('\n');
    const date = new Date().toISOString().split('T')[0];
    const safeFilename = `${providerName}-report-${date}.csv`;
    
    return new NextResponse('\ufeff' + csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodeURIComponent(safeFilename)}`,
      },
    });
  } catch (error) {
    console.error('Error generating provider report:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate report',
      },
      { status: 500 }
    );
  }
}
