import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createMockApi } from '@/api/mock/mockApi';
import { memoryStore, renderRoute, testApi } from '@/test/utils';

describe('Home', () => {
  it('first visit: lecture 1 opened up as two parts, later lectures as one-line rows', async () => {
    renderRoute('/');
    expect(await screen.findByRole('heading', { name: 'Hi Priya!' })).toBeInTheDocument();
    expect(screen.getAllByText('0 of 4 lectures done').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Your Lectures' })).toBeInTheDocument();
    // The lecture she is on is already open on the path, so no "Today" card repeats it.
    expect(screen.queryByRole('link', { name: 'Start Morning Greeting at Drop-off' })).not.toBeInTheDocument();

    const map = screen.getByRole('region', { name: 'Your practice journey' });
    expect(within(map).getByText('Lecture 1 of 4')).toBeInTheDocument();
    expect(within(map).getByRole('heading', { name: 'Morning Greeting at Drop-off' })).toBeInTheDocument();
    expect(within(map).getByText('With Ria’s mother · 2 parts')).toBeInTheDocument();
    expect(within(map).getByText('0/2 parts')).toBeInTheDocument();
    expect(
      within(map).getByRole('link', { name: 'Morning Greeting at Drop-off, Part 1 · Learn, Key phrases and a tip, start here' }),
    ).toHaveAttribute('href', '/moments/morning-greeting/learn');
    expect(within(map).getByText('Start')).toBeInTheDocument();
    expect(within(map).getByRole('link', { name: /^Morning Greeting at Drop-off, Part 2 · Role-play, \d+ lines, open$/ })).toHaveAttribute(
      'href',
      '/moments/morning-greeting',
    );
    expect(within(map).getByRole('img', { name: /^Lecture 1 reward, locked$/ })).toBeInTheDocument();
    // Other lectures: one line each. Ready ones lead to their next step; locked ones aren't links.
    expect(within(map).getByRole('link', { name: /^Lecture 2:\s*Pick-up Update,\s*Ready$/ })).toHaveAttribute('href', '/moments/pickup-update/learn');
    expect(within(map).getByRole('img', { name: 'Lecture 3: Parent Meeting, Locked' })).toBeInTheDocument();
    expect(within(map).queryByRole('link', { name: /Parent Meeting/ })).not.toBeInTheDocument();

    expect(screen.getByRole('link', { name: /See Progress/ })).toHaveAttribute('href', '/progress');

    // The four main screens sit in a tab bar; Home is the current one.
    const tabs = screen.getByRole('navigation', { name: 'Main' });
    expect(within(tabs).getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    expect(within(tabs).getByRole('link', { name: 'Practise' })).toHaveAttribute('href', '/practise');
    expect(within(tabs).getByRole('link', { name: 'Phrasebook' })).toHaveAttribute('href', '/phrasebook');
    expect(within(tabs).getByRole('link', { name: 'Me' })).toHaveAttribute('href', '/me');
  });

  it('Practise tab: story, rehearse and the anytime moments', async () => {
    renderRoute('/practise');
    expect(await screen.findByRole('heading', { name: 'Tell me what happened' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tell ELSA' })).toHaveAttribute('href', '/story');
    expect(screen.getByRole('link', { name: 'Pick a moment' })).toHaveAttribute('href', '/rehearse');
    expect(screen.getByRole('link', { name: /A Parent Calls/ })).toHaveAttribute('href', '/moments/phone-call/learn');
    expect(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Practise' })).toHaveAttribute('aria-current', 'page');
  });

  it('Me tab: her numbers, then progress, certificate and settings', async () => {
    const api = testApi();
    api.seedDemoProgress();
    renderRoute('/me', api);
    expect(await screen.findByRole('heading', { name: 'Priya' })).toBeInTheDocument();
    expect(screen.getByText('Practice days').closest('div')).toHaveTextContent(/Practice days\d+/);
    expect(screen.getByRole('link', { name: /Your Progress/ })).toHaveAttribute('href', '/progress');
    expect(screen.getByRole('link', { name: /Your Certificate/ })).toHaveAttribute('href', '/certificate');
    expect(screen.getByRole('link', { name: /Settings and Privacy/ })).toHaveAttribute('href', '/settings');
  });

  it('in progress: done lectures link to their summary, the current one shows Continue, streak shows', async () => {
    const api = testApi();
    api.seedDemoProgress();
    renderRoute('/', api);
    expect(await screen.findByRole('link', { name: /^Lecture 1:\s*Morning Greeting at Drop-off,\s*Done$/ })).toHaveAttribute(
      'href',
      '/moments/morning-greeting/summary',
    );
    expect(screen.getByRole('link', { name: /^Parent Meeting, Part 2 · Role-play, Response 5 of \d+, start here$/ })).toHaveAttribute(
      'href',
      '/moments/parent-meeting',
    );
    const map = screen.getByRole('region', { name: 'Your practice journey' });
    expect(within(map).getByText('Continue')).toBeInTheDocument();
    expect(within(map).getByText('1/2 parts')).toBeInTheDocument();
    expect(within(map).getByRole('img', { name: /^Lecture 3 reward, locked$/ })).toBeInTheDocument();
    expect(screen.getByText(/Your private streak/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Continue Parent Meeting' })).not.toBeInTheDocument();
  });

  it('sends a teacher who hasn’t accepted yet to the welcome screens', async () => {
    const api = createMockApi({ storage: memoryStore(), latencyMs: 0 });
    const { router } = renderRoute('/', api);
    expect(await screen.findByRole('heading', { name: 'Hi Priya, I’m ELSA' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/welcome');
  });
});
