// probe-worklet.mjs — Phase 2.0 infra check: prove the worklet<->Tone bridge passes audio.
// Wires osc -> passthrough-worklet -> meter -> destination in a real browser and reads dB.
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

const result = await page.evaluate(async () => {
  const Tone = window.Tone;
  const { loadWorklets, makeWorkletNode } = await import('/js/audio/worklet.js');
  await loadWorklets();
  const osc = new Tone.Oscillator({ frequency: 330, type: 'sine' }).start();
  const wk = makeWorkletNode('passthrough-processor');
  const meter = new Tone.Meter({ smoothing: 0.2 });
  osc.connect(wk.in);
  wk.out.connect(meter);
  wk.out.connect(Tone.getDestination());
  await new Promise((r) => setTimeout(r, 400));
  let peak = -Infinity;
  for (let i = 0; i < 8; i++) { await new Promise((r) => setTimeout(r, 60)); const v = meter.getValue(); if (v > peak) peak = v; }
  osc.stop(); osc.dispose(); wk.dispose(); meter.dispose();
  return peak;
});

console.log(`  passthrough-worklet peak: ${Number(result).toFixed(1)} dB`);
const pass = Number.isFinite(result) && result > -60;
console.log(pass ? '  PASS: worklet bridge passes audio' : '  FAIL: worklet bridge silent');
await browser.close();
process.exit(pass ? 0 : 1);
