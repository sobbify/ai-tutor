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

/** End-of-session reward, like Duolingo's XP: "+17 ❄ snowflakes earned · 52 this week", on one line. */
export function SnowflakeReward({ snowflakes }: { snowflakes: SnowflakesEarned }) {
  const shown = useCountUp(snowflakes.earned);
  if (snowflakes.earned <= 0) return null;
  return (
    <section aria-labelledby="snowflake-reward" className="mt-3 flex animate-rise flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[22px] border-2 border-[#7fd3ff] bg-surface px-4 py-3">
      <h2 id="snowflake-reward" className="sr-only">
        {t.snowflakes.earnedLabel(snowflakes.earned)}
      </h2>
      <span className="flex shrink-0 items-center gap-1.5" aria-hidden="true">
        <Snowflake size={34} className="animate-pop" />
        <span className="snowflake-gradient text-[30px] leading-none font-extrabold tabular-nums">{t.snowflakes.earned(shown)}</span>
      </span>
      <span className="flex-1 text-[14px] leading-[19px] font-bold whitespace-nowrap text-ink-2" aria-hidden="true">
        {t.snowflakes.earnedShort}
      </span>
      <span className="shrink-0 rounded-full bg-sky px-2.5 py-0.5 text-[12.5px] leading-5 font-bold whitespace-nowrap text-action">
        <span className="sr-only">{t.snowflakes.weekLabel(snowflakes.week)}</span>
        <span aria-hidden="true">{t.snowflakes.thisWeek(snowflakes.week)}</span>
      </span>
    </section>
  );
}
