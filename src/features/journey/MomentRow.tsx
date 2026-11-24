import type { ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import type { MomentIcon } from '@/types/tutor';
import { ChevronRightIcon } from '@/components/ui/Icons';
import { MomentGlyph } from './MomentGlyph';

/** A moment as a tappable row: illustration, title (and a line under it), an optional pill, chevron. */
export function MomentRow({ icon, title, sub, pill, ...link }: Omit<LinkProps, 'children' | 'className'> & { icon: MomentIcon; title: string; sub?: string; pill?: ReactNode }) {
  return (
    <Link
      viewTransition
      {...link}
      className="flex items-center gap-3 rounded-card border border-line bg-surface py-2.5 pr-3.5 pl-2.5 transition-colors hover:border-action/50 hover:bg-sky/25 active:bg-sky/40"
    >
      <MomentGlyph icon={icon} size={44} />
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] leading-6 font-bold">{title}</span>
        {sub && <span className="block text-[13px] leading-[18px] text-ink-2">{sub}</span>}
      </span>
      {pill}
      <ChevronRightIcon size={18} className="shrink-0 text-ink-2" />
    </Link>
  );
}
