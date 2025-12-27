'use client';

import { PriceSource } from '@/lib/types';

interface SourceSelectorProps {
  value: PriceSource;
  onChange: (source: PriceSource) => void;
  hasApiKey: boolean;
}

const sources: Array<{
  id: PriceSource;
  name: string;
  description: string;
  icon: string;
  requiresApiKey: boolean;
  recommended?: boolean;
}> = [
  {
    id: 'zap',
    name: 'Zap.co.il',
    description: 'חינם! מחירים בזמן אמת מ-100+ חנויות',
    icon: '🏷️',
    requiresApiKey: false,
    recommended: true,
  },
  {
    id: 'combined',
    name: 'Zap + חיפוש נוסף',
    description: 'Zap ראשי + Google/Brave אם יש API key',
    icon: '⚡',
    requiresApiKey: false,
  },
  {
    id: 'serpapi',
    name: 'Google Search',
    description: 'חיפוש ב-Google Shopping (בתשלום)',
    icon: '🔍',
    requiresApiKey: true,
  },
  {
    id: 'manual',
    name: 'ייבוא ידני',
    description: 'מחירים שיובאו ידנית מ-CSV',
    icon: '📋',
    requiresApiKey: false,
  },
];

export default function SourceSelector({
  value,
  onChange,
  hasApiKey,
}: SourceSelectorProps) {
  return (
    <div className="glass rounded-xl p-6">
      <h3 className="font-semibold mb-4">מקור מחירים</h3>
      
      <div className="space-y-3">
        {sources.map((source) => {
          const isDisabled = source.requiresApiKey && !hasApiKey;
          const isSelected = value === source.id;
          
          return (
            <button
              key={source.id}
              onClick={() => !isDisabled && onChange(source.id)}
              disabled={isDisabled}
              className={`w-full p-4 rounded-lg border text-left transition-all ${
                isSelected
                  ? 'border-[var(--primary)] bg-[var(--primary)]/10'
                  : isDisabled
                  ? 'border-[var(--border)] opacity-50 cursor-not-allowed'
                  : source.recommended
                  ? 'border-[var(--success)]/50 hover:border-[var(--success)]'
                  : 'border-[var(--border)] hover:border-[var(--primary)]/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{source.icon}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{source.name}</span>
                    {isSelected && (
                      <span className="badge badge-success text-xs">פעיל</span>
                    )}
                    {source.recommended && !isSelected && (
                      <span className="badge bg-[var(--success)]/20 text-[var(--success)] text-xs">מומלץ</span>
                    )}
                    {isDisabled && (
                      <span className="badge badge-warning text-xs">נדרש API Key</span>
                    )}
                  </div>
                  <p className="text-sm text-[var(--muted)]">{source.description}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

