// waveset-processor.js — real-time CDP-style waveset ("wavecycle") distortion.
//
// A *waveset* is the signal between alternate zero-crossings: from one upward
// zero-crossing (prev < 0, cur >= 0) to the next. For a sine that's one cycle;
// for complex sound it's a pseudo-cycle. CDP's DISTORT family segments on these
// and rebuilds the sound from transformed wavesets. This worklet reimplements it
// live: it segments the incoming stream, groups `group` consecutive wavesets into
// a unit, transforms the unit per `mode`, and streams the result out.
//
// Some modes change the sample count (repeat lengthens; omit/telescope/average
// shorten), so output can't be produced sample-for-sample. Each channel owns an
// output FIFO drained 128 samples/quantum; completed transformed units are pushed
// in. The FIFO is capped (~1 s) — on overflow the oldest samples are dropped, on
// underflow zeros are emitted. That cap is the one concession to real-time vs.
// offline CDP; it bounds latency instead of letting it grow without limit.

const MAX_WAVESET = 4096; // force-close a waveset after this many samples (DC / sub-audio guard)

// Linear-interpolation resample of a Float32Array from its length to `outLen`.
function resample(src, outLen) {
  const inLen = src.length;
  const out = new Float32Array(outLen);
  if (inLen === 0 || outLen === 0) return out;
  if (inLen === 1) { out.fill(src[0]); return out; }
  const step = (inLen - 1) / (outLen - 1 || 1);
  for (let i = 0; i < outLen; i++) {
    const x = i * step;
    const i0 = Math.floor(x);
    const i1 = Math.min(i0 + 1, inLen - 1);
    const f = x - i0;
    out[i] = src[i0] * (1 - f) + src[i1] * f;
  }
  return out;
}

// One cycle (or `cycles` cycles) of a simple waveform across `len` samples at `amp`.
function synth(shape, len, amp, cycles) {
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const ph = ((i / len) * cycles) % 1; // 0..1 within each cycle
    let v;
    switch (shape) {
      case 'square':   v = ph < 0.5 ? 1 : -1; break;
      case 'tri':      v = ph < 0.5 ? (4 * ph - 1) : (3 - 4 * ph); break;
      case 'saw':      v = 2 * ph - 1; break;
      default:         v = Math.sin(2 * Math.PI * ph); break; // sine
    }
    out[i] = v * amp;
  }
  return out;
}

// Per-channel state: the waveset segmenter, the group accumulator, the omit
// counter, and the output FIFO (ring buffer).
class Channel {
  constructor(sampleRate) {
    this.prev = 0;                 // last input sample (for zero-cross detection)
    this.cur = [];                 // samples of the waveset being collected
    this.pending = [];             // completed wavesets awaiting a full group
    this.omitIndex = 0;            // position in the keep/skip cycle (units)
    // output FIFO
    this.cap = Math.ceil(sampleRate); // ~1 s
    this.buf = new Float32Array(this.cap);
    this.r = 0; this.w = 0; this.count = 0;
  }

  push(arr) { // append a Float32Array to the FIFO, dropping oldest on overflow
    for (let i = 0; i < arr.length; i++) {
      if (this.count === this.cap) { this.r = (this.r + 1) % this.cap; this.count--; } // drop oldest
      this.buf[this.w] = arr[i];
      this.w = (this.w + 1) % this.cap;
      this.count++;
    }
  }

  pull(out) { // fill `out` from the FIFO, zero-padding when empty
    for (let i = 0; i < out.length; i++) {
      if (this.count > 0) { out[i] = this.buf[this.r]; this.r = (this.r + 1) % this.cap; this.count--; }
      else out[i] = 0;
    }
  }
}

class WavesetProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.opts = { mode: 'repeat', group: 1, count: 2, keep: 1, skip: 1, shape: 'sine', level: 1 };
    this.chans = [];
    this.port.onmessage = (e) => { Object.assign(this.opts, e.data || {}); };
  }

  // Transform one unit (array of `group` wavesets) and push the result to the FIFO.
  processUnit(ch, wavesets) {
    const o = this.opts;
    // concatenate the group into a single unit
    let total = 0; for (const w of wavesets) total += w.length;
    const U = new Float32Array(total);
    let k = 0; for (const w of wavesets) { U.set(w, k); k += w.length; }
    const lvl = o.level;

    switch (o.mode) {
      case 'repeat': { // emit the unit `count` times -> time-extend, sub-octave buzz
        const n = Math.max(1, o.count | 0);
        const out = new Float32Array(U.length * n);
        for (let i = 0; i < n; i++) out.set(U, i * U.length);
        this.scaleAndPush(ch, out, lvl);
        break;
      }
      case 'omit': { // keep `keep` units, drop `skip` units, repeating
        const keep = Math.max(0, o.keep | 0), skip = Math.max(0, o.skip | 0);
        const period = Math.max(1, keep + skip);
        const inKeep = (ch.omitIndex % period) < keep;
        ch.omitIndex = (ch.omitIndex + 1) % period;
        if (inKeep) this.scaleAndPush(ch, U, lvl);
        // else: emit nothing (contracts time)
        break;
      }
      case 'reverse': { // reverse the unit in place -> same length, rougher
        const out = new Float32Array(U.length);
        for (let i = 0; i < U.length; i++) out[i] = U[U.length - 1 - i];
        this.scaleAndPush(ch, out, lvl);
        break;
      }
      case 'average': { // average the group's waveshapes into one -> contract + smear
        const refLen = Math.max(1, Math.round(total / wavesets.length));
        const acc = new Float32Array(refLen);
        for (const w of wavesets) { const rs = resample(w, refLen); for (let i = 0; i < refLen; i++) acc[i] += rs[i]; }
        for (let i = 0; i < refLen; i++) acc[i] /= wavesets.length;
        this.scaleAndPush(ch, acc, lvl);
        break;
      }
      case 'telescope': { // squeeze the group into one average-length waveset -> pitch up
        const outLen = Math.max(1, Math.round(total / wavesets.length));
        this.scaleAndPush(ch, resample(U, outLen), lvl);
        break;
      }
      case 'reform': { // replace with a simple waveform of the same length + peak
        let peak = 0; for (let i = 0; i < U.length; i++) { const a = Math.abs(U[i]); if (a > peak) peak = a; }
        this.scaleAndPush(ch, synth(o.shape, U.length, peak, wavesets.length), lvl);
        break;
      }
      default:
        this.scaleAndPush(ch, U, lvl);
    }
  }

  scaleAndPush(ch, arr, lvl) {
    if (lvl !== 1) for (let i = 0; i < arr.length; i++) arr[i] *= lvl;
    ch.push(arr);
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    const group = Math.max(1, this.opts.group | 0);

    for (let c = 0; c < output.length; c++) {
      let ch = this.chans[c];
      if (!ch) ch = this.chans[c] = new Channel(sampleRate);
      const inCh = input && input[c];

      if (inCh) {
        for (let i = 0; i < inCh.length; i++) {
          const s = inCh[i];
          // upward zero-crossing closes the current waveset
          if (ch.prev < 0 && s >= 0 && ch.cur.length > 0) {
            ch.pending.push(Float32Array.from(ch.cur));
            ch.cur.length = 0;
            if (ch.pending.length >= group) { this.processUnit(ch, ch.pending); ch.pending = []; }
          }
          ch.cur.push(s);
          if (ch.cur.length >= MAX_WAVESET) { // DC / sub-audio: force-close so we never stall
            ch.pending.push(Float32Array.from(ch.cur));
            ch.cur.length = 0;
            if (ch.pending.length >= group) { this.processUnit(ch, ch.pending); ch.pending = []; }
          }
          ch.prev = s;
        }
      }
      ch.pull(output[c]); // drain the FIFO into this quantum's output (zeros if empty)
    }
    return true; // stay alive with no input connected
  }
}

registerProcessor('waveset-processor', WavesetProcessor);
