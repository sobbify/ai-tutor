import { useCallback, useState } from 'react';
import { t } from '@/i18n';
import { useCertificate } from '@/hooks/queries';
import { useBack } from '@/hooks/useBack';
import type { Certificate } from '@/types/tutor';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { ErrorBlock, LoadingBlock } from '@/components/layout/StatusScreens';
import { Button } from '@/components/ui/Button';
import { HeroCard } from '@/components/ui/Card';
import { Confetti } from '@/components/ui/Confetti';
import { AwardIcon, LockIcon } from '@/components/ui/Icons';

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

/** Draws the certificate on a canvas (Nunito is already loaded by the page) and returns a PNG. */
async function renderPng(c: Certificate): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = 1131;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('Canvas unavailable');
  await document.fonts?.ready;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.strokeStyle = '#1f92fc';
  g.lineWidth = 24;
  g.strokeRect(40, 40, canvas.width - 80, canvas.height - 80);
  g.fillStyle = '#ebffff';
  g.fillRect(64, 64, canvas.width - 128, 200);
  g.textAlign = 'center';
  const line = (text: string, y: number, size: number, weight: number, color = '#2c2b2b') => {
    g.fillStyle = color;
    g.font = `${weight} ${size}px "Nunito Variable", Nunito, system-ui, sans-serif`;
    g.fillText(text, canvas.width / 2, y);
  };
  line(t.common.appName, 150, 56, 800, '#003ef2');
  line(t.certificate.heading, 225, 44, 700);
  line(t.certificate.awardedTo, 380, 34, 400, '#565656');
  line(c.name, 480, 80, 800);
  line(t.certificate.completed, 580, 40, 700);
  line(t.certificate.programme, 650, 28, 400, '#565656');
  c.moments.forEach((m, i) => line(`✓ ${m}`, 740 + i * 46, 30, 700, '#166534'));
  line(t.certificate.on(formatDate(c.earnedAt)), 1010, 30, 400, '#565656');
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG failed'))), 'image/png'));
}

/** FR-23: her certificate — only she sees it; downloading or sharing is her choice. */
export default function CertificatePage() {
  const { data, isPending, error, refetch } = useCertificate();
  const back = useBack('/');

  return (
    <Screen>
      <AppHeader title={t.certificate.title} onBack={back} />
      <main className="flex flex-1 flex-col px-5 pt-4 pb-8">
        {isPending ? (
          <LoadingBlock />
        ) : error ? (
          <ErrorBlock error={error} onRetry={() => void refetch()} />
        ) : data.earned ? (
          <Earned certificate={data} />
        ) : (
          <NotYet certificate={data} />
        )}
      </main>
    </Screen>
  );
}

function Earned({ certificate: c }: { certificate: Certificate }) {
  const [busy, setBusy] = useState(false);
  const fileName = `ELSA-certificate-${c.name.replace(/\s+/g, '-')}.png`;
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const download = useCallback(async () => {
    setBusy(true);
    try {
      const url = URL.createObjectURL(await renderPng(c));
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } finally {
      setBusy(false);
    }
  }, [c, fileName]);

  const share = useCallback(async () => {
    setBusy(true);
    try {
      const file = new File([await renderPng(c)], fileName, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: t.certificate.heading });
      else await navigator.share({ title: t.certificate.heading, text: `${c.name} ${t.certificate.completed}` });
    } catch {
      /* she closed the share sheet */
    } finally {
      setBusy(false);
    }
  }, [c, fileName]);

  return (
    <>
      <article className="relative overflow-hidden rounded-card border-[6px] border-header bg-surface px-5 pt-5 pb-6 text-center shadow-card">
        <Confetti pieces={34} />
        <p className="text-[20px] font-extrabold text-action">{t.common.appName}</p>
        <h2 className="text-[18px] font-bold">{t.certificate.heading}</h2>
        <p className="mt-4 text-[14px] text-ink-2">{t.certificate.awardedTo}</p>
        <p className="mt-1 text-[26px] leading-8 font-extrabold">{c.name}</p>
        <p className="mt-2 text-[16px] font-bold">{t.certificate.completed}</p>
        <p className="mt-1 text-[13.5px] leading-5 text-ink-2">{t.certificate.programme}</p>
        <ul className="mt-3 space-y-1 text-[14px] font-bold text-ok">
          {c.moments.map((m) => (
            <li key={m}>✓ {m}</li>
          ))}
        </ul>
        <p className="mt-3 text-[13.5px] text-ink-2">{t.certificate.on(formatDate(c.earnedAt))}</p>
      </article>
      <p className="mt-4 flex items-center justify-center gap-1.5 text-[13px] font-semibold text-sage">
        <LockIcon size={14} />
        {t.certificate.privacy}
      </p>
      <div className="mt-4 flex gap-3">
        <Button variant="outline" className="flex-1" onClick={() => void download()} disabled={busy}>
          {t.certificate.download}
        </Button>
        {canShare && (
          <Button className="flex-1" onClick={() => void share()} disabled={busy}>
            {t.certificate.share}
          </Button>
        )}
      </div>
    </>
  );
}

function NotYet({ certificate: c }: { certificate: Certificate }) {
  const total = c.daysPractised + c.daysNeeded;
  const done = Math.min(c.daysPractised, total);
  return (
    <HeroCard className="flex flex-col items-center px-6 pt-7 pb-8 text-center">
      <DaysRing done={done} total={total} />
      <h2 className="mt-4 text-[19px] font-bold">{t.certificate.notYet}</h2>
      <p className="mt-2 text-[15px] leading-6">{t.certificate.keepGoing}</p>
      <p className="mt-3 text-[15px] font-bold text-action">
        {c.daysNeeded > 0 ? t.certificate.daysLeft(c.daysNeeded) : t.certificate.allDaysDone}
      </p>
      {c.momentsLeft.length > 0 && (
        <div className="mt-4 w-full rounded-[20px] bg-surface px-4 py-3 text-left">
          <p className="text-[14px] font-bold">{t.certificate.momentsLeft}</p>
          <ul className="mt-1.5 space-y-1.5">
            {c.momentsLeft.map((m) => (
              <li key={m} className="flex items-center gap-2.5 text-[14.5px] text-ink-2">
                <span className="size-4 shrink-0 rounded-full border-2 border-line" aria-hidden="true" />
                {m}
              </li>
            ))}
          </ul>
        </div>
      )}
    </HeroCard>
  );
}

/** Practice days so far, as a ring around the award icon. */
function DaysRing({ done, total }: { done: number; total: number }) {
  const r = 46;
  const length = 2 * Math.PI * r;
  const share = total > 0 ? done / total : 0;
  return (
    <div className="relative size-[120px]" role="img" aria-label={t.certificate.daysOf(done, total)}>
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden="true">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--color-surface)" strokeWidth="11" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="var(--color-action)"
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={`${length * share} ${length}`}
          className="transition-[stroke-dasharray] duration-700 ease-out"
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
        <AwardIcon size={22} className="text-action" />
        <span className="mt-0.5 text-[20px] leading-6 font-extrabold">
          {done}
          <span className="text-[14px] font-bold text-ink-2">/{total}</span>
        </span>
        <span className="text-[11.5px] font-semibold text-ink-2">{t.certificate.days}</span>
      </span>
    </div>
  );
}
