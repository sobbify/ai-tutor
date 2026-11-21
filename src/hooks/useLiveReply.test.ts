import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/api/client', () => ({ apiMode: 'http' }));

// ---- minimal Web Audio / WebSocket / getUserMedia fakes ---------------------------------------

class FakeNode {
  connect = vi.fn((next: unknown) => next);
  disconnect = vi.fn();
}
class FakeWorkletNode extends FakeNode {
  static last: FakeWorkletNode;
  port = { onmessage: null as ((e: { data: ArrayBuffer }) => void) | null, postMessage: vi.fn() };
  constructor() {
    super();
    FakeWorkletNode.last = this;
  }
}
class FakeAudioContext {
  state = 'running';
  destination = new FakeNode();
  audioWorklet = { addModule: vi.fn(() => Promise.resolve()) };
  resume = vi.fn(() => Promise.resolve());
  createMediaStreamSource = () => new FakeNode();
  createGain = () => Object.assign(new FakeNode(), { gain: { value: 1 } });
  createAnalyser = () =>
    Object.assign(new FakeNode(), { fftSize: 64, frequencyBinCount: 32, getByteFrequencyData: vi.fn() });
}

class FakeSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static last: FakeSocket;
  readyState = 0;
  binaryType = '';
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.last = this;
  }
  send(data: unknown) {
    this.sent.push(data);
  }
  close = vi.fn(() => {
    this.readyState = 3;
  });
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  server(msg: object) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

const track = { stop: vi.fn() };
const reply = {
  turnId: 'mg-1',
  transcript: 'Don’t worry, she will settle in quickly.',
  attempt: 1,
  feedback: { heard: true, positives: ['You sounded warm and kind'], fix: null },
};

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('AudioWorkletNode', FakeWorkletNode);
  vi.stubGlobal('WebSocket', FakeSocket);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(() => Promise.resolve({ getTracks: () => [track] })) },
  });
});
afterEach(() => vi.unstubAllGlobals());

async function load() {
  return import('./useLiveReply');
}

describe('useLiveReply', () => {
  it('streams PCM while speaking and resolves with the checked reply', async () => {
    const { useLiveReply, liveReplySupported } = await load();
    expect(liveReplySupported()).toBe(true);
    const { result } = renderHook(() => useLiveReply('morning-greeting'));

    let started: Promise<unknown> = Promise.resolve();
    act(() => {
      started = result.current.start('mg-1');
    });
    await waitFor(() => expect(FakeSocket.last).toBeDefined());
    const ws = FakeSocket.last;
    expect(ws.url).toMatch(/^ws:\/\/[^/]+\/ws\/practice\/morning-greeting$/);
    expect(ws.binaryType).toBe('arraybuffer');
    act(() => ws.open());
    expect(JSON.parse(ws.sent[0] as string)).toEqual({ type: 'start', turnId: 'mg-1' });
    await act(async () => {
      ws.server({ type: 'ready', live: true });
      await expect(started).resolves.toEqual({ ok: true });
    });
    expect(result.current.status).toBe('recording');

    // A 40 ms chunk from the worklet goes straight to the socket as binary.
    const chunk = new Int16Array(640).buffer;
    FakeWorkletNode.last.port.onmessage?.({ data: chunk });
    expect(ws.sent[1]).toBe(chunk);

    let finished: Promise<unknown> = Promise.resolve();
    act(() => {
      finished = result.current.finish();
    });
    await waitFor(() => expect(ws.sent.some((m) => m === JSON.stringify({ type: 'stop' }))).toBe(true));
    expect(FakeWorkletNode.last.port.postMessage).toHaveBeenCalledWith('flush');
    expect(track.stop).toHaveBeenCalled();
    await act(async () => {
      ws.server({ type: 'caption', text: reply.transcript });
      ws.server({ type: 'reply', reply });
      await expect(finished).resolves.toEqual(reply);
    });
    expect(result.current.caption).toBe(reply.transcript);
    expect(result.current.status).toBe('idle');
  });

  it('reports a blocked socket as a transport failure (the page falls back to uploading)', async () => {
    const { useLiveReply } = await load();
    const { result } = renderHook(() => useLiveReply('morning-greeting'));
    let started: Promise<unknown> = Promise.resolve();
    act(() => {
      started = result.current.start('mg-1');
    });
    await waitFor(() => expect(FakeSocket.last?.onerror).toBeTruthy());
    await act(async () => {
      FakeSocket.last.onerror?.();
      await expect(started).resolves.toEqual({ ok: false, reason: 'transport' });
    });
    expect(track.stop).toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('passes server errors through (e.g. the line moved on)', async () => {
    const { useLiveReply } = await load();
    const { result } = renderHook(() => useLiveReply('morning-greeting'));
    let started: Promise<{ ok: boolean; error?: { code: string } }> = Promise.resolve({ ok: true });
    act(() => {
      started = result.current.start('mg-2') as typeof started;
    });
    await waitFor(() => expect(FakeSocket.last?.onopen).toBeTruthy());
    await act(async () => {
      FakeSocket.last.open();
      FakeSocket.last.server({ type: 'error', code: 'conflict', message: 'That line is no longer current' });
      const r = await started;
      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe('conflict');
    });
  });
});
