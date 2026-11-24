import { useId } from 'react';
import { cn } from '@/lib/cn';

/**
 * ELSA's XP: a chunky, colourful snowflake (Buddy's World illustrated-icon style, like Duolingo's
 * XP bolt). Decorative: always paired with a number and words.
 */
export function Snowflake({ size = 24, className }: { size?: number; className?: string }) {
  const id = useId();
  const arms = [0, 60, 120, 180, 240, 300];
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false" className={cn('shrink-0', className)}>
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7fd3ff" />
          <stop offset="1" stopColor="#1f92fc" />
        </linearGradient>
      </defs>
      <g stroke={`url(#${id}-g)`} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" fill="none">
        {arms.map((deg) => (
          <g key={deg} transform={`rotate(${deg} 16 16)`}>
            <path d="M16 16V3.5" />
            <path d="m12.2 6.6 3.8 3 3.8-3" />
          </g>
        ))}
      </g>
      <circle cx="16" cy="16" r="3.2" fill="#fff" stroke="#1f92fc" strokeWidth="1.6" />
    </svg>
  );
}

/** A number of snowflakes as a pill: "❄ 45". `label` is what screen readers hear. */
export function SnowflakeCount({ value, label, className }: { value: number | string; label: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 font-extrabold tabular-nums', className)} aria-label={label} role="img">
      <Snowflake size={18} />
      <span aria-hidden="true">{value}</span>
    </span>
  );
}
