'use client';

interface AlertBadgeProps {
  count: number;
}

export default function AlertBadge({ count }: AlertBadgeProps) {
  if (count === 0) return null;

  return (
    <span className="relative flex h-6 w-6 items-center justify-center">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--danger)] opacity-75"></span>
      <span className="relative inline-flex rounded-full h-6 w-6 bg-[var(--danger)] items-center justify-center text-xs font-bold text-white">
        {count > 99 ? '99+' : count}
      </span>
    </span>
  );
}

