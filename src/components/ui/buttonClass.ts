import { cn } from '@/lib/cn';

type Variant = 'primary' | 'outline' | 'ghost' | 'danger' | 'danger-outline';
type Size = 'lg' | 'md' | 'sm';

const base =
  'inline-flex items-center justify-center gap-2 rounded-full font-bold whitespace-nowrap select-none transition-colors disabled:opacity-50';
const variants: Record<Variant, string> = {
  primary: 'bg-action text-on-action hover:bg-action-strong active:bg-action-strong',
  outline: 'border-2 border-action bg-surface text-action hover:bg-sky/40 active:bg-sky/60',
  ghost: 'text-action hover:underline underline-offset-4',
  danger: 'bg-danger text-white hover:brightness-90 active:brightness-90',
  'danger-outline': 'border-2 border-danger-ink bg-surface text-danger-ink hover:bg-danger-wash',
};
const sizes: Record<Size, string> = {
  lg: 'h-[50px] px-6 text-[17px]',
  md: 'h-11 px-5 text-[17px]',
  sm: 'h-8 min-w-[98px] px-3 text-[13.5px]',
};

export interface ButtonStyleProps {
  variant?: Variant;
  size?: Size;
  block?: boolean;
}

export function buttonClass({ variant = 'primary', size = 'lg', block = false }: ButtonStyleProps, extra?: string) {
  return cn(base, variants[variant], sizes[size], block && 'w-full', extra);
}
