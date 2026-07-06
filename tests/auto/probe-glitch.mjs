// probe-glitch.mjs — Phase 2.5c: iterate~ (triggered stutter) + scramble~ (segment reorder).
// iterate~ emits only on trig, so it must be ~silent before a trig and audible after.
// scramble~ must produce audio once its segment buffer fills.
import { chromium } from 'playwright';

const PORT = process.argv[2] || '8123';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await (await browser.newContext()).newPage();
page.on('pageerror', (e) => console.log(`  [PAGEERROR] ${e.message}`));

await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.editor && window.Tone);
await page.click('#btn-audio');
await sleep(400);

const r = await page.evaluate(async () => {
  const Tone = window.Tone;
  const { loadWorklets, makeWorkletNode } = await import('/js/audio/worklet.js');
  await loadWorklets();
  const peakOf = async (node, ms) => { const m = new Tone.Meter({ smoothing: 0.1 }); node.connect(m); let p = -Infinity; const n = Math.ceil(ms / 40); for (let i = 0; i < n; i++) { await new Promise((r) => setTimeout(r, 40)); const v = m.getValue(); if (v > p) p = v; } m.dispose(); return p; };
  const out = {};

  // iterate: silent before trig, audible after
  {
    const osc = new Tone.Oscillator({ frequency: 220, type: 'sawtooth' }).start();
    const wk = makeWorkletNode('iterate-processor');
    wk.node.port.postMessage({ seg: 180, count: 6, decay: 0.85, pitch: 0 });
    osc.connect(wk.in);
    await new Promise((r) => setTimeout(r, 400));        // let it record some input
    out.iterPre = await peakOf(wk.out, 250);             // no trig yet -> silent
    wk.node.port.postMessage({ trig: 1 });
    out.iterPost = await peakOf(wk.out, 300);            // burst plays
    osc.stop(); osc.dispose(); wk.dispose();
  }

  // scramble: audible once the segment buffer fills
  {
    const osc = new Tone.Oscillator({ frequency: 200, type: 'sawtooth' }).start();
    const wk = makeWorkletNode('scramble-processor');
    wk.node.port.postMessage({ seg: 120, mode: 'shuffle' });
    osc.connect(wk.in);
    await new Promise((r) => setTimeout(r, 400));        // fill a few segments
    out.scramble = await peakOf(wk.out, 400);
    osc.stop(); osc.dispose(); wk.dispose();
  }
  return out;
});

const checks = [
  ['iterate~ silent before trig (< -40 dB)', r.iterPre < -40, r.iterPre.toFixed(1) + ' dB'],
  ['iterate~ audible after trig (> -40 dB)', r.iterPost > -40, r.iterPost.toFixed(1) + ' dB'],
  ['scramble~ audible once buffered (> -40 dB)', r.scramble > -40, r.scramble.toFixed(1) + ' dB'],
];
let ok = true;
for (const [name, pass, detail] of checks) { if (!pass) ok = false; console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}  [${detail}]`); }
console.log(ok ? '  GLITCH PAIR PASS' : '  FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
