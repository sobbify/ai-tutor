import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { Link, useSearchParams } from 'react-router';
import { adminApi, type LearnerSort } from '../api';
import { adminKeys } from '../keys';
import { Badge, Empty, ErrorBox, Loading, PageHeader, Pagination, SearchBox, SelectInput, Table, Td, Th } from '../ui';
import { fmtAgo, fmtDate, fmtNumber } from '../format';

const SIZE = 25;

export default function Learners() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const sort = (params.get('sort') as LearnerSort | null) ?? 'last_seen';
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);
  const query = { q, sort, page, size: SIZE };
  const learners = useQuery({ queryKey: adminKeys.learners(query), queryFn: () => adminApi.learners(query), placeholderData: keepPreviousData });

  const update = useCallback(
    (patch: Record<string, string>) =>
      setParams((p) => {
        const next = new URLSearchParams(p);
        for (const [k, v] of Object.entries(patch)) {
          if (v) next.set(k, v);
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
      <PageHeader title="Learners" subtitle="Everyone who has opened AI Tutor. Search by ID or name." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchBox value={q} onChange={setQ} label="Search learners" placeholder="Search ID or name" />
        <div className="flex items-center gap-2 text-[13.5px] font-bold">
          <label htmlFor="learner-sort">Sort</label>
          <SelectInput id="learner-sort" value={sort} onChange={(e) => update({ sort: e.target.value })} className="w-auto">
            <option value="last_seen">Last active</option>
            <option value="created">Newest</option>
            <option value="name">Name</option>
            <option value="replies">Most replies</option>
          </SelectInput>
        </div>
      </div>
      {learners.isPending ? (
        <Loading />
      ) : learners.error ? (
        <ErrorBox error={learners.error} onRetry={() => void learners.refetch()} />
      ) : learners.data.total === 0 ? (
        <Empty title={q ? 'No learners match that search' : 'No learners yet'} body={q ? undefined : 'Learners appear here the first time the app opens /in for them.'} />
      ) : (
        <>
          <Table
            caption="Learners"
            head={
              <tr>
                <Th>Learner</Th>
                <Th>Moments done</Th>
                <Th>Replies</Th>
                <Th>First-try grammar</Th>
                <Th>Last active</Th>
                <Th>Joined</Th>
              </tr>
            }
          >
            {learners.data.items.map((l) => (
              <tr key={l.uid} className="hover:bg-[#f7fbff]">
                <Td>
                  <Link to={`/admin/learners/${encodeURIComponent(l.uid)}`} className="font-bold text-ink hover:text-action hover:underline">
                    {l.name}
                  </Link>
                  <p className="font-mono text-[12.5px] text-ink-2">{l.uid}</p>
                </Td>
                <Td className="tabular-nums">{l.momentsDone}</Td>
                <Td className="tabular-nums">{fmtNumber(l.replies)}</Td>
                <Td>{l.accuracy === null ? <span className="text-ink-2">—</span> : <Badge tone={l.accuracy >= 80 ? 'green' : l.accuracy >= 50 ? 'blue' : 'amber'}>{l.accuracy}%</Badge>}</Td>
                <Td className="whitespace-nowrap text-ink-2">{fmtAgo(l.lastSeenAt)}</Td>
                <Td className="whitespace-nowrap text-ink-2">{fmtDate(l.createdAt)}</Td>
              </tr>
            ))}
          </Table>
          <Pagination page={page} size={SIZE} total={learners.data.total} onPage={(p) => update({ page: String(p) })} />
        </>
      )}
    </>
  );
}
