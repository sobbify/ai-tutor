import { cn } from '@/lib/cn';

/** Thin linear progress, e.g. "Response 2 of 5". */
export function ProgressBar({ value, max, label, className }: { value: number; max: number; label: string; className?: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn('h-2 overflow-hidden rounded-full bg-line', className)}
    >
      <div className="h-full rounded-full bg-action transition-[width] duration-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

export type SegmentState = 'done' | 'current' | 'idle';

/** One segment per moment: done = green, current = blue, rest grey. */
export function SegmentedProgress({ segments, label, className }: { segments: SegmentState[]; label: string; className?: string }) {
  const done = segments.filter((s) => s === 'done').length;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={segments.length}
      aria-valuenow={done}
      className={cn('flex gap-1.5', className)}
    >
      {segments.map((state, i) => (
        <span
          // Segments are positional and never reorder, so the index is a stable key.
          key={i}
          className={cn(
            'h-2 flex-1 rounded-full',
            state === 'done' && 'bg-ok',
            state === 'current' && 'bg-action',
            state === 'idle' && 'bg-line',
          )}
        />
      ))}
    </div>
  );
}
