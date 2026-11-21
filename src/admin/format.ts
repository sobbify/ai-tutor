import { AdminApiError } from './api';

// ---- formatting ---------------------------------------------------------------------------

const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const rel = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

export const fmtDate = (iso: string) => dateFmt.format(new Date(iso));
export const fmtDateTime = (iso: string) => timeFmt.format(new Date(iso));
export const fmtNumber = (n: number) => n.toLocaleString('en-IN');

export function fmtAgo(iso: string): string {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return 'just now';
  if (abs < 3600) return rel.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rel.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rel.format(Math.round(diff / 86400), 'day');
  return fmtDate(iso);
}

export const errorMessage = (e: unknown) => (e instanceof AdminApiError || e instanceof Error ? e.message : 'Something went wrong.');
