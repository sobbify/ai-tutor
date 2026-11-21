import { useEffect, useRef, useState } from 'react';
import type { Stats } from './api';
import {  } from './ui';
import { fmtNumber } from './format';

/**
 * Replies per day (single series → no legend; the panel title names it). Columns ≤ 24px with a
 * rounded data end, hairline grid, per-column hover/focus tooltip, and a table view toggle. Colour: the app's action blue (validated against the surface).
 */
export function ActivityChart({ data }: { data: Stats['activity'] }) {
  const [active, setActive] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  // Draw at the real pixel width so text stays 11px on phones and wide screens alike.
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(720);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => entry && setW(Math.max(300, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [asTable]);
  const H = 220;
  const pad = { top: 16, right: 8, bottom: 26, left: 36 };
  const max = Math.max(4, ...data.map((d) => d.replies));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: Math.floor(top / step) + 1 }, (_, i) => i * step);
  const band = (W - pad.left - pad.right) / data.length;
  const barW = Math.min(24, band - 2);
  const y = (v: number) => pad.top + (H - pad.top - pad.bottom) * (1 - v / top);
  const point = active !== null ? data[active] : undefined;

  if (asTable) {
    return (
      <div>
        <ToggleView asTable onToggle={() => setAsTable(false)} />
        <div className="max-h-[260px] overflow-y-auto rounded-2xl border border-line/80">
          <table className="w-full text-left text-[14px]">
            <caption className="sr-only">Replies per day, last 30 days</caption>
            <thead className="sticky top-0 bg-mist text-[12.5px] font-bold text-ink-2 uppercase">
              <tr>
                <th scope="col" className="px-4 py-2">Date</th>
                <th scope="col" className="px-4 py-2">Replies</th>
                <th scope="col" className="px-4 py-2">Learners</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/70">
              {[...data].reverse().map((d) => (
                <tr key={d.date}>
                  <td className="px-4 py-2">{shortDate(d.date)}</td>
                  <td className="px-4 py-2 tabular-nums">{fmtNumber(d.replies)}</td>
                  <td className="px-4 py-2 tabular-nums">{fmtNumber(d.learners)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const labelEvery = W < 500 ? 10 : 7;
  return (
    <div className="relative" ref={box}>
      <ToggleView asTable={false} onToggle={() => setAsTable(true)} />
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block max-w-full" role="group" aria-label="Replies per day, last 30 days">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} stroke="#e8ebee" strokeWidth={1} />
            <text x={pad.left - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#565656">
              {fmtNumber(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = pad.left + i * band + (band - barW) / 2;
          const h = y(0) - y(d.replies);
          const r = Math.min(4, h / 2, barW / 2);
          return (
            <g key={d.date}>
              {d.replies > 0 && (
                <path
                  d={`M${x},${y(0)} V${y(d.replies) + r} Q${x},${y(d.replies)} ${x + r},${y(d.replies)} H${x + barW - r} Q${x + barW},${y(d.replies)} ${x + barW},${y(d.replies) + r} V${y(0)} Z`}
                  fill={active === i ? '#0032c4' : '#003ef2'}
                />
              )}
              {/* Hit target: the whole band, taller than the mark. */}
              <rect
                x={pad.left + i * band}
                y={pad.top}
                width={band}
                height={H - pad.top - pad.bottom}
                fill="transparent"
                role="img"
                tabIndex={0}
                aria-label={`${d.date}: ${d.replies} replies from ${d.learners} learners`}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              />
              {(i === data.length - 1 || (i % labelEvery === 0 && data.length - 1 - i >= labelEvery / 2)) && (
                <text x={pad.left + i * band + band / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="#565656">
                  {shortDate(d.date)}
                </text>
              )}
            </g>
          );
        })}
        <line x1={pad.left} x2={W - pad.right} y1={y(0)} y2={y(0)} stroke="#c9ced3" strokeWidth={1} />
      </svg>
      {point && active !== null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 rounded-xl bg-white px-3 py-2 text-[13px] whitespace-nowrap shadow-[0_6px_24px_rgb(0_0_0/0.15)]"
          style={{ left: `${((pad.left + active * band + band / 2) / W) * 100}%`, top: 0 }}
          aria-hidden="true"
        >
          <p className="font-bold">{shortDate(point.date)}</p>
          <p className="text-ink-2">
            {fmtNumber(point.replies)} replies · {fmtNumber(point.learners)} learners
          </p>
        </div>
      )}
    </div>
  );
}

function ToggleView({ asTable, onToggle }: { asTable: boolean; onToggle: () => void }) {
  return (
    <div className="mb-2 flex justify-end">
      <button type="button" onClick={onToggle} className="text-[13px] font-bold text-action underline-offset-4 hover:underline">
        {asTable ? 'View as chart' : 'View as table'}
      </button>
    </div>
  );
}

function niceStep(max: number) {
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? pow * 10;
}

function shortDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}
