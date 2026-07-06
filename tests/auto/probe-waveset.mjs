// probe-waveset.mjs — Phase 2.3 check: prove the waveset-processor worklet crunches
// live audio in every mode. Wires osc -> waveset-worklet -> meter and reads dB per mode.
import { chromium } from 'playwright';

const PORT = process.argv[2] || '8123';
const BASE = `http://localhost:${PORT}/index.html`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await (await browser.newContext()).newPage();
page.on('console', (m) => console.log(`  [console.${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => console.log(`  [PAGEERROR] ${e.message}`));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.editor && window.Tone);
await page.click('#btn-audio');            // unlock context + engine.start() (loads worklets)
await sleep(400);

const modes = ['repeat', 'omit', 'reverse', 'average', 'telescope', 'reform'];
const results = await page.evaluate(async (modes) => {
  const Tone = window.Tone;
  const { loadWorklets, makeWorkletNode } = await import('/js/audio/worklet.js');
  await loadWorklets();
  const osc = new Tone.Oscillator({ frequency: 220, type: 'sawtooth' }).start();
  const out = {};
  for (const mode of modes) {
    const wk = makeWorkletNode('waveset-processor');
    wk.node.port.postMessage({ mode, group: 2, count: 3, keep: 1, skip: 1, shape: 'square', level: 1 });
    const meter = new Tone.Meter({ smoothing: 0.2 });
    osc.connect(wk.in);
    wk.out.connect(meter);
    await new Promise((r) => setTimeout(r, 500)); // let FIFO fill
    let peak = -Infinity;
    for (let i = 0; i < 10; i++) { await new Promise((r) => setTimeout(r, 50)); const v = meter.getValue(); if (v > peak) peak = v; }
    out[mode] = peak;
    osc.disconnect(wk.in); wk.dispose(); meter.dispose();
  }
  osc.stop(); osc.dispose();
  return out;
}, modes);

let ok = true;
for (const mode of modes) {
  const dB = results[mode];
  const pass = Number.isFinite(dB) && dB > -60;
  if (!pass) ok = false;
  console.log(`  ${mode.padEnd(10)} ${Number(dB).toFixed(1).padStart(7)} dB  ${pass ? 'PASS' : 'FAIL (silent)'}`);
}
console.log(ok ? '  ALL MODES PASS: waveset worklet audible' : '  FAIL: a mode was silent');
await browser.close();
process.exit(ok ? 0 : 1);
