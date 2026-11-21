import type { SegmentState } from '@/components/ui/Progress';
import type { MomentProgress } from '@/types/tutor';

/** The moment to practise next: the unfinished one, else the first unlocked not-done one. */
export function currentMomentId(moments: MomentProgress[]): string | null {
  const ordered = [...moments].sort((a, b) => a.order - b.order);
  return (ordered.find((m) => m.status === 'in_progress') ?? ordered.find((m) => m.status === 'available'))?.id ?? null;
}

export function journeySegments(moments: MomentProgress[]): SegmentState[] {
  const current = currentMomentId(moments);
  return [...moments]
    .sort((a, b) => a.order - b.order)
    .map((m) => (m.status === 'done' ? 'done' : m.id === current ? 'current' : 'idle'));
}

export const doneCount = (moments: MomentProgress[]) => moments.filter((m) => m.status === 'done').length;
