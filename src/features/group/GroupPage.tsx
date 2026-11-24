import { useId, useState, type FormEvent } from 'react';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { useBack } from '@/hooks/useBack';
import { useCreateGroup, useGroup, useJoinGroup, useLeaveGroup } from '@/hooks/queries';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { ErrorBlock, LoadingBlock } from '@/components/layout/StatusScreens';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog, Section } from '@/components/ui/Controls';
import { CheckIcon, CopyIcon, LockIcon, ShareIcon, UsersIcon } from '@/components/ui/Icons';
import { Snowflake, SnowflakeCount } from '@/components/ui/Snowflake';
import type { Group, GroupMember } from '@/types/tutor';

/**
 * Practise together (PRD §05, FR-25/26/28/30): up to 5 named teachers from one centre, a shared
 * weekly snowflake goal, and each other's names and effort — never feedback, transcripts or levels.
 */
export default function GroupPage() {
  const status = useGroup();
  const back = useBack('/me');

  return (
    <Screen>
      <AppHeader title={t.group.title} onBack={back} />
      <main className="flex flex-1 flex-col gap-4 px-5 pt-4 pb-8">
        {status.isPending ? (
          <LoadingBlock />
        ) : status.error || !status.data ? (
          <ErrorBlock error={status.error} onRetry={() => void status.refetch()} />
        ) : status.data.group ? (
          <MyGroup group={status.data.group} />
        ) : (
          <NoGroup canJoin={status.data.canJoin} />
        )}
      </main>
    </Screen>
  );
}

// ---- not in a group yet ---------------------------------------------------------------------------

function NoGroup({ canJoin }: { canJoin: boolean }) {
  return (
    <>
      <section aria-labelledby="group-intro" className="rounded-card bg-aqua px-4 py-5 text-center shadow-card">
        <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-surface text-action shadow-soft" aria-hidden="true">
          <UsersIcon size={32} />
        </span>
        <h2 id="group-intro" className="mt-3 text-[21px] leading-7 font-extrabold">
          {t.group.introTitle}
        </h2>
        <p className="mt-1.5 text-[15px] leading-6 text-ink-2">{t.group.intro}</p>
      </section>
      <Private />
      {canJoin ? (
        <>
          <CreateForm />
          <JoinForm />
        </>
      ) : (
        <p role="note" className="rounded-card border-2 border-dashed border-line px-4 py-4 text-center text-[15px] leading-6 font-semibold text-ink-2">
          {t.group.noCentre}
        </p>
      )}
    </>
  );
}

function CreateForm() {
  const create = useCreateGroup();
  const [name, setName] = useState('');
  const id = useId();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) create.mutate(name.trim());
  };
  return (
    <Section title={t.group.createTitle}>
      <form onSubmit={submit} className="mt-2 flex flex-col gap-3 pb-1">
        <label htmlFor={id} className="text-[14px] font-bold text-ink-2">
          {t.group.nameLabel}
        </label>
        <input
          id={id}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder={t.group.namePlaceholder}
          autoComplete="off"
          className="-mt-1.5 h-12 rounded-[14px] border-2 border-line bg-surface px-3.5 text-[16px] focus:border-action focus-visible:outline-offset-1"
        />
        <FormError error={create.error} />
        <Button type="submit" block disabled={!name.trim() || create.isPending} aria-busy={create.isPending}>
          {t.group.create}
        </Button>
      </form>
    </Section>
  );
}

function JoinForm() {
  const join = useJoinGroup();
  const [code, setCode] = useState('');
  const id = useId();
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (clean.length >= 4) join.mutate(clean);
  };
  return (
    <Section title={t.group.joinTitle}>
      <form onSubmit={submit} className="mt-2 flex flex-col gap-3 pb-1">
        <label htmlFor={id} className="text-[14px] font-bold text-ink-2">
          {t.group.codeLabel}
        </label>
        <input
          id={id}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={12}
          placeholder={t.group.codePlaceholder}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="-mt-1.5 h-12 rounded-[14px] border-2 border-line bg-surface px-3.5 text-[18px] font-bold tracking-[0.2em] uppercase focus:border-action focus-visible:outline-offset-1"
        />
        <FormError error={join.error} />
        <Button type="submit" variant="outline" block disabled={clean.length < 4 || join.isPending} aria-busy={join.isPending}>
          {t.group.join}
        </Button>
      </form>
    </Section>
  );
}

function FormError({ error }: { error: Error | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-[14px] leading-5 font-semibold text-danger-ink">
      {error.message}
    </p>
  );
}

function Private() {
  return (
    <p className="flex items-start justify-center gap-1.5 px-2 text-center text-[13px] leading-5 font-semibold text-sage">
      <LockIcon size={14} className="mt-[3px] shrink-0" />
      {t.group.private}
    </p>
  );
}

// ---- in a group -------------------------------------------------------------------------------------

function MyGroup({ group }: { group: Group }) {
  const leave = useLeaveGroup();
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <Goal group={group} />

      <section aria-labelledby="group-members">
        <h2 id="group-members" className="px-1 text-[17px] font-bold">
          {t.group.members(group.members.length, group.maxMembers)}
        </h2>
        <ol className="mt-2 divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {group.members.map((m, i) => (
            <MemberRow key={`${m.name}-${i}`} member={m} rank={i + 1} />
          ))}
        </ol>
      </section>

      {group.members.length < group.maxMembers && <Invite group={group} />}

      <Private />

      <Button variant="danger-outline" size="md" className="self-center" onClick={() => setConfirming(true)}>
        {t.group.leave}
      </Button>
      <ConfirmDialog
        open={confirming}
        title={t.group.leaveConfirmTitle}
        body={t.group.leaveConfirm}
        confirmLabel={t.group.leaveYes}
        busy={leave.isPending}
        onClose={() => setConfirming(false)}
        onConfirm={() => leave.mutate(undefined, { onSuccess: () => setConfirming(false) })}
      />
    </>
  );
}

/** The shared weekly goal, like a Duolingo friends quest. */
function Goal({ group }: { group: Group }) {
  const pct = group.weekGoal > 0 ? Math.min(100, (group.weekTotal / group.weekGoal) * 100) : 0;
  const reached = group.weekTotal >= group.weekGoal;
  return (
    <section aria-labelledby="group-name" className="rounded-[20px] bg-[#126bc0] px-4 pt-4 pb-4 text-white shadow-card">
      <p className="text-[12.5px] font-extrabold tracking-[0.08em] uppercase">{t.group.goal}</p>
      <h2 id="group-name" className="mt-0.5 text-[22px] leading-7 font-extrabold">
        {group.name}
      </h2>
      <div className="mt-3 flex items-center gap-2.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white shadow-soft" aria-hidden="true">
          <Snowflake size={28} />
        </span>
        <div className="min-w-0 flex-1">
          <div
            role="progressbar"
            aria-label={t.group.goal}
            aria-valuemin={0}
            aria-valuemax={group.weekGoal}
            aria-valuenow={Math.min(group.weekTotal, group.weekGoal)}
            aria-valuetext={t.group.goalProgress(group.weekTotal, group.weekGoal)}
            className="relative h-4 overflow-hidden rounded-full bg-black/25"
          >
            <div className="h-full rounded-full bg-[#7fd3ff] transition-[width] duration-700" style={{ width: `${pct}%` }}>
              <span className="mx-2 mt-[3px] block h-1 rounded-full bg-white/50" />
            </div>
          </div>
          <p className="mt-1.5 flex flex-wrap justify-between gap-x-3 text-[13.5px] font-bold [&>span]:whitespace-nowrap">
            <span>{t.group.goalProgress(group.weekTotal, group.weekGoal)}</span>
            <span>{reached ? t.group.goalDone : t.group.goalLeft(group.weekGoal - group.weekTotal)}</span>
          </p>
        </div>
      </div>
      <p className="mt-2 text-[12.5px] font-semibold">{t.group.resets}</p>
    </section>
  );
}

const AVATAR_COLOURS = ['#126bc0', '#6b38c4', '#c8285e', '#0b7a55', '#a85a08'];

function MemberRow({ member, rank }: { member: GroupMember; rank: number }) {
  return (
    <li className={cn('flex items-center gap-3 px-4 py-3', member.isMe && 'bg-sky/30')}>
      <span className="w-4 shrink-0 text-center text-[15px] font-extrabold text-ink-2" aria-hidden="true">
        {rank}
      </span>
      <span
        className="flex size-11 shrink-0 items-center justify-center rounded-full text-[20px] font-extrabold text-white"
        style={{ background: AVATAR_COLOURS[(rank - 1) % AVATAR_COLOURS.length] }}
        aria-hidden="true"
      >
        {member.firstName.slice(0, 1).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start gap-1.5">
          <span className="line-clamp-2 text-[16px] leading-[21px] font-bold break-words">{member.name}</span>
          {member.isMe && <span className="mt-0.5 shrink-0 rounded-full bg-action px-2 py-0.5 text-[11.5px] font-extrabold text-on-action">{t.group.you}</span>}
        </span>
        <span className="flex items-center gap-1.5 text-[13px] leading-[18px] font-semibold text-ink-2">
          <span className={cn('size-2 rounded-full', member.practisedToday ? 'bg-[#16a34a]' : 'bg-line')} aria-hidden="true" />
          {member.practisedToday ? t.group.practisedToday : t.group.notToday}
        </span>
      </span>
      <SnowflakeCount value={member.weekSnowflakes} label={t.snowflakes.weekLabel(member.weekSnowflakes)} className="text-[17px] text-action" />
    </li>
  );
}

function Invite({ group }: { group: Group }) {
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(group.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the code is on screen to read out.
    }
  };
  const share = () => {
    navigator.share({ text: t.group.shareText(group.name, group.code) }).catch(() => undefined);
  };
  return (
    <Section title={t.group.invite}>
      <p className="mt-1 text-[14px] leading-5 text-ink-2">{t.group.inviteHelp}</p>
      <p className="mt-3 rounded-[14px] border-2 border-dashed border-action/60 bg-sky/30 py-3 text-center font-mono text-[28px] font-extrabold tracking-[0.3em] text-ink" aria-label={`${t.group.codeLabel}: ${group.code.split('').join(' ')}`}>
        {group.code}
      </p>
      <div className="mt-3 flex gap-2.5 pb-1">
        <Button variant="outline" size="md" className="flex-1" onClick={() => void copy()}>
          {copied ? <CheckIcon size={18} /> : <CopyIcon size={18} />}
          <span aria-live="polite">{copied ? t.group.copied : t.group.copy}</span>
        </Button>
        {canShare && (
          <Button variant="outline" size="md" className="flex-1" onClick={share}>
            <ShareIcon size={18} />
            {t.group.share}
          </Button>
        )}
      </div>
    </Section>
  );
}
