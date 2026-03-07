'use client';

import { Product, PriceComparison } from '@/lib/types';

type FilterType = 'all' | 'flagged' | 'unmatched' | 'good' | 'not-searched';

interface StatsPanelProps {
  products: Product[];
  priceData: { [barcode: string]: PriceComparison };
  threshold: number;
  isSearching: boolean;
  searchProgress: { current: number; total: number };
  onExport?: (category: FilterType) => void;
}

export default function StatsPanel({
  products,
  priceData,
  threshold,
  isSearching,
  searchProgress,
  onExport,
}: StatsPanelProps) {
  // Calculate stats
  const stats = {
    total: products.length,
    searched: 0,
    flagged: 0,
    notFound: 0,
    good: 0,
  };

  for (const product of products) {
    const comparison = priceData[product.barcode];
    
    if (!comparison) {
      continue;
    }
    
    stats.searched++;
    
    if (comparison.providers.length === 0) {
      stats.notFound++;
    } else if (comparison.flaggedProviders && comparison.flaggedProviders.length > 0) {
      stats.flagged++;
    } else {
      stats.good++;
    }
  }

  const notSearched = stats.total - stats.searched;
  const searchedPercent = stats.total > 0 ? Math.round((stats.searched / stats.total) * 100) : 0;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 md:px-5 py-3 border-b border-[var(--border)] bg-[var(--background)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h2 className="font-bold flex items-center gap-2">
          📊 סקירת מצב
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-sm text-[var(--muted)]">
            נסרקו {searchedPercent}% מהמוצרים
          </span>
          {onExport && (
            <button
              onClick={() => onExport('all')}
              className="text-xs px-3 py-1.5 rounded-lg bg-[var(--border)] hover:bg-[var(--primary)]/20 transition-colors"
            >
              📥 ייצא הכל
            </button>
          )}
        </div>
      </div>

      {/* Progress bar during search */}
      {isSearching && (
        <div className="px-5 py-3 bg-[var(--primary)]/5 border-b border-[var(--primary)]/20">
          <div className="flex justify-between text-sm mb-2">
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4 text-[var(--primary)]" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              סורק מוצרים...
            </span>
            <span className="text-[var(--primary)] font-bold">
              {searchProgress.current} / {searchProgress.total}
            </span>
          </div>
          <div className="h-2 bg-[var(--background)] rounded-full overflow-hidden">
            <div 
              className="h-full bg-[var(--primary)] transition-all duration-300"
              style={{ width: `${(searchProgress.current / searchProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div className="p-4 grid grid-cols-2 sm:grid-cols-5 gap-3">
        {/* Total */}
        <StatCard
          value={stats.total}
          label="סה״כ"
          icon="📦"
          colorClass="text-[var(--foreground)]"
          bgClass="bg-[var(--background)]"
          onExport={() => onExport?.('all')}
        />

        {/* Pending */}
        <StatCard
          value={notSearched}
          label="ממתינים"
          icon="⏳"
          colorClass="text-[var(--muted)]"
          bgClass="bg-gray-500/10"
          onExport={() => onExport?.('not-searched')}
        />

        {/* Flagged */}
        <StatCard
          value={stats.flagged}
          label="חריגים"
          icon="⚠️"
          colorClass="text-[var(--danger)]"
          bgClass="bg-[var(--danger)]/10"
          borderClass="border-[var(--danger)]/30"
          onExport={() => onExport?.('flagged')}
        />

        {/* Not found */}
        <StatCard
          value={stats.notFound}
          label="לא נמצאו"
          icon="🔍"
          colorClass="text-[var(--warning)]"
          bgClass="bg-[var(--warning)]/10"
          borderClass="border-[var(--warning)]/30"
          onExport={() => onExport?.('unmatched')}
        />

        {/* Good */}
        <StatCard
          value={stats.good}
          label="תקינים"
          icon="✅"
          colorClass="text-[var(--success)]"
          bgClass="bg-[var(--success)]/10"
          borderClass="border-[var(--success)]/30"
          onExport={() => onExport?.('good')}
        />
      </div>

      {/* Legend */}
      <div className="px-5 py-2 border-t border-[var(--border)] bg-[var(--background)] text-xs text-[var(--muted)] flex flex-wrap gap-4 justify-center">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[var(--danger)]"></span>
          חריגים: מחיר נמוך מ-{threshold}%
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[var(--warning)]"></span>
          לא נמצאו באתרים
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[var(--success)]"></span>
          תקינים
        </span>
      </div>
    </div>
  );
}

function StatCard({
  value,
  label,
  icon,
  colorClass,
  bgClass,
  borderClass = 'border-[var(--border)]',
  onExport,
}: {
  value: number;
  label: string;
  icon: string;
  colorClass: string;
  bgClass: string;
  borderClass?: string;
  onExport?: () => void;
}) {
  return (
    <div 
      className={`rounded-lg p-3 border ${bgClass} ${borderClass} group hover:scale-105 transition-transform cursor-pointer`}
      onClick={onExport}
      title="לחץ לייצוא CSV"
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-lg">{icon}</span>
        <span className="opacity-0 group-hover:opacity-100 transition-opacity text-xs">📥</span>
      </div>
      <div className={`text-2xl font-bold ${colorClass}`}>
        {value}
      </div>
      <div className="text-xs text-[var(--muted)]">
        {label}
      </div>
    </div>
  );
}
