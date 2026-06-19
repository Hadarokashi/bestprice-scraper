import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { filterIgnoredProviders, loadIgnoredMatches } from '@/lib/ignored-matches';
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

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET() {
  try {
    const [{ data: priceCache, error }, ignoredMatches] = await Promise.all([
      supabase.from('price_cache').select('*'),
      loadIgnoredMatches().catch(() => []),
    ]);
    
    if (error) throw error;
    
    const providerMap = new Map<string, ProviderSummary>();
    
    for (const cache of priceCache || []) {
      const providers = filterIgnoredProviders(
        (cache.providers || []) as ProviderPrice[],
        cache.barcode,
        ignoredMatches
      );
      
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
        
        const recommendedPrice = toNumber(cache.recommended_price);
        const providerPrice = toNumber(provider.price);
        const threshold = toNumber(cache.threshold) || 10;
        const thresholdPrice = recommendedPrice * (1 - threshold / 100);
        const isFlagged = providerPrice < thresholdPrice;
        
        if (isFlagged) {
          providerData.flaggedProducts++;
        }
        
        providerData.products.push({
          productId: cache.product_id,
          barcode: cache.barcode,
          recommendedPrice,
          providerPrice,
          providerUrl: provider.providerUrl,
          lastChecked: provider.lastUpdated || cache.last_searched,
          isFlagged,
          priceDifference: recommendedPrice - providerPrice,
          percentDifference: recommendedPrice > 0
            ? ((recommendedPrice - providerPrice) / recommendedPrice * 100).toFixed(1)
            : '0.0',
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
