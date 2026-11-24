import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createMockApi } from '@/api/mock/mockApi';
import { memoryStore, renderRoute, testApi } from '@/test/utils';

describe('Home', () => {
  it('first visit: day 1, today’s moment, week 1 open and later weeks locked', async () => {
    renderRoute('/');
    expect(await screen.findByRole('heading', { name: 'Hi Priya!' })).toBeInTheDocument();
    expect(screen.getAllByText('Day 1 of 15 · Week 1: Drop-off and pick-up').length).toBeGreaterThan(0);
    expect(screen.getByText('Morning Greeting at Drop-off', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start Morning Greeting at Drop-off' })).toHaveAttribute('href', '/moments/morning-greeting/learn');

    const map = screen.getByRole('region', { name: 'Your practice journey' });
    // A Duolingo-style path: learn + role-play steps per moment, a chest at the end of each week.
    expect(within(map).getByRole('link', { name: 'Morning Greeting at Drop-off, Key phrases and a tip, start here' })).toHaveAttribute(
      'href',
      '/moments/morning-greeting/learn',
    );
    expect(within(map).getByText('Start')).toBeInTheDocument();
    expect(within(map).getByRole('link', { name: /^Pick-up Update, Key phrases and a tip, open$/ })).toHaveAttribute('href', '/moments/pickup-update/learn');
    expect(within(map).getByRole('img', { name: /^Week 1 reward, locked$/ })).toBeInTheDocument();
    // Weeks 2 and 3 open later: their banners say so and their steps are locked, not links.
    expect(within(map).getAllByText('Opens soon')).toHaveLength(2);
    expect(within(map).getByRole('img', { name: /^Parent Meeting, Key phrases and a tip, locked$/ })).toBeInTheDocument();
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

  it('in progress: done moments link to their summary, current shows Continue, streak shows', async () => {
    const api = testApi();
    api.seedDemoProgress();
    renderRoute('/', api);
    expect(await screen.findByRole('link', { name: 'Morning Greeting at Drop-off, Role-play, Done · see summary, done' })).toHaveAttribute(
      'href',
      '/moments/morning-greeting/summary',
    );
    expect(screen.getByRole('link', { name: /^Parent Meeting, Role-play, Response 5 of \d+, start here$/ })).toHaveAttribute('href', '/moments/parent-meeting');
    expect(within(screen.getByRole('region', { name: 'Your practice journey' })).getByText('Continue')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Week 1 complete!, done$/ })).toHaveAttribute('href', '/progress');
    expect(screen.getByText(/Your private streak/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continue Parent Meeting' })).toHaveAttribute('href', '/moments/parent-meeting');
  });

  it('sends a teacher who hasn’t accepted yet to the welcome screens', async () => {
    const api = createMockApi({ storage: memoryStore(), latencyMs: 0 });
    const { router } = renderRoute('/', api);
    expect(await screen.findByRole('heading', { name: 'Hi Priya, I’m ELSA' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/welcome');
  });
});
