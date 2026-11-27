import { t } from '@/i18n';
import type { MomentProgress } from '@/types/tutor';

/**
 * The programme as lectures on a Duolingo-style path: each programme moment is one lecture with
 * two parts (Learn, then the role-play) and its own reward chest. Only the lecture she is on is
 * opened up; the others show as one-line rows. Pure, so it is easy to test.
 */
export type NodeKind = 'learn' | 'roleplay' | 'chest';
export type NodeState = 'done' | 'current' | 'open' | 'locked';
export type LectureState = 'done' | 'active' | 'open' | 'locked';

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

export interface Lecture {
  /** 1-based, in programme order. */
  number: number;
  total: number;
  moment: MomentProgress;
  state: LectureState;
  partsDone: number;
  final: boolean;
  nodes: PathNode[];
}

const started = (m: MomentProgress) => m.status === 'in_progress' || m.status === 'done' || m.timesPractised > 0;
const finished = (m: MomentProgress) => (m.status === 'done' || m.firstTry !== null) && m.status !== 'in_progress';

/** The programme moments, in order: lecture 1, 2, 3… */
export function lectureMoments(moments: MomentProgress[]): MomentProgress[] {
  return moments.filter((m) => m.kind === 'programme').sort((a, b) => a.order - b.order);
}

/** A moment's lecture number, or null when it isn't part of the programme (anytime, baseline). */
export function lectureNumber(moments: MomentProgress[] | undefined, momentId: string): number | null {
  if (!moments) return null;
  const i = lectureMoments(moments).findIndex((m) => m.id === momentId);
  return i < 0 ? null : i + 1;
}

/** Where a moment's row should lead: its summary, the role-play in progress, or its Learn step. */
export function momentHref(m: MomentProgress): string | null {
  if (m.status === 'locked') return null;
  if (finished(m)) return `/moments/${m.id}/summary`;
  if (m.status === 'in_progress') return `/moments/${m.id}`;
  return `/moments/${m.id}/learn`;
}

export function buildLectures(moments: MomentProgress[]): Lecture[] {
  const programme = lectureMoments(moments);
  const total = programme.length;
  const lectures = programme.map((m, i): Lecture => {
    const n = i + 1;
    const locked = m.status === 'locked';
    const learnDone = started(m);
    const playDone = finished(m);
    const last = n === total;
    const nodes: PathNode[] = [
      {
        key: `${m.id}:learn`,
        kind: 'learn',
        state: locked ? 'locked' : learnDone ? 'done' : 'open',
        moment: m,
        to: locked ? null : `/moments/${m.id}/learn`,
        label: t.lecture.partLearn,
        sub: learnDone ? t.lecture.done : t.path.learnSub,
        progress: 0,
        final: false,
      },
      {
        key: `${m.id}:play`,
        kind: 'roleplay',
        state: locked ? 'locked' : playDone ? 'done' : 'open',
        moment: m,
        to: locked ? null : playDone ? `/moments/${m.id}/summary` : `/moments/${m.id}`,
        label: t.lecture.partPlay,
        sub: playDone
          ? t.path.doneSub
          : m.status === 'in_progress'
            ? t.journey.responseOf(m.responsesDone + 1, m.responsesTotal)
            : t.path.lines(m.responsesTotal),
        progress: m.status === 'in_progress' ? m.responsesDone / Math.max(1, m.responsesTotal) : 0,
        final: false,
      },
      {
        key: `${m.id}:chest`,
        kind: 'chest',
        state: playDone ? 'done' : 'locked',
        moment: null,
        to: playDone ? (last ? '/certificate' : '/progress') : null,
        label: playDone ? t.lecture.rewardDone(n) : t.lecture.reward(n),
        sub: '',
        progress: 0,
        final: last,
      },
    ];
    return {
      number: n,
      total,
      moment: m,
      state: locked ? 'locked' : playDone ? 'done' : 'open',
      partsDone: (learnDone ? 1 : 0) + (playDone ? 1 : 0),
      final: last,
      nodes,
    };
  });

  // The next step to take: the first open step, in order (Duolingo's "Start" bubble). Its lecture
  // is the one opened up on the path.
  for (const lecture of lectures) {
    const next = lecture.nodes.find((node) => node.state === 'open');
    if (next) {
      next.state = 'current';
      lecture.state = 'active';
      break;
    }
  }
  return lectures;
}
