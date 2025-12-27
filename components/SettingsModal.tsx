'use client';

import { useState } from 'react';
import { PriceSource } from '@/lib/types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  threshold: number;
  priceSource: PriceSource;
  hasApiKey: boolean;
  onSave: (settings: {
    threshold: number;
    priceSource: PriceSource;
    serpApiKey?: string;
  }) => Promise<void>;
}

export default function SettingsModal({
  isOpen,
  onClose,
  threshold,
  priceSource,
  hasApiKey,
  onSave,
}: SettingsModalProps) {
  const [localThreshold, setLocalThreshold] = useState(threshold);
  const [localSource, setLocalSource] = useState(priceSource);
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        threshold: localThreshold,
        priceSource: localSource,
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
          <label className="block font-medium mb-2">מקור מחירים</label>
          <select
            value={localSource}
            onChange={(e) => setLocalSource(e.target.value as PriceSource)}
            className="w-full"
          >
            <option value="zap">🏷️ Zap.co.il - חינם, מדויק (מומלץ)</option>
            <option value="combined">⚡ Zap + חיפוש נוסף (אם יש API key)</option>
            <option value="serpapi">🔍 Google Search (בתשלום)</option>
            <option value="manual">📋 ייבוא ידני</option>
          </select>
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

