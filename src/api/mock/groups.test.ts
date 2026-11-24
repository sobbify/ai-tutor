import { describe, expect, it } from 'vitest';
import { GroupStatusSchema, HomeSchema, SummarySchema } from '@/types/tutor';
import { memoryStore } from '@/test/utils';
import { DEMO_GROUP_CODE, SNOWFLAKES, createMockApi } from './mockApi';

const api = () => createMockApi({ storage: memoryStore(), latencyMs: 0, onboarded: true, today: () => new Date(2026, 10, 25) });

async function playThrough(a: ReturnType<typeof api>, id: string, retryFirst = false) {
  let run = await a.startRun(id);
  while (!run.completed) {
    const turnId = run.turnIds[run.turnIndex]!;
    await a.submitReply(id, { turnId, audio: null, transcript: null });
    if (retryFirst && run.turnIndex === 0) await a.submitReply(id, { turnId, audio: null, transcript: null });
    run = await a.advance(id);
  }
}

describe('snowflakes (mock)', () => {
  it('rewards effort: finishing, saying it again, a story and the day’s practice', async () => {
    const a = api();
    // The onboarded demo teacher already did the first chat (undated, so not in this week).
    const base = (await a.getHome()).snowflakes;
    expect(base).toEqual({ total: SNOWFLAKES.finished, week: 0 });
    await playThrough(a, 'morning-greeting', true);
    const summary = await a.getSummary('morning-greeting');
    expect(SummarySchema.safeParse(summary).success).toBe(true);
    expect(summary.snowflakes).toEqual({
      earned: SNOWFLAKES.finished + SNOWFLAKES.again,
      items: [
        { kind: 'finished', amount: SNOWFLAKES.finished },
        { kind: 'again', amount: SNOWFLAKES.again },
      ],
      week: SNOWFLAKES.finished + SNOWFLAKES.again + SNOWFLAKES.daily,
    });
    const story = await a.tellStory('A mother asked about the picnic and I explained it.');
    expect(story.snowflakes).toBe(SNOWFLAKES.story);
    const home = await a.getHome();
    expect(HomeSchema.safeParse(home).success).toBe(true);
    expect(home.snowflakes.total).toBe(base.total + SNOWFLAKES.finished + SNOWFLAKES.again + SNOWFLAKES.daily + SNOWFLAKES.story);
    await a.deleteMyData(); // keeps only the first chat, as before
    expect((await a.getHome()).snowflakes).toEqual(base);
  });
});

describe('groups (mock)', () => {
  it('starts, joins by code (spaces and case ignored) and leaves', async () => {
    const a = api();
    expect(await a.getGroup()).toEqual({ group: null, canJoin: true });
    const made = await a.createGroup('  Lotus   Room ');
    expect(GroupStatusSchema.safeParse(made).success).toBe(true);
    expect(made.group).toMatchObject({ name: 'Lotus Room', createdByMe: true, maxMembers: 5, weekGoal: 50 });
    await expect(a.joinGroup(DEMO_GROUP_CODE)).rejects.toMatchObject({ code: 'conflict' });
    await a.leaveGroup();
    await expect(a.joinGroup('nope42')).rejects.toMatchObject({ code: 'not_found' });

    const joined = await a.joinGroup(` ${DEMO_GROUP_CODE.slice(0, 3).toLowerCase()}-${DEMO_GROUP_CODE.slice(3)} `);
    const names = joined.group?.members.map((m) => m.name) ?? [];
    expect(names).toContain('Meera Iyer');
    expect(joined.group?.members.filter((m) => m.isMe)).toHaveLength(1);
    // Ordered by this week's snowflakes.
    const counts = joined.group?.members.map((m) => m.weekSnowflakes) ?? [];
    expect(counts).toEqual([...counts].sort((x, y) => y - x));
    expect((await a.getHome()).group).toMatchObject({ name: 'Sunflower Room', members: 4, weekGoal: 200 });
  });
});
