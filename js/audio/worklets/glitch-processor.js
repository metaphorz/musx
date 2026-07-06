// glitch-processor.js — two CDP "extend" transforms as real-time worklets.
//   iterate-processor : continuously ring-records the input; on `trig` it snapshots the last
//                       `seg` seconds and replays it `count` times with a per-iteration gain
//                       `decay` and semitone `pitch` step (CDP iterate / stutter). It emits
//                       ONLY the iterations (a triggered burst), so patch the dry path too if
//                       you want to hear the source between triggers.
//   scramble-processor: chops the input into `seg`-length segments, keeps the last few, and
//                       plays them back in shuffled or drunk order (CDP scramble/shuffle).
//                       One segment out per segment in, so it stays rate-locked (no drift).
const MAXSEC = 1.0;

class IterateProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.seg = 0.2; this.count = 4; this.decay = 0.7; this.pitch = 0; // pitch = semitone step per iteration
    this.max = Math.ceil(sampleRate * MAXSEC);
    this.chans = [];
    this.port.onmessage = (e) => {
      const d = e.data || {};
      if ('seg' in d) { const v = +d.seg; if (Number.isFinite(v)) this.seg = Math.max(0.005, Math.min(MAXSEC, v / 1000)); }
      if ('count' in d) { const v = d.count | 0; if (v >= 1) this.count = v; }
      if ('decay' in d) { const v = +d.decay; if (Number.isFinite(v)) this.decay = v; }
      if ('pitch' in d) { const v = +d.pitch; if (Number.isFinite(v)) this.pitch = v; }
      if (d.trig) for (const ch of this.chans) if (ch) this.fire(ch);
    };
  }
  newChan() { return { rec: new Float32Array(this.max), recPos: 0, snap: new Float32Array(this.max), snapLen: 0, playing: false, iter: 0, readPos: 0 }; }
  fire(ch) {
    const L = Math.min(this.max, Math.round(this.seg * sampleRate));
    for (let i = 0; i < L; i++) ch.snap[i] = ch.rec[(ch.recPos - L + i + this.max) % this.max];
    ch.snapLen = L; ch.playing = true; ch.iter = 0; ch.readPos = 0;
  }
  process(inputs, outputs) {
    const input = inputs[0], output = outputs[0];
    for (let c = 0; c < output.length; c++) {
      let ch = this.chans[c]; if (!ch) ch = this.chans[c] = this.newChan();
      const inCh = input && input[c], outCh = output[c];
      for (let i = 0; i < outCh.length; i++) {
        ch.rec[ch.recPos] = inCh ? inCh[i] : 0;
        ch.recPos = (ch.recPos + 1) % this.max;
        let o = 0;
        if (ch.playing && ch.snapLen > 1) {
          const rate = Math.pow(2, this.pitch * ch.iter / 12);
          const gain = Math.pow(this.decay, ch.iter);
          const p = ch.readPos, i0 = Math.floor(p), i1 = Math.min(i0 + 1, ch.snapLen - 1), f = p - i0;
          o = (ch.snap[i0] * (1 - f) + ch.snap[i1] * f) * gain;
          ch.readPos += rate;
          if (ch.readPos >= ch.snapLen - 1) { ch.iter++; ch.readPos = 0; if (ch.iter >= this.count) ch.playing = false; }
        }
        outCh[i] = o;
      }
    }
    return true;
  }
}
registerProcessor('iterate-processor', IterateProcessor);

class ScrambleProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.seg = 0.15; this.mode = 'shuffle'; this.CAP = 8; this.reinit = false;
    this.chans = [];
    this.port.onmessage = (e) => {
      const d = e.data || {};
      if ('seg' in d) { const v = +d.seg; if (Number.isFinite(v)) { this.seg = Math.max(0.02, Math.min(1, v / 1000)); this.reinit = true; } }
      if ('mode' in d) this.mode = d.mode;
    };
  }
  newChan() {
    const segLen = Math.max(1, Math.round(this.seg * sampleRate));
    return { segLen, segs: Array.from({ length: this.CAP }, () => new Float32Array(segLen)), write: 0, filled: 0, recPos: 0, rec: new Float32Array(segLen), outSeg: 0, outPos: 0, drunk: 0 };
  }
  pick(ch) {
    const avail = Math.min(ch.filled, this.CAP);
    if (this.mode === 'drunk') {
      ch.drunk += (Math.random() < 0.5 ? -1 : 1);
      ch.drunk = Math.max(0, Math.min(avail - 1, ch.drunk));
      return (ch.write - 1 - ch.drunk + this.CAP) % this.CAP;
    }
    const off = Math.floor(Math.random() * avail);
    return (ch.write - 1 - off + this.CAP) % this.CAP;
  }
  process(inputs, outputs) {
    if (this.reinit) { this.chans = []; this.reinit = false; }
    const input = inputs[0], output = outputs[0];
    for (let c = 0; c < output.length; c++) {
      let ch = this.chans[c]; if (!ch) ch = this.chans[c] = this.newChan();
      const inCh = input && input[c], outCh = output[c], segLen = ch.segLen;
      for (let i = 0; i < outCh.length; i++) {
        ch.rec[ch.recPos] = inCh ? inCh[i] : 0;
        if (++ch.recPos >= segLen) { ch.segs[ch.write].set(ch.rec); ch.write = (ch.write + 1) % this.CAP; ch.filled = Math.min(this.CAP, ch.filled + 1); ch.recPos = 0; }
        let o = 0;
        if (ch.filled > 0) {
          o = ch.segs[ch.outSeg][ch.outPos];
          if (++ch.outPos >= segLen) { ch.outPos = 0; ch.outSeg = this.pick(ch); }
        }
        outCh[i] = o;
      }
    }
    return true;
  }
}
registerProcessor('scramble-processor', ScrambleProcessor);
