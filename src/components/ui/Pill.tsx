import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'sky' | 'ok' | 'mist' | 'speaking' | 'gold';

const tones: Record<Tone, string> = {
  sky: 'bg-sky text-action',
  ok: 'bg-ok-bg text-ok',
  mist: 'bg-mist text-ink-2',
  speaking: 'bg-speaking text-white',
  gold: 'bg-gold text-gold-ink',
};

export function Pill({ tone = 'sky', className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12.5px] leading-5 font-bold', tones[tone], className)}>
      {children}
    </span>
  );
}
