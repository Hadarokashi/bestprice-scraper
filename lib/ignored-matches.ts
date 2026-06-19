import { supabase } from './supabase';
import type { IgnoredMatch, PriceCache, PriceComparison, ProviderPrice } from './types';
import { computeFlaggedProviders } from './scan-utils';

interface IgnoredMatchRow {
  id: number;
  barcode: string;
  provider_name: string;
  provider_url: string | null;
  reason: string | null;
  created_at: string;
  products?: { name: string } | { name: string }[] | null;
}

export function normalizeProviderUrl(url?: string | null): string {
  return (url || '').trim();
}

export function providerMatchKey(
  barcode: string,
  providerName: string,
  providerUrl?: string | null
): string {
  return `${barcode}::${providerName}::${normalizeProviderUrl(providerUrl)}`;
}

export function rowToIgnoredMatch(row: IgnoredMatchRow): IgnoredMatch {
  const product = Array.isArray(row.products) ? row.products[0] : row.products;

  return {
    id: row.id,
    barcode: row.barcode,
    providerName: row.provider_name,
    providerUrl: row.provider_url,
    reason: row.reason,
    createdAt: row.created_at,
    productName: product?.name,
  };
}

export function isProviderIgnored(
  ignoredMatches: IgnoredMatch[],
  barcode: string,
  provider: Pick<ProviderPrice, 'providerName' | 'providerUrl'>
): boolean {
  const key = providerMatchKey(barcode, provider.providerName, provider.providerUrl);
  return ignoredMatches.some(
    (match) => providerMatchKey(match.barcode, match.providerName, match.providerUrl) === key
  );
}

export function filterIgnoredProviders(
  providers: ProviderPrice[],
  barcode: string,
  ignoredMatches: IgnoredMatch[]
): ProviderPrice[] {
  return providers.filter((provider) => !isProviderIgnored(ignoredMatches, barcode, provider));
}

export function applyIgnoredFiltersToComparison(
  comparison: PriceComparison,
  ignoredMatches: IgnoredMatch[],
  threshold: number
): PriceComparison {
  const providers = filterIgnoredProviders(comparison.providers, comparison.barcode, ignoredMatches);
  const flaggedProviders = computeFlaggedProviders(
    providers,
    comparison.recommendedPrice,
    threshold
  );

  return {
    ...comparison,
    providers,
    flaggedProviders,
  };
}

export function applyIgnoredFiltersToPriceCache(
  priceData: PriceCache,
  ignoredMatches: IgnoredMatch[],
  threshold: number
): PriceCache {
  return Object.entries(priceData).reduce((acc, [barcode, comparison]) => {
    acc[barcode] = applyIgnoredFiltersToComparison(comparison, ignoredMatches, threshold);
    return acc;
  }, {} as PriceCache);
}

export async function loadIgnoredMatches(): Promise<IgnoredMatch[]> {
  const { data, error } = await supabase
    .from('ignored_matches')
    .select('id, barcode, provider_name, provider_url, reason, created_at, products(name)')
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []).map((row) => rowToIgnoredMatch(row as IgnoredMatchRow));
}
