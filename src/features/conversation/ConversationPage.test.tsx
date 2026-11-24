import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecorderStatus, RecordingResult } from '@/hooks/useRecorder';
import { renderRoute } from '@/test/utils';

// The browser microphone isn't available in jsdom: drive the recorder by hand.
let nextTranscript: string | null = null;
let micOutcome: RecorderStatus = 'recording';
vi.mock('@/hooks/useRecorder', () => ({
  useRecorder: () => {
    const [status, setStatus] = useState<RecorderStatus>('idle');
    return {
      status,
      levels: [0.5, 0.5, 0.5, 0.5, 0.5],
      start: async () => setStatus(micOutcome),
      stop: async (): Promise<RecordingResult> => {
        setStatus('idle');
        return { audio: null, transcript: nextTranscript };
      },
      cancel: () => setStatus('idle'),
    };
  },
}));

beforeEach(() => {
  nextTranscript = null;
  micOutcome = 'recording';
});

async function speak(user: ReturnType<typeof userEvent.setup>, transcript: string | null) {
  nextTranscript = transcript;
  await user.click(await screen.findByRole('button', { name: 'Start speaking your reply' }));
  await user.click(await screen.findByRole('button', { name: 'Stop and send your reply' }));
}

describe('Conversation', () => {
  it('runs a turn: hint → listening → grammar fix → next line', async () => {
    const user = userEvent.setup();
    renderRoute('/moments/morning-greeting');

    expect(await screen.findByText('Response 1 of 6')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Conversation so far' })).toHaveTextContent('Ria’s mother at the gate, in Ria’s first week of school.');
    expect(screen.getByText(/We will start with her favourite songs/)).toBeInTheDocument();
    expect(screen.getByText('Speaking only. We never judge your accent.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Start speaking your reply' }));
    expect(await screen.findByText('Take your time. Tap when you finish.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Stop and send your reply' }));

    expect(await screen.findByRole('heading', { name: 'Grammar Fix' })).toBeInTheDocument();
    const card = screen.getByRole('region', { name: 'Grammar Fix' });
    expect(card).toHaveTextContent('You answered her question clearly');
    expect(card).toHaveTextContent('Tense'); // what kind of slip it was
    expect(card).toHaveTextContent(/You said\s+… she settle quickly\./); // “Don’t worry,” wasn’t the slip
    expect(card).toHaveTextContent(/Try\s+She will settle in quickly\./);
    // The slip is marked in her own words, and the new words in the fix stand out.
    expect(within(card).getByText('will', { selector: 'ins' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Conversation so far' }).querySelector('mark')).toHaveTextContent('(mistake: settle)');

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Response 2 of 6')).toBeInTheDocument();
    expect(screen.queryByText('Speaking only. We never judge your accent.')).not.toBeInTheDocument();
  });

  it('"Say It Again" lets the teacher retry the same line', async () => {
    const user = userEvent.setup();
    renderRoute('/moments/morning-greeting');
    await speak(user, 'Don’t worry, she settle quickly.');
    await user.click(await screen.findByRole('button', { name: 'Say It Again' }));
    await speak(user, 'Don’t worry, she will settle in quickly.');
    expect(await screen.findAllByText('No grammar mistakes. Well said!')).not.toHaveLength(0);
    expect(screen.getByText('Response 1 of 6')).toBeInTheDocument();
  });

  it('asks to try again when nothing was heard', async () => {
    const user = userEvent.setup();
    renderRoute('/moments/morning-greeting');
    await speak(user, 'um');
    expect(await screen.findByRole('alert')).toHaveTextContent('We couldn’t hear you clearly');
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
  });

  it('explains a blocked microphone', async () => {
    micOutcome = 'denied';
    const user = userEvent.setup();
    renderRoute('/moments/morning-greeting');
    await user.click(await screen.findByRole('button', { name: 'Start speaking your reply' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The microphone is blocked');
  });

  it('keeps a live transcript of both sides, with each correction docked under her line', async () => {
    const user = userEvent.setup();
    renderRoute('/moments/morning-greeting');
    await speak(user, null);
    await user.click(await screen.findByRole('button', { name: 'Continue' }));
    await screen.findByText('Response 2 of 6');
    const chat = screen.getByRole('list', { name: 'Conversation so far' });
    expect(chat).toHaveTextContent('Good morning, Priya ma’am! Ria is a little nervous today.');
    expect(chat).toHaveTextContent(/Good morning\. Don’t worry, she \(mistake: settle\) quickly\./);
    expect(chat).toHaveTextContent(/Try\s+She will settle in quickly\./);
    expect(chat).toHaveTextContent('please give her this cough syrup at eleven');

    // Captions can be hidden, like on a call.
    await user.click(screen.getByRole('button', { name: 'Captions' }));
    expect(screen.queryByRole('list', { name: 'Conversation so far' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Captions' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('a correction can be closed, and it docks into the chat', async () => {
    const user = userEvent.setup();
    renderRoute('/moments/morning-greeting');
    await speak(user, null);
    await user.click(await screen.findByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('region', { name: 'Grammar Fix' })).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Conversation so far' })).toHaveTextContent(/Try\s+She will settle in quickly\./);
    expect(screen.getByRole('button', { name: 'Say It Again' })).toBeInTheDocument();
  });

  it('after the last line goes to the full chat, then a "Well done" summary', async () => {
    const user = userEvent.setup();
    const { router } = renderRoute('/moments/morning-greeting');
    for (let i = 1; i <= 6; i++) {
      await screen.findByText(`Response ${i} of 6`);
      await speak(user, null);
      await user.click(await screen.findByRole('button', { name: 'Continue' }));
    }
    expect(await screen.findByText('Your Conversation with Ria’s mother')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/moments/morning-greeting/chat');

    await user.click(screen.getByRole('link', { name: 'See Summary' }));
    expect(await screen.findByRole('heading', { name: 'Well done, Priya!' })).toBeInTheDocument();
    expect(screen.queryByText(/is now open/)).not.toBeInTheDocument(); // pick-up was already open (same week)
    expect(screen.getByRole('heading', { name: /Sentences to Practise/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Next Moment' })).toHaveAttribute('href', '/moments/pickup-update/learn');
    await act(async () => {
      await router.navigate('/moments/morning-greeting/summary');
    });
    expect(await screen.findByRole('heading', { name: 'Your Summary' })).toBeInTheDocument();
  });

  it('typing fallback: type a reply instead of speaking, with a grammar tip', async () => {
    const user = userEvent.setup();
    renderRoute('/moments/morning-greeting');
    await user.click(await screen.findByRole('button', { name: 'Type instead' }));
    await user.type(screen.getByRole('textbox', { name: 'Type your reply' }), 'Good morning. Don’t worry, she settle quickly.');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('heading', { name: 'Grammar Fix' })).toBeInTheDocument();
    expect(screen.getByText(/Use “will” for promises/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save to phrasebook: She will settle in quickly.' }));
    expect(await screen.findByRole('button', { name: 'Saved in your phrasebook: She will settle in quickly.' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('notices several slips at once and sorts them by category', async () => {
    const user = userEvent.setup();
    renderRoute('/moments/morning-greeting');
    await user.click(await screen.findByRole('button', { name: 'Type instead' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Type your reply' }),
      'Don’t worry, she settle quickly. She have many friends and he like the songs.',
    );
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('heading', { name: '3 Grammar Fixes' })).toBeInTheDocument();
    const card = screen.getByRole('region', { name: 'Grammar Fix' });
    // One group per kind of slip, each slip with its own one-change fix.
    const tense = within(card).getByRole('region', { name: 'Tense' });
    expect(tense).toHaveTextContent(/Try\s+She will settle in quickly\./);
    const agreement = within(card).getByRole('region', { name: 'He / she + verb' });
    expect(agreement).toHaveTextContent('× 2');
    expect(agreement).toHaveTextContent(/Try\s+She has many friends and he like the songs\./);
    expect(agreement).toHaveTextContent(/Try\s+She have many friends and he likes the songs\./);
    // Then her whole reply with every fix, which she can hear and save too.
    expect(card).toHaveTextContent(/All together\s*She will settle in quickly\. She has many friends and he likes the songs\./);
    expect(within(card).getByRole('button', { name: /Save to phrasebook: She will settle in quickly\. She has/ })).toBeInTheDocument();
    // Every slip is marked in her own words in the chat.
    const marks = screen.getByRole('list', { name: 'Conversation so far' }).querySelectorAll('mark');
    expect([...marks].map((m) => m.textContent)).toEqual(['(mistake: settle)', '(mistake: have)', '(mistake: like)']);
  });

  it('the first chat never shows marks and returns home at the end', async () => {
    const user = userEvent.setup();
    const { router } = renderRoute('/moments/hello-elsa');
    for (let i = 1; i <= 3; i++) {
      await screen.findByText(`Response ${i} of 3`);
      await speak(user, 'I teach Pre-K and my class has eighteen children.');
    }
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(screen.queryByRole('heading', { name: 'Grammar Fix' })).not.toBeInTheDocument();
  });

  it('Rehearse now runs only the first three lines', async () => {
    renderRoute({ pathname: '/moments/phone-call', state: { quick: true } });
    expect(await screen.findByText('Response 1 of 3')).toBeInTheDocument();
    expect(screen.getByText('Rehearse now')).toBeInTheDocument();
  });

  it('shows an error for a moment that does not exist', async () => {
    renderRoute('/moments/nope');
    expect(await screen.findByRole('alert')).toHaveTextContent('Moment not found');
  });
});
