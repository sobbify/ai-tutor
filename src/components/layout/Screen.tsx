import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Phone-width column. Fills small screens; centred with a soft frame on desktop
 * (e.g. inside the Electron wrapper window).
 */
export function Screen({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-surface sm:shadow-[0_0_40px_rgb(31_146_252/0.08)]', className)}>
      {children}
    </div>
  );
}

/** Sticky footer for primary actions, with safe-area padding. */
export function ScreenFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('sticky bottom-0 z-10 bg-surface px-5 pt-3 pb-[max(env(safe-area-inset-bottom),20px)]', className)}>
      {children}
    </div>
  );
}
