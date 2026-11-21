import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { adminApi } from '../api';
import { adminKeys } from '../keys';
import { Badge, Empty, ErrorBox, Loading, PageHeader, Pagination, SelectInput, Table, Td, Th } from '../ui';
import { fmtDateTime } from '../format';

const SIZE = 50;
const ACTIONS = [
  'admin.login',
  'admin.login_failed',
  'admin.password_changed',
  'admin.created',
  'admin.deleted',
  'learner.renamed',
  'learner.progress_reset',
  'learner.signed_out',
  'learner.deleted',
  'learner.exported',
  'moment.created',
  'moment.updated',
  'moment.deleted',
  'content.imported',
  'content.exported',
  'backup.downloaded',
];

const tone = (action: string) => (action.endsWith('deleted') || action.endsWith('failed') ? 'red' : action.startsWith('admin.') ? 'grey' : action.includes('export') || action.includes('backup') ? 'amber' : 'blue');

export default function Audit() {
  const [params, setParams] = useSearchParams();
  const action = params.get('action') ?? '';
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);
  const query = { page, size: SIZE, action: action || undefined };
  const audit = useQuery({ queryKey: adminKeys.audit(query), queryFn: () => adminApi.audit(query), placeholderData: keepPreviousData });

  return (
    <>
      <PageHeader title="Audit log" subtitle="Every sign-in and every change made in this console." />
      <div className="mb-4">
        <SelectInput aria-label="Filter by action" value={action} onChange={(e) => setParams(e.target.value ? { action: e.target.value } : {})} className="w-auto">
          <option value="">All actions</option>
          {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
        </SelectInput>
      </div>
      {audit.isPending ? (
        <Loading />
      ) : audit.error ? (
        <ErrorBox error={audit.error} onRetry={() => void audit.refetch()} />
      ) : audit.data.total === 0 ? (
        <Empty title="Nothing logged yet" />
      ) : (
        <>
          <Table caption="Audit log" head={<tr><Th>When</Th><Th>Admin</Th><Th>Action</Th><Th>Target</Th><Th>Details</Th></tr>}>
            {audit.data.items.map((a) => (
              <tr key={a.id}>
                <Td className="whitespace-nowrap text-ink-2">{fmtDateTime(a.createdAt)}</Td>
                <Td className="font-bold">{a.adminUsername}</Td>
                <Td><Badge tone={tone(a.action)}>{a.action}</Badge></Td>
                <Td className="font-mono text-[13px]">{a.targetType}:{a.targetId}</Td>
                <Td className="text-[13px] text-ink-2">
                  {Object.entries(a.detail).map(([k, v]) => (
                    <span key={k} className="mr-3 inline-block">
                      {k}: <span className="text-ink">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                    </span>
                  ))}
                </Td>
              </tr>
            ))}
          </Table>
          <Pagination page={page} size={SIZE} total={audit.data.total} onPage={(p) => setParams({ ...(action ? { action } : {}), page: String(p) })} />
        </>
      )}
    </>
  );
}
