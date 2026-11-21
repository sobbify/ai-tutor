/**
 * The programme rules, mirrored from backend/src/ai_tutor/services/programme.py for the browser-only
 * demo. The backend is the source of truth; keep the two in step.
 */

export const PROGRAMME_DAYS = 15;
export const DAYS_PER_WEEK = 5;
export const QUICK_LINES = 3;
export const MAX_LEVEL = 4;
export const WEEK_TITLES: Record<number, string> = { 1: 'Drop-off and pick-up', 2: 'Parent meetings', 3: 'Worried or upset parents' };

/** Local calendar date as YYYY-MM-DD. */
export function isoDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parse(day: string): Date {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

export interface ProgrammeState {
  day: number;
  week: number;
  daysPractised: number;
  practisedToday: boolean;
  harderToday: boolean;
  complete: boolean;
}

export function programmeState(days: string[], today: string, programmeDone: boolean): ProgrammeState {
  const practisedToday = days.includes(today);
  const count = days.length;
  const day = Math.min(PROGRAMME_DAYS, practisedToday ? count : count + 1);
  return {
    day,
    week: Math.min(3, Math.floor((day - 1) / DAYS_PER_WEEK) + 1),
    daysPractised: count,
    practisedToday,
    harderToday: day % DAYS_PER_WEEK === 0,
    complete: count >= PROGRAMME_DAYS && programmeDone,
  };
}

function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-${Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)}`;
}

/** School days in a row (Mon–Fri), one free miss per week; not practising yet today never breaks it. */
export function streak(days: string[], today: string): number {
  if (days.length === 0) return 0;
  const practised = new Set(days);
  const first = parse([...days].sort()[0] ?? today);
  const misses = new Map<string, number>();
  let count = 0;
  for (const d = parse(today); d >= first; d.setDate(d.getDate() - 1)) {
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const key = isoDay(d);
    if (practised.has(key)) count++;
    else if (key !== today) {
      const week = isoWeek(d);
      misses.set(week, (misses.get(week) ?? 0) + 1);
      if ((misses.get(week) ?? 0) > 1) break;
    }
  }
  return count;
}
