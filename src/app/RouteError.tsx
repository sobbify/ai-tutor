import { isRouteErrorResponse, useRouteError } from 'react-router';
import { t } from '@/i18n';
import { exitTutor } from '@/hooks/useBack';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { ErrorBlock, LoadingBlock } from '@/components/layout/StatusScreens';
import { ButtonLink } from '@/components/ui/Button';

export function RouteError() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFound />;
  console.error(error);
  return (
    <Screen>
      <AppHeader title={t.journey.title} onBack={exitTutor} />
      <ErrorBlock error={error instanceof Error ? new Error(t.common.errorTitle) : error} onRetry={() => window.location.reload()} />
    </Screen>
  );
}

export function NotFound() {
  return (
    <Screen>
      <AppHeader title={t.journey.title} onBack={exitTutor} />
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
        <h2 className="text-lg font-bold">{t.common.notFoundTitle}</h2>
        <p className="text-ink-2">{t.common.notFoundBody}</p>
        <ButtonLink to="/" variant="outline" size="md">
          {t.common.goHome}
        </ButtonLink>
      </main>
    </Screen>
  );
}

export function RouteLoading() {
  return (
    <Screen>
      <LoadingBlock />
    </Screen>
  );
}
