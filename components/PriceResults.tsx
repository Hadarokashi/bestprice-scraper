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
  const scanPhase = comparison?.phase || comparison?.scanMetadata?.phase;

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
        {comparison?.scanMetadata && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="bg-[var(--primary)]/10 text-[var(--primary)] px-2 py-1 rounded">
              {scanPhase || 'completed'}
            </span>
            {comparison.scanMetadata.message && (
              <span className="bg-[var(--background)] px-2 py-1 rounded text-[var(--muted)]">
                {comparison.scanMetadata.message}
              </span>
            )}
            {comparison.scanMetadata.currentSite && (
              <span className="bg-[var(--background)] px-2 py-1 rounded text-[var(--muted)]">
                כעת: {comparison.scanMetadata.currentSite}
              </span>
            )}
          </div>
        )}
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
        
        {/* Website Scan Summary */}
        {comparison?.scanMetadata && (
          <details className="mt-4 pt-4 border-t border-[var(--border)]">
            <summary className="cursor-pointer p-2 bg-[var(--background)] rounded hover:bg-[var(--border)]/30 transition-colors flex items-center gap-2 font-medium text-sm">
              <span>🌐</span>
              <span>אתרים שנסרקו</span>
              <span className="mr-auto text-[var(--success)] bg-[var(--success)]/10 px-2 py-0.5 rounded">
                {comparison.scanMetadata.scannedWebsites}/{comparison.scanMetadata.totalWebsites}
              </span>
            </summary>
            <div className="mt-2 space-y-1 max-h-[200px] overflow-y-auto">
              {comparison.scanMetadata.websites.map((site, idx) => (
                <div 
                  key={idx} 
                  className="flex justify-between items-center text-xs p-2 bg-[var(--card)] rounded border border-[var(--border)]/50"
                >
                  <span className="font-medium">{site.name}</span>
                  <span className={`flex items-center gap-1 ${
                    site.status === 'found' ? 'text-[var(--success)]' : 
                    site.status === 'error' ? 'text-[var(--danger)]' : 
                    'text-[var(--muted)]'
                  }`}>
                    {site.status === 'found' && (
                      <>
                        <span>✓</span>
                        <span>{site.resultsCount} נמצאו</span>
                      </>
                    )}
                    {site.status === 'error' && (
                      <>
                        <span>✗</span>
                        <span title={site.error}>שגיאה</span>
                      </>
                    )}
                    {site.status === 'not_found' && (
                      <>
                        <span>—</span>
                        <span>לא נמצא</span>
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      {/* Manual Search Links */}
      <div className="px-5 py-3 border-t-2 border-[var(--border)] bg-[var(--primary)]/5">
        <span className="text-[var(--primary)] text-sm font-bold flex items-center gap-2">
          🔎 חיפוש ידני
        </span>
      </div>
      <div className="p-4 space-y-2">
        <p className="text-xs text-[var(--muted)] mb-3">חפש במנועי חיפוש ואתרי מסחר נוספים:</p>
        <ManualSearchLinks productName={product.name} />
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

function ManualSearchLinks({ productName }: { productName: string }) {
  const searchQuery = encodeURIComponent(productName);
  
  // Helper to build search URLs
  const buildSearchUrl = (baseUrl: string) => {
    // Normalize URL
    let url = baseUrl;
    if (!url.startsWith('http')) {
      url = `https://${url}`;
    }
    if (!url.endsWith('/')) {
      url += '/';
    }
    
    // Common search patterns
    if (url.includes('zap.co.il')) {
      return `https://www.zap.co.il/search.aspx?keyword=${searchQuery}`;
    }
    
    // Default: try ?s= or ?q= or just append search path
    return `${url}?s=${searchQuery}`;
  };
  
  const musicStores = [
    { name: 'Bconnect', url: 'https://bconnect.co.il' },
    { name: 'Diez', url: 'https://diez.co.il/' },
    { name: 'Next-Pro', url: 'https://www.next-pro.co.il/' },
    { name: 'הד סאונד', url: 'https://headsound.co.il/' },
    { name: 'טרטל', url: 'https://www.turtle.co.il/' },
    { name: 'עולם המוסיקה', url: 'https://www.musicworld.co.il/' },
    { name: 'מג\'יקל נוטס', url: 'https://www.magical-notes.co.il/' },
    { name: 'אודיולאב', url: 'https://audiolab.co.il/' },
    { name: 'לבמה', url: 'https://la-bama.co.il/' },
    { name: 'מיוזיק סנטר', url: 'https://www.music-center.co.il/' },
    { name: 'אסקול', url: 'https://www.askol.co.il/' },
    { name: 'Speed of sound', url: 'https://www.speedofsound.co.il/' },
    { name: 'Ginges', url: 'https://www.ginges.co.il/' },
    { name: 'Signal', url: 'https://www.signal-audio.co.il/' },
    { name: 'Orior', url: 'https://www.orior.co.il/' },
    { name: 'Kilombo', url: 'https://kilombo.co.il' },
    { name: 'FunkyDJ', url: 'https://www.funkydj.co.il/' },
    { name: 'שלמון', url: 'https://shalmonmusic.co.il/' },
    { name: 'קול המוסיקה', url: 'https://kolhamusica.com/' },
    { name: 'חלילית', url: 'https://www.halilit.com/' },
    { name: 'מצלול', url: 'https://mitzlol.com' },
    { name: 'פעימות', url: 'https://peimot.com' },
    { name: 'אפקט', url: 'https://www.effect.co.il/' },
    { name: 'שכטר', url: 'https://shechtermusic.com' },
    { name: 'סאונד צ\'ק', url: 'https://www.sound-check.co.il/' },
    { name: 'דראם בית', url: 'https://www.drumbite.co.il/' },
  ];
  
  const electronicsStores = [
    { name: 'KSP', url: 'https://ksp.co.il' },
    { name: 'Ivory', url: 'https://www.ivory.co.il' },
    { name: 'BUG', url: 'https://www.bug.co.il' },
    { name: 'לידר', url: 'https://www.leadercomputers.co.il/' },
    { name: 'Wallashops', url: 'https://www.wallashops.co.il' },
    { name: 'מחסני חשמל', url: 'https://www.payngo.co.il' },
    { name: 'Olsale', url: 'https://www.olsale.co.il' },
    { name: 'LastPrice', url: 'https://www.lastprice.co.il' },
    { name: 'Kravitz', url: 'https://www.kravitz.co.il' },
    { name: 'HTZone', url: 'https://www.htzone.co.il' },
    { name: 'ALM', url: 'https://www.alm.co.il' },
    { name: 'Gamestorm', url: 'https://www.gamestorm.co.il/' },
    { name: 'ZapStore', url: 'https://shop.zap.co.il/' },
  ];
  
  const internationalStores = [
    { name: 'Sweetwater', url: 'https://www.sweetwater.com' },
    { name: 'Thomann', url: 'https://www.thomann.de' },
    { name: 'Thomann Music', url: 'https://www.thomannmusic.com/' },
  ];

  return (
    <div className="space-y-3">
      {/* Quick Search - Zap & Google */}
      <div className="flex gap-2">
        <a
          href={`https://www.zap.co.il/search.aspx?keyword=${searchQuery}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-2 p-2.5 rounded-lg border bg-blue-500/10 border-blue-500/30 hover:bg-blue-500/20 transition-all text-sm font-medium"
        >
          <span>🔍</span>
          <span>Zap</span>
        </a>
        <a
          href={`https://www.google.com/search?q=${searchQuery}+מחיר+ישראל`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-2 p-2.5 rounded-lg border bg-green-500/10 border-green-500/30 hover:bg-green-500/20 transition-all text-sm font-medium"
        >
          <span>🌐</span>
          <span>Google</span>
        </a>
      </div>

      {/* Expandable sections */}
      <details className="group">
        <summary className="cursor-pointer p-2 rounded bg-[var(--background)] hover:bg-[var(--border)]/30 transition-all text-xs font-medium list-none flex items-center justify-between">
          <span>🎵 חנויות מוסיקה ({musicStores.length})</span>
          <span className="group-open:rotate-180 transition-transform">▼</span>
        </summary>
        <div className="mt-2 grid grid-cols-2 gap-1.5 max-h-[200px] overflow-y-auto p-1">
          {musicStores.map((site) => (
            <a
              key={site.name}
              href={buildSearchUrl(site.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 p-2 rounded border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--primary)]/5 hover:border-[var(--primary)]/30 transition-all text-xs"
            >
              <span className="truncate">{site.name}</span>
              <span className="mr-auto text-[10px] opacity-50">→</span>
            </a>
          ))}
        </div>
      </details>

      <details className="group">
        <summary className="cursor-pointer p-2 rounded bg-[var(--background)] hover:bg-[var(--border)]/30 transition-all text-xs font-medium list-none flex items-center justify-between">
          <span>💻 חנויות אלקטרוניקה ({electronicsStores.length})</span>
          <span className="group-open:rotate-180 transition-transform">▼</span>
        </summary>
        <div className="mt-2 grid grid-cols-2 gap-1.5 max-h-[200px] overflow-y-auto p-1">
          {electronicsStores.map((site) => (
            <a
              key={site.name}
              href={buildSearchUrl(site.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 p-2 rounded border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--primary)]/5 hover:border-[var(--primary)]/30 transition-all text-xs"
            >
              <span className="truncate">{site.name}</span>
              <span className="mr-auto text-[10px] opacity-50">→</span>
            </a>
          ))}
        </div>
      </details>

      <details className="group">
        <summary className="cursor-pointer p-2 rounded bg-[var(--background)] hover:bg-[var(--border)]/30 transition-all text-xs font-medium list-none flex items-center justify-between">
          <span>🌍 אתרים בינלאומיים ({internationalStores.length})</span>
          <span className="group-open:rotate-180 transition-transform">▼</span>
        </summary>
        <div className="mt-2 grid grid-cols-2 gap-1.5 p-1">
          {internationalStores.map((site) => (
            <a
              key={site.name}
              href={buildSearchUrl(site.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 p-2 rounded border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--primary)]/5 hover:border-[var(--primary)]/30 transition-all text-xs"
            >
              <span className="truncate">{site.name}</span>
              <span className="mr-auto text-[10px] opacity-50">→</span>
            </a>
          ))}
        </div>
      </details>
    </div>
  );
}
