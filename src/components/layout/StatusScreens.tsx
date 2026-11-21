import { t } from '@/i18n';
import { ApiError } from '@/api/types';
import { Button, ButtonLink } from '@/components/ui/Button';

/** Page placeholder while data loads: soft shimmering blocks shaped like the cards to come. */
export function LoadingBlock({ label = t.common.loading }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-1 flex-col gap-4 px-5 py-5">
      <span className="sr-only">{label}</span>
      <div className="skeleton h-[120px] rounded-card" aria-hidden="true" />
      <div className="skeleton h-[76px] rounded-card" aria-hidden="true" />
      <div className="grid grid-cols-2 gap-3" aria-hidden="true">
        <div className="skeleton h-[96px] rounded-card" />
        <div className="skeleton h-[96px] rounded-card" />
      </div>
      <div className="skeleton h-[56px] rounded-card" aria-hidden="true" />
    </div>
  );
}

export function ErrorBlock({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof ApiError || error instanceof Error ? error.message : t.common.errorTitle;
  const notFound = error instanceof ApiError && (error.code === 'not_found' || error.code === 'locked');
  return (
    <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-4 px-8 py-16 text-center">
      <p className="text-lg font-bold">{t.common.errorTitle}</p>
      <p className="text-[15px] text-ink-2">{message}</p>
      {onRetry && !notFound ? (
        <Button variant="outline" size="md" onClick={onRetry}>
          {t.common.retry}
        </Button>
      ) : (
        <ButtonLink to="/" variant="outline" size="md">
          {t.common.goHome}
        </ButtonLink>
      )}
    </div>
  );
}
