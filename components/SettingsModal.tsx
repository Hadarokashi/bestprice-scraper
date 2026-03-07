'use client';

import { useEffect, useState } from 'react';
import { PriceSource, ScanMode, ScanSitePreset } from '@/lib/types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  threshold: number;
  priceSource: PriceSource;
  scanMode?: ScanMode;
  sitePreset?: ScanSitePreset;
  cacheFreshnessHours?: number;
  maxConcurrentJobs?: number;
  hasApiKey: boolean;
  onSave: (settings: {
    threshold: number;
    priceSource: PriceSource;
    scanMode: ScanMode;
    sitePreset: ScanSitePreset;
    cacheFreshnessHours: number;
    maxConcurrentJobs: number;
    serpApiKey?: string;
  }) => Promise<void>;
}

export default function SettingsModal({
  isOpen,
  onClose,
  threshold,
  priceSource,
  scanMode = 'zap_then_remaining',
  sitePreset = 'enabled',
  cacheFreshnessHours = 24,
  maxConcurrentJobs = 2,
  hasApiKey,
  onSave,
}: SettingsModalProps) {
  const [localThreshold, setLocalThreshold] = useState(threshold);
  const [localSource, setLocalSource] = useState(priceSource);
  const [localScanMode, setLocalScanMode] = useState<ScanMode>(scanMode);
  const [localSitePreset, setLocalSitePreset] = useState<ScanSitePreset>(sitePreset);
  const [localCacheFreshness, setLocalCacheFreshness] = useState(cacheFreshnessHours);
  const [localMaxConcurrentJobs, setLocalMaxConcurrentJobs] = useState(maxConcurrentJobs);
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLocalThreshold(threshold);
    setLocalSource(priceSource);
    setLocalScanMode(scanMode);
    setLocalSitePreset(sitePreset);
    setLocalCacheFreshness(cacheFreshnessHours);
    setLocalMaxConcurrentJobs(maxConcurrentJobs);
  }, [isOpen, threshold, priceSource, scanMode, sitePreset, cacheFreshnessHours, maxConcurrentJobs]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        threshold: localThreshold,
        priceSource: localSource,
        scanMode: localScanMode,
        sitePreset: localSitePreset,
        cacheFreshnessHours: localCacheFreshness,
        maxConcurrentJobs: localMaxConcurrentJobs,
        serpApiKey: apiKey || undefined,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative glass rounded-2xl p-8 max-w-lg w-full mx-4 animate-fade-in">
        <h2 className="text-2xl font-bold mb-6">הגדרות</h2>
        
        {/* Threshold */}
        <div className="mb-6">
          <label className="block font-medium mb-2">
            סף התראה: <span className="text-[var(--primary)]">{localThreshold}%</span>
          </label>
          <input
            type="range"
            min="1"
            max="50"
            value={localThreshold}
            onChange={(e) => setLocalThreshold(Number(e.target.value))}
            className="w-full"
          />
          <p className="text-sm text-[var(--muted)] mt-2">
            ספקים שמוכרים ב-{localThreshold}% פחות מהמחיר המומלץ יסומנו
          </p>
        </div>
        
        {/* Price Source */}
        <div className="mb-6">
          <label className="block font-medium mb-2">מדיניות סריקה</label>
          <select
            value={localScanMode}
            onChange={(e) => setLocalScanMode(e.target.value as ScanMode)}
            className="w-full"
          >
            <option value="zap_then_remaining">Zap ואז אתרים חסרים</option>
            <option value="zap_only">Zap בלבד</option>
            <option value="playwright_only">Playwright בלבד</option>
            <option value="selected_sites">רק אתרים שנבחרו</option>
            <option value="retry_failed">רק אתרים שנכשלו</option>
          </select>
          <p className="text-sm text-[var(--muted)] mt-2">
            המצב המומלץ: Zap מחזיר תוצאות מהר, ואז המערכת ממשיכה ברקע לאתרים הנותרים.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block font-medium mb-2">Preset אתרים</label>
            <select
              value={localSitePreset}
              onChange={(e) => setLocalSitePreset(e.target.value as ScanSitePreset)}
              className="w-full"
            >
              <option value="enabled">כל האתרים הפעילים</option>
              <option value="music">חנויות מוסיקה בלבד</option>
              <option value="electronics">חנויות אלקטרוניקה בלבד</option>
              <option value="selected">רק אתרים שסומנו באדמין</option>
            </select>
          </div>
          <div>
            <label className="block font-medium mb-2">מקור מחירים משלים</label>
            <select
              value={localSource}
              onChange={(e) => setLocalSource(e.target.value as PriceSource)}
              className="w-full"
            >
              <option value="zap">Zap בלבד</option>
              <option value="combined">Zap + חיפוש נוסף</option>
              <option value="serpapi">SerpAPI</option>
              <option value="manual">ייבוא ידני</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block font-medium mb-2">רענון מטמון (שעות)</label>
            <input
              type="number"
              min="1"
              max="168"
              value={localCacheFreshness}
              onChange={(e) => setLocalCacheFreshness(Number(e.target.value) || 24)}
              className="w-full"
            />
            <p className="text-sm text-[var(--muted)] mt-2">
              מעל מספר השעות הזה, התוצאה תיחשב ישנה וניתן יהיה לרענן אותה.
            </p>
          </div>
          <div>
            <label className="block font-medium mb-2">Jobs במקביל</label>
            <input
              type="number"
              min="1"
              max="5"
              value={localMaxConcurrentJobs}
              onChange={(e) => setLocalMaxConcurrentJobs(Number(e.target.value) || 2)}
              className="w-full"
            />
            <p className="text-sm text-[var(--muted)] mt-2">
              קובע כמה מוצרים ירוצו במקביל בזמן בדיקה מרובה.
            </p>
          </div>
        </div>

        {/* API Key */}
        <div className="mb-6">
          <label className="block font-medium mb-2">
            SerpAPI Key
            {hasApiKey && (
              <span className="badge badge-success text-xs mr-2">מוגדר</span>
            )}
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={hasApiKey ? '••••••••' : 'הזן API key חדש'}
            className="w-full"
          />
          <p className="text-sm text-[var(--muted)] mt-2">
            קבל API key חינם מ-{' '}
            <a
              href="https://serpapi.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--primary)] hover:underline"
            >
              serpapi.com
            </a>
          </p>
        </div>
        
        {/* Actions */}
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">
            ביטול
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary flex-1"
          >
            {saving ? 'שומר...' : 'שמור הגדרות'}
          </button>
        </div>
      </div>
    </div>
  );
}

