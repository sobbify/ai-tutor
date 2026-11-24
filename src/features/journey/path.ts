import { t } from '@/i18n';
import type { MomentProgress } from '@/types/tutor';

/**
 * The programme as a Duolingo-style path: each week is a unit; each moment is two steps (Learn,
 * then the role-play); a reward chest closes the week. Pure, so it is easy to test.
 */
export type NodeKind = 'learn' | 'roleplay' | 'chest';
export type NodeState = 'done' | 'current' | 'open' | 'locked';

export interface PathNode {
  key: string;
  kind: NodeKind;
  state: NodeState;
  moment: MomentProgress | null;
  to: string | null;
  label: string;
  sub: string;
  /** Role-play started: share of lines answered (for the ring around the current step). */
  progress: number;
  final: boolean;
}

export interface PathUnit {
  week: number;
  title: string;
  daysDone: number;
  daysTotal: number;
  locked: boolean;
  nodes: PathNode[];
}

const DAYS_PER_WEEK = 5;

const started = (m: MomentProgress) => m.status === 'in_progress' || m.status === 'done' || m.timesPractised > 0;
const finished = (m: MomentProgress) => m.status === 'done' || m.firstTry !== null;

export function buildPath(moments: MomentProgress[], daysPractised: number): PathUnit[] {
  const programme = moments.filter((m) => m.kind === 'programme').sort((a, b) => a.order - b.order);
  const weeks = [...new Set(programme.map((m) => m.week ?? 1))].sort((a, b) => a - b);
  let currentTaken = false;

  const units = weeks.map((week, wi): PathUnit => {
    const inWeek = programme.filter((m) => (m.week ?? 1) === week);
    const nodes: PathNode[] = [];
    for (const m of inWeek) {
      const locked = m.status === 'locked';
      const learnDone = started(m);
      const playDone = finished(m) && m.status !== 'in_progress';
      nodes.push({
        key: `${m.id}:learn`,
        kind: 'learn',
        state: locked ? 'locked' : learnDone ? 'done' : 'open',
        moment: m,
        to: locked ? null : `/moments/${m.id}/learn`,
        label: m.title,
        sub: t.path.learnSub,
        progress: 0,
        final: false,
      });
      nodes.push({
        key: `${m.id}:play`,
        kind: 'roleplay',
        state: locked ? 'locked' : playDone ? 'done' : 'open',
        moment: m,
        to: locked ? null : playDone ? `/moments/${m.id}/summary` : `/moments/${m.id}`,
        label: t.path.roleplay,
        sub: playDone
          ? t.path.doneSub
          : m.status === 'in_progress'
            ? t.journey.responseOf(m.responsesDone + 1, m.responsesTotal)
            : t.path.lines(m.responsesTotal),
        progress: m.status === 'in_progress' ? m.responsesDone / Math.max(1, m.responsesTotal) : 0,
        final: false,
      });
    }
    const weekDone = inWeek.length > 0 && inWeek.every((m) => finished(m) && m.status !== 'in_progress');
    const last = wi === weeks.length - 1;
    nodes.push({
      key: `week-${week}:chest`,
      kind: 'chest',
      state: weekDone ? 'done' : 'locked',
      moment: null,
      to: weekDone ? (last ? '/certificate' : '/progress') : null,
      label: last ? t.path.certificate : weekDone ? t.path.rewardDone(week) : t.path.reward(week),
      sub: '',
      progress: 0,
      final: last,
    });
    return {
      week,
      title: t.path.weekTitles[week] ?? '',
      daysDone: Math.max(0, Math.min(DAYS_PER_WEEK, daysPractised - (week - 1) * DAYS_PER_WEEK)),
      daysTotal: DAYS_PER_WEEK,
      locked: inWeek.every((m) => m.status === 'locked'),
      nodes,
    };
  });

  // The next step to take: the first open step, in order (Duolingo's "Start" bubble).
  for (const unit of units) {
    for (const node of unit.nodes) {
      if (!currentTaken && node.state === 'open') {
        node.state = 'current';
        currentTaken = true;
      }
    }
  }
  return units;
}
