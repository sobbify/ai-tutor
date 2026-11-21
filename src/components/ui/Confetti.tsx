import { memo, useMemo, type CSSProperties } from 'react';

const COLORS = ['#1f92fc', '#f7b733', '#ef6f6c', '#2fa585', '#8a5cd6', '#ffd36e'];

/**
 * A one-off shower of paper pieces for a celebration (moment finished, certificate earned).
 * Purely decorative: hidden from assistive tech, and with reduced motion it simply doesn't show.
 */
export const Confetti = memo(function Confetti({ pieces = 26 }: { pieces?: number }) {
  const bits = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => {
        const spread = (i / pieces) * 100;
        return {
          left: `${(spread + ((i * 37) % 11)) % 100}%`,
          delay: `${(i % 7) * 70}ms`,
          duration: `${1100 + ((i * 53) % 700)}ms`,
          drift: `${((i * 29) % 80) - 40}px`,
          turn: `${((i * 71) % 540) - 270}deg`,
          color: COLORS[i % COLORS.length],
          wide: i % 3 === 0,
        };
      }),
    [pieces],
  );
  return (
    <span className="pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden" aria-hidden="true">
      {bits.map((b, i) => (
        <span
          // Fixed list for this render.
          key={i}
          className="confetti-bit absolute top-0 block rounded-[2px]"
          style={
            {
              left: b.left,
              width: b.wide ? 10 : 6,
              height: b.wide ? 6 : 10,
              background: b.color,
              animationDelay: b.delay,
              animationDuration: b.duration,
              '--drift': b.drift,
              '--turn': b.turn,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
});
