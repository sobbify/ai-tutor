import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderRoute, testApi } from '@/test/utils';

describe('Progress', () => {
  it('shows the empty state before any lecture is finished', async () => {
    renderRoute('/progress');
    expect(await screen.findByRole('heading', { name: 'Nothing Here Yet' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start Lecture 1' })).toHaveAttribute('href', '/moments/morning-greeting/learn');
  });

  it('compares first try and latest per lecture, anytime moments below', async () => {
    const api = testApi();
    api.seedDemoProgress();
    renderRoute('/progress', api);
    expect(await screen.findByText('Grammar in Each Lecture')).toBeInTheDocument();
    expect(screen.getByText('Lecture 1')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Anytime Moments' })).toBeInTheDocument();
    expect(screen.getByText('Practised 3 times')).toBeInTheDocument();
    expect(screen.getByText('+1 correct')).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: 'First try: 4 of 6 correct' })).toHaveLength(1);
    expect(screen.getByRole('img', { name: 'Latest: 5 of 6 correct' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'First try: 5 of 8 correct' })).toBeInTheDocument();
    expect(screen.getByText('Redo to compare')).toBeInTheDocument();
    expect(screen.getByText('In progress · 4 of 8 done')).toBeInTheDocument();
    expect(screen.getAllByText('Locked')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Gently, Over Time' })).toBeInTheDocument();
    expect(screen.getByText('6 days practised')).toBeInTheDocument();
  });
});
