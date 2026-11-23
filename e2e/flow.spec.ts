import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function expectAccessible(page: Page) {
  // Let entrance animations finish first: half-faded text would read as low contrast.
  await page
    .waitForFunction(
      `document.getAnimations().every((a) => {
        const t = a.effect && a.effect.getComputedTiming();
        const short = t && t.iterations !== Infinity && Number(t.endTime || 0) <= 2000;
        return !short || a.playState === 'finished';
      })`,
      undefined,
      { timeout: 3000 },
    )
    .catch(() => undefined);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

async function replyOnce(page: Page) {
  await page.getByRole('button', { name: 'Start speaking your reply' }).click();
  await page.getByRole('button', { name: 'Stop and send your reply' }).click();
}

test('day 0 to a finished moment, end to end', async ({ page }) => {
  // Welcome: consent (voice never stored), hardest moment, first chat.
  await page.goto('/?demo=reset');
  await expect(page.getByRole('heading', { name: 'Hi Priya, I’m ELSA' })).toBeVisible();
  await expectAccessible(page);
  await page.getByRole('checkbox', { name: /I understand how ELSA works/ }).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('group', { name: 'Which moment feels hardest?' })).toBeVisible();
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Not sure yet' }).click();
  await expectAccessible(page);
  await page.getByRole('link', { name: 'Start the Chat' }).click();
  for (let i = 1; i <= 3; i++) {
    await expect(page.getByText(`Response ${i} of 3`)).toBeVisible();
    await replyOnce(page);
  }

  // Home: day 1 of the programme.
  await expect(page.getByRole('heading', { name: 'Hi Priya!' })).toBeVisible();
  await expect(page.getByText('Day 1 of 15 · Week 1: Drop-off and pick-up').first()).toBeVisible();
  await expectAccessible(page);

  // Learn → role-play.
  await page.getByRole('link', { name: 'Start Morning Greeting at Drop-off' }).click();
  await expect(page.getByRole('heading', { name: 'Drop-off: calm and clear' })).toBeVisible();
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Start the Role-play' }).click();
  await expect(page.getByText('Response 1 of 6')).toBeVisible();
  await expectAccessible(page);

  await replyOnce(page);
  await expect(page.getByRole('heading', { name: 'Grammar Fix' })).toBeVisible();
  await expect(page.getByText(/Use “will” for promises/)).toBeVisible();
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Save to phrasebook: She will settle in quickly.' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  for (let i = 2; i <= 6; i++) {
    await expect(page.getByText(`Response ${i} of 6`)).toBeVisible();
    await replyOnce(page);
    await page.getByRole('button', { name: 'Continue' }).click();
  }

  await expect(page.getByText('Your Conversation with Ria’s mother')).toBeVisible();
  await expectAccessible(page);
  await page.getByRole('link', { name: 'See Summary' }).click();
  await expect(page.getByRole('heading', { name: 'Well done, Priya!' })).toBeVisible();
  await expectAccessible(page);

  await page.goto('/progress');
  await expect(page.getByRole('img', { name: 'First try: 3 of 6 correct' })).toBeVisible();
  await expect(page.getByText('1 day practised')).toBeVisible();
  await expectAccessible(page);

  await page.goto('/phrasebook');
  await expect(page.getByText('“She will settle in quickly.”')).toBeVisible();
  await expectAccessible(page);
});

test('story, rehearse, certificate and settings screens are accessible', async ({ page }) => {
  await page.goto('/?demo=progress');
  await expect(page.getByText(/Your private streak/)).toBeAttached();
  await expectAccessible(page);

  await page.goto('/story'); // the demo build has no realtime socket, so typing shows straight away
  await page.getByRole('textbox', { name: 'What happened?' }).fill('A parent asked me about lunch and I said he eat well today.');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByRole('heading', { name: 'Next Time, You Could Say' })).toBeVisible();
  await expectAccessible(page);

  await page.goto('/rehearse');
  await expect(page.getByRole('heading', { name: 'Programme moments' })).toBeVisible();
  await expectAccessible(page);
  await page.getByRole('link', { name: /A Parent Calls/ }).click();
  await expect(page.getByText('Response 1 of 3')).toBeVisible();

  await page.goto('/certificate');
  await expect(page.getByRole('heading', { name: 'Not yet earned' })).toBeVisible();
  await expectAccessible(page);

  await page.goto('/settings');
  await expect(page.getByRole('switch', { name: 'Quiet mode' })).toBeVisible();
  await expectAccessible(page);
});

test.describe('dark appearance', () => {
  test.use({ colorScheme: 'dark' });

  test('every main screen stays readable (WCAG AA) in the dark', async ({ page }) => {
    await page.goto('/?demo=progress');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expectAccessible(page);

    await page.goto('/moments/morning-greeting/learn');
    await expectAccessible(page);
    await page.getByRole('button', { name: 'Start the Role-play' }).click();
    await replyOnce(page);
    await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
    await expectAccessible(page);

    for (const path of ['/progress', '/phrasebook', '/rehearse', '/certificate', '/settings']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expectAccessible(page);
    }
    await page.getByRole('radio', { name: 'Light' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });
});
