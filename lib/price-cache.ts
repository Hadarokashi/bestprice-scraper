import { supabase } from './supabase';
import type { PriceCache, PriceComparison } from './types';
import { normalizeScanMetadata } from './scan-utils';

interface PriceCacheRow {
  product_id: string;
  barcode: string;
  recommended_price: string | number;
  threshold: number;
  providers: PriceComparison['providers'];
  flagged_providers: PriceComparison['flaggedProviders'];
  last_searched: string;
  error?: string | null;
  scan_metadata?: PriceComparison['scanMetadata'];
}

export function rowToPriceComparison(row: PriceCacheRow): PriceComparison {
  return {
    productId: row.product_id,
    barcode: row.barcode,
    recommendedPrice: parseFloat(String(row.recommended_price)),
    threshold: row.threshold,
    providers: row.providers || [],
    flaggedProviders: row.flagged_providers || [],
    lastSearched: row.last_searched,
    error: row.error || undefined,
    scanMetadata: normalizeScanMetadata(row.scan_metadata),
    phase: row.scan_metadata?.phase,
  };
}

export async function loadPriceCache(): Promise<PriceCache> {
  const { data, error } = await supabase.from('price_cache').select('*');

  if (error) {
    throw error;
  }

  const cache: PriceCache = {};
  for (const row of data || []) {
    cache[row.barcode] = rowToPriceComparison(row);
  }

  return cache;
}

export async function upsertPriceComparison(comparison: PriceComparison): Promise<void> {
  const payload = {
    barcode: comparison.barcode,
    product_id: comparison.productId,
    recommended_price: comparison.recommendedPrice,
    threshold: comparison.threshold,
    providers: comparison.providers || [],
    flagged_providers: comparison.flaggedProviders || [],
    scan_metadata: comparison.scanMetadata || null,
    last_searched: comparison.lastSearched,
    error: comparison.error || null,
    updated_at: new Date().toISOString(),
  };

  let { error } = await supabase
    .from('price_cache')
    .upsert(payload, { onConflict: 'barcode' });

  // Fallback for databases that were not yet migrated with scan_metadata.
  if (error && String(error.message || '').includes('scan_metadata')) {
    ({ error } = await supabase
      .from('price_cache')
      .upsert({
        barcode: comparison.barcode,
        product_id: comparison.productId,
        recommended_price: comparison.recommendedPrice,
        threshold: comparison.threshold,
        providers: comparison.providers || [],
        flagged_providers: comparison.flaggedProviders || [],
        last_searched: comparison.lastSearched,
        error: comparison.error || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'barcode' }));
  }

  if (error) {
    throw error;
  }
}
