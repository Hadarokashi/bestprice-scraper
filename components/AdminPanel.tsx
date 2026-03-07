'use client';

import { useEffect, useMemo, useState } from 'react';
import type { AppSettings, ScraperConfig } from '@/lib/types';

interface AdminPanelProps {
  settings: AppSettings;
  onRefresh: () => Promise<void>;
  onOpenSettings: () => void;
}

export default function AdminPanel({
  settings,
  onRefresh,
  onOpenSettings,
}: AdminPanelProps) {
  const [scrapers, setScrapers] = useState<ScraperConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<'all' | 'enabled' | 'music' | 'electronics'>('all');

  useEffect(() => {
    void fetchScrapers();
  }, []);

  const fetchScrapers = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/scrapers');
      const result = await response.json();
      if (result.success) {
        setScrapers(result.data || []);
      }
    } catch (error) {
      console.error('Failed to load scrapers:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredScrapers = useMemo(() => {
    if (filter === 'enabled') return scrapers.filter((scraper) => scraper.enabled);
    if (filter === 'music') return scrapers.filter((scraper) => scraper.category === 'music');
    if (filter === 'electronics') return scrapers.filter((scraper) => scraper.category === 'electronics');
    return scrapers;
  }, [filter, scrapers]);

  const updateScraper = (id: string, patch: Partial<ScraperConfig>) => {
    setScrapers((current) =>
      current.map((scraper) => (scraper.id === id ? { ...scraper, ...patch } : scraper))
    );
  };

  const saveScrapers = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/scrapers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scrapers }),
      });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to save scrapers');
      }
      setScrapers(result.data || []);
    } catch (error) {
      console.error('Failed to save scrapers:', error);
      alert('שגיאה בשמירת רשימת האתרים');
    } finally {
      setSaving(false);
    }
  };

  const clearCache = async () => {
    if (!confirm('למחוק את כל תוצאות המטמון?')) {
      return;
    }

    await fetch('/api/prices', { method: 'DELETE' });
    await onRefresh();
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-lg p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold gradient-text">אדמין סריקות</h2>
            <p className="text-sm text-[var(--muted)] mt-1">
              שליטה על מדיניות הסריקה, האתרים הפעילים ומטמון התוצאות.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={onOpenSettings} className="btn-secondary">
              ⚙️ מדיניות סריקה
            </button>
            <button onClick={() => void onRefresh()} className="btn-secondary">
              🔄 רענן נתונים
            </button>
            <button onClick={clearCache} className="btn-danger">
              🗑️ נקה מטמון
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-5">
          <SummaryCard label="מצב ברירת מחדל" value={settings.scanMode || 'zap_then_remaining'} />
          <SummaryCard label="Preset" value={settings.sitePreset || 'enabled'} />
          <SummaryCard label="מטמון (שעות)" value={String(settings.cacheFreshnessHours || 24)} />
          <SummaryCard label="Jobs במקביל" value={String(settings.maxConcurrentJobs || 2)} />
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-lg overflow-hidden">
        <div className="p-4 border-b border-[var(--border)] flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            {[
              ['all', 'הכל'],
              ['enabled', 'פעילים'],
              ['music', 'מוסיקה'],
              ['electronics', 'אלקטרוניקה'],
            ].map(([value, label]) => (
              <button
                key={value}
                onClick={() => setFilter(value as typeof filter)}
                className={`px-3 py-1.5 rounded-lg text-sm ${
                  filter === value
                    ? 'bg-[var(--primary)] text-white'
                    : 'bg-[var(--background)] border border-[var(--border)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button onClick={saveScrapers} disabled={saving} className="btn-primary">
            {saving ? 'שומר...' : 'שמור אתרים'}
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-[var(--muted)]">טוען רשימת אתרים...</div>
        ) : (
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>פעיל</th>
                  <th>שם אתר</th>
                  <th>קטגוריה</th>
                  <th>עדיפות</th>
                  <th>תבנית חיפוש</th>
                </tr>
              </thead>
              <tbody>
                {filteredScrapers.map((scraper) => (
                  <tr key={scraper.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={scraper.enabled}
                        onChange={(e) => updateScraper(scraper.id, { enabled: e.target.checked })}
                        className="w-4 h-4"
                      />
                    </td>
                    <td className="font-medium">{scraper.name}</td>
                    <td className="text-sm text-[var(--muted)]">{scraper.category || 'general'}</td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={scraper.priority}
                        onChange={(e) => updateScraper(scraper.id, { priority: Number(e.target.value) || 0 })}
                        className="w-24"
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={scraper.searchPattern || ''}
                        onChange={(e) => updateScraper(scraper.id, { searchPattern: e.target.value })}
                        className="min-w-[260px]"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4">
      <div className="text-xs text-[var(--muted)] mb-1">{label}</div>
      <div className="font-bold">{value}</div>
    </div>
  );
}
