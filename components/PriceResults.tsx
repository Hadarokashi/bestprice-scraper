'use client';

import { Product, PriceComparison, ProviderPrice } from '@/lib/types';

interface PriceResultsProps {
  product: Product | null;
  comparison: PriceComparison | null;
  threshold: number;
}

export default function PriceResults({ product, comparison, threshold }: PriceResultsProps) {
  if (!product) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-lg p-8 text-center">
        <div className="text-[var(--muted)]">
          <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-[var(--border)]/30 flex items-center justify-center">
            <svg className="w-8 h-8 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <p className="font-medium">בחר מוצר</p>
          <p className="text-sm mt-1">לחץ על שורה בטבלה</p>
        </div>
      </div>
    );
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: 'ILS',
      minimumFractionDigits: 0,
    }).format(price);
  };

  const thresholdPrice = product.recommendedPrice * (1 - threshold / 100);
  const sortedProviders = comparison?.providers.slice().sort((a, b) => a.price - b.price) || [];

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-lg overflow-hidden">
      {/* Product Info */}
      <div className="px-5 py-3 border-b border-[var(--border)] bg-[var(--primary)]/5">
        <span className="text-[var(--primary)] text-sm font-bold flex items-center gap-2">
          📦 פרטי מוצר
        </span>
      </div>
      <div className="p-4 border-b border-[var(--border)]">
        <h3 className="font-bold mb-2">{product.name}</h3>
        <div className="flex flex-wrap gap-2 text-xs text-[var(--muted)]">
          <span className="bg-[var(--background)] px-2 py-1 rounded">מק״ט: {product.sku}</span>
          <span className="bg-[var(--background)] px-2 py-1 rounded">ברקוד: {product.barcode}</span>
        </div>
      </div>

      {/* Price Overview */}
      <div className="px-5 py-3 border-b border-[var(--border)] bg-[var(--warning)]/5">
        <span className="text-[var(--warning)] text-sm font-bold flex items-center gap-2">
          💰 סקירת מחירים
        </span>
      </div>
      <div className="p-4 grid grid-cols-3 gap-2 border-b border-[var(--border)] text-center">
        <div>
          <p className="text-xs text-[var(--muted)]">מומלץ</p>
          <p className="font-bold">{formatPrice(product.recommendedPrice)}</p>
        </div>
        <div className="border-x border-[var(--border)]">
          <p className="text-xs text-[var(--muted)]">סף ({threshold}%-)</p>
          <p className="font-bold text-[var(--warning)]">{formatPrice(thresholdPrice)}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--muted)]">נמוך</p>
          {sortedProviders.length > 0 ? (
            <p className={`font-bold ${sortedProviders[0].price < thresholdPrice ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>
              {formatPrice(sortedProviders[0].price)}
            </p>
          ) : (
            <p className="font-bold text-[var(--muted)]">—</p>
          )}
        </div>
      </div>

      {/* Providers */}
      <div className="px-5 py-3 border-b border-[var(--border)] bg-[var(--success)]/5 flex justify-between items-center">
        <span className="text-[var(--success)] text-sm font-bold flex items-center gap-2">
          🏪 ספקים
        </span>
        {comparison && (
          <span className="bg-[var(--success)]/20 text-[var(--success)] px-2 py-0.5 rounded-full text-xs font-bold">
            {comparison.providers.length}
          </span>
        )}
      </div>
      
      <div className="p-4 max-h-[400px] overflow-y-auto">
        {!comparison ? (
          <div className="text-center py-4 text-[var(--muted)]">
            <p className="text-sm">לא נבדק עדיין</p>
          </div>
        ) : comparison.providers.length === 0 ? (
          <div className="text-center py-4 text-[var(--muted)]">
            <p className="text-sm">🔍 לא נמצאו ספקים</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedProviders.map((provider, index) => (
              <ProviderCard
                key={`${provider.providerName}-${index}`}
                provider={provider}
                thresholdPrice={thresholdPrice}
                recommendedPrice={product.recommendedPrice}
              />
            ))}
          </div>
        )}

        {comparison && (
          <div className="mt-3 pt-3 border-t border-[var(--border)] text-xs text-[var(--muted)]">
            עודכן: {new Date(comparison.lastSearched).toLocaleString('he-IL')}
          </div>
        )}
      </div>
    </div>
  );
}

function getDomainName(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

function ProviderCard({
  provider,
  thresholdPrice,
  recommendedPrice,
}: {
  provider: ProviderPrice;
  thresholdPrice: number;
  recommendedPrice: number;
}) {
  const isBelowThreshold = provider.price < thresholdPrice;
  const priceDiff = recommendedPrice - provider.price;
  const percentDiff = ((priceDiff / recommendedPrice) * 100).toFixed(1);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: 'ILS',
      minimumFractionDigits: 0,
    }).format(price);
  };

  return (
    <div className={`p-3 rounded-lg border ${isBelowThreshold ? 'border-[var(--danger)] bg-[var(--danger)]/5' : 'border-[var(--border)] bg-[var(--background)]'}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h5 className="font-medium text-sm truncate">{provider.providerName}</h5>
            {isBelowThreshold && <span className="text-[var(--danger)] text-xs">⚠️</span>}
          </div>
          
          {provider.providerUrl && (
            <a
              href={provider.providerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[var(--primary)] hover:underline"
            >
              🌐 {getDomainName(provider.providerUrl)} ←
            </a>
          )}
        </div>
        
        <div className="text-left">
          <p className={`font-bold ${isBelowThreshold ? 'text-[var(--danger)]' : ''}`}>
            {formatPrice(provider.price)}
          </p>
          {priceDiff > 0 && (
            <p className="text-xs text-[var(--success)]">-{percentDiff}%</p>
          )}
        </div>
      </div>
    </div>
  );
}
