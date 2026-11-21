import { describe, expect, it } from 'vitest';
import { MomentSchema } from '@/types/tutor';
import { ApiError } from '../types';
import { createMockApi } from './mockApi';
import { MOMENTS } from './content';
import { memoryStore } from '@/test/utils';

const api = (opts: Parameters<typeof createMockApi>[0] = {}) => createMockApi({ storage: memoryStore(), latencyMs: 0, onboarded: true, ...opts });

async function playThrough(a: ReturnType<typeof api>, id: string, transcript: (i: number) => string | null = () => null, quick = false) {
  let run = await a.startRun(id, { quick });
  while (!run.completed) {
    const turnId = run.turnIds[run.turnIndex]!;
    await a.submitReply(id, { turnId, audio: null, transcript: transcript(run.turnIndex) });
    run = await a.advance(id);
  }
  return run;
}

const MG_LEVEL_1 = ['mg-1', 'mg-med', 'mg-2', 'mg-3', 'mg-4', 'mg-5'];

describe('content/moments.json', () => {
  it('matches the public Moment schema', async () => {
    const a = api();
    for (const m of MOMENTS) expect(MomentSchema.safeParse(await a.getMoment(m.id)).success).toBe(true);
  });
});

describe('mock tutor API', () => {
  it('asks for consent first', async () => {
    const a = api({ onboarded: false });
    expect((await a.getHome()).consented).toBe(false);
    await expect(a.startRun('morning-greeting')).rejects.toMatchObject({ code: 'consent_required' });
    await a.onboard({ consent: true, hardestMomentId: 'upset-parent' });
    const home = await a.getHome();
    expect(home).toMatchObject({ consented: true, baselineDone: false, recommended: { momentId: 'upset-parent', reason: 'hardest' } });
  });

  it('opens week 1 and the anytime moments; later weeks stay locked', async () => {
    const status = Object.fromEntries((await api().getProgress()).moments.map((m) => [m.id, m.status]));
    expect(status).toMatchObject({
      'morning-greeting': 'available',
      'pickup-update': 'available',
      'parent-meeting': 'locked',
      'upset-parent': 'locked',
      'phone-call': 'available',
    });
    expect(status['hello-elsa']).toBeUndefined();
    await expect(api().startRun('parent-meeting')).rejects.toMatchObject({ code: 'locked' });
  });

  it('resumes an unfinished run instead of starting over', async () => {
    const a = api();
    const run = await a.startRun('morning-greeting');
    expect(run.turnIds).toEqual(MG_LEVEL_1);
    await a.submitReply('morning-greeting', { turnId: 'mg-1', audio: null, transcript: null });
    await a.advance('morning-greeting');
    const resumed = await a.startRun('morning-greeting');
    expect(resumed.runNumber).toBe(run.runNumber);
    expect(resumed.turnIndex).toBe(1);
    expect((await a.getProgress()).moments[0]).toMatchObject({ status: 'in_progress', responsesDone: 1 });
    expect((await a.getHome()).programme).toMatchObject({ daysPractised: 1, practisedToday: true });
  });

  it('will not advance before the line has a reply, or accept another line', async () => {
    const a = api();
    await a.startRun('morning-greeting');
    await expect(a.advance('morning-greeting')).rejects.toBeInstanceOf(ApiError);
    await expect(a.submitReply('morning-greeting', { turnId: 'mg-3', audio: null, transcript: 'Hello there' })).rejects.toMatchObject({
      code: 'conflict',
    });
  });

  it('completing week 1 opens week 2, with summaries and tips', async () => {
    const a = api();
    await playThrough(a, 'morning-greeting');
    const progress = await a.getProgress();
    expect(progress.moments[0]).toMatchObject({ status: 'done', timesPractised: 1, firstTry: [false, false, true, false, true, true] });
    const summary = await a.getSummary('morning-greeting');
    expect(summary).toMatchObject({ firstCompletion: true, unlocked: null, nextMomentId: 'pickup-update', previousPractiseCount: null });
    expect(summary.practise).toHaveLength(3);
    expect(summary.practise[0]?.tip).toBeTruthy();
    await playThrough(a, 'pickup-update');
    expect((await a.getSummary('pickup-update')).unlocked).toEqual({ id: 'parent-meeting', title: 'Parent Meeting' });
  });

  it('raises the hidden level after a clean run', async () => {
    const a = api();
    const moment = await a.getMoment('morning-greeting');
    const ideal = (i: number) => {
      const turn = moment.turns.find((t) => t.id === MG_LEVEL_1[i]);
      return turn?.hint.kind === 'sentence' ? turn.hint.text : null;
    };
    await playThrough(a, 'morning-greeting', ideal);
    const next = await a.startRun('morning-greeting', { restart: true });
    expect(next.turnIds).toContain('mg-allergy');
  });

  it('Rehearse now is three lines and not counted as progress', async () => {
    const a = api();
    const run = await a.startRun('phone-call', { quick: true });
    expect(run).toMatchObject({ kind: 'quick', turnIds: ['pc-1', 'pc-2', 'pc-3'] });
    await playThrough(a, 'phone-call', () => null, true);
    const m = (await a.getProgress()).moments.find((x) => x.id === 'phone-call');
    expect(m).toMatchObject({ status: 'available', timesPractised: 0 });
  });

  it('does not store replies that were not heard', async () => {
    const a = api();
    await a.startRun('morning-greeting');
    const reply = await a.submitReply('morning-greeting', { turnId: 'mg-1', audio: null, transcript: 'uh' });
    expect(reply.feedback.heard).toBe(false);
    await expect(a.advance('morning-greeting')).rejects.toBeInstanceOf(ApiError);
  });

  it('typed replies are evaluated as typed', async () => {
    const a = api();
    await a.startRun('morning-greeting');
    const reply = await a.submitReply('morning-greeting', { turnId: 'mg-1', audio: null, transcript: 'Good morning, she will settle in.', typed: true });
    expect(reply).toMatchObject({ typed: true, feedback: { heard: true } });
  });

  it('phrasebook keeps only lines from practice', async () => {
    const a = api();
    const moment = await a.getMoment('morning-greeting');
    const line = moment.lesson!.phrases[0]!.text;
    await a.savePhrase(line, 'morning-greeting');
    await a.savePhrase(line);
    expect((await a.getPhrasebook()).map((p) => p.text)).toEqual([line]);
    await expect(a.savePhrase('anything')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('stories remove names and count as a practice day', async () => {
    const a = api();
    const story = await a.tellStory('A boy named Rohan cried and I said he eat well.');
    expect(story.transcript).not.toContain('Rohan');
    expect(story.fix?.wrong).toBe('he eat');
    expect((await a.getHome()).programme.daysPractised).toBe(1);
    await a.deleteStory(story.id!);
    expect(await a.getStories()).toEqual([]);
  });

  it('delete my data keeps consent', async () => {
    const a = api();
    await playThrough(a, 'morning-greeting');
    await a.deleteMyData();
    expect((await a.getProgress()).moments[0]?.timesPractised).toBe(0);
    expect((await a.getPreferences()).consented).toBe(true);
    expect((await a.getHome()).baselineDone).toBe(true);
  });

  it('seeds the "journey in progress" state from the design', async () => {
    const a = api();
    a.seedDemoProgress();
    const [mg, pu, pm, up] = (await a.getProgress()).moments;
    expect(mg).toMatchObject({ status: 'done', timesPractised: 3 });
    expect(pu!.status).toBe('done');
    expect(pm).toMatchObject({ status: 'in_progress', responsesDone: 4 });
    expect(up!.status).toBe('locked');
    expect((await a.getHome()).programme.day).toBe(7);
  });

  it('survives corrupt storage', async () => {
    const store = memoryStore();
    store.setItem('ai-tutor:mock:v2', '{not json');
    const a = createMockApi({ storage: store, latencyMs: 0 });
    expect((await a.getProgress()).moments[0]!.status).toBe('available');
  });
});
