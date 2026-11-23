import { useId, useState, useSyncExternalStore } from 'react';
import { t } from '@/i18n';
import { useDeleteMyData, usePreferences, useProgress, useSavePreferences } from '@/hooks/queries';
import { useBack } from '@/hooks/useBack';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { ErrorBlock, LoadingBlock } from '@/components/layout/StatusScreens';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog, Section, Toggle } from '@/components/ui/Controls';
import { LockIcon } from '@/components/ui/Icons';
import { cn } from '@/lib/cn';
import { onThemeChange, setThemePref, themePref, type ThemePref } from '@/lib/theme';
import { avatar3dPref, canDraw3d, setAvatar3dPref } from '@/lib/avatar3d';

/** Her preferences (FR-2, FR-16, FR-31), the privacy promises, and delete my data (FR-39). */
export default function SettingsPage() {
  const prefs = usePreferences();
  const progress = useProgress();
  const save = useSavePreferences();
  const wipe = useDeleteMyData();
  const back = useBack('/');
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const timeId = useId();
  const hardestId = useId();
  const programme = (progress.data?.moments ?? []).filter((m) => m.kind === 'programme').sort((a, b) => a.order - b.order);

  return (
    <Screen>
      <AppHeader title={t.settings.title} onBack={back} />
      <main className="flex flex-1 flex-col gap-4 bg-mist px-5 pt-4 pb-8">
        {prefs.isPending ? (
          <LoadingBlock />
        ) : prefs.error ? (
          <ErrorBlock error={prefs.error} onRetry={() => void prefs.refetch()} />
        ) : (
          <>
            <Section title={t.settings.privacyTitle}>
              <ul className="mt-2 space-y-2">
                {t.settings.privacy.map((line) => (
                  <li key={line} className="flex gap-2 text-[14.5px] leading-5">
                    <LockIcon size={16} className="mt-0.5 shrink-0 text-sage" />
                    {line}
                  </li>
                ))}
              </ul>
            </Section>

            <Section title={t.settings.practiceTitle}>
              <div className="divide-y divide-line">
                <Toggle
                  label={t.settings.quietMode}
                  help={t.settings.quietModeHelp}
                  checked={prefs.data.quietMode}
                  disabled={save.isPending}
                  onChange={(on) => save.mutate({ quietMode: on })}
                />
                <div className="py-3">
                  <label htmlFor={timeId} className="block text-[16px] font-bold">
                    {t.settings.nudge}
                  </label>
                  <p className="mt-0.5 text-[13.5px] leading-5 text-ink-2">{t.settings.nudgeHelp}</p>
                  <div className="mt-2.5 flex flex-wrap gap-2" role="group" aria-label={t.settings.nudgeTime}>
                    {t.settings.nudgePresets.map((p) => {
                      const on = prefs.data.nudgeTime === p.time;
                      return (
                        <button
                          key={p.time}
                          type="button"
                          aria-pressed={on}
                          disabled={save.isPending}
                          onClick={() => save.mutate({ nudgeTime: p.time })}
                          className={cn(
                            'flex flex-col items-start rounded-[14px] border-2 px-3 py-1.5 text-left transition-colors',
                            on ? 'border-action bg-sky' : 'border-line bg-surface hover:border-action/60',
                          )}
                        >
                          <span className="text-[14px] font-bold">{p.label}</span>
                          <span className="text-[12.5px] text-ink-2">{formatTime(p.time)}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-3 text-[13px] font-semibold text-ink-2">{t.settings.nudgeCustom}</p>
                  <div className="mt-1.5 flex items-center gap-3">
                    <input
                      id={timeId}
                      type="time"
                      value={prefs.data.nudgeTime ?? ''}
                      min="07:00"
                      max="19:59"
                      onChange={(e) => e.target.value && save.mutate({ nudgeTime: e.target.value })}
                      className="h-11 rounded-[14px] border-2 border-line bg-surface px-3 text-[16px] focus:border-action focus:outline-none"
                    />
                    {prefs.data.nudgeTime && (
                      <Button variant="ghost" size="md" onClick={() => save.mutate({ clearNudge: true })}>
                        {t.settings.nudgeOff}
                      </Button>
                    )}
                  </div>
                </div>
                <div className="py-3">
                  <label htmlFor={hardestId} className="block text-[16px] font-bold">
                    {t.settings.hardest}
                  </label>
                  <select
                    id={hardestId}
                    value={prefs.data.hardestMomentId ?? ''}
                    onChange={(e) => save.mutate({ hardestMomentId: e.target.value })}
                    className="mt-2 h-11 w-full rounded-[14px] border-2 border-line bg-surface px-3 text-[16px] focus:border-action focus:outline-none"
                  >
                    <option value="">{t.settings.none}</option>
                    {programme.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="sr-only" aria-live="polite">
                {save.isSuccess ? (prefs.data.nudgeTime ? t.settings.nudgeSet(formatTime(prefs.data.nudgeTime)) : t.settings.savedOk) : ''}
              </p>
              {save.error && (
                <p role="alert" className="pb-2 text-[14px] font-semibold text-stop">
                  {save.error.message}
                </p>
              )}
            </Section>

            <Section title={t.settings.appearance}>
              <Appearance />
              {canDraw3d() && <Avatar3dToggle />}
            </Section>

            <Section title={t.settings.deleteTitle}>
              <p className="mt-1 text-[14px] leading-5 text-ink-2">{t.settings.deleteHelp}</p>
              <Button variant="danger-outline" size="md" className="mt-3 mb-1" onClick={() => setConfirming(true)}>
                {t.settings.deleteButton}
              </Button>
              {notice && (
                <p role="status" className="pb-1 text-[14px] font-semibold text-ok">
                  {notice}
                </p>
              )}
            </Section>
            <ConfirmDialog
              open={confirming}
              title={t.settings.deleteTitle}
              body={t.settings.deleteConfirm}
              confirmLabel={t.common.delete}
              busy={wipe.isPending}
              onClose={() => setConfirming(false)}
              onConfirm={() =>
                wipe.mutate(undefined, {
                  onSuccess: () => {
                    setConfirming(false);
                    setNotice(t.settings.deleted);
                  },
                })
              }
            />
          </>
        )}
      </main>
    </Screen>
  );
}

function formatTime(hhmm: string): string {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

function Appearance() {
  const pref = useSyncExternalStore(onThemeChange, themePref, () => 'auto' as ThemePref);
  const options: ThemePref[] = ['auto', 'light', 'dark'];
  return (
    <>
      <p className="mt-0.5 text-[13.5px] leading-5 text-ink-2">{t.settings.appearanceHelp}</p>
      <div
        role="radiogroup"
        aria-label={t.settings.appearance}
        className="mt-2.5 mb-1 grid grid-cols-3 gap-1 rounded-full bg-mist p-1"
      >
        {options.map((o) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={pref === o}
            tabIndex={pref === o ? 0 : -1}
            data-theme-option={o}
            onKeyDown={(e) => {
              const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
              if (!step) return;
              e.preventDefault();
              const next = options[(options.indexOf(pref) + step + options.length) % options.length] ?? 'auto';
              setThemePref(next);
              (e.currentTarget.parentElement?.querySelector(`[data-theme-option="${next}"]`) as HTMLElement | null)?.focus();
            }}
            onClick={() => setThemePref(o)}
            className={cn(
              'h-10 rounded-full text-[15px] font-bold transition-colors',
              pref === o ? 'bg-surface text-action shadow-soft' : 'text-ink-2 hover:text-ink',
            )}
          >
            {t.settings.themes[o]}
          </button>
        ))}
      </div>
    </>
  );
}

function Avatar3dToggle() {
  const [on, setOn] = useState(avatar3dPref);
  return (
    <div className="mt-2 border-t border-line">
      <Toggle
        label={t.settings.avatar3d}
        help={t.settings.avatar3dHelp}
        checked={on}
        onChange={(next) => {
          setAvatar3dPref(next);
          setOn(next);
        }}
      />
    </div>
  );
}
