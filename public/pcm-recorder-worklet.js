// AudioWorklet (from the Live tutor): mic Float32 @ context rate -> PCM16 mono @ 16 kHz, posted in
// 40 ms chunks for the realtime practice socket. Post 'flush' to get the last partial chunk.
class PcmRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000; // sampleRate is a global in the worklet scope
    this.pos = 0;
    this.buf = new Int16Array(640);
    this.len = 0;
    this.port.onmessage = (e) => {
      if (e.data === 'flush' && this.len > 0) {
        const tail = this.buf.slice(0, this.len);
        this.port.postMessage(tail.buffer, [tail.buffer]);
        this.len = 0;
      }
    };
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    // linear-interpolation downsample
    while (this.pos < ch.length - 1) {
      const i = Math.floor(this.pos);
      const f = this.pos - i;
      const s = ch[i] * (1 - f) + ch[i + 1] * f;
      this.buf[this.len++] = Math.max(-1, Math.min(1, s)) * 0x7fff;
      if (this.len === this.buf.length) {
        this.port.postMessage(this.buf.buffer, [this.buf.buffer]);
        this.buf = new Int16Array(640);
        this.len = 0;
      }
      this.pos += this.ratio;
    }
    this.pos -= ch.length;
    return true;
  }
}
registerProcessor('pcm-recorder', PcmRecorder);
