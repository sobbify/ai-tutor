import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { adminApi, download } from '../api';
import { adminKeys } from '../keys';
import { ConfirmDialog, ErrorBox, Field, Loading, PageHeader, Panel, Table, Td, TextArea, TextInput, Th } from '../ui';
import { errorMessage, fmtAgo, fmtDate } from '../format';
import { useToasts } from '../toasts';

const PASSWORD_HINT = '12+ characters with upper- and lower-case letters and a digit.';

export default function Settings() {
  const qc = useQueryClient();
  const toast = useToasts((s) => s.push);
  const me = useQuery({ queryKey: adminKeys.me, queryFn: adminApi.session });
  const admins = useQuery({ queryKey: adminKeys.admins, queryFn: adminApi.admins });
  const [removing, setRemoving] = useState<string | null>(null);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const changePw = useMutation({
    mutationFn: () => adminApi.changePassword(current, next),
    onSuccess: () => {
      toast('Password changed. Other sessions were signed out.');
      setCurrent('');
      setNext('');
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const create = useMutation({
    mutationFn: () => adminApi.createAdmin(username, password),
    onSuccess: () => {
      toast(`Admin ${username} added`);
      setUsername('');
      setPassword('');
      void qc.invalidateQueries({ queryKey: adminKeys.admins });
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const remove = useMutation({
    mutationFn: (u: string) => adminApi.deleteAdmin(u),
    onSuccess: () => {
      toast('Admin removed');
      setRemoving(null);
      void qc.invalidateQueries({ queryKey: adminKeys.admins });
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  const submit = (fn: () => void) => (e: FormEvent) => {
    e.preventDefault();
    fn();
  };

  return (
    <>
      <PageHeader title="Settings" subtitle="Backups, console admins and your password." />
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Backup">
          <p className="text-[14.5px] text-ink-2">
            Download everything — content, learners and their full practice history — as one JSON file. Admin passwords are never included. Keep backups somewhere safe: they contain learners’ data.
          </p>
          <Button className="mt-4" size="md" onClick={() => void download('/backup', 'ai-tutor-backup.json').then(() => toast('Backup downloaded')).catch((e: unknown) => toast(errorMessage(e), 'error'))}>
            Download backup
          </Button>
        </Panel>

        <NudgePanel />

        <Panel title="Change your password">
          <form onSubmit={submit(() => changePw.mutate())} className="flex flex-col gap-4">
            <Field label="Current password">{(id) => <TextInput id={id} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />}</Field>
            <Field label="New password" hint={PASSWORD_HINT}>{(id, d) => <TextInput id={id} aria-describedby={d} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={12} />}</Field>
            <Button type="submit" size="md" className="self-start" disabled={changePw.isPending}>Change password</Button>
          </form>
        </Panel>

        <Panel title="Console admins" className="xl:col-span-2">
          {admins.isPending ? (
            <Loading />
          ) : admins.error ? (
            <ErrorBox error={admins.error} />
          ) : (
            <Table caption="Admins" head={<tr><Th>Username</Th><Th>Added</Th><Th>Last sign-in</Th><Th><span className="sr-only">Actions</span></Th></tr>}>
              {admins.data.map((a) => (
                <tr key={a.username}>
                  <Td className="font-bold">{a.username}{a.username === me.data?.username && <span className="ml-2 text-[12.5px] font-semibold text-ink-2">(you)</span>}</Td>
                  <Td className="text-ink-2">{fmtDate(a.createdAt)}</Td>
                  <Td className="text-ink-2">{a.lastLoginAt ? fmtAgo(a.lastLoginAt) : 'Never'}</Td>
                  <Td className="text-right">
                    {a.username !== me.data?.username && (
                      <Button size="sm" variant="danger-outline" onClick={() => setRemoving(a.username)}>Remove</Button>
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
          )}
          <form onSubmit={submit(() => create.mutate())} className="mt-5 grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <Field label="New admin username">{(id) => <TextInput id={id} value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} pattern="[A-Za-z0-9_.@-]+" autoComplete="off" />}</Field>
            <Field label="Their password" hint={PASSWORD_HINT}>{(id, d) => <TextInput id={id} aria-describedby={d} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={12} autoComplete="new-password" />}</Field>
            <Button type="submit" size="md" disabled={create.isPending} className="sm:mb-6">Add admin</Button>
          </form>
        </Panel>
      </div>
      <ConfirmDialog
        open={removing !== null}
        title="Remove admin"
        body={<>Remove <b>{removing}</b>? They’ll be signed out and can’t use the console any more.</>}
        confirmLabel="Remove"
        danger
        busy={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing)}
        onClose={() => setRemoving(null)}
      />
    </>
  );
}

/** FR-31…34: the host app sends the reminders; here: one central encouragement and school holidays. */
function NudgePanel() {
  const qc = useQueryClient();
  const toast = useToasts((s) => s.push);
  const query = useQuery({ queryKey: adminKeys.nudges, queryFn: adminApi.nudgeSettings });
  const [draft, setDraft] = useState<{ encouragement: string; holidays: string } | null>(null);
  const save = useMutation({
    mutationFn: (d: { encouragement: string; holidays: string }) =>
      adminApi.saveNudgeSettings({ encouragement: d.encouragement, holidays: d.holidays.split(/[\s,]+/).filter(Boolean) }),
    onSuccess: (data) => {
      qc.setQueryData(adminKeys.nudges, data);
      setDraft(null);
      toast('Reminder settings saved');
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  if (query.isPending) return <Panel title="Reminders"><Loading /></Panel>;
  if (query.error) return <Panel title="Reminders"><ErrorBox error={query.error} onRetry={() => void query.refetch()} /></Panel>;
  const value = draft ?? { encouragement: query.data.encouragement, holidays: query.data.holidays.join('\n') };
  return (
    <Panel title="Reminders">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(value);
        }}
      >
        <p className="text-[14px] text-ink-2">
          Teachers choose their own reminder time. The host app fetches due reminders from <code>/api/host/nudges</code> (needs HOST_API_KEY). None on weekends, holidays or after 8 pm.
        </p>
        <Field label="Encouragement from head office" hint="Sent instead of the usual reminder, at most once a week per teacher. Keep it kind — never mention missed days.">
          {(id, d) => <TextArea id={id} aria-describedby={d} maxLength={200} value={value.encouragement} onChange={(e) => setDraft({ ...value, encouragement: e.target.value })} />}
        </Field>
        <Field label="School holidays" hint="One date per line (YYYY-MM-DD). No reminders, and they don’t break streaks.">
          {(id, d) => <TextArea id={id} aria-describedby={d} value={value.holidays} onChange={(e) => setDraft({ ...value, holidays: e.target.value })} className="font-mono" />}
        </Field>
        <Button type="submit" size="md" className="self-start" disabled={!draft || save.isPending}>Save</Button>
      </form>
    </Panel>
  );
}
