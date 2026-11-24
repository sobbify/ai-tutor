import { memo, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import type { MomentProgress } from '@/types/tutor';
import { CheckIcon, LockIcon } from '@/components/ui/Icons';
import { Pill } from '@/components/ui/Pill';
import { MomentGlyph } from './MomentGlyph';
import { currentMomentId } from './journeyState';

/*
 * The winding-road map from the design. Horizontal positions are in % so the map stretches
 * from 360px to 480px wide; vertical positions are fixed px so text never gets squashed.
 * Design canvas: 390 × (56 + 102·(n−1) + 64).
 */
const DESIGN_WIDTH = 390;
const STEP = 102;
const TOP = 56;
const BOTTOM = 64;
const LEFT_X = 116;
const RIGHT_X = 276;
const GOAL_X = 170;


interface Point {
  x: number;
  y: number;
}

function layout(count: number) {
  const height = TOP + STEP * (count - 1) + BOTTOM;
  const points: Point[] = Array.from({ length: count }, (_, i) => {
    const y = height - BOTTOM - STEP * i;
    if (i === count - 1 && count > 1) return { x: GOAL_X, y };
    return { x: i % 2 === 0 ? LEFT_X : RIGHT_X, y };
  });
  return { height, points };
}

/** Smooth S-curve between two nodes (vertical tangents give the winding-road look). */
function segmentPath(a: Point, b: Point) {
  const mid = (a.y - b.y) * 0.55;
  return `M${a.x},${a.y} C${a.x},${a.y - mid} ${b.x},${b.y + mid} ${b.x},${b.y}`;
}

function statusLabel(m: MomentProgress) {
  switch (m.status) {
    case 'locked':
      return t.journey.locked;
    case 'done':
      return t.journey.doneSummary;
    case 'in_progress':
      return t.journey.responseOf(m.responsesDone + 1, m.responsesTotal);
    default:
      return t.journey.responses(m.responsesTotal);
  }
}

function destination(m: MomentProgress, isCurrent: boolean) {
  if (m.status === 'done' && !isCurrent) return `/moments/${m.id}/summary`;
  if (m.status === 'locked') return null;
  if (m.status === 'in_progress') return `/moments/${m.id}`;
  return `/moments/${m.id}/learn`; // a fresh start begins with the Learn step
}

export const JourneyMap = memo(function JourneyMap({ moments }: { moments: MomentProgress[] }) {
  const ordered = [...moments].sort((a, b) => a.order - b.order);
  const { height, points } = layout(ordered.length);
  const nodes = ordered.map((m, i) => ({ m, p: points[i] ?? { x: LEFT_X, y: TOP } }));
  const segments = nodes.slice(1).map((to, i) => ({ id: to.m.id, from: nodes[i]?.p ?? to.p, to: to.p, reached: to.m.status !== 'locked' }));
  const goal = nodes[nodes.length - 1]?.p ?? { x: GOAL_X, y: TOP };
  const current = currentMomentId(ordered);
  const pct = (x: number) => `${(x / DESIGN_WIDTH) * 100}%`;

  return (
    <section aria-label={t.journey.mapLabel} className="relative w-full overflow-hidden [container-type:inline-size]" style={{ height }}>
      <MapBackdrop height={height} />

      {/* Road */}
      <svg className="dim-in-dark absolute inset-0 size-full" viewBox={`0 0 ${DESIGN_WIDTH} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        {segments.map(({ id, from, to, reached }) => {
          const d = segmentPath(from, to);
          return (
            <g key={id}>
              <path d={d} stroke={reached ? '#3fae62' : '#c9dbe8'} strokeWidth={36} fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity={reached ? 0.35 : 0.6} />
              <path d={d} stroke={reached ? 'var(--color-road-done)' : '#f4f8fc'} strokeWidth={30} fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity={reached ? 1 : 0.85} />
              <path d={d} stroke="#ffffff" strokeWidth={3} strokeDasharray="10 12" fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity={reached ? 0.95 : 0.9} />
            </g>
          );
        })}
      </svg>

      {/* Goal trophy beside the last moment */}
      <div className="absolute flex -translate-x-1/2 flex-col items-center" style={{ left: pct(95), top: goal.y - 30 }} aria-hidden="true">
        <span className="text-[34px] leading-none drop-shadow-sm">🏆</span>
        <Pill tone="gold" className="mt-0.5 px-3 text-[11.5px]">
          {t.journey.goal}
        </Pill>
      </div>

      {/* Moments, listed in practice order for screen readers */}
      <ol className="contents">
        {nodes.map(({ m, p }) => {
          const isCurrent = m.id === current;
          const big = isCurrent;
          const side: 'left' | 'right' = p.x > DESIGN_WIDTH / 2 ? 'left' : 'right';
          const to = destination(m, isCurrent);
          const label = statusLabel(m);
          // Offsets are measured from the node centre in the design; the box origin is its edge.
          const radius = big ? 34 : 27.5;
          const gap = big ? 51 : 44;
          const cardStyle: CSSProperties =
            side === 'right'
              ? { left: radius + gap, top: radius - 26, width: `calc(100cqw * ${1 - p.x / DESIGN_WIDTH} - ${gap + 2}px)` }
              : { right: radius + gap, top: radius - 26, width: `calc(100cqw * ${p.x / DESIGN_WIDTH} - ${gap + 10}px)` };

          // Links take their name from the visible card text; locked rows get the same as a label.
          const name = [m.title, label, isCurrent && m.status === 'in_progress' ? t.journey.continue : null].filter(Boolean).join(' ');
          const content = (
            <>
              <span aria-hidden="true">
                {isCurrent && <span className="absolute -inset-[11px] animate-halo rounded-full bg-action/25" />}
                <MomentNode status={m.status} big={big} number={m.order} />
              </span>
              <span
                className={cn(
                  'absolute flex flex-col gap-1.5 rounded-2xl bg-surface/90 py-2 pr-1.5 pl-2',
                  side === 'left' ? 'items-end text-right' : 'items-start text-left',
                )}
                style={cardStyle}
              >
                <span className="text-[14.5px] leading-tight font-semibold text-ink">
                  {m.title}
                </span>
                <Pill tone={m.status === 'locked' ? 'mist' : m.status === 'done' ? 'ok' : 'sky'} className="text-[13px]">
                  {label}
                </Pill>
              </span>
              {isCurrent && m.status === 'in_progress' && (
                <span className="absolute top-[calc(100%+6px)] left-1/2 -translate-x-1/2 rounded-full bg-speaking px-5 py-1 text-[15px] font-bold whitespace-nowrap text-white shadow-[0_3px_0_#5a2fa6]">
                  {t.journey.continue}
                </span>
              )}
            </>
          );

          const nodeBox = cn(
            'absolute -translate-x-1/2 -translate-y-1/2 rounded-full',
            big ? 'size-[68px]' : 'size-[55px]',
          );
          const style = { left: pct(p.x), top: p.y };
          return (
            <li key={m.id} className="contents">
              {/* Sibling of the link (not inside it) so the emoji isn't part of the link's text. */}
              <span
                className="pointer-events-none absolute z-[1] flex size-[28px] items-center justify-center rounded-full bg-surface shadow-soft"
                style={{ left: `calc(${pct(p.x)} + ${big ? 20 : 15.5}px)`, top: p.y - (big ? 45 : 36.5) }}
                aria-hidden="true"
              >
                <MomentGlyph icon={m.icon} size={24} />
              </span>
              {to ? (
                <Link viewTransition to={to} className={cn(nodeBox, 'group')} style={style}>
                  {content}
                </Link>
              ) : (
                <div className={nodeBox} style={style} role="group" aria-label={name}>
                  {content}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
});

function MomentNode({ status, big, number }: { status: MomentProgress['status']; big: boolean; number: number }) {
  if (big) {
    return (
      <span className="relative flex size-full items-center justify-center rounded-full border-[3px] border-white bg-[radial-gradient(circle_at_35%_30%,#4f7dfa,#0a3fe6_70%)] text-[34px] font-extrabold text-white shadow-[0_6px_0_#0a2a9c,0_10px_18px_rgb(10_42_156/0.3)] transition-transform group-hover:-translate-y-0.5 group-active:translate-y-0.5">
        {number}
      </span>
    );
  }
  if (status === 'available' || status === 'in_progress') {
    // Open but not today's: a white button with its number, ready to tap.
    return (
      <span className="relative flex size-full items-center justify-center rounded-full border-[3px] border-[#3f6ff5] bg-white text-[24px] font-extrabold text-[#0a3fe6] shadow-[0_5px_0_#9db4f7,0_8px_14px_rgb(10_42_156/0.18)] transition-transform group-hover:-translate-y-0.5">
        {number}
      </span>
    );
  }
  if (status === 'done') {
    return (
      <span className="relative flex size-full items-center justify-center rounded-full border-[3px] border-white bg-[radial-gradient(circle_at_35%_30%,#3fd273,#1fa34f_70%)] text-white shadow-[0_5px_0_#178a41,0_8px_14px_rgb(23_138_65/0.25)] transition-transform group-hover:-translate-y-0.5">
        <CheckIcon size={26} strokeWidth={3} />
      </span>
    );
  }
  return (
    <span className="relative flex size-full items-center justify-center rounded-full border-[3px] border-white bg-[radial-gradient(circle_at_35%_30%,#f0f2f4,#cdd2d6_75%)] text-[#7f888e] shadow-[0_5px_0_#9aa3a9,0_8px_14px_rgb(60_70_80/0.18)]">
      <LockIcon size={22} />
    </span>
  );
}

/** Sky, hills, clouds and bushes. Purely decorative. */
function MapBackdrop({ height }: { height: number }) {
  return (
    <svg className="dim-in-dark absolute inset-0 size-full" viewBox={`0 0 ${DESIGN_WIDTH} ${height}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="map-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#cdebfd" />
          <stop offset="0.55" stopColor="#e1f3f6" />
          <stop offset="1" stopColor="#e8f6ec" />
        </linearGradient>
      </defs>
      <rect width={DESIGN_WIDTH} height={height} fill="url(#map-sky)" />
      <ellipse cx="40" cy={height * 0.37} rx="200" ry="72" fill="#e3f3e8" />
      <ellipse cx="380" cy={height * 0.56} rx="170" ry="95" fill="#e3f3e8" />
      <ellipse cx="195" cy={height + 70} rx="340" ry="190" fill="#e1f2e5" />
      {/* clouds */}
      <g fill="#ffffff" opacity="0.95">
        <ellipse cx="62" cy={height * 0.21} rx="26" ry="12" />
        <ellipse cx="80" cy={height * 0.195} rx="16" ry="11" />
        <ellipse cx="318" cy="10" rx="26" ry="10" />
        <ellipse cx="345" cy="8" rx="18" ry="10" />
      </g>
      {/* bushes */}
      <g fill="#a6dbb0">
        <circle cx="30" cy={height * 0.58} r="7" />
        <circle cx="356" cy={height * 0.44} r="8" />
        <circle cx="366" cy={height * 0.457} r="6" />
        <circle cx="34" cy={height * 0.81} r="9" />
        <circle cx="46" cy={height * 0.825} r="7" />
      </g>
    </svg>
  );
}
