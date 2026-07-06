// probe-pvoc.mjs — Phase 2.4a check for the phase-vocoder worklet.
// Critical checks: (1) `thru` reconstructs the input at ~unity gain (a broken STFT/OLA
// combs or drifts in level); (2) `freeze` sustains after the input stops; (3) blur/filter
// pass audio. Runs in a real browser and reads RMS/meter dB.
import { chromium } from 'playwright';

const PORT = process.argv[2] || '8123';
const BASE = `http://localhost:${PORT}/index.html`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await (await browser.newContext()).newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log(`  [console.error] ${m.text()}`); });
page.on('pageerror', (e) => console.log(`  [PAGEERROR] ${e.message}`));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.editor && window.Tone);
await page.click('#btn-audio');
await sleep(400);

const r = await page.evaluate(async () => {
  const Tone = window.Tone;
  const { loadWorklets, makeWorkletNode } = await import('/js/audio/worklet.js');
  await loadWorklets();
  const rms = (a) => { let s = 0; for (const x of a) s += x * x; return Math.sqrt(s / a.length); };
  const out = {};

  // (1) thru reconstruction: RMS(pvoc thru) ~= RMS(direct)
  {
    const osc = new Tone.Oscillator({ frequency: 220, type: 'sine' }).start();
    const wk = makeWorkletNode('pvoc-processor'); wk.node.port.postMessage({ op: 'thru' });
    osc.connect(wk.in);
    const wfD = new Tone.Waveform(2048); const wfT = new Tone.Waveform(2048);
    osc.connect(wfD); wk.out.connect(wfT);
    await new Promise((r) => setTimeout(r, 600));
    out.thruRatio = rms(wfT.getValue()) / (rms(wfD.getValue()) || 1e-9);
    osc.stop(); osc.dispose(); wk.dispose(); wfD.dispose(); wfT.dispose();
  }

  // (2) freeze sustains after input stops
  {
    const osc = new Tone.Oscillator({ frequency: 330, type: 'sawtooth' }).start();
    const wk = makeWorkletNode('pvoc-processor'); wk.node.port.postMessage({ op: 'freeze' });
    osc.connect(wk.in);
    const meter = new Tone.Meter({ smoothing: 0.1 }); wk.out.connect(meter);
    await new Promise((r) => setTimeout(r, 400));
    wk.node.port.postMessage({ freeze: 'on' });            // capture current frame
    await new Promise((r) => setTimeout(r, 200));
    osc.stop(); osc.disconnect(wk.in);                     // kill the input entirely
    await new Promise((r) => setTimeout(r, 500));          // frozen frame should still ring
    let peak = -Infinity;
    for (let i = 0; i < 8; i++) { await new Promise((r) => setTimeout(r, 50)); const v = meter.getValue(); if (v > peak) peak = v; }
    out.freezeAfterStop = peak;
    osc.dispose(); wk.dispose(); meter.dispose();
  }

  // (2b) pitch: ratio 1 (0 semis) reconstructs at unity; +12 semis stays audible
  {
    const osc = new Tone.Oscillator({ frequency: 220, type: 'sine' }).start();
    const wk = makeWorkletNode('pvoc-processor'); wk.node.port.postMessage({ op: 'pitch', pitch: 0 });
    osc.connect(wk.in);
    const wfD = new Tone.Waveform(2048); const wfT = new Tone.Waveform(2048);
    osc.connect(wfD); wk.out.connect(wfT);
    await new Promise((r) => setTimeout(r, 600));
    out.pitch0Ratio = rms(wfT.getValue()) / (rms(wfD.getValue()) || 1e-9);
    wk.node.port.postMessage({ pitch: 12 });               // up an octave
    const meter = new Tone.Meter({ smoothing: 0.2 }); wk.out.connect(meter);
    await new Promise((r) => setTimeout(r, 400));
    let peak = -Infinity;
    for (let i = 0; i < 8; i++) { await new Promise((r) => setTimeout(r, 50)); const v = meter.getValue(); if (v > peak) peak = v; }
    out.pitchUp = peak;
    osc.stop(); osc.dispose(); wk.dispose(); wfD.dispose(); wfT.dispose(); meter.dispose();
  }

  // (2c) stretch: exponent 1 is identity (reconstruction); 1.5 stays audible
  {
    const osc = new Tone.Oscillator({ frequency: 220, type: 'sawtooth' }).start();
    const wk = makeWorkletNode('pvoc-processor'); wk.node.port.postMessage({ op: 'stretch', stretch: 1 });
    osc.connect(wk.in);
    const wfD = new Tone.Waveform(2048); const wfT = new Tone.Waveform(2048);
    osc.connect(wfD); wk.out.connect(wfT);
    await new Promise((r) => setTimeout(r, 600));
    out.stretch1Ratio = rms(wfT.getValue()) / (rms(wfD.getValue()) || 1e-9);
    wk.node.port.postMessage({ stretch: 1.5 });
    const meter = new Tone.Meter({ smoothing: 0.2 }); wk.out.connect(meter);
    await new Promise((r) => setTimeout(r, 400));
    let peak = -Infinity;
    for (let i = 0; i < 8; i++) { await new Promise((r) => setTimeout(r, 50)); const v = meter.getValue(); if (v > peak) peak = v; }
    out.stretchUp = peak;
    osc.stop(); osc.dispose(); wk.dispose(); wfD.dispose(); wfT.dispose(); meter.dispose();
  }

  // (2d) morph: 0 -> reconstruct A, 1 -> reconstruct B, 0.5 -> audible crossfade
  {
    const oscA = new Tone.Oscillator({ frequency: 220, type: 'sine' }).start();
    const oscB = new Tone.Oscillator({ frequency: 330, type: 'sawtooth' }).start();
    const wk = makeWorkletNode('pvoc-morph-processor', { numberOfInputs: 2 });
    oscA.connect(wk.ins[0]); oscB.connect(wk.ins[1]);
    const wfA = new Tone.Waveform(2048); const wfB = new Tone.Waveform(2048); const wfO = new Tone.Waveform(2048);
    oscA.connect(wfA); oscB.connect(wfB); wk.out.connect(wfO);
    wk.node.port.postMessage({ morph: 0 });
    await new Promise((r) => setTimeout(r, 600));
    out.morphAisA = rms(wfO.getValue()) / (rms(wfA.getValue()) || 1e-9);
    wk.node.port.postMessage({ morph: 1 });
    await new Promise((r) => setTimeout(r, 600));
    out.morphBisB = rms(wfO.getValue()) / (rms(wfB.getValue()) || 1e-9);
    wk.node.port.postMessage({ morph: 0.5 });
    const meter = new Tone.Meter({ smoothing: 0.2 }); wk.out.connect(meter);
    await new Promise((r) => setTimeout(r, 400));
    let peak = -Infinity;
    for (let i = 0; i < 8; i++) { await new Promise((r) => setTimeout(r, 50)); const v = meter.getValue(); if (v > peak) peak = v; }
    out.morphMid = peak;
    oscA.stop(); oscB.stop(); oscA.dispose(); oscB.dispose(); wk.dispose(); wfA.dispose(); wfB.dispose(); wfO.dispose(); meter.dispose();
  }

  // (3) blur + filter pass audio
  for (const [op, msg] of [['blur', { op: 'blur', amount: 8 }], ['filter', { op: 'filter', thresh: 0.3 }]]) {
    const osc = new Tone.Oscillator({ frequency: 200, type: 'sawtooth' }).start();
    const wk = makeWorkletNode('pvoc-processor'); wk.node.port.postMessage(msg);
    osc.connect(wk.in);
    const meter = new Tone.Meter({ smoothing: 0.2 }); wk.out.connect(meter);
    await new Promise((r) => setTimeout(r, 500));
    let peak = -Infinity;
    for (let i = 0; i < 8; i++) { await new Promise((r) => setTimeout(r, 50)); const v = meter.getValue(); if (v > peak) peak = v; }
    out[op] = peak;
    osc.stop(); osc.dispose(); wk.dispose(); meter.dispose();
  }
  return out;
});

const checks = [
  ['thru reconstructs (RMS ratio 0.5..2.0)', r.thruRatio > 0.5 && r.thruRatio < 2.0, r.thruRatio.toFixed(2)],
  ['freeze sustains after input stops (> -50 dB)', r.freezeAfterStop > -50, r.freezeAfterStop.toFixed(1) + ' dB'],
  ['pitch=0 reconstructs (RMS ratio 0.5..2.0)', r.pitch0Ratio > 0.5 && r.pitch0Ratio < 2.0, r.pitch0Ratio.toFixed(2)],
  ['pitch +12 audible (> -60 dB)', r.pitchUp > -60, r.pitchUp.toFixed(1) + ' dB'],
  ['stretch=1 reconstructs (RMS ratio 0.5..2.0)', r.stretch1Ratio > 0.5 && r.stretch1Ratio < 2.0, r.stretch1Ratio.toFixed(2)],
  ['stretch 1.5 audible (> -60 dB)', r.stretchUp > -60, r.stretchUp.toFixed(1) + ' dB'],
  ['morph=0 reconstructs A (RMS ratio 0.5..2.0)', r.morphAisA > 0.5 && r.morphAisA < 2.0, r.morphAisA.toFixed(2)],
  ['morph=1 reconstructs B (RMS ratio 0.5..2.0)', r.morphBisB > 0.5 && r.morphBisB < 2.0, r.morphBisB.toFixed(2)],
  ['morph=0.5 audible crossfade (> -60 dB)', r.morphMid > -60, r.morphMid.toFixed(1) + ' dB'],
  ['blur audible (> -60 dB)', r.blur > -60, r.blur.toFixed(1) + ' dB'],
  ['filter audible (> -60 dB)', r.filter > -60, r.filter.toFixed(1) + ' dB'],
];
let ok = true;
for (const [name, pass, detail] of checks) { if (!pass) ok = false; console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}  [${detail}]`); }
console.log(ok ? '  ALL PVOC CHECKS PASS' : '  FAIL: a PVOC check failed');
await browser.close();
process.exit(ok ? 0 : 1);
