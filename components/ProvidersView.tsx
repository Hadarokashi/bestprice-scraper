'use client';

import { useState, useEffect } from 'react';

interface ProviderProduct {
  productId: string;
  barcode: string;
  recommendedPrice: number;
  providerPrice: number;
  providerUrl: string;
  lastChecked: string;
  isFlagged: boolean;
  priceDifference: number;
  percentDifference: string;
}

interface ProviderData {
  name: string;
  totalProducts: number;
  flaggedProducts: number;
  products: ProviderProduct[];
}

export default function ProvidersView() {
  const [providers, setProviders] = useState<ProviderData[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'name' | 'products' | 'flagged'>('name');
  const [exporting, setExporting] = useState<string | null>(null);
  
  useEffect(() => {
    fetchProviders();
  }, []);
  
  const fetchProviders = async () => {
    try {
      const response = await fetch('/api/providers');
      const result = await response.json();
      if (result.success) {
        setProviders(result.data);
      }
    } catch (error) {
      console.error('Error fetching providers:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const handleExport = async (providerName: string) => {
    setExporting(providerName);
    try {
      const response = await fetch('/api/providers/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerName }),
      });
      
      if (!response.ok) {
        const errorResult = await response.json().catch(() => null);
        throw new Error(errorResult?.error || `Export failed (${response.status})`);
      }
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const disposition = response.headers.get('Content-Disposition') || '';
      const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
      a.download = utf8Match
        ? decodeURIComponent(utf8Match[1])
        : `${providerName}-report-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting provider:', error);
      alert(error instanceof Error ? error.message : 'שגיאה בייצוא הדוח');
    } finally {
      setExporting(null);
    }
  };
  
  const sortedProviders = [...providers].sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name, 'he');
    if (sortBy === 'products') return b.totalProducts - a.totalProducts;
    if (sortBy === 'flagged') return b.flaggedProducts - a.flaggedProducts;
    return 0;
  });
  
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[var(--primary)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[var(--muted)]">טוען ספקים...</p>
        </div>
      </div>
    );
  }
  
  if (providers.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-[var(--border)]/30 flex items-center justify-center">
          <span className="text-4xl">🏪</span>
        </div>
        <p className="text-[var(--muted)] mb-2">אין ספקים זמינים</p>
        <p className="text-sm text-[var(--muted)]">בדוק מחירים כדי למצוא ספקים</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Header with sort options */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold gradient-text">ספקים</h2>
          <p className="text-[var(--muted)] text-sm mt-1">
            נמצאו {providers.length} ספקים עם {providers.reduce((sum, p) => sum + p.totalProducts, 0)} מוצרים
          </p>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={() => setSortBy('name')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              sortBy === 'name'
                ? 'bg-[var(--primary)] text-white'
                : 'bg-[var(--background)] border border-[var(--border)] hover:bg-[var(--border)]/30'
            }`}
          >
            לפי שם
          </button>
          <button
            onClick={() => setSortBy('products')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              sortBy === 'products'
                ? 'bg-[var(--primary)] text-white'
                : 'bg-[var(--background)] border border-[var(--border)] hover:bg-[var(--border)]/30'
            }`}
          >
            לפי מוצרים
          </button>
          <button
            onClick={() => setSortBy('flagged')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              sortBy === 'flagged'
                ? 'bg-[var(--primary)] text-white'
                : 'bg-[var(--background)] border border-[var(--border)] hover:bg-[var(--border)]/30'
            }`}
          >
            לפי חריגים
          </button>
        </div>
      </div>
      
      {/* Provider cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {sortedProviders.map(provider => (
          <div
            key={provider.name}
            className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-lg hover:shadow-xl transition-shadow"
          >
            <h3 className="font-bold text-lg mb-4 truncate" title={provider.name}>
              {provider.name}
            </h3>
            
            <div className="space-y-3 mb-4">
              <div className="flex justify-between items-center text-sm">
                <span className="text-[var(--muted)]">מוצרים שנמצאו:</span>
                <span className="font-bold text-[var(--primary)]">{provider.totalProducts}</span>
              </div>
              
              {provider.flaggedProducts > 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-[var(--muted)]">חריגים:</span>
                  <span className="font-bold text-[var(--danger)] flex items-center gap-1">
                    <span>⚠️</span>
                    {provider.flaggedProducts}
                  </span>
                </div>
              )}
              
              <div className="flex justify-between items-center text-sm">
                <span className="text-[var(--muted)]">תקינים:</span>
                <span className="font-bold text-[var(--success)]">
                  {provider.totalProducts - provider.flaggedProducts}
                </span>
              </div>
              
              <div className="pt-2 border-t border-[var(--border)]">
                <div className="text-xs text-[var(--muted)]">שיעור חריגים</div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-2 bg-[var(--background)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--danger)] transition-all"
                      style={{
                        width: `${(provider.flaggedProducts / provider.totalProducts) * 100}%`
                      }}
                    />
                  </div>
                  <span className="text-xs font-medium">
                    {((provider.flaggedProducts / provider.totalProducts) * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>
            
            <button
              onClick={() => handleExport(provider.name)}
              disabled={exporting === provider.name}
              className="w-full py-2.5 px-4 rounded-lg bg-[var(--primary)] text-white font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {exporting === provider.name ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  מייצא...
                </>
              ) : (
                <>
                  📊 ייצא דוח CSV
                </>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
