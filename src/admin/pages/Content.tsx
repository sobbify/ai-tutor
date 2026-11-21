import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { Link } from 'react-router';
import { Button, ButtonLink } from '@/components/ui/Button';
import { adminApi, download } from '../api';
import { adminKeys } from '../keys';
import { Badge, ErrorBox, Loading, PageHeader, Table, Td, Th } from '../ui';
import { errorMessage, fmtAgo } from '../format';
import { useToasts } from '../toasts';

const ICONS: Record<string, string> = { sun: '☀️', backpack: '🎒', chat: '💬', handshake: '🤝', school: '🏫', phone: '📞', bandage: '🩹', star: '⭐' };

export default function Content() {
  const qc = useQueryClient();
  const toast = useToasts((s) => s.push);
  const file = useRef<HTMLInputElement>(null);
  const moments = useQuery({ queryKey: adminKeys.moments, queryFn: adminApi.moments });
  const importer = useMutation({
    mutationFn: async (f: File) => adminApi.importContent(JSON.parse(await f.text()) as unknown),
    onSuccess: (r) => {
      toast(`Imported: ${r.created} new, ${r.updated} updated`);
      void qc.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (e) => toast(e instanceof SyntaxError ? 'That file isn’t valid JSON.' : errorMessage(e), 'error'),
  });

  return (
    <>
      <PageHeader
        title="Content"
        subtitle="The practice moments and their lines. Changes go live for learners immediately."
        actions={
          <>
            <Button size="sm" variant="outline" onClick={() => void download('/content/export', 'moments.json').catch((e: unknown) => toast(errorMessage(e), 'error'))}>Export JSON</Button>
            <Button size="sm" variant="outline" onClick={() => file.current?.click()} disabled={importer.isPending}>Import JSON</Button>
            <input
              ref={file}
              type="file"
              accept="application/json,.json"
              className="hidden"
              aria-label="Import content file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importer.mutate(f);
                e.target.value = '';
              }}
            />
            <ButtonLink to="/admin/content/new" size="sm">New moment</ButtonLink>
          </>
        }
      />
      {moments.isPending ? (
        <Loading />
      ) : moments.error ? (
        <ErrorBox error={moments.error} onRetry={() => void moments.refetch()} />
      ) : (
        <Table caption="Moments" head={<tr><Th>#</Th><Th>Moment</Th><Th>Type</Th><Th>Lines</Th><Th>Avatar videos</Th><Th>Learners</Th><Th>Status</Th><Th>Updated</Th></tr>}>
          {moments.data.map((m) => (
            <tr key={m.id} className="hover:bg-[#f7fbff]">
              <Td className="font-bold tabular-nums">{m.order}</Td>
              <Td>
                <Link to={`/admin/content/${m.id}`} className="flex items-center gap-2 font-bold hover:text-action hover:underline">
                  <span aria-hidden="true">{ICONS[m.icon] ?? '•'}</span>
                  {m.title}
                </Link>
                <p className="font-mono text-[12px] text-ink-2">{m.id}</p>
              </Td>
              <Td className="whitespace-nowrap">{m.kind === 'programme' ? `Week ${m.week ?? 1}` : m.kind === 'baseline' ? 'First chat' : 'Anytime'}</Td>
              <Td className="tabular-nums">{m.lines}</Td>
              <Td>{m.videos === 0 ? <span className="text-ink-2">Placeholder</span> : <Badge tone={m.videos === m.lines ? 'green' : 'amber'}>{m.videos} of {m.lines}</Badge>}</Td>
              <Td className="tabular-nums">{m.learnersStarted}</Td>
              <Td>{m.published ? <Badge tone="green">Live</Badge> : <Badge>Hidden</Badge>}</Td>
              <Td className="whitespace-nowrap text-ink-2">{fmtAgo(m.updatedAt)}</Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
