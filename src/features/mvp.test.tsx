import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createMockApi } from '@/api/mock/mockApi';
import { memoryStore, renderRoute, testApi } from '@/test/utils';

describe('Welcome (day 0)', () => {
  it('consent → hardest moment → first chat', async () => {
    const user = userEvent.setup();
    const api = createMockApi({ storage: memoryStore(), latencyMs: 0 });
    const { router } = renderRoute('/welcome', api);
    expect(await screen.findByText('Only you see your practice')).toBeInTheDocument();
    const next = screen.getByRole('button', { name: 'Continue' });
    expect(next).toBeDisabled();
    expect(screen.getByText(/never recorded or stored/)).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /I understand how ELSA works/ }));
    await user.click(next);

    await user.click(await screen.findByRole('radio', { name: /Worried or Upset Parent/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('heading', { name: 'Let’s say hello' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start the Chat' })).toHaveAttribute('href', '/moments/hello-elsa');
    expect((await api.getPreferences()).hardestMomentId).toBe('upset-parent');
    expect(router.state.location.pathname).toBe('/welcome');
  });
});

describe('Learn step', () => {
  it('shows key phrases to hear and save, and the tip', async () => {
    const user = userEvent.setup();
    const { router } = renderRoute('/moments/morning-greeting/learn');
    expect(await screen.findByRole('heading', { name: 'Drop-off: calm and clear' })).toBeInTheDocument();
    expect(screen.getByText('“Just to confirm: five ml at eleven?”')).toBeInTheDocument();
    expect(screen.getByText(/Use “will” for promises/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save to phrasebook: Just to confirm: five ml at eleven?' }));
    await user.click(screen.getByRole('button', { name: 'Start the Role-play' }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/moments/morning-greeting'));
  });
});

describe('Rehearse now', () => {
  it('lists open moments and starts a quick run', async () => {
    renderRoute('/rehearse');
    const programme = await screen.findByRole('heading', { name: 'Programme moments' });
    expect(programme).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Morning Greeting at Drop-off/ })).toHaveAttribute('href', '/moments/morning-greeting');
    expect(screen.queryByRole('link', { name: /Parent Meeting/ })).not.toBeInTheDocument(); // still locked
  });
});

describe('Tell me what happened', () => {
  it('typed story: one fix, a better line, names removed', async () => {
    const user = userEvent.setup();
    renderRoute('/story');
    // jsdom has no Web Audio or sockets, so the typing form shows straight away.
    await user.type(await screen.findByRole('textbox', { name: 'What happened?' }), 'A boy named Rohan cried and I told his mother he eat well.');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('heading', { name: 'Next Time, You Could Say' })).toBeInTheDocument();
    expect(screen.queryByText(/Rohan/)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Grammar Fix' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tell Another' }));
    expect(await screen.findByRole('heading', { name: 'Earlier Stories' })).toBeInTheDocument();
  });
});

describe('Phrasebook', () => {
  it('lists saved lines and removes them', async () => {
    const user = userEvent.setup();
    const api = testApi();
    await api.savePhrase('Thank you for letting me know.');
    renderRoute('/phrasebook', api);
    expect(await screen.findByText('“Thank you for letting me know.”')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove: Thank you for letting me know.' }));
    expect(await screen.findByRole('heading', { name: 'Your phrasebook is waiting' })).toBeInTheDocument();
  });
});

describe('Certificate', () => {
  it('shows what is left before it is earned', async () => {
    renderRoute('/certificate');
    expect(await screen.findByRole('heading', { name: 'Not yet earned' })).toBeInTheDocument();
    expect(screen.getByText('15 more practice days')).toBeInTheDocument();
  });
});

describe('Settings', () => {
  it('saves preferences and deletes practice data after confirming', async () => {
    const user = userEvent.setup();
    const api = testApi();
    renderRoute('/settings', api);
    const quiet = await screen.findByRole('switch', { name: 'Quiet mode' });
    await user.click(quiet);
    expect(await screen.findByRole('switch', { name: 'Quiet mode' })).toHaveAttribute('aria-checked', 'true');
    expect((await api.getPreferences()).quietMode).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Delete My Data' }));
    const dialog = screen.getByRole('dialog', { hidden: true });
    await user.click(within(dialog).getByRole('button', { name: 'Delete', hidden: true }));
    expect(await screen.findByText('Your practice data was deleted.')).toBeInTheDocument();
  });
});
