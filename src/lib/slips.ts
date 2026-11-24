import type { GrammarFix, Slip } from '@/types/tutor';

/** One slip to show: one change, with its rule and category. */
export interface SlipView {
  wrong: string;
  better: string;
  tip: string | null;
  category: string;
}

export interface SlipGroup {
  category: string;
  slips: SlipView[];
}

/** The main fix plus the other slips, in the order ELSA ranked them. */
export function slipsOf(feedback: {
  fix: GrammarFix | null;
  tip?: string | null;
  category?: string | null;
  moreFixes?: Slip[] | null;
}): SlipView[] {
  if (!feedback.fix) return [];
  const main: SlipView = { ...feedback.fix, tip: feedback.tip ?? null, category: feedback.category ?? 'grammar' };
  const more = (feedback.moreFixes ?? []).map((m) => ({ wrong: m.wrong, better: m.better, tip: m.tip ?? null, category: m.category ?? 'grammar' }));
  return [main, ...more];
}

/** Slips sorted into their categories (tense, article, …), groups in the order they first appear. */
export function groupSlips<T extends { category: string }>(slips: T[]): Array<{ category: string; slips: T[] }> {
  const groups = new Map<string, T[]>();
  for (const slip of slips) groups.set(slip.category, [...(groups.get(slip.category) ?? []), slip]);
  return [...groups].map(([category, list]) => ({ category, slips: list }));
}
