import { useEffect, useState } from 'react';
import { t } from '@/i18n';
import { Snowflake } from '@/components/ui/Snowflake';
import type { SnowflakesEarned } from '@/types/tutor';

/** Counts up to `to` (skipped when she prefers reduced motion). */
function useCountUp(to: number, ms = 900): number {
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [value, setValue] = useState(reduced ? to : 0);
  useEffect(() => {
    if (reduced) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / ms);
      setValue(Math.round(to * (1 - (1 - k) ** 3)));
      if (k < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [to, ms, reduced]);
  return value;
}

/** End-of-session reward, like Duolingo's XP screen: "+17 ❄" with what earned it and her week. */
export function SnowflakeReward({ snowflakes }: { snowflakes: SnowflakesEarned }) {
  const shown = useCountUp(snowflakes.earned);
  if (snowflakes.earned <= 0) return null;
  return (
    <section aria-labelledby="snowflake-reward" className="mt-3 animate-rise overflow-hidden rounded-[22px] border-2 border-[#7fd3ff] bg-surface">
      <h2 id="snowflake-reward" className="bg-[#126bc0] px-4 py-1.5 text-center text-[13px] font-extrabold tracking-[0.08em] text-white uppercase">
        {t.snowflakes.earnedLabel(snowflakes.earned)}
      </h2>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 px-4 py-3">
        <span className="flex items-center gap-1.5" aria-hidden="true">
          <Snowflake size={40} className="animate-pop" />
          <span className="text-[34px] leading-none font-extrabold text-action tabular-nums">{t.snowflakes.earned(shown)}</span>
        </span>
        {/* Reasons never wrap: on a narrow phone the list moves under the number instead. */}
        <ul className="min-w-[200px] flex-1 space-y-0.5 text-[13.5px] leading-5 font-semibold text-ink-2">
          {snowflakes.items.map((item) => (
            <li key={item.kind} className="flex items-baseline justify-between gap-3 whitespace-nowrap">
              <span>{t.snowflakes.items[item.kind] ?? item.kind}</span>
              <span className="font-extrabold text-ink tabular-nums">{t.snowflakes.earned(item.amount)}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="border-t border-line px-4 py-2 text-center text-[13px] font-bold text-ink-2">{t.snowflakes.weekLabel(snowflakes.week)}</p>
    </section>
  );
}
