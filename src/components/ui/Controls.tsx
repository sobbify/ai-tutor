import { useEffect, useId, useRef, type ReactNode } from 'react';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { Button } from './Button';

/** Accessible on/off switch with a visible label and help text. */
export function Toggle({
  label,
  help,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  help?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div>
        <p id={`${id}-l`} className="text-[16px] font-bold">
          {label}
        </p>
        {help && (
          <p id={`${id}-h`} className="mt-0.5 text-[13.5px] leading-5 text-ink-2">
            {help}
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-l`}
        aria-describedby={help ? `${id}-h` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 inline-flex h-8 w-[52px] shrink-0 items-center rounded-full transition-colors',
          checked ? 'bg-action' : 'bg-ink-2/60',
        )}
      >
        <span className={cn('inline-block size-6 rounded-full bg-white shadow-soft transition-transform', checked ? 'translate-x-[24px]' : 'translate-x-1')} />
      </button>
    </div>
  );
}

/** Native modal dialog for a yes/no decision (focus trapped and Esc handled by the browser). */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal?.();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto w-[min(92vw,380px)] rounded-card p-0 shadow-card backdrop:bg-ink/40"
    >
      <div className="p-5">
        <h2 id={titleId} className="text-[18px] font-bold">
          {title}
        </h2>
        <div className="mt-2 text-[15px] leading-6 text-ink-2">{body}</div>
        <div className="mt-5 flex gap-3">
          <Button variant="outline" size="md" className="flex-1" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button variant="danger" size="md" className="flex-1" onClick={onConfirm} disabled={busy} aria-busy={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}

/** A titled white section used on the settings-style screens. */
export function Section({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={cn('rounded-card border border-line bg-surface px-4 py-3', className)}>
      <h2 id={id} className="text-[17px] font-bold">
        {title}
      </h2>
      {children}
    </section>
  );
}
