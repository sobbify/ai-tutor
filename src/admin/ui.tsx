import { useEffect, useId, useRef, useState, type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { errorMessage, fmtNumber } from './format';
import { useToasts } from './toasts';

// ---- layout pieces -------------------------------------------------------------------------

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[26px] leading-tight font-extrabold text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-[14.5px] text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Panel({ title, actions, children, className }: { title?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-card border border-line/80 bg-white p-5 shadow-[0_1px_2px_rgb(44_43_43/0.04)]', className)}>
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-[16px] font-bold">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatTile({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-card bg-aqua px-5 py-4">
      <p className="text-[13px] font-semibold text-ink-2">{label}</p>
      <p className="mt-1 text-[30px] leading-none font-extrabold text-ink tabular-nums">{value}</p>
      {hint && <p className="mt-2 text-[12.5px] text-ink-2">{hint}</p>}
    </div>
  );
}

type BadgeTone = 'blue' | 'green' | 'amber' | 'grey' | 'red';
const badgeTones: Record<BadgeTone, string> = {
  blue: 'bg-sky text-action',
  green: 'bg-ok-bg text-ok',
  amber: 'bg-[#fef3c7] text-[#854d0e]',
  grey: 'bg-mist text-ink-2',
  red: 'bg-[#fde8e8] text-[#a61b1b]',
};
export function Badge({ tone = 'grey', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-[12.5px] font-bold whitespace-nowrap', badgeTones[tone])}>{children}</span>;
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-16 text-ink-2">
      <span className="size-6 animate-spin rounded-full border-[3px] border-sky border-t-action" aria-hidden="true" />
      {label}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#fde8e8] px-4 py-3 text-[14.5px] font-semibold text-[#a61b1b]">
      {errorMessage(error)}
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

export function Empty({ title, body }: { title: string; body?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-6 py-12 text-center">
      <p className="font-bold">{title}</p>
      {body && <p className="mt-1 text-[14px] text-ink-2">{body}</p>}
    </div>
  );
}

// ---- form controls ---------------------------------------------------------------------------

const fieldBase =
  'w-full rounded-xl border border-line bg-white px-3 py-2 text-[14.5px] text-ink placeholder:text-[#8a8f93] focus-visible:border-action focus-visible:outline-2 focus-visible:outline-offset-0 disabled:bg-mist';

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: (id: string, describedBy?: string) => ReactNode }) {
  const id = useId();
  const hintId = hint || error ? `${id}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-bold text-ink">
        {label}
      </label>
      {children(id, hintId)}
      {(hint || error) && (
        <p id={hintId} className={cn('text-[12.5px]', error ? 'font-semibold text-[#a61b1b]' : 'text-ink-2')}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldBase, className)} {...rest} />;
}

export function TextArea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldBase, 'min-h-[72px] resize-y leading-relaxed', className)} {...rest} />;
}

export function SelectInput({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(fieldBase, 'cursor-pointer pr-8', className)} {...rest}>
      {children}
    </select>
  );
}

export function SearchBox({ value, onChange, label, placeholder }: { value: string; onChange: (v: string) => void; label: string; placeholder?: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    const t = setTimeout(() => draft !== value && onChange(draft), 300);
    return () => clearTimeout(t);
  }, [draft, value, onChange]);
  return (
    <input
      type="search"
      aria-label={label}
      placeholder={placeholder ?? label}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      className={cn(fieldBase, 'max-w-xs')}
    />
  );
}

/** Pill segmented control (single choice). */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full bg-mist p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn('rounded-full px-3.5 py-1.5 text-[13.5px] font-bold transition-colors', value === o.value ? 'bg-[#0a5cad] text-white' : 'text-ink hover:bg-white')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---- table & pagination ------------------------------------------------------------------------

export function Table({ caption, head, children }: { caption: string; head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line/80">
      <table className="w-full border-collapse text-left text-[14px]">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-mist text-[12.5px] font-bold tracking-wide text-ink-2 uppercase">{head}</thead>
        <tbody className="divide-y divide-line/70 bg-white">{children}</tbody>
      </table>
    </div>
  );
}

export const Th = ({ children, className }: { children?: ReactNode; className?: string }) => (
  <th scope="col" className={cn('px-4 py-3 font-bold whitespace-nowrap', className)}>
    {children}
  </th>
);
export const Td = ({ children, className }: { children?: ReactNode; className?: string }) => <td className={cn('px-4 py-3 align-top', className)}>{children}</td>;

export function Pagination({ page, size, total, onPage }: { page: number; size: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  const from = total === 0 ? 0 : (page - 1) * size + 1;
  const to = Math.min(total, page * size);
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between gap-3 text-[13.5px] text-ink-2">
      <span>
        {fmtNumber(from)}–{fmtNumber(to)} of {fmtNumber(total)}
      </span>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </nav>
  );
}

// ---- dialogs & toasts -------------------------------------------------------------------------------

/** Native <dialog> (focus trap, Esc, inert background for free). Optional type-to-confirm. */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  danger = false,
  typeToConfirm,
  busy = false,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  typeToConfirm?: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState('');
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setTyped('');
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open]);
  const blocked = typeToConfirm !== undefined && typed !== typeToConfirm;
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto w-[min(460px,calc(100vw-32px))] rounded-card p-0 shadow-[0_20px_60px_rgb(0_0_0/0.25)] backdrop:bg-black/40"
    >
      <form
        method="dialog"
        className="flex flex-col gap-4 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (!blocked) onConfirm();
        }}
      >
        <h2 id={titleId} className="text-[19px] font-extrabold">
          {title}
        </h2>
        <div className="text-[14.5px] leading-relaxed text-ink-2">{body}</div>
        {children}
        {typeToConfirm !== undefined && (
          <Field label={`Type “${typeToConfirm}” to confirm`}>
            {(id) => <TextInput id={id} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />}
          </Field>
        )}
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="outline" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="md" variant={danger ? 'danger' : 'primary'} disabled={blocked || busy} aria-busy={busy}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </dialog>
  );
}

export function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === 'error' ? 'alert' : 'status'}
          className={cn(
            'pointer-events-auto flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-[14px] font-semibold shadow-[0_8px_30px_rgb(0_0_0/0.15)]',
            t.tone === 'error' ? 'text-[#a61b1b]' : 'text-ok',
          )}
        >
          {t.text}
          <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-ink-2 hover:text-ink">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
