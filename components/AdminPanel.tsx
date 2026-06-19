'use client';

import { useEffect, useMemo, useState } from 'react';
import type { AppSettings, IgnoredMatch, ScraperConfig, ScheduleConfig, ScheduleFrequency } from '@/lib/types';

interface AdminPanelProps {
  settings: AppSettings;
  ignoredMatches: IgnoredMatch[];
  onRestoreIgnoredMatch: (id: number) => Promise<void>;
  onRefresh: () => Promise<void>;
  onOpenSettings: () => void;
  onSaveSettings: (patch: Partial<AppSettings>) => Promise<void>;
}

const EMPTY_SCRAPER: Partial<ScraperConfig> = {
  name: '',
  baseUrl: '',
  enabled: true,
  priority: 5,
  searchPattern: '/?s={query}',
  category: 'general',
};

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);

function toUiErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const err = error as Record<string, unknown>;
    if (typeof err.message === 'string' && err.message.trim()) return err.message;
    try {
      return JSON.stringify(error);
    } catch {
      return '[object error]';
    }
  }
  return 'שגיאה לא ידועה';
}

export default function AdminPanel({
  settings,
  ignoredMatches,
  onRestoreIgnoredMatch,
  onRefresh,
  onOpenSettings,
  onSaveSettings,
}: AdminPanelProps) {
  const [scrapers, setScrapers] = useState<ScraperConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [filter, setFilter] = useState<'all' | 'enabled' | 'music' | 'electronics'>('all');

  const [showAddForm, setShowAddForm] = useState(false);
  const [newScraper, setNewScraper] = useState<Partial<ScraperConfig>>({ ...EMPTY_SCRAPER });
  const [addingNew, setAddingNew] = useState(false);

  const schedule = settings.schedule ?? {
    enabled: false,
    frequency: 'off' as ScheduleFrequency,
    hour: 8,
    timezone: 'Asia/Jerusalem',
  };
  const [localSchedule, setLocalSchedule] = useState<ScheduleConfig>(schedule);
  const [savingSchedule, setSavingSchedule] = useState(false);

  useEffect(() => {
    setLocalSchedule(schedule);
  }, [
    settings.schedule?.enabled,
    settings.schedule?.frequency,
    settings.schedule?.hour,
    settings.schedule?.timezone,
  ]);

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
    if (filter === 'enabled') return scrapers.filter((s) => s.enabled);
    if (filter === 'music') return scrapers.filter((s) => s.category === 'music');
    if (filter === 'electronics') return scrapers.filter((s) => s.category === 'electronics');
    return scrapers;
  }, [filter, scrapers]);

  const updateScraper = (id: string, patch: Partial<ScraperConfig>) => {
    setScrapers((current) =>
      current.map((s) => (s.id === id ? { ...s, ...patch } : s))
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
      if (!result.success) throw new Error(result.error || 'Failed to save');
      setScrapers(result.data || []);
    } catch (error) {
      console.error('Failed to save scrapers:', error);
      alert('שגיאה בשמירת רשימת האתרים');
    } finally {
      setSaving(false);
    }
  };

  const addNewScraper = async () => {
    if (!newScraper.name?.trim() || !newScraper.baseUrl?.trim()) {
      alert('שם אתר וכתובת URL הם שדות חובה');
      return;
    }
    setAddingNew(true);
    try {
      const response = await fetch('/api/scrapers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scraper: newScraper }),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to add');
      setScrapers(result.data || []);
      setNewScraper({ ...EMPTY_SCRAPER });
      setShowAddForm(false);
    } catch (error) {
      console.error('Failed to add scraper:', error);
      alert('שגיאה בהוספת אתר');
    } finally {
      setAddingNew(false);
    }
  };

  const deleteScraper = async (id: string, name: string) => {
    if (!confirm(`למחוק את "${name}"?`)) return;
    try {
      const response = await fetch('/api/scrapers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to delete');
      setScrapers((current) => current.filter((s) => s.id !== id));
    } catch (error) {
      console.error('Failed to delete scraper:', error);
      alert('שגיאה במחיקת אתר');
    }
  };

  const clearCache = async () => {
    if (!confirm('למחוק את כל תוצאות המטמון?')) return;
    await fetch('/api/prices', { method: 'DELETE' });
    await onRefresh();
  };

  const saveSchedule = async () => {
    setSavingSchedule(true);
    try {
      const enabled = localSchedule.frequency !== 'off';
      const scheduleToSave: ScheduleConfig = { ...localSchedule, enabled };

      const res = await fetch('/api/settings/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule: scheduleToSave }),
      });
      const result = await res.json();

      if (!result.success) {
        const apiError =
          typeof result.error === 'string'
            ? result.error
            : toUiErrorMessage(result.error);
        throw new Error(apiError || 'Failed to save schedule');
      }
      await onRefresh();
    } catch (error) {
      console.error('Failed to save schedule:', error);
      const msg = toUiErrorMessage(error);
      alert(`שגיאה בשמירת לוח זמנים: ${msg}`);
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleRestoreIgnored = async (id: number) => {
    setRestoringId(id);
    try {
      await onRestoreIgnoredMatch(id);
    } catch (error) {
      alert(toUiErrorMessage(error));
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-lg p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold gradient-text">אדמין סריקות</h2>
            <p className="text-sm text-[var(--muted)] mt-1">
              שליטה על מדיניות הסריקה, האתרים הפעילים, לוח זמנים ומטמון התוצאות.
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

      {/* Schedule card */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-lg p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="text-lg font-bold">🕐 סריקה מתוזמנת</h3>
          <button
            onClick={saveSchedule}
            disabled={savingSchedule}
            className="btn-primary text-sm"
          >
            {savingSchedule ? 'שומר...' : 'שמור לוח זמנים'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">תדירות</label>
            <select
              value={localSchedule.frequency}
              onChange={(e) =>
                setLocalSchedule((prev) => ({
                  ...prev,
                  frequency: e.target.value as ScheduleFrequency,
                  enabled: e.target.value !== 'off',
                }))
              }
              className="w-full"
            >
              <option value="off">כבוי</option>
              <option value="daily">יומי</option>
              <option value="weekly">שבועי</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">שעה</label>
            <select
              value={localSchedule.hour}
              onChange={(e) =>
                setLocalSchedule((prev) => ({ ...prev, hour: Number(e.target.value) }))
              }
              className="w-full"
              disabled={localSchedule.frequency === 'off'}
            >
              {HOUR_OPTIONS.map((h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}:00
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">אזור זמן</label>
            <select
              value={localSchedule.timezone}
              onChange={(e) =>
                setLocalSchedule((prev) => ({ ...prev, timezone: e.target.value }))
              }
              className="w-full"
              disabled={localSchedule.frequency === 'off'}
            >
              <option value="Asia/Jerusalem">ישראל (Asia/Jerusalem)</option>
              <option value="Europe/London">לונדון (GMT)</option>
              <option value="America/New_York">ניו יורק (EST)</option>
            </select>
          </div>
        </div>

        {localSchedule.frequency !== 'off' && (
          <p className="text-sm text-[var(--muted)] mt-3">
            הסריקה תרוץ {localSchedule.frequency === 'daily' ? 'כל יום' : 'פעם בשבוע'} בשעה{' '}
            <span className="font-bold text-[var(--primary)]">
              {String(localSchedule.hour).padStart(2, '0')}:00
            </span>{' '}
            ({localSchedule.timezone}).
            {schedule.lastRunAt && (
              <span className="block mt-1">
                הרצה אחרונה: {new Date(schedule.lastRunAt).toLocaleString('he-IL')}
              </span>
            )}
          </p>
        )}
      </div>

      {/* Ignored matches */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-lg overflow-hidden">
        <div className="p-4 border-b border-[var(--border)] flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold">🚫 תוצאות שהוסתרו</h3>
            <p className="text-sm text-[var(--muted)] mt-1">
              התאמות שסומנו כשגויות ולא יוצגו בדשבורד או בדוח.
            </p>
          </div>
          <span className="bg-[var(--background)] px-3 py-1 rounded-full text-sm font-medium">
            {ignoredMatches.length}
          </span>
        </div>

        {ignoredMatches.length === 0 ? (
          <div className="p-8 text-center text-[var(--muted)] text-sm">
            אין תוצאות מוסתרות כרגע.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>מוצר</th>
                  <th>ספק</th>
                  <th>קישור</th>
                  <th>הוסתר בתאריך</th>
                  <th className="w-24"></th>
                </tr>
              </thead>
              <tbody>
                {ignoredMatches.map((match) => (
                  <tr key={match.id}>
                    <td className="font-medium">{match.productName || match.barcode}</td>
                    <td>{match.providerName}</td>
                    <td>
                      {match.providerUrl ? (
                        <a
                          href={match.providerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--primary)] hover:underline text-sm"
                        >
                          קישור
                        </a>
                      ) : (
                        <span className="text-[var(--muted)] text-sm">—</span>
                      )}
                    </td>
                    <td className="text-sm text-[var(--muted)]">
                      {new Date(match.createdAt).toLocaleString('he-IL')}
                    </td>
                    <td>
                      <button
                        onClick={() => void handleRestoreIgnored(match.id)}
                        disabled={restoringId === match.id}
                        className="btn-secondary text-xs py-1.5 px-2"
                      >
                        {restoringId === match.id ? 'משחזר...' : 'שחזר'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Scrapers table */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-lg overflow-hidden">
        <div className="p-4 border-b border-[var(--border)] flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2 flex-wrap">
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
          <div className="flex gap-2">
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="btn-secondary text-sm"
            >
              {showAddForm ? '✕ סגור' : '+ הוסף אתר'}
            </button>
            <button onClick={saveScrapers} disabled={saving} className="btn-primary text-sm">
              {saving ? 'שומר...' : 'שמור שינויים'}
            </button>
          </div>
        </div>

        {showAddForm && (
          <div className="p-4 border-b border-[var(--border)] bg-[var(--primary)]/5">
            <h4 className="text-sm font-bold mb-3">הוסף אתר חדש</h4>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
              <div className="md:col-span-2">
                <label className="block text-xs text-[var(--muted)] mb-1">שם אתר *</label>
                <input
                  type="text"
                  value={newScraper.name || ''}
                  onChange={(e) => setNewScraper((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="לדוגמה: חנות החשמל"
                  className="w-full text-sm"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs text-[var(--muted)] mb-1">כתובת URL *</label>
                <input
                  type="text"
                  value={newScraper.baseUrl || ''}
                  onChange={(e) => setNewScraper((prev) => ({ ...prev, baseUrl: e.target.value }))}
                  placeholder="https://www.example.co.il"
                  className="w-full text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--muted)] mb-1">קטגוריה</label>
                <select
                  value={newScraper.category || 'general'}
                  onChange={(e) =>
                    setNewScraper((prev) => ({
                      ...prev,
                      category: e.target.value as ScraperConfig['category'],
                    }))
                  }
                  className="w-full text-sm"
                >
                  <option value="general">כללי</option>
                  <option value="music">מוסיקה</option>
                  <option value="electronics">אלקטרוניקה</option>
                </select>
              </div>
              <div>
                <button
                  onClick={addNewScraper}
                  disabled={addingNew}
                  className="btn-primary w-full text-sm"
                >
                  {addingNew ? 'מוסיף...' : '+ הוסף'}
                </button>
              </div>
            </div>
            <p className="text-xs text-[var(--muted)] mt-2">
              תבנית החיפוש תוגדר ל-<code>/?s={'{'}{'}query'}</code> כברירת מחדל. ניתן לשנות
              אחרי ההוספה.
            </p>
          </div>
        )}

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
                  <th className="w-12"></th>
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
                    <td>
                      <select
                        value={scraper.category || 'general'}
                        onChange={(e) =>
                          updateScraper(scraper.id, {
                            category: e.target.value as ScraperConfig['category'],
                          })
                        }
                        className="text-sm"
                      >
                        <option value="general">כללי</option>
                        <option value="music">מוסיקה</option>
                        <option value="electronics">אלקטרוניקה</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={scraper.priority}
                        onChange={(e) =>
                          updateScraper(scraper.id, { priority: Number(e.target.value) || 0 })
                        }
                        className="w-20"
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={scraper.searchPattern || ''}
                        onChange={(e) =>
                          updateScraper(scraper.id, { searchPattern: e.target.value })
                        }
                        className="min-w-[220px]"
                      />
                    </td>
                    <td>
                      <button
                        onClick={() => deleteScraper(scraper.id, scraper.name)}
                        className="text-[var(--danger)] hover:bg-[var(--danger)]/10 rounded p-1 text-sm"
                        title="מחק אתר"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="p-3 text-xs text-[var(--muted)] border-t border-[var(--border)]">
              סך הכל: {scrapers.length} אתרים ({scrapers.filter((s) => s.enabled).length} פעילים)
            </div>
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
