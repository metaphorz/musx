// pvoc-processor.js — real-time phase vocoder (STFT -> modify bins -> inverse STFT/OLA).
//
// The browser's AnalyserNode reads an FFT but can't resynthesize, so spectral transforms
// need a custom worklet. This one does a sliding Short-Time Fourier Transform (FFT 2048,
// hop 512 = 75% overlap, Hann window on analysis AND synthesis), lets an `op` modify the
// per-bin magnitude/phase, then inverse-FFTs and overlap-adds back to a continuous stream.
// Latency ~= FFT-hop = 1536 samples (~35 ms at 44.1 k). Per-channel state.
//
// The framing follows the well-tested Bernsee smbPitchShift structure (rover FIFO +
// output accumulator) so reconstruction is unity-gain with no combing. AudioWorklets load
// as classic scripts and can't import, so a compact radix-2 FFT is embedded below.
//
// Phase 2.4a ops (all length-preserving, magnitude/phase domain):
//   thru   — no modification (reconstruction test)
//   freeze — hold the captured frame's magnitudes, advancing each bin's phase by its
//            analysed frequency so the freeze sustains smoothly
//   blur   — average magnitudes over the last N frames (smears transients)
//   filter — spectral gate: keep bins above (or, inverted, below) a fraction of peak level

const N = 2048;          // FFT size
const HOP = 512;         // analysis/synthesis hop (75% overlap)
const OSAMP = N / HOP;   // 4
const N2 = N >> 1;
const LATENCY = N - HOP; // rover start / read offset
const EXPCT = 2 * Math.PI * HOP / N; // expected per-hop phase advance of bin 1
const MAXBLUR = 32;

// --- compact in-place radix-2 FFT (forward + inverse via `inverse` flag) ---
function makeFFT(n) {
  const levels = Math.log2(n);
  const rev = new Uint16Array(n);
  for (let i = 0; i < n; i++) { let x = i, r = 0; for (let j = 0; j < levels; j++) { r = (r << 1) | (x & 1); x >>= 1; } rev[i] = r; }
  const cos = new Float32Array(n >> 1), sin = new Float32Array(n >> 1);
  for (let i = 0; i < (n >> 1); i++) { cos[i] = Math.cos(-2 * Math.PI * i / n); sin[i] = Math.sin(-2 * Math.PI * i / n); }
  return function fft(re, im, inverse) {
    for (let i = 0; i < n; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1, step = n / len;
      for (let i = 0; i < n; i += len) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const wr = cos[k], wi = inverse ? -sin[k] : sin[k];
          const a = i + j, b = a + half;
          const xr = re[b] * wr - im[b] * wi;
          const xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr; im[b] = im[a] - xi;
          re[a] += xr; im[a] += xi;
        }
      }
    }
    if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  };
}

function wrapPhase(x) { // wrap to [-pi, pi] via rounding
  const q = x / Math.PI;
  const r = q >= 0 ? Math.floor(q + 0.5) : Math.ceil(q - 0.5);
  return x - Math.PI * r;
}

class PvocProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.op = 'thru';
    this.thresh = 0.05;   // filter: fraction of peak magnitude
    this.amount = 4;      // blur: frames to average
    this.invert = false;  // filter: keep below instead of above
    this.freezeOn = false;
    this.fft = makeFFT(N);
    this.window = new Float32Array(N);
    let sumW2 = 0;
    for (let k = 0; k < N; k++) { const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * k / N); this.window[k] = w; sumW2 += w * w; }
    // COLA normalization: with analysis+synthesis Hann windows and this hop, each output
    // sample is the sum over overlapping frames of (wa*ws) = sumW2/HOP. Divide by that for
    // unity reconstruction. (Our inverse FFT already divides by N, so no extra 1/N here.)
    this.norm = HOP / sumW2;
    // per-hop scratch (serial, reused across channels)
    this.re = new Float32Array(N); this.im = new Float32Array(N);
    this.mag = new Float32Array(N2 + 1); this.phase = new Float32Array(N2 + 1);
    this.chans = [];
    this.port.onmessage = (e) => this.onMsg(e.data || {});
  }

  onMsg(d) {
    if ('op' in d) this.op = d.op;
    if ('thresh' in d) { const v = +d.thresh; if (Number.isFinite(v)) this.thresh = v; }
    if ('amount' in d) { const v = d.amount | 0; if (v >= 1) this.amount = Math.min(MAXBLUR, v); }
    if ('invert' in d) this.invert = (d.invert === 'on' || d.invert === true);
    if ('freeze' in d) {
      const on = (d.freeze === 'on' || d.freeze === true);
      if (on && !this.freezeOn) for (const ch of this.chans) if (ch) ch.wantCapture = true; // capture on rising edge
      this.freezeOn = on;
    }
    if (d.trig) { this.freezeOn = true; for (const ch of this.chans) if (ch) { ch.wantCapture = true; ch.isFrozen = true; } }
  }

  newChan() {
    return {
      inFifo: new Float32Array(N),
      outFifo: new Float32Array(N),
      outAccum: new Float32Array(2 * N),
      rover: LATENCY,
      lastPhase: new Float32Array(N2 + 1),
      // freeze
      isFrozen: false, wantCapture: false,
      frozenMag: new Float32Array(N2 + 1),
      frozenDelta: new Float32Array(N2 + 1),
      frozenPhase: new Float32Array(N2 + 1),
      // blur history
      blurHist: Array.from({ length: MAXBLUR }, () => new Float32Array(N2 + 1)),
      blurPos: 0, blurCount: 0,
    };
  }

  processFrame(ch) {
    const { re, im, mag, phase, window } = this;
    for (let k = 0; k < N; k++) { re[k] = ch.inFifo[k] * window[k]; im[k] = 0; }
    this.fft(re, im, false);
    let peak = 1e-9;
    for (let k = 0; k <= N2; k++) { const m = Math.hypot(re[k], im[k]); mag[k] = m; phase[k] = Math.atan2(im[k], re[k]); if (m > peak) peak = m; }

    switch (this.op) {
      case 'freeze': this.opFreeze(ch); break;
      case 'blur': this.opBlur(ch); break;
      case 'filter': this.opFilter(peak); break;
      default: break; // thru
    }

    // rebuild Hermitian upper half so the inverse FFT is real
    for (let k = 1; k < N2; k++) { re[N - k] = re[k]; im[N - k] = -im[k]; }
    im[0] = 0; im[N2] = 0;
    this.fft(re, im, true);

    const win = window, norm = this.norm;
    for (let k = 0; k < N; k++) ch.outAccum[k] += win[k] * re[k] * norm;
    for (let k = 0; k < HOP; k++) ch.outFifo[k] = ch.outAccum[k];
    ch.outAccum.copyWithin(0, HOP, HOP + N); // shift accumulator down one hop (tail is zero-filled region)
    ch.inFifo.copyWithin(0, HOP, N);         // shift input FIFO; new samples refill the tail
  }

  opFilter(peak) {
    const t = this.thresh * peak, inv = this.invert, { re, im, mag } = this;
    for (let k = 0; k <= N2; k++) {
      const keep = inv ? (mag[k] < t) : (mag[k] >= t);
      if (!keep) { re[k] = 0; im[k] = 0; }
    }
  }

  opBlur(ch) {
    const { re, im, mag } = this;
    ch.blurHist[ch.blurPos].set(mag);
    ch.blurPos = (ch.blurPos + 1) % MAXBLUR;
    if (ch.blurCount < MAXBLUR) ch.blurCount++;
    const n = Math.min(this.amount, ch.blurCount);
    for (let k = 0; k <= N2; k++) {
      let sum = 0;
      for (let f = 0; f < n; f++) { const idx = (ch.blurPos - 1 - f + MAXBLUR) % MAXBLUR; sum += ch.blurHist[idx][k]; }
      const avg = sum / n, scale = avg / (mag[k] || 1e-9);
      re[k] *= scale; im[k] *= scale;
    }
  }

  opFreeze(ch) {
    const { re, im, mag, phase } = this;
    if (!ch.isFrozen) {
      // while live, keep each bin's true per-hop phase advance ready for the capture instant
      for (let k = 0; k <= N2; k++) {
        let tmp = phase[k] - ch.lastPhase[k];
        ch.lastPhase[k] = phase[k];
        tmp -= k * EXPCT;
        ch.frozenDelta[k] = k * EXPCT + wrapPhase(tmp);
      }
    }
    if (ch.wantCapture) { // capture the current frame (frozenDelta was just measured above)
      for (let k = 0; k <= N2; k++) { ch.frozenMag[k] = mag[k]; ch.frozenPhase[k] = phase[k]; }
      ch.wantCapture = false; ch.isFrozen = true;
    }
    if (this.freezeOn && ch.isFrozen) {
      for (let k = 0; k <= N2; k++) { // hold magnitudes, advance phase -> smooth sustain
        ch.frozenPhase[k] += ch.frozenDelta[k];
        re[k] = ch.frozenMag[k] * Math.cos(ch.frozenPhase[k]);
        im[k] = ch.frozenMag[k] * Math.sin(ch.frozenPhase[k]);
      }
    } else {
      ch.isFrozen = false; // pass current frame through unchanged
    }
  }

  process(inputs, outputs) {
    const input = inputs[0], output = outputs[0];
    for (let c = 0; c < output.length; c++) {
      let ch = this.chans[c]; if (!ch) ch = this.chans[c] = this.newChan();
      const inCh = input && input[c], outCh = output[c];
      for (let i = 0; i < outCh.length; i++) {
        ch.inFifo[ch.rover] = inCh ? inCh[i] : 0;
        outCh[i] = ch.outFifo[ch.rover - LATENCY];
        ch.rover++;
        if (ch.rover >= N) { ch.rover = LATENCY; this.processFrame(ch); }
      }
    }
    return true;
  }
}

registerProcessor('pvoc-processor', PvocProcessor);
