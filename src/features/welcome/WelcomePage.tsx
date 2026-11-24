import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { useHome, useOnboard, useProgress } from '@/hooks/queries';
import { exitTutor } from '@/hooks/useBack';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen, ScreenFooter } from '@/components/layout/Screen';
import { ErrorBlock, LoadingBlock } from '@/components/layout/StatusScreens';
import { Button, ButtonLink } from '@/components/ui/Button';
import { HeroCard } from '@/components/ui/Card';
import { CheckIcon, LockIcon } from '@/components/ui/Icons';
import { MomentGlyph } from '@/features/journey/MomentGlyph';
import { Face } from '@/features/conversation/Portrait';

const ELSA = { name: 'ELSA', role: 'Coach', initials: 'EL', posterUrl: null };

/**
 * Day 0 (PRD §05): plain consent (FR-2) — her voice is never recorded, only transcripts are kept —, her hardest moment
 * (FR-5), then the friendly first chat that is never scored (FR-4).
 */
export default function WelcomePage() {
  const home = useHome();
  const [step, setStep] = useState<1 | 2 | 3 | null>(null);

  if (home.isPending) {
    return (
      <Screen>
        <AppHeader title={t.journey.title} onBack={exitTutor} />
        <LoadingBlock />
      </Screen>
    );
  }
  if (home.error) {
    return (
      <Screen>
        <AppHeader title={t.journey.title} onBack={exitTutor} />
        <ErrorBlock error={home.error} onRetry={() => void home.refetch()} />
      </Screen>
    );
  }
  const current = step ?? (home.data.consented ? 3 : 1);
  if (home.data.consented && home.data.baselineDone && step === null) return <Navigate to="/" replace />;

  return (
    <Screen>
      <AppHeader title={t.welcome.title} onBack={current === 2 ? () => setStep(1) : exitTutor} />
      <p className="px-5 pt-3 text-[13px] font-bold text-ink-2" aria-live="polite">
        {t.welcome.step(current, 3)}
      </p>
      {current === 1 && <Consent firstName={home.data.learner.firstName} onNext={() => setStep(2)} />}
      {current === 2 && <Hardest onDone={() => setStep(3)} />}
      {current === 3 && <Baseline />}
    </Screen>
  );
}

function Consent({ firstName, onNext }: { firstName: string; onNext: () => void }) {
  const [agreed, setAgreed] = useState(false);
  return (
    <>
      <main className="flex flex-1 flex-col px-5 pt-2 pb-6">
        <HeroCard className="px-5 pt-4 pb-5">
          <h2 className="text-[21px] leading-7 font-bold">{t.welcome.hello(firstName)}</h2>
          <p className="mt-1 text-[15px] leading-6 text-ink-2">{t.welcome.intro}</p>
        </HeroCard>
        <ul className="mt-4 space-y-3">
          {t.welcome.promises.map((p, i) => (
            <li key={p.title} className="flex gap-3 rounded-card border border-line px-4 py-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-sky text-action" aria-hidden="true">
                {i === 0 ? <LockIcon size={16} /> : <CheckIcon size={16} />}
              </span>
              <div>
                <h3 className="text-[16px] font-bold">{p.title}</h3>
                <p className="text-[14px] leading-5 text-ink-2">{p.body}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[14px] leading-5 text-ink-2">{t.welcome.voiceNote}</p>
        <label className="mt-4 flex cursor-pointer items-start gap-3 text-[15px] leading-6 font-semibold">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 size-5 shrink-0 accent-[var(--color-action)]" />
          {t.welcome.consentLabel}
        </label>
      </main>
      <ScreenFooter className="border-t border-line">
        <Button block disabled={!agreed} onClick={onNext}>
          {t.common.continue}
        </Button>
      </ScreenFooter>
    </>
  );
}

function Hardest({ onDone }: { onDone: () => void }) {
  const progress = useProgress();
  const onboard = useOnboard();
  const [choice, setChoice] = useState<string | null>(null);
  const programme = (progress.data?.moments ?? []).filter((m) => m.kind === 'programme').sort((a, b) => a.order - b.order);
  const submit = (hardest: string | null) =>
    onboard.mutate({ consent: true, hardestMomentId: hardest }, { onSuccess: onDone });

  return (
    <>
      <main className="flex flex-1 flex-col px-5 pt-2 pb-6">
        <fieldset>
          <legend className="text-[21px] leading-7 font-bold">{t.welcome.hardestTitle}</legend>
          <p className="mt-1 text-[15px] text-ink-2">{t.welcome.hardestBody}</p>
          {progress.isPending ? (
            <LoadingBlock />
          ) : (
            <div className="mt-4 space-y-3">
              {programme.map((m) => (
                <label
                  key={m.id}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-card border-2 px-4 py-3.5 text-[16px] font-bold',
                    choice === m.id ? 'border-action bg-sky/40' : 'border-line',
                  )}
                >
                  <input type="radio" name="hardest" value={m.id} checked={choice === m.id} onChange={() => setChoice(m.id)} className="size-5 accent-[var(--color-action)]" />
                  <MomentGlyph icon={m.icon} size={34} />
                  {m.title}
                </label>
              ))}
            </div>
          )}
        </fieldset>
        {onboard.error && (
          <p role="alert" className="mt-3 text-[14px] font-semibold text-stop">
            {onboard.error.message}
          </p>
        )}
      </main>
      <ScreenFooter className="flex flex-col gap-2 border-t border-line">
        <Button block disabled={!choice || onboard.isPending} aria-busy={onboard.isPending} onClick={() => submit(choice)}>
          {t.common.continue}
        </Button>
        <Button variant="ghost" size="md" disabled={onboard.isPending} onClick={() => submit(null)}>
          {t.welcome.notSure}
        </Button>
      </ScreenFooter>
    </>
  );
}

function Baseline() {
  const navigate = useNavigate();
  return (
    <>
      <main className="flex flex-1 flex-col px-5 pt-2 pb-6">
        <HeroCard className="flex flex-col items-center px-6 pt-7 pb-8 text-center">
          <span className="relative block size-24" aria-hidden="true">
            <Face character={ELSA} className="size-24 animate-pop overflow-hidden rounded-full border-4 border-surface shadow-card" />
            <span className="absolute -right-1 -bottom-1 flex size-9 items-center justify-center rounded-full bg-surface text-[20px] shadow-soft">👋</span>
          </span>
          <h2 className="mt-4 text-[21px] font-bold">{t.welcome.baselineTitle}</h2>
          <p className="mt-2 text-[15px] leading-6 text-ink-2">{t.welcome.baselineBody}</p>
        </HeroCard>
      </main>
      <ScreenFooter className="flex flex-col gap-2 border-t border-line">
        <ButtonLink to="/moments/hello-elsa" replace block>
          {t.welcome.startChat}
        </ButtonLink>
        <Button variant="ghost" size="md" onClick={() => void navigate('/', { replace: true , viewTransition: true })}>
          {t.welcome.skipChat}
        </Button>
      </ScreenFooter>
    </>
  );
}
