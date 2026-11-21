import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttpApi } from './httpApi';
import { useSessionLost } from './session';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('http tutor API', () => {
  it('parses a valid response and sends the session cookie', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(json({ learner: { firstName: 'Priya' }, moments: [], trends: { daysPractised: 0, fillers: null, grammarSlips: null } }));
    vi.stubGlobal('fetch', fetchMock);
    const progress = await createHttpApi('').getProgress();
    expect(progress.learner.firstName).toBe('Priya');
    expect(fetchMock).toHaveBeenCalledWith('/api/tutor/progress', expect.objectContaining({ credentials: 'same-origin' }));
  });

  it('rejects responses that do not match the schema', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ learner: {} })));
    await expect(createHttpApi('').getProgress()).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('maps 204 on /run to null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(createHttpApi('').getRun('morning-greeting')).resolves.toBeNull();
  });

  it('surfaces FastAPI error details and status codes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ detail: 'This moment is still locked' }, 423)));
    await expect(createHttpApi('').startRun('pickup-update')).rejects.toMatchObject({ code: 'locked', message: 'This moment is still locked' });
  });

  it('a 403 from the AccessGate switches the app to "Session not available"', async () => {
    useSessionLost.setState({ lost: false });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ detail: 'Session not available' }, 403)));
    await expect(createHttpApi('').getProgress()).rejects.toMatchObject({ code: 'forbidden' });
    expect(useSessionLost.getState().lost).toBe(true);
  });

  it('reports network failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(createHttpApi('').getProgress()).rejects.toMatchObject({ code: 'network' });
  });

  it('uploads replies as multipart with the audio file', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      json({ turnId: 'mg-1', transcript: 'Hi there', attempt: 1, feedback: { heard: true, positives: [], fix: null } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await createHttpApi('https://tutor.example').submitReply('morning-greeting', {
      turnId: 'mg-1',
      audio: new Blob(['x'], { type: 'audio/webm' }),
      transcript: null,
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://tutor.example/api/tutor/moments/morning-greeting/replies');
    const body = init.body as FormData;
    expect(body.get('turn_id')).toBe('mg-1');
    expect(body.get('audio')).toBeInstanceOf(Blob);
    expect(body.has('transcript')).toBe(false);
  });
});

describe('http tutor API — MVP endpoints', () => {
  it('sends typed replies and Rehearse-now runs', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ momentId: 'phone-call', runNumber: 1, turnIndex: 0, turnIds: ['pc-1'], kind: 'quick', replies: [], completed: false }))
      .mockResolvedValueOnce(json({ id: 3, turnId: 'pc-1', transcript: 'Hello', attempt: 1, typed: true, feedback: { heard: true, positives: [], fix: null, tip: null } }));
    vi.stubGlobal('fetch', fetchMock);
    const api = createHttpApi('');
    await api.startRun('phone-call', { quick: true });
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body as string)).toEqual({ restart: false, quick: true });
    await api.submitReply('phone-call', { turnId: 'pc-1', audio: null, transcript: 'Hello', typed: true });
    const form = fetchMock.mock.calls[1]![1].body as FormData;
    expect(form.get('typed')).toBe('true');
  });

  it('deletes with 204 and maps 428 to consent_required', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(createHttpApi('').deleteMyData()).resolves.toBeUndefined();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ detail: 'Please accept first' }, 428)));
    await expect(createHttpApi('').startRun('morning-greeting')).rejects.toMatchObject({ code: 'consent_required' });
  });
});
