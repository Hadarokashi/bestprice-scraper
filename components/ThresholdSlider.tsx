'use client';

interface ThresholdSliderProps {
  value: number;
  onChange: (value: number) => void;
}

export default function ThresholdSlider({ value, onChange }: ThresholdSliderProps) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-lg overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-[var(--border)] bg-[var(--warning)]/5 flex items-center justify-between">
        <h3 className="font-bold flex items-center gap-2">
          🎯 סף התראה
        </h3>
        <span className="text-2xl font-bold text-[var(--warning)]">{value}%</span>
      </div>
      
      {/* Slider */}
      <div className="p-5">
        <input
          type="range"
          min="1"
          max="50"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full"
        />
        
        <div className="flex justify-between text-xs text-[var(--muted)] mt-2">
          <span>1%</span>
          <span>25%</span>
          <span>50%</span>
        </div>
        
        <p className="text-sm text-[var(--muted)] mt-4 p-3 rounded-lg bg-[var(--background)] border border-[var(--border)]">
          ⚠️ ספקים שמוכרים במחיר הנמוך ב-<span className="text-[var(--warning)] font-bold">{value}%</span> או יותר מהמחיר המומלץ יסומנו כחריגים
        </p>
      </div>
    </div>
  );
}
