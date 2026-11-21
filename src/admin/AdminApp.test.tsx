import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderRoute } from '@/test/utils';

vi.mock('@/api/client', () => ({ apiMode: 'http' }));

const STATS = {
  kpis: { learners: 2, activeLearnersWeek: 2, signedInNow: 1, repliesTotal: 7, repliesWeek: 7, completedRuns: 1, accuracyMonth: 57.1, avgEvalMs: 812 },
  activity: Array.from({ length: 30 }, (_, i) => ({ date: `2026-11-${String((i % 28) + 1).padStart(2, '0')}`, replies: i === 29 ? 7 : 0, learners: i === 29 ? 2 : 0 })),
  moments: [{ id: 'morning-greeting', title: 'Morning Greeting at Drop-off', learnersStarted: 2, completions: 1, accuracy: 57.1 }],
  topFixes: [{ wrong: 'settle', better: 'She will settle in quickly.', count: 2 }],
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let signedIn = false;
const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  if (url === '/api/admin/session') return json({ username: signedIn ? 'bloom' : null });
  if (url === '/api/admin/login') {
    const body = JSON.parse(String(init?.body)) as { password: string };
    if (body.password !== 'Right-Password-1') return json({ detail: 'Wrong username or password' }, 401);
    signedIn = true;
    return json({ username: 'bloom' });
  }
  if (url === '/api/admin/stats') return json(STATS);
  return json({ detail: 'Not Found' }, 404);
});

beforeEach(() => {
  signedIn = false;
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe('Admin console', () => {
  it('asks for a sign-in, shows errors, then opens the dashboard', async () => {
    const user = userEvent.setup();
    renderRoute('/admin');
    expect(await screen.findByRole('heading', { name: 'AI Tutor console' })).toBeInTheDocument();

    await user.type(screen.getByLabelText('Username'), 'bloom');
    await user.type(screen.getByLabelText('Password'), 'nope');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong username or password');
    expect(screen.getByLabelText('Password')).toHaveValue(''); // cleared after a failed attempt

    await user.type(screen.getByLabelText('Password'), 'Right-Password-1');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText('57.1%')).toBeInTheDocument();
    expect(screen.getByText('“She will settle in quickly.”')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Console' })).toBeInTheDocument();

    const login = fetchMock.mock.calls.find(([u]) => u === '/api/admin/login');
    expect((login?.[1]?.headers as Record<string, string>)['X-Requested-With']).toBe('ai-tutor');
  });

  it('offers the activity data as a table', async () => {
    signedIn = true;
    const user = userEvent.setup();
    renderRoute('/admin');
    await user.click(await screen.findByRole('button', { name: 'View as table' }));
    await waitFor(() => expect(screen.getByRole('table', { name: 'Replies per day, last 30 days' })).toBeInTheDocument());
  });
});
