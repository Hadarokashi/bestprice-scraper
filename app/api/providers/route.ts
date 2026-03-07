import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import type { ProviderPrice } from '@/lib/types';

interface ProviderSummary {
  name: string;
  totalProducts: number;
  flaggedProducts: number;
  products: Array<{
    productId: string;
    barcode: string;
    recommendedPrice: number;
    providerPrice: number;
    providerUrl: string;
    lastChecked: string;
    isFlagged: boolean;
    priceDifference: number;
    percentDifference: string;
  }>;
}

export async function GET() {
  try {
    // Fetch all price comparisons
    const { data: priceCache, error } = await supabase
      .from('price_cache')
      .select('*');
    
    if (error) throw error;
    
    // Aggregate by provider
    const providerMap = new Map<string, ProviderSummary>();
    
    for (const cache of priceCache || []) {
      const providers = (cache.providers || []) as ProviderPrice[];
      
      for (const provider of providers) {
        const key = provider.providerName;
        
        if (!providerMap.has(key)) {
          providerMap.set(key, {
            name: key,
            totalProducts: 0,
            flaggedProducts: 0,
            products: [],
          });
        }
        
        const providerData = providerMap.get(key);
        if (!providerData) continue;
        providerData.totalProducts++;
        
        // Check if flagged
        const threshold = cache.threshold || 10;
        const thresholdPrice = cache.recommended_price * (1 - threshold / 100);
        const isFlagged = provider.price < thresholdPrice;
        
        if (isFlagged) {
          providerData.flaggedProducts++;
        }
        
        providerData.products.push({
          productId: cache.product_id,
          barcode: cache.barcode,
          recommendedPrice: cache.recommended_price,
          providerPrice: provider.price,
          providerUrl: provider.providerUrl,
          lastChecked: provider.lastUpdated || cache.last_searched,
          isFlagged,
          priceDifference: cache.recommended_price - provider.price,
          percentDifference: ((cache.recommended_price - provider.price) / cache.recommended_price * 100).toFixed(1),
        });
      }
    }
    
    const providers = Array.from(providerMap.values()).sort((a, b) => 
      a.name.localeCompare(b.name, 'he')
    );
    
    return NextResponse.json({
      success: true,
      data: providers,
    });
  } catch (error) {
    console.error('Error aggregating providers:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to aggregate providers' },
      { status: 500 }
    );
  }
}
