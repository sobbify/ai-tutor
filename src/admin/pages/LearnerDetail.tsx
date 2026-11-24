import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { HighlightedText } from '@/features/conversation/ChatBubbles';
import { adminApi, download } from '../api';
import { adminKeys } from '../keys';
import { Badge, ConfirmDialog, Empty, ErrorBox, Field, Loading, PageHeader, Panel, SelectInput, TextInput } from '../ui';
import { errorMessage, fmtAgo, fmtDate, fmtDateTime } from '../format';
import { useToasts } from '../toasts';

type Dialog = 'edit' | 'reset' | 'signout' | 'delete' | null;

export default function LearnerDetail() {
  const { uid = '' } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToasts((s) => s.push);
  const learner = useQuery({ queryKey: adminKeys.learner(uid), queryFn: () => adminApi.learner(uid) });
  const [dialog, setDialog] = useState<Dialog>(null);
  const [name, setName] = useState('');
  const [centre, setCentre] = useState('');
  const [resetMoment, setResetMoment] = useState('');

  const done = (message: string) => {
    toast(message);
    setDialog(null);
    void qc.invalidateQueries({ queryKey: ['admin'] });
  };
  const fail = (e: unknown) => toast(errorMessage(e), 'error');
  const edit = useMutation({
    mutationFn: () => adminApi.updateLearner(uid, { name, centre: centre.trim() }),
    onSuccess: () => done('Learner updated'),
    onError: fail,
  });
  const reset = useMutation({
    mutationFn: () => adminApi.resetLearner(uid, resetMoment || null),
    onSuccess: (r) => done(`Progress reset (${r.runsDeleted} practice runs removed)`),
    onError: fail,
  });
  const signOut = useMutation({ mutationFn: () => adminApi.signOutLearner(uid), onSuccess: (r) => done(`Signed out of ${r.sessionsEnded} browser(s)`), onError: fail });
  const remove = useMutation({
    mutationFn: () => adminApi.deleteLearner(uid),
    onSuccess: () => {
      done('Learner deleted');
      void navigate('/admin/learners', { replace: true });
    },
    onError: fail,
  });

  if (learner.isPending) return <Loading />;
  if (learner.error) return <ErrorBox error={learner.error} onRetry={() => void learner.refetch()} />;
  const l = learner.data;

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2 text-[13.5px]">
        <Link to="/admin/learners" className="font-bold text-action hover:underline">
          Learners
        </Link>
        <span className="text-ink-2"> / {l.name}</span>
      </nav>
      <PageHeader
        title={l.name}
        subtitle={
          <>
            <span className="font-mono">{l.uid}</span> · centre {l.centre ? <span className="font-mono">{l.centre}</span> : 'not set'}
            {l.group && <> · group “{l.group}”</>} · joined {fmtDate(l.createdAt)} · last active {fmtAgo(l.lastSeenAt)}
          </>
        }
        actions={
          <>
            <Button size="sm" variant="outline" onClick={() => { setName(l.name); setCentre(l.centre ?? ''); setDialog('edit'); }}>Edit</Button>
            <Button size="sm" variant="outline" onClick={() => void download(`/learners/${encodeURIComponent(uid)}/export`, `learner-${uid}.json`).catch(fail)}>Export data</Button>
            <Button size="sm" variant="outline" onClick={() => setDialog('reset')}>Reset progress</Button>
            <Button size="sm" variant="outline" onClick={() => setDialog('signout')} disabled={l.sessions.length === 0}>Sign out</Button>
            <Button size="sm" variant="danger" onClick={() => setDialog('delete')}>Delete</Button>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <Panel title="Progress">
          <ul className="flex flex-col divide-y divide-line/70">
            {l.progress.map((m) => {
              const first = m.firstTry?.filter(Boolean).length ?? 0;
              const latest = m.latest?.filter(Boolean).length ?? 0;
              return (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="font-bold">{m.title}</p>
                    <p className="text-[13px] text-ink-2">
                      {m.status === 'done'
                        ? `Practised ${m.timesPractised}× · first try ${first}/${m.responsesTotal} · latest ${latest}/${m.responsesTotal}`
                        : m.status === 'in_progress'
                          ? `${m.responsesDone} of ${m.responsesTotal} lines done`
                          : `${m.responsesTotal} lines`}
                    </p>
                  </div>
                  <Badge tone={m.status === 'done' ? 'green' : m.status === 'in_progress' ? 'blue' : 'grey'}>
                    {m.status === 'in_progress' ? 'In progress' : m.status === 'done' ? 'Done' : m.status === 'available' ? 'Not started' : 'Locked'}
                  </Badge>
                </li>
              );
            })}
          </ul>
        </Panel>
        <Panel title={`Signed-in browsers (${l.sessions.length})`}>
          {l.sessions.length === 0 ? (
            <p className="text-[14px] text-ink-2">Not signed in anywhere.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {l.sessions.map((s) => (
                <li key={s.createdAt} className="rounded-2xl bg-mist px-3.5 py-2.5 text-[13.5px]">
                  <p className="truncate font-semibold" title={s.userAgent}>{browserName(s.userAgent)}</p>
                  <p className="text-ink-2">Opened {fmtDateTime(s.createdAt)} · used {fmtAgo(s.lastUsedAt)} · expires {fmtDate(s.expiresAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Recent replies" className="mt-6" actions={<Link to={`/admin/replies?learner=${encodeURIComponent(uid)}`} className="text-[13.5px] font-bold text-action hover:underline">All replies</Link>}>
        {l.recentReplies.length === 0 ? (
          <Empty title="No replies yet" />
        ) : (
          <ul className="flex flex-col gap-3">
            {l.recentReplies.slice(0, 15).map((r) => (
              <li key={r.id} className="rounded-2xl border border-line/70 px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-[12.5px] text-ink-2">
                  <span className="font-bold text-ink">{r.momentTitle}</span>
                  <span>{fmtDateTime(r.createdAt)} · attempt {r.attempt}</span>
                </div>
                <p className="mt-1 text-[13.5px] text-ink-2">Parent: {r.parentLine}</p>
                <p className={cn('mt-1 text-[15px]')}>
                  <HighlightedText text={r.transcript} phrase={r.fixWrong} />
                </p>
                {r.fixBetter ? <p className="mt-1 text-[13.5px] font-bold text-action">Better: “{r.fixBetter}”</p> : <p className="mt-1 text-[13.5px] font-bold text-ok">✓ Well said</p>}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <ConfirmDialog open={dialog === 'edit'} title="Edit learner" body="Changes show in the app next time they open it. The host app may overwrite the name and centre." confirmLabel="Save" busy={edit.isPending} onConfirm={() => edit.mutate()} onClose={() => setDialog(null)}>
        <Field label="Name">{(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />}</Field>
        <Field label="Centre ID" hint="Groups only mix teachers of one centre. Leave empty to clear.">
          {(id, describedBy) => <TextInput id={id} aria-describedby={describedBy} value={centre} onChange={(e) => setCentre(e.target.value)} maxLength={64} className="font-mono" />}
        </Field>
      </ConfirmDialog>
      <ConfirmDialog open={dialog === 'reset'} title="Reset progress" body="Practice runs and replies are deleted. This can’t be undone." confirmLabel="Reset" danger busy={reset.isPending} onConfirm={() => reset.mutate()} onClose={() => setDialog(null)}>
        <Field label="Which moments?">
          {(id) => (
            <SelectInput id={id} value={resetMoment} onChange={(e) => setResetMoment(e.target.value)}>
              <option value="">All moments</option>
              {l.progress.map((m) => (
                <option key={m.id} value={m.id}>{m.title}</option>
              ))}
            </SelectInput>
          )}
        </Field>
      </ConfirmDialog>
      <ConfirmDialog open={dialog === 'signout'} title="Sign out everywhere" body="Every browser this learner is signed into will need to open AI Tutor from the app again." confirmLabel="Sign out" busy={signOut.isPending} onConfirm={() => signOut.mutate()} onClose={() => setDialog(null)} />
      <ConfirmDialog open={dialog === 'delete'} title="Delete learner" body={<>This permanently deletes <b>{l.name}</b> and all their practice history. Download their data first if you need it.</>} confirmLabel="Delete forever" danger typeToConfirm={l.uid} busy={remove.isPending} onConfirm={() => remove.mutate()} onClose={() => setDialog(null)} />
    </>
  );
}

function browserName(ua: string): string {
  if (!ua) return 'Unknown browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  const app = /Electron/.test(ua) ? 'Electron app' : /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return os ? `${app} on ${os}` : app;
}
