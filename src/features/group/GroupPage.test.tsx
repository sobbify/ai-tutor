import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DEMO_GROUP_CODE } from '@/api/mock/mockApi';
import { renderRoute, testApi } from '@/test/utils';

describe('Your Group', () => {
  it('starts a group and shows the invite code', async () => {
    const user = userEvent.setup();
    renderRoute('/group');
    expect(await screen.findByRole('heading', { name: 'Practise together' })).toBeInTheDocument();
    expect(screen.getByText(/never sees what you said/)).toBeInTheDocument();
    const start = screen.getByRole('button', { name: 'Start Group' });
    expect(start).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: 'Group name' }), 'Lotus Room');
    await user.click(start);
    expect(await screen.findByRole('heading', { name: 'Lotus Room' })).toBeInTheDocument();
    expect(screen.getByText('Teachers (1 of 5)')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'This week’s group goal' })).toHaveAttribute('aria-valuemax', '50');
    expect(screen.getByLabelText(/^Invite code: [A-Z0-9 ]+$/)).toBeInTheDocument();
  });

  it('joins with a code, lists colleagues by name with their snowflakes, and can leave', async () => {
    const user = userEvent.setup();
    renderRoute('/group');
    await user.type(await screen.findByRole('textbox', { name: 'Invite code' }), 'wrong1');
    await user.click(screen.getByRole('button', { name: 'Join Group' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No group has that code');

    await user.clear(screen.getByRole('textbox', { name: 'Invite code' }));
    await user.type(screen.getByRole('textbox', { name: 'Invite code' }), DEMO_GROUP_CODE.toLowerCase());
    await user.click(screen.getByRole('button', { name: 'Join Group' }));
    expect(await screen.findByRole('heading', { name: 'Sunflower Room' })).toBeInTheDocument();
    const list = screen.getByRole('list');
    const meera = within(list).getByText('Meera Iyer').closest('li');
    expect(meera).toHaveTextContent('Practised today');
    expect(within(meera!).getByRole('img', { name: '45 snowflakes this week' })).toBeInTheDocument();
    expect(within(list).getByText('You')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Leave Group' }));
    await user.click(screen.getByRole('button', { name: 'Yes, Leave', hidden: true })); // jsdom has no showModal
    expect(await screen.findByRole('heading', { name: 'Practise together' })).toBeInTheDocument();
  });

  it('shows the group on Home and Me', async () => {
    const api = testApi();
    api.seedDemoGroup();
    const { unmount } = renderRoute('/', api);
    expect(await screen.findByRole('link', { name: /Sunflower Room/ })).toHaveAttribute('href', '/group');
    expect(screen.getByRole('link', { name: /^\d+ snowflakes this week$/ })).toHaveAttribute('href', '/me');
    unmount();
    renderRoute('/me', api);
    expect(await screen.findByRole('link', { name: /Your Group\s*Sunflower Room · 4 of 5 teachers/ })).toHaveAttribute('href', '/group');
    expect(screen.getByText('Snowflakes').closest('div')).toHaveTextContent(/this week/);
  });
});
