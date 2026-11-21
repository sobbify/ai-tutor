import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useBlocker, useNavigate, useParams } from 'react-router';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { adminApi, type EditableMoment, type EditableTurn } from '../api';
import { adminKeys } from '../keys';
import { ConfirmDialog, ErrorBox, Field, Loading, PageHeader, Panel, Segmented, SelectInput, TextArea, TextInput } from '../ui';
import { errorMessage } from '../format';
import { useToasts } from '../toasts';

const ICONS = [
  { value: 'sun', label: '☀️ Sun' },
  { value: 'backpack', label: '🎒 Backpack' },
  { value: 'chat', label: '💬 Chat' },
  { value: 'handshake', label: '🤝 Handshake' },
  { value: 'school', label: '🏫 School' },
  { value: 'phone', label: '📞 Phone' },
  { value: 'bandage', label: '🩹 Bandage' },
  { value: 'star', label: '⭐ Star' },
] as const;

const LEVELS = [
  { value: 1, label: '1 · Calm (always)' },
  { value: 2, label: '2 · Surprise follow-up' },
  { value: 3, label: '3 · Worried parent' },
  { value: 4, label: '4 · Upset or fast-talking' },
] as const;

const blankTurn = (id = ''): EditableTurn => ({
  id,
  parentLine: '',
  hint: { kind: 'sentence', text: '' },
  videoUrl: null,
  demoReply: '',
  knownFixes: [],
  minLevel: 1,
});

const BLANK: EditableMoment = {
  id: '',
  title: '',
  order: 99,
  icon: 'chat',
  scene: '',
  character: { name: '', role: 'Parent', initials: '', posterUrl: null },
  possessive: 'her',
  published: false,
  kind: 'anytime',
  week: null,
  lesson: null,
  turns: [blankTurn()],
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

export default function MomentEditor() {
  const { momentId = 'new' } = useParams();
  const isNew = momentId === 'new';
  const query = useQuery({ queryKey: adminKeys.moment(momentId), queryFn: () => adminApi.moment(momentId), enabled: !isNew });
  if (!isNew && query.isPending) return <Loading />;
  if (!isNew && query.error) return <ErrorBox error={query.error} onRetry={() => void query.refetch()} />;
  return <Editor key={momentId} initial={isNew ? BLANK : (query.data ?? BLANK)} isNew={isNew} />;
}

function Editor({ initial, isNew }: { initial: EditableMoment; isNew: boolean }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToasts((s) => s.push);
  const [m, setM] = useState<EditableMoment>(initial);
  const [saved, setSaved] = useState(initial);
  const [deleting, setDeleting] = useState(false);
  const dirty = JSON.stringify(m) !== JSON.stringify(saved);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const save = useMutation({
    mutationFn: () => {
      const clean = normalise(m);
      return isNew ? adminApi.createMoment(clean) : adminApi.saveMoment(clean);
    },
    onSuccess: (result) => {
      setM(result);
      setSaved(result);
      toast(isNew ? 'Moment created' : 'Saved — live for learners now');
      void qc.invalidateQueries({ queryKey: ['admin'] });
      if (isNew) void navigate(`/admin/content/${result.id}`, { replace: true });
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const remove = useMutation({
    mutationFn: () => adminApi.deleteMoment(m.id),
    onSuccess: () => {
      setSaved(m);
      toast('Moment deleted');
      void qc.invalidateQueries({ queryKey: ['admin'] });
      void navigate('/admin/content', { replace: true });
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  const patch = (p: Partial<EditableMoment>) => setM((cur) => ({ ...cur, ...p }));
  const patchTurn = (i: number, p: Partial<EditableTurn>) => setM((cur) => ({ ...cur, turns: cur.turns.map((t, j) => (j === i ? { ...t, ...p } : t)) }));
  const moveTurn = (i: number, by: -1 | 1) =>
    setM((cur) => {
      const turns = [...cur.turns];
      const [t] = turns.splice(i, 1);
      if (t) turns.splice(i + by, 0, t);
      return { ...cur, turns };
    });
  const addTurn = () =>
    setM((cur) => ({
      ...cur,
      turns: [...cur.turns, blankTurn(nextTurnId(cur))],
    }));
  const removeTurn = (i: number) => setM((cur) => ({ ...cur, turns: cur.turns.filter((_, j) => j !== i) }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <nav aria-label="Breadcrumb" className="mb-2 text-[13.5px]">
        <Link to="/admin/content" className="font-bold text-action hover:underline">Content</Link>
        <span className="text-ink-2"> / {isNew ? 'New moment' : saved.title}</span>
      </nav>
      <PageHeader
        title={isNew ? 'New moment' : saved.title}
        subtitle={dirty ? 'Unsaved changes' : isNew ? 'Fill in the details, then create.' : 'All changes saved.'}
        actions={
          <>
            {!isNew && (
              <Button type="button" size="sm" variant="danger-outline" onClick={() => setDeleting(true)}>
                Delete
              </Button>
            )}
            <Button type="submit" size="sm" disabled={!dirty || save.isPending} aria-busy={save.isPending}>
              {save.isPending ? 'Saving…' : isNew ? 'Create moment' : 'Save changes'}
            </Button>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[2fr_3fr]">
        <Panel title="Details" className="self-start">
          <div className="flex flex-col gap-4">
            <Field label="Title">{(id) => <TextInput id={id} value={m.title} required maxLength={120} onChange={(e) => patch({ title: e.target.value, ...(isNew ? { id: slug(e.target.value) } : {}) })} />}</Field>
            <Field label="ID" hint={isNew ? 'Lower-case letters, digits and dashes. Can’t be changed later.' : 'Fixed after creation.'}>
              {(id, d) => <TextInput id={id} aria-describedby={d} value={m.id} required pattern="[a-z0-9-]{1,64}" disabled={!isNew} onChange={(e) => patch({ id: e.target.value })} className="font-mono" />}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Position">{(id) => <TextInput id={id} type="number" min={1} max={100} value={m.order} onChange={(e) => patch({ order: Number(e.target.value) || 1 })} />}</Field>
              <Field label="Map icon">
                {(id) => (
                  <SelectInput id={id} value={m.icon} onChange={(e) => patch({ icon: e.target.value as EditableMoment['icon'] })}>
                    {ICONS.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
                  </SelectInput>
                )}
              </Field>
            </div>
            <Field label="Scene" hint="Shown under the video, e.g. “Ria’s mother at the gate…”">{(id, d) => <TextArea id={id} aria-describedby={d} value={m.scene} required maxLength={500} onChange={(e) => patch({ scene: e.target.value })} />}</Field>
            <div className="grid grid-cols-[1fr_88px] gap-3">
              <Field label="Character">{(id) => <TextInput id={id} value={m.character.name} required maxLength={80} onChange={(e) => patch({ character: { ...m.character, name: e.target.value } })} />}</Field>
              <Field label="Initials">{(id) => <TextInput id={id} value={m.character.initials} required maxLength={3} onChange={(e) => patch({ character: { ...m.character, initials: e.target.value.toUpperCase() } })} />}</Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Role">{(id) => <TextInput id={id} value={m.character.role} maxLength={40} onChange={(e) => patch({ character: { ...m.character, role: e.target.value } })} />}</Field>
              <Field label="Pronoun in feedback">
                {(id) => (
                  <SelectInput id={id} value={m.possessive} onChange={(e) => patch({ possessive: e.target.value as EditableMoment['possessive'] })}>
                    <option value="her">her</option>
                    <option value="his">his</option>
                    <option value="their">their</option>
                  </SelectInput>
                )}
              </Field>
            </div>
            <Field label="Poster image URL" hint="Optional still shown before the avatar video loads (https://…)">
              {(id, d) => <TextInput id={id} aria-describedby={d} type="url" value={m.character.posterUrl ?? ''} onChange={(e) => patch({ character: { ...m.character, posterUrl: e.target.value || null } })} />}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type" hint="Programme = the 15-day course. Anytime = rehearse on demand. First chat = never scored.">
                {(id, d) => (
                  <SelectInput
                    id={id}
                    aria-describedby={d}
                    value={m.kind}
                    onChange={(e) => {
                      const kind = e.target.value as EditableMoment['kind'];
                      patch({ kind, week: kind === 'programme' ? (m.week ?? 1) : null });
                    }}
                  >
                    <option value="programme">Programme</option>
                    <option value="anytime">Anytime</option>
                    <option value="baseline">First chat</option>
                  </SelectInput>
                )}
              </Field>
              {m.kind === 'programme' && (
                <Field label="Week">
                  {(id) => (
                    <SelectInput id={id} value={m.week ?? 1} onChange={(e) => patch({ week: Number(e.target.value) })}>
                      <option value={1}>1 · Drop-off and pick-up</option>
                      <option value={2}>2 · Parent meetings</option>
                      <option value={3}>3 · Worried parents</option>
                    </SelectInput>
                  )}
                </Field>
              )}
            </div>
            <div className="flex items-center gap-3 rounded-2xl bg-mist px-4 py-3">
              <input id="moment-published" type="checkbox" aria-describedby="moment-published-hint" checked={m.published} onChange={(e) => patch({ published: e.target.checked })} className="size-5 accent-[#003ef2]" />
              <div>
                <label htmlFor="moment-published" className="block font-bold">Live for learners</label>
                <p id="moment-published-hint" className="text-[13px] text-ink-2">Hidden moments don’t appear on the journey map.</p>
              </div>
            </div>
          </div>
        </Panel>

        <div className="flex flex-col gap-4">
          <LessonPanel lesson={m.lesson} onChange={(lesson) => patch({ lesson })} />
          <h2 className="text-[16px] font-bold">Lines ({m.turns.length})</h2>
          <ol className="flex flex-col gap-4">
            {m.turns.map((t, i) => (
              <TurnCard
                key={`${t.id}-${i}`}
                turn={t}
                index={i}
                total={m.turns.length}
                onChange={(p) => patchTurn(i, p)}
                onMove={(by) => moveTurn(i, by)}
                onRemove={() => removeTurn(i)}
                idEditable={!saved.turns.some((s) => s.id === t.id) || isNew}
              />
            ))}
          </ol>
          <Button type="button" variant="outline" onClick={addTurn} disabled={m.turns.length >= 40}>
            Add a line
          </Button>
        </div>
      </div>

      {save.error && <div className="mt-4"><ErrorBox error={save.error} /></div>}

      <ConfirmDialog
        open={deleting}
        title="Delete moment"
        body={<>This removes <b>{saved.title}</b> and every learner’s practice history for it. Export the content first if you might want it back.</>}
        confirmLabel="Delete forever"
        danger
        typeToConfirm={saved.id}
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
        onClose={() => setDeleting(false)}
      />
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title="Leave without saving?"
        body="Your changes to this moment will be lost."
        confirmLabel="Leave"
        danger
        onConfirm={() => blocker.proceed?.()}
        onClose={() => blocker.reset?.()}
      />
    </form>
  );
}

function TurnCard({
  turn,
  index,
  total,
  idEditable,
  onChange,
  onMove,
  onRemove,
}: {
  turn: EditableTurn;
  index: number;
  total: number;
  idEditable: boolean;
  onChange: (p: Partial<EditableTurn>) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  const [advanced, setAdvanced] = useState(false);
  const label = `Line ${index + 1}`;
  return (
    <li className="rounded-card border border-line/80 bg-white p-5" aria-label={label}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="flex size-8 items-center justify-center rounded-full bg-action text-[14px] font-bold text-white" aria-hidden="true">{index + 1}</span>
          {idEditable ? (
            <TextInput aria-label={`${label} ID`} value={turn.id} required pattern="[a-z0-9-]{1,64}" onChange={(e) => onChange({ id: e.target.value })} className="w-40 py-1 font-mono text-[13px]" />
          ) : (
            <span className="font-mono text-[13px] text-ink-2">{turn.id}</span>
          )}
        </div>
        <div className="flex gap-1">
          <IconBtn label={`Move ${label} up`} disabled={index === 0} onClick={() => onMove(-1)}>↑</IconBtn>
          <IconBtn label={`Move ${label} down`} disabled={index === total - 1} onClick={() => onMove(1)}>↓</IconBtn>
          <IconBtn label={`Remove ${label}`} disabled={total === 1} onClick={onRemove} danger>✕</IconBtn>
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <Field label="Parent says">{(id) => <TextArea id={id} value={turn.parentLine} required maxLength={500} onChange={(e) => onChange({ parentLine: e.target.value })} />}</Field>
        <Field label="Difficulty" hint="A run includes every line up to the teacher’s hidden level. Level 1 lines are always included.">
          {(id, d) => (
            <SelectInput id={id} aria-describedby={d} value={turn.minLevel} onChange={(e) => onChange({ minLevel: Number(e.target.value) })}>
              {LEVELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[13px] font-bold">Hint for the teacher</span>
            <Segmented
              label={`${label} hint type`}
              value={turn.hint.kind}
              onChange={(kind) =>
                onChange({ hint: kind === 'sentence' ? { kind, text: turn.hint.kind === 'starters' ? turn.hint.options.join(' ') : turn.hint.text } : { kind, options: turn.hint.kind === 'sentence' && turn.hint.text ? [turn.hint.text] : [''] } })
              }
              options={[
                { value: 'sentence', label: 'Full sentence' },
                { value: 'starters', label: 'Starters' },
              ]}
            />
          </div>
          {turn.hint.kind === 'sentence' ? (
            <TextArea aria-label={`${label} suggested reply`} value={turn.hint.text} required maxLength={500} onChange={(e) => onChange({ hint: { kind: 'sentence', text: e.target.value } })} />
          ) : (
            <TextArea
              aria-label={`${label} starters, one per line`}
              value={turn.hint.options.join('\n')}
              onChange={(e) => onChange({ hint: { kind: 'starters', options: e.target.value.split('\n').slice(0, 6) } })}
              placeholder={'One starter per line, e.g.\nShe can count…'}
            />
          )}
        </div>
        <Field label="Avatar video URL" hint="From the avatar provider (https://…). Empty = placeholder tile.">
          {(id, d) => <TextInput id={id} aria-describedby={d} type="url" value={turn.videoUrl ?? ''} onChange={(e) => onChange({ videoUrl: e.target.value || null })} />}
        </Field>
        <button type="button" aria-expanded={advanced} onClick={() => setAdvanced((a) => !a)} className="self-start text-[13.5px] font-bold text-action hover:underline">
          {advanced ? 'Hide' : 'Show'} offline-evaluator settings
        </button>
        {advanced && (
          <div className="flex flex-col gap-4 rounded-2xl bg-mist p-4">
            <Field label="Demo reply" hint="Used only by the offline (rules) evaluator when no transcript is available.">
              {(id, d) => <TextArea id={id} aria-describedby={d} value={turn.demoReply} maxLength={500} onChange={(e) => onChange({ demoReply: e.target.value })} />}
            </Field>
            <div>
              <p className="mb-2 text-[13px] font-bold">Known mistakes (offline evaluator)</p>
              <ul className="flex flex-col gap-2">
                {turn.knownFixes.map((k, j) => (
                  <li key={j} className="grid gap-2 sm:grid-cols-[1fr_1fr_2fr_auto]">
                    <TextInput aria-label="Pattern (regex)" placeholder="regex, e.g. \bshe settle\b" value={k.pattern} onChange={(e) => onChange({ knownFixes: turn.knownFixes.map((x, n) => (n === j ? { ...x, pattern: e.target.value } : x)) })} className="font-mono text-[13px]" />
                    <TextInput aria-label="Wrong words" placeholder="wrong words" value={k.wrong} onChange={(e) => onChange({ knownFixes: turn.knownFixes.map((x, n) => (n === j ? { ...x, wrong: e.target.value } : x)) })} />
                    <TextInput aria-label="Better sentence" placeholder="better sentence" value={k.better} onChange={(e) => onChange({ knownFixes: turn.knownFixes.map((x, n) => (n === j ? { ...x, better: e.target.value } : x)) })} />
                    <IconBtn label="Remove mistake" onClick={() => onChange({ knownFixes: turn.knownFixes.filter((_, n) => n !== j) })} danger>✕</IconBtn>
                  </li>
                ))}
              </ul>
              <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => onChange({ knownFixes: [...turn.knownFixes, { pattern: '', wrong: '', better: '' }] })} disabled={turn.knownFixes.length >= 10}>
                Add mistake
              </Button>
            </div>
          </div>
        )}
      </div>
    </li>
  );
}

function LessonPanel({ lesson, onChange }: { lesson: EditableMoment['lesson']; onChange: (l: EditableMoment['lesson']) => void }) {
  if (!lesson) {
    return (
      <Panel title="Learn step">
        <p className="text-[14px] text-ink-2">Key phrases and a grammar tip shown before the role-play. Without one, the teacher goes straight to the role-play.</p>
        <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => onChange({ title: '', intro: '', phrases: [{ text: '', note: '' }], tip: '' })}>
          Add a Learn step
        </Button>
      </Panel>
    );
  }
  const set = (p: Partial<NonNullable<EditableMoment['lesson']>>) => onChange({ ...lesson, ...p });
  return (
    <Panel title="Learn step">
      <div className="flex flex-col gap-3">
        <Field label="Title">{(id) => <TextInput id={id} value={lesson.title} required maxLength={120} onChange={(e) => set({ title: e.target.value })} />}</Field>
        <Field label="Intro">{(id) => <TextArea id={id} value={lesson.intro} maxLength={300} onChange={(e) => set({ intro: e.target.value })} />}</Field>
        <div>
          <p className="mb-2 text-[13px] font-bold">Key phrases (up to 8)</p>
          <ul className="flex flex-col gap-2">
            {lesson.phrases.map((ph, j) => (
              <li key={j} className="grid gap-2 sm:grid-cols-[2fr_1fr_auto]">
                <TextInput aria-label={`Phrase ${j + 1}`} placeholder="Just to confirm: five ml at eleven?" value={ph.text} maxLength={300} onChange={(e) => set({ phrases: lesson.phrases.map((x, n) => (n === j ? { ...x, text: e.target.value } : x)) })} />
                <TextInput aria-label={`Phrase ${j + 1} label`} placeholder="Confirm medicine" value={ph.note} maxLength={80} onChange={(e) => set({ phrases: lesson.phrases.map((x, n) => (n === j ? { ...x, note: e.target.value } : x)) })} />
                <IconBtn label={`Remove phrase ${j + 1}`} onClick={() => set({ phrases: lesson.phrases.filter((_, n) => n !== j) })} danger>✕</IconBtn>
              </li>
            ))}
          </ul>
          <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => set({ phrases: [...lesson.phrases, { text: '', note: '' }] })} disabled={lesson.phrases.length >= 8}>
            Add phrase
          </Button>
        </div>
        <Field label="Grammar tip">{(id) => <TextArea id={id} value={lesson.tip} maxLength={300} onChange={(e) => set({ tip: e.target.value })} />}</Field>
        <Button type="button" size="sm" variant="ghost" className="self-start" onClick={() => onChange(null)}>
          Remove the Learn step
        </Button>
      </div>
    </Panel>
  );
}

function IconBtn({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn('flex size-9 items-center justify-center rounded-full border border-line font-bold hover:bg-mist disabled:opacity-40', danger ? 'text-[#c02626]' : 'text-ink')}
    >
      {children}
    </button>
  );
}

function nextTurnId(m: EditableMoment): string {
  const prefix = m.id.split('-').map((p) => p[0]).join('') || 'line';
  const used = new Set(m.turns.map((t) => t.id));
  let n = m.turns.length + 1;
  while (used.has(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}

/** Trim text and drop empty starters before sending. */
function normalise(m: EditableMoment): EditableMoment {
  return {
    ...m,
    title: m.title.trim(),
    scene: m.scene.trim(),
    character: { ...m.character, name: m.character.name.trim(), initials: m.character.initials.trim(), posterUrl: m.character.posterUrl?.trim() || null },
    lesson: m.lesson
      ? {
          title: m.lesson.title.trim(),
          intro: m.lesson.intro.trim(),
          tip: m.lesson.tip.trim(),
          phrases: m.lesson.phrases.map((p) => ({ text: p.text.trim(), note: p.note.trim() })).filter((p) => p.text),
        }
      : null,
    turns: m.turns.map((t) => ({
      ...t,
      parentLine: t.parentLine.trim(),
      videoUrl: t.videoUrl?.trim() || null,
      hint: t.hint.kind === 'sentence' ? { kind: 'sentence', text: t.hint.text.trim() } : { kind: 'starters', options: t.hint.options.map((o) => o.trim()).filter(Boolean) },
      knownFixes: t.knownFixes.filter((k) => k.pattern.trim() && k.wrong.trim() && k.better.trim()),
    })),
  };
}
