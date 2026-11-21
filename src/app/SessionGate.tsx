import type { ReactNode } from 'react';
import { t } from '@/i18n';
import { useSessionLost } from '@/api/session';
import { Screen } from '@/components/layout/Screen';
import { LockIcon } from '@/components/ui/Icons';

/** Replaces the whole app once the backend reports the session is no longer valid. */
export function SessionGate({ children }: { children: ReactNode }) {
  const lost = useSessionLost((s) => s.lost);
  // The admin console has its own sign-in.
  if (!lost || window.location.pathname.startsWith('/admin')) return children;
  return (
    <Screen>
      <main role="alert" className="flex flex-1 flex-col items-center justify-center gap-3 px-10 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-sky text-action" aria-hidden="true">
          <LockIcon size={24} />
        </span>
        <h1 className="text-[20px] font-bold">{t.common.sessionTitle}</h1>
        <p className="text-[15px] text-ink-2">{t.common.sessionBody}</p>
      </main>
    </Screen>
  );
}
