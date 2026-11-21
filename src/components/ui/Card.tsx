import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/** Aqua hero panel used at the top of Journey / Summary / Progress. */
export function HeroCard({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return <section className={cn('rounded-card bg-aqua shadow-card', className)} {...rest} />;
}

/** White outlined container. */
export function OutlineCard({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return <section className={cn('rounded-card border border-line bg-surface', className)} {...rest} />;
}
