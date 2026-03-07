import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
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

export async function POST(request: NextRequest) {
  try {
    const { providerName } = await request.json();
    
    if (!providerName) {
      return NextResponse.json(
        { success: false, error: 'Provider name is required' },
        { status: 400 }
      );
    }
    
    // Fetch all price cache entries and products
    const { data: priceCache, error: cacheError } = await supabase
      .from('price_cache')
      .select('*');
    
    if (cacheError) throw cacheError;
    
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, name, sku, barcode');
    
    if (productsError) throw productsError;
    
    // Create product lookup map
    const productMap = new Map(products?.map(p => [p.id, p]) || []);
    
    const providerProducts: ProviderExportRow[] = [];
    
    for (const cache of priceCache || []) {
      const providers = (cache.providers || []) as ProviderPrice[];
      const provider = providers.find((p) => p.providerName === providerName);
      
      if (provider) {
        const product = productMap.get(cache.product_id);
        const threshold = cache.threshold || 10;
        const thresholdPrice = cache.recommended_price * (1 - threshold / 100);
        const isFlagged = provider.price < thresholdPrice;
        
        providerProducts.push({
          'שם מוצר': product?.name || 'Unknown',
          'ברקוד': cache.barcode,
          'מק"ט': product?.sku || '',
          'מחיר מומלץ': cache.recommended_price.toFixed(2),
          'מחיר ספק': provider.price.toFixed(2),
          'הפרש מחיר': (cache.recommended_price - provider.price).toFixed(2),
          'אחוז הנחה': (((cache.recommended_price - provider.price) / cache.recommended_price) * 100).toFixed(1) + '%',
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
    
    // Generate CSV
    const headers = Object.keys(providerProducts[0]).join(',');
    const rows = providerProducts.map(item =>
      Object.values(item).map(v => `"${v}"`).join(',')
    );
    const csv = [headers, ...rows].join('\n');
    
    return new NextResponse('\ufeff' + csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${providerName}-report-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error('Error generating provider report:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate report' },
      { status: 500 }
    );
  }
}
