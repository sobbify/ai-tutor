import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { Link, useSearchParams } from 'react-router';
import { HighlightedText } from '@/features/conversation/ChatBubbles';
import { adminApi, type ReplyOutcome } from '../api';
import { adminKeys } from '../keys';
import { Badge, Empty, ErrorBox, Loading, PageHeader, Pagination, SearchBox, Segmented, SelectInput, Table, Td, Th } from '../ui';
import { fmtDateTime } from '../format';

const SIZE = 25;

export default function Replies() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const moment = params.get('moment') ?? '';
  const learner = params.get('learner') ?? '';
  const outcome = (params.get('outcome') as ReplyOutcome | null) ?? 'all';
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);
  const query = { q, moment, outcome, learner, page, size: SIZE };
  const replies = useQuery({ queryKey: adminKeys.replies(query), queryFn: () => adminApi.replies(query), placeholderData: keepPreviousData });
  const moments = useQuery({ queryKey: adminKeys.moments, queryFn: adminApi.moments });

  const update = useCallback(
    (patch: Record<string, string>) =>
      setParams((p) => {
        const next = new URLSearchParams(p);
        for (const [k, v] of Object.entries(patch)) {
          if (v && v !== 'all') next.set(k, v);
          else next.delete(k);
        }
        if (!('page' in patch)) next.delete('page');
        return next;
      }),
    [setParams],
  );
  const setQ = useCallback((v: string) => update({ q: v }), [update]);

  return (
    <>
      <PageHeader title="Replies" subtitle="Every spoken reply and the feedback it got (first attempts measure progress)." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchBox value={q} onChange={setQ} label="Search replies" placeholder="Search words, ID or name" />
        <SelectInput aria-label="Moment" value={moment} onChange={(e) => update({ moment: e.target.value })} className="w-auto">
          <option value="">All moments</option>
          {moments.data?.map((m) => (
            <option key={m.id} value={m.id}>{m.title}</option>
          ))}
        </SelectInput>
        <Segmented
          label="Outcome"
          value={outcome}
          onChange={(v) => update({ outcome: v })}
          options={[
            { value: 'all', label: 'All' },
            { value: 'fix', label: 'Needed a fix' },
            { value: 'clean', label: 'Well said' },
          ]}
        />
        {learner && (
          <Badge tone="blue">
            Learner {learner}
            <button type="button" className="ml-1.5" aria-label="Clear learner filter" onClick={() => update({ learner: '' })}>×</button>
          </Badge>
        )}
      </div>
      {replies.isPending ? (
        <Loading />
      ) : replies.error ? (
        <ErrorBox error={replies.error} onRetry={() => void replies.refetch()} />
      ) : replies.data.total === 0 ? (
        <Empty title="No replies match" />
      ) : (
        <>
          <Table caption="Replies" head={<tr><Th>Learner</Th><Th>Line</Th><Th>Reply & feedback</Th><Th>When</Th></tr>}>
            {replies.data.items.map((r) => (
              <tr key={r.id}>
                <Td className="w-[180px]">
                  <Link to={`/admin/learners/${encodeURIComponent(r.learnerUid)}`} className="font-bold hover:text-action hover:underline">{r.learnerName}</Link>
                  <p className="font-mono text-[12px] text-ink-2">{r.learnerUid}</p>
                </Td>
                <Td className="max-w-[260px]">
                  <p className="text-[12.5px] font-bold text-ink-2">{r.momentTitle}</p>
                  <p className="text-[13.5px]">{r.parentLine}</p>
                </Td>
                <Td className="min-w-[280px]">
                  <p className="text-[14.5px]"><HighlightedText text={r.transcript} phrase={r.fixWrong} /></p>
                  {r.fixBetter ? <p className="mt-1 text-[13.5px] font-bold text-action">Better: “{r.fixBetter}”</p> : <p className="mt-1 text-[13.5px] font-bold text-ok">✓ Well said</p>}
                </Td>
                <Td className="whitespace-nowrap text-[13px] text-ink-2">
                  {fmtDateTime(r.createdAt)}
                  <p>attempt {r.attempt} · {r.evaluator} · {r.latencyMs} ms</p>
                </Td>
              </tr>
            ))}
          </Table>
          <Pagination page={page} size={SIZE} total={replies.data.total} onPage={(p) => update({ page: String(p) })} />
        </>
      )}
    </>
  );
}
